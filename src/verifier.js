import puppeteer from 'puppeteer';
import { run, get } from './database.js';
import { syncLeadToSheet } from './sheets.js';
import { log } from './logger.js';

// Helper to normalize phone numbers for comparison
export function normalizePhone(phoneStr) {
  if (!phoneStr) return '';
  let clean = phoneStr.replace(/\D/g, '');
  if (clean.startsWith('84')) {
    clean = '0' + clean.slice(2);
  }
  return clean;
}

// Extract phone numbers from a page body string
export function extractPhones(text) {
  if (!text) return [];
  const phoneRegex = /(?:\+84|0)[235789][0-9]{1,4}[.\s-]?[0-9]{3,4}[.\s-]?[0-9]{3,4}/g;
  const matches = text.match(phoneRegex) || [];
  
  const uniqueNormalized = [...new Set(matches.map(m => normalizePhone(m)))];
  return uniqueNormalized.filter(p => p.length >= 9 && p.length <= 11);
}

// Extract facebook links from page HTML
export function extractFacebookLinks(html) {
  if (!html) return [];
  const fbRegex = /href=["'](https?:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9._-]+)/gi;
  const matches = [];
  let match;
  while ((match = fbRegex.exec(html)) !== null) {
    const link = match[1];
    if (!link.includes('/sharer') && !link.includes('/plugins') && !link.includes('/groups')) {
      matches.push(link);
    }
  }
  return [...new Set(matches)];
}

export async function verifyLead(leadId, logCallback = log) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1200, height: 800 });

  const lead = await get('SELECT * FROM leads WHERE id = ?', [leadId]);

  if (!lead) {
    logCallback(`Không tìm thấy lead ID: ${leadId}`);
    await browser.close();
    return;
  }

  logCallback(`Đang xác thực thông tin cho: ${lead.brand_name}`);
  let verifiedPhone = lead.phone || '';
  let verifiedFb = lead.facebook || '';
  let verifiedWeb = lead.website || '';
  let notes = [];
  let isWebValid = false;
  let isFbValid = false;

  // 1. Verify Website
  if (lead.website) {
    logCallback(`Đang truy cập website: ${lead.website}`);
    try {
      await page.goto(lead.website, { waitUntil: 'networkidle2', timeout: 30000 });
      isWebValid = true;
      notes.push('Website hoạt động.');

      const pageText = await page.evaluate(() => document.body.innerText);
      const pageHtml = await page.evaluate(() => document.body.innerHTML);

      const webPhones = extractPhones(pageText);
      if (webPhones.length > 0) {
        logCallback(`Tìm thấy SĐT trên website: ${webPhones.join(', ')}`);
        const mapPhoneNorm = normalizePhone(lead.phone);
        const matched = webPhones.some(wp => normalizePhone(wp) === mapPhoneNorm);
        
        if (matched) {
          notes.push('SĐT khớp trên website.');
        } else {
          notes.push(`Website có SĐT khác: ${webPhones.join(', ')}`);
          if (!verifiedPhone) verifiedPhone = webPhones[0];
        }
      }

      const fbLinks = extractFacebookLinks(pageHtml);
      if (fbLinks.length > 0 && !verifiedFb) {
        verifiedFb = fbLinks[0];
        logCallback(`Trích xuất được link Facebook từ website: ${verifiedFb}`);
        notes.push('Trích xuất được Facebook từ website.');
      }
    } catch (err) {
      logCallback(`Không truy cập được website ${lead.website}: ${err.message}`);
      notes.push(`Lỗi truy cập website: ${err.message}`);
    }
  }

  // 2. Verify Facebook Fanpage
  if (verifiedFb) {
    logCallback(`Đang truy cập Facebook: ${verifiedFb}`);
    try {
      await page.goto(verifiedFb, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(r => setTimeout(r, 3000));
      
      isFbValid = true;
      const pageText = await page.evaluate(() => document.body.innerText);

      const fbPhones = extractPhones(pageText);
      if (fbPhones.length > 0) {
        logCallback(`Tìm thấy SĐT trên Facebook: ${fbPhones.join(', ')}`);
        const mapPhoneNorm = normalizePhone(verifiedPhone);
        const matched = fbPhones.some(fp => normalizePhone(fp) === mapPhoneNorm);

        if (matched) {
          notes.push('SĐT khớp trên Facebook.');
        } else {
          notes.push(`Facebook có SĐT khác: ${fbPhones.join(', ')}`);
          if (!verifiedPhone) verifiedPhone = fbPhones[0];
        }
      }
    } catch (err) {
      logCallback(`Không truy cập được trang Facebook: ${err.message}`);
      notes.push(`Lỗi truy cập Facebook: ${err.message}`);
    }
  }

  // Determine final verification status
  let status = 'invalid';
  if (isWebValid || isFbValid) {
    const hasPhoneMatch = notes.some(n => n.includes('khớp'));
    if (hasPhoneMatch) {
      status = 'verified';
    } else {
      status = 'partially_verified';
    }
  } else {
    // If both web and FB are invalid/down, but the lead is highly relevant (score >= 4) and has a phone, mark as partially_verified
    const noteContent = lead.verification_notes || '';
    const scoreMatch = noteContent.match(/\[Điểm:\s*(\d+)\]/);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
    
    if (score >= 4 && verifiedPhone && verifiedPhone.trim() !== '') {
      status = 'partially_verified';
      notes.push('Không có website/FB hoạt động nhưng là địa điểm tiềm năng cao (Điểm >= 4) và có SĐT.');
    }
  }

  const notesStr = notes.join(' | ');
  logCallback(`Xác thực hoàn tất. Trạng thái: ${status}. Ghi chú: ${notesStr}`);

  // Update Database
  await run(
    `UPDATE leads 
     SET phone = ?, facebook = ?, website = ?, verification_status = ?, verification_notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [verifiedPhone || lead.phone, verifiedFb || lead.facebook, verifiedWeb || lead.website, status, notesStr, leadId]
  );

  const updatedLead = await get('SELECT * FROM leads WHERE id = ?', [leadId]);
  
  // Sync to Google Sheets
  const sheetSynced = await syncLeadToSheet(updatedLead);
  if (sheetSynced) {
    await run(`UPDATE leads SET sheet_sync_status = 'synced' WHERE id = ?`, [leadId]);
  } else {
    await run(`UPDATE leads SET sheet_sync_status = 'failed' WHERE id = ?`, [leadId]);
  }

  await browser.close();
  return updatedLead;
}
