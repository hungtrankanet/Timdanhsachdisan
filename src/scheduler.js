import puppeteer from 'puppeteer';
import { get, run, all } from './database.js';
import { scrapeGoogleMaps } from './scraper.js';
import { verifyLead } from './verifier.js';
import { sendZaloInvite, isZaloLoggedIn, syncZaloChat, initZaloSession, closeZaloSession, sendZaloMessageDirect } from './zalo.js';
import { log, logMaps, logZalo } from './logger.js';

let scraperBrowser = null;
let verifierBrowser = null;
let isScraperWorkerRunning = false;
let isVerifierWorkerRunning = false;
let isZaloWorkerRunning = false;

async function closeScraperBrowser() {
  if (scraperBrowser) {
    try {
      await scraperBrowser.close();
      logMaps('[Scraper Worker] Đã đóng trình duyệt Scraper.');
    } catch (e) {
      logMaps(`Lỗi khi đóng trình duyệt Scraper: ${e.message}`);
    } finally {
      scraperBrowser = null;
    }
  }
}

async function closeVerifierBrowser() {
  if (verifierBrowser) {
    try {
      await verifierBrowser.close();
      logMaps('[Verifier Worker] Đã đóng trình duyệt Verifier.');
    } catch (e) {
      logMaps(`Lỗi khi đóng trình duyệt Verifier: ${e.message}`);
    } finally {
      verifierBrowser = null;
    }
  }
}

export async function closeWorkerBrowsers() {
  logMaps('Đang đóng toàn bộ trình duyệt của các worker...');
  await closeScraperBrowser();
  await closeVerifierBrowser();
}

function isWithinWorkingHours() {
  const options = { timeZone: 'Asia/Ho_Chi_Minh', hour: 'numeric', minute: 'numeric', hour12: false };
  const formatter = new Intl.DateTimeFormat('vi-VN', options);
  const parts = formatter.formatToParts(new Date());
  
  const hourPart = parts.find(p => p.type === 'hour');
  const minutePart = parts.find(p => p.type === 'minute');
  
  const hour = parseInt(hourPart.value, 10);
  const minute = parseInt(minutePart.value, 10);
  
  // Morning: 08:30 - 12:00
  const isMorning = (hour > 8 && hour < 12) || (hour === 8 && minute >= 30);
  
  // Afternoon: 13:30 - 17:00
  const isAfternoon = (hour > 13 && hour < 17) || (hour === 13 && minute >= 30);
  
  return isMorning || isAfternoon;
}

export async function runScraperWorker() {
  if (isScraperWorkerRunning) return;

  const stack = new Error().stack || '';
  const isManual = stack.includes('server.js') && !stack.includes('Timeout') && !stack.includes('Interval');

  const statusRow = await get('SELECT value FROM configs WHERE key = "scheduler_status"');
  const schedulerStatus = statusRow ? statusRow.value : 'idle';

  if (!isManual && schedulerStatus !== 'active') {
    logMaps('[Scraper Worker] Tiến trình cào Maps tự động đang tạm dừng (Idle).');
    await closeScraperBrowser();
    return;
  }

  isScraperWorkerRunning = true;
  logMaps(isManual ? '--- KHỞI ĐỘNG SCRAPER WORKER (THỦ CÔNG) ---' : '--- KHỞI ĐỘNG SCRAPER WORKER ---');

  try {
    const job = await get('SELECT * FROM scheduler_queue WHERE status = "pending" ORDER BY id ASC LIMIT 1');
    if (!job) {
      logMaps('[Scraper Worker] Hàng đợi cào trống! Đã xử lý toàn bộ từ khóa và địa điểm.');
      await closeScraperBrowser();
      isScraperWorkerRunning = false;
      return;
    }

    logMaps(`[Scraper Worker] Bắt đầu xử lý hàng đợi ID ${job.id}: cào "${job.keyword}" tại "${job.location}"`);
    await run('UPDATE scheduler_queue SET status = "running", updated_at = CURRENT_TIMESTAMP WHERE id = ?', [job.id]);
    await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['current_task', `Đang cào: "${job.keyword}" tại "${job.location}"`]);

    if (!scraperBrowser) {
      logMaps('[Scraper Worker] Đang khởi chạy trình duyệt Scraper...');
      scraperBrowser = await puppeteer.launch({
        headless: true,
        args: [
          '--js-flags="--max-old-space-size=128"',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-extensions',
          '--no-first-run',
          '--no-zygote',
          '--disable-blink-features=AutomationControlled'
        ]
      });
    }

    const query = `${job.keyword} ${job.location}`;
    const scrapedLeads = await scrapeGoogleMaps(query, 50, logMaps, scraperBrowser);
    const leadsCount = scrapedLeads.length;
    logMaps(`[Scraper Worker] Đã hoàn thành cào GMap. Tìm thấy ${leadsCount} leads.`);

    await run('UPDATE scheduler_queue SET status = "completed", leads_found = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [leadsCount, job.id]);
    logMaps(`--- HOÀN TẤT TÁC VỤ CÀO GMAP HÀNG ĐỢI ID ${job.id} ---`);

  } catch (err) {
    logMaps(`[Scraper Worker] Lỗi trong Scraper Worker: ${err.message}`);
    await closeScraperBrowser();
  } finally {
    isScraperWorkerRunning = false;
    const statusCheck = await get('SELECT value FROM configs WHERE key = "scheduler_status"');
    if (statusCheck && statusCheck.value === 'active') {
      const nextJob = await get('SELECT id FROM scheduler_queue WHERE status = "pending" LIMIT 1');
      if (nextJob) {
        logMaps(`[Scraper Worker] Phát hiện còn tác vụ chờ. Lập lịch cào lại sau 3 giây...`);
        setTimeout(runScraperWorker, 3000);
      } else {
        logMaps(`[Scraper Worker] Hàng đợi trống. Scraper dừng hoạt động.`);
        await closeScraperBrowser();
        
        // Check if verifier is also done
        const unverifiedCheck = await get('SELECT id FROM leads WHERE verification_status = "unverified" LIMIT 1');
        if (!unverifiedCheck) {
          logMaps(`[Scheduler] Cả Scraper và Verifier đều đã hoàn thành. Chuyển trạng thái sang Idle.`);
          await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['scheduler_status', 'idle']);
          await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['current_task', 'Tạm dừng (Idle)']);
        }
      }
    } else {
      await closeScraperBrowser();
      await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['current_task', 'Tạm dừng (Idle)']);
    }
  }
}

export async function runVerifierWorker() {
  if (isVerifierWorkerRunning) return;

  const stack = new Error().stack || '';
  const isManual = stack.includes('server.js') && !stack.includes('Timeout') && !stack.includes('Interval');

  const statusRow = await get('SELECT value FROM configs WHERE key = "scheduler_status"');
  const schedulerStatus = statusRow ? statusRow.value : 'idle';

  if (!isManual && schedulerStatus !== 'active') {
    logMaps('[Verifier Worker] Tiến trình xác thực tự động đang tạm dừng (Idle).');
    await closeVerifierBrowser();
    return;
  }

  isVerifierWorkerRunning = true;
  logMaps(isManual ? '--- KHỞI ĐỘNG VERIFIER WORKER (THỦ CÔNG) ---' : '--- KHỞI ĐỘNG VERIFIER WORKER ---');

  try {
    const unverifiedLeads = await all('SELECT id FROM leads WHERE verification_status = "unverified" LIMIT 50');
    if (unverifiedLeads.length === 0) {
      logMaps('[Verifier Worker] Không có lead nào cần xác thực. Đóng trình duyệt và tạm nghỉ.');
      await closeVerifierBrowser();
      isVerifierWorkerRunning = false;
      return;
    }

    logMaps(`[Verifier Worker] Bắt đầu xác thực cho ${unverifiedLeads.length} leads...`);

    if (!verifierBrowser) {
      logMaps('[Verifier Worker] Đang khởi chạy trình duyệt Verifier...');
      verifierBrowser = await puppeteer.launch({
        headless: true,
        args: [
          '--js-flags="--max-old-space-size=128"',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-extensions',
          '--no-first-run',
          '--no-zygote',
          '--disable-blink-features=AutomationControlled'
        ]
      });
    }

    for (const lead of unverifiedLeads) {
      const checkStatus = await get('SELECT value FROM configs WHERE key = "scheduler_status"');
      if (!isManual && (!checkStatus || checkStatus.value !== 'active')) {
        logMaps('[Verifier Worker] Lập lịch bị tạm dừng khi đang xác thực. Dừng.');
        break;
      }

      try {
        await verifyLead(lead.id, logMaps, verifierBrowser);
        const spacingRow = await get('SELECT value FROM configs WHERE key = "verifier_spacing"');
        const verifierSpacing = spacingRow ? parseInt(spacingRow.value, 10) * 1000 : 5000;
        await new Promise(r => setTimeout(r, verifierSpacing));
      } catch (err) {
        logMaps(`[Verifier Worker] Lỗi xác thực lead ID ${lead.id}: ${err.message}`);
      }
    }

    logMaps('--- HOÀN TẤT CHU KỲ XÁC THỰC VERIFIER WORKER ---');

  } catch (err) {
    logMaps(`[Verifier Worker] Lỗi trong Verifier Worker: ${err.message}`);
    await closeVerifierBrowser();
  } finally {
    isVerifierWorkerRunning = false;
    const statusCheck = await get('SELECT value FROM configs WHERE key = "scheduler_status"');
    if (statusCheck && statusCheck.value === 'active') {
      const nextLead = await get('SELECT id FROM leads WHERE verification_status = "unverified" LIMIT 1');
      if (nextLead) {
        const delayRow = await get('SELECT value FROM configs WHERE key = "verifier_delay"');
        const verifierDelay = delayRow ? parseInt(delayRow.value, 10) * 1000 : 30000;
        logMaps(`[Verifier Worker] Lập lịch xác thực lại sau ${verifierDelay / 1000} giây...`);
        setTimeout(runVerifierWorker, verifierDelay);
      } else {
        logMaps(`[Verifier Worker] Không còn lead cần xác thực. Verifier dừng hoạt động.`);
        await closeVerifierBrowser();

        // If scraper queue is also empty, set system to idle
        const pendingJobCheck = await get('SELECT id FROM scheduler_queue WHERE status = "pending" LIMIT 1');
        if (!pendingJobCheck) {
          logMaps(`[Scheduler] Cả Scraper và Verifier đều đã hoàn thành. Chuyển trạng thái sang Idle.`);
          await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['scheduler_status', 'idle']);
          await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['current_task', 'Tạm dừng (Idle)']);
        }
      }
    } else {
      await closeVerifierBrowser();
    }
  }
}

export async function runQueueWorker() {
  logMaps('Cảnh báo: runQueueWorker() được gọi. Tiến hành chạy song song cả scraper và verifier worker.');
  return Promise.all([runScraperWorker(), runVerifierWorker()]);
}


export async function runFollowUpCampaignWorker(logCallback = logZalo) {
  logCallback('--- KHỞI ĐỘNG HỆ THỐNG KIỂM TRA CHĂM SÓC FOLLOW-UP (1-3-5) ---');
  try {
    const day1TemplateRow = await get("SELECT value FROM configs WHERE key = 'zalo_day1_template'");
    const day3TemplateRow = await get("SELECT value FROM configs WHERE key = 'zalo_day3_template'");
    const day1Template = day1TemplateRow ? day1TemplateRow.value : '';
    const day3Template = day3TemplateRow ? day3TemplateRow.value : '';

    const leads = await all(`
      SELECT id, brand_name, phone, city, assigned_zalo_account_id, zalo_followup_stage, last_followup_at, transfer_count 
      FROM leads 
      WHERE zalo_status IN ('message_sent', 'friend_request_sent')
        AND zalo_followup_stage IN (0, 1, 2)
    `);

    logCallback(`[Follow-up] Tìm thấy ${leads.length} leads trong luồng follow-up.`);

    const now = new Date();
    const leadsByAccount = {};
    const transfers = [];

    for (const lead of leads) {
      const lastFollowUp = new Date(lead.last_followup_at);
      const diffMs = now - lastFollowUp;
      const diffHours = diffMs / (1000 * 60 * 60);

      if (lead.zalo_followup_stage === 0 && diffHours >= 24) {
        if (lead.assigned_zalo_account_id) {
          if (!leadsByAccount[lead.assigned_zalo_account_id]) {
            leadsByAccount[lead.assigned_zalo_account_id] = [];
          }
          leadsByAccount[lead.assigned_zalo_account_id].push({ lead, stage: 1, template: day1Template });
        }
      } else if (lead.zalo_followup_stage === 1 && diffHours >= 48) {
        if (lead.assigned_zalo_account_id) {
          if (!leadsByAccount[lead.assigned_zalo_account_id]) {
            leadsByAccount[lead.assigned_zalo_account_id] = [];
          }
          leadsByAccount[lead.assigned_zalo_account_id].push({ lead, stage: 2, template: day3Template });
        }
      } else if (lead.zalo_followup_stage === 2 && diffHours >= 48) {
        transfers.push(lead);
      }
    }

    // Xử lý chuyển giao ngày thứ 5 (database-only)
    for (const lead of transfers) {
      logCallback(`[Follow-up] Lead "${lead.brand_name}" (${lead.phone}) quá 5 ngày không phản hồi. Tiến hành chuyển giao...`);
      
      const allConnectedAccounts = await all("SELECT id, assigned_regions FROM zalo_accounts WHERE status = 'connected' AND id != ?", [lead.assigned_zalo_account_id]);
      
      if (allConnectedAccounts.length === 0) {
        logCallback(`[Follow-up] Không tìm thấy tài khoản Zalo connected khác để chuyển giao lead ID ${lead.id}.`);
        continue;
      }

      // Ưu tiên tài khoản Zalo cùng khu vực địa lý của lead
      const candidateAccounts = [];
      if (lead.city) {
        for (const acc of allConnectedAccounts) {
          if (acc.assigned_regions) {
            const regions = acc.assigned_regions.split(',').map(r => r.trim().toLowerCase()).filter(Boolean);
            if (regions.some(r => lead.city.toLowerCase().includes(r))) {
              candidateAccounts.push(acc);
            }
          }
        }
      }

      const targetAccounts = candidateAccounts.length > 0 ? candidateAccounts : allConnectedAccounts;
      
      // Load balancing: chọn tài khoản đang giữ ít lead nhất
      let bestAccount = null;
      let minLeads = Infinity;
      for (const acc of targetAccounts) {
        const countRow = await get("SELECT COUNT(*) as count FROM leads WHERE assigned_zalo_account_id = ?", [acc.id]);
        const count = countRow ? countRow.count : 0;
        if (count < minLeads) {
          minLeads = count;
          bestAccount = acc;
        }
      }

      if (bestAccount) {
        const newAccountId = bestAccount.id;
        const newCount = (lead.transfer_count || 0) + 1;
        
        await run(`
          UPDATE leads 
          SET assigned_zalo_account_id = ?, 
              zalo_status = 'pending', 
              zalo_followup_stage = 0, 
              last_followup_at = CURRENT_TIMESTAMP, 
              transfer_count = ?, 
              zalo_notes = ?,
              updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `, [newAccountId, newCount, `Chuyển giao lần ${newCount} từ tài khoản #${lead.assigned_zalo_account_id} sang #${newAccountId}`, lead.id]);

        await run(`
          INSERT INTO lead_transfer_logs (lead_id, from_account_id, to_account_id, reason) 
          VALUES (?, ?, ?, ?)
        `, [lead.id, lead.assigned_zalo_account_id, newAccountId, `Quá 5 ngày không phản hồi (Chuyển giao lần ${newCount})`]);

        logCallback(`[Follow-up] Đã chuyển lead "${lead.brand_name}" sang Zalo ID ${newAccountId}. Ghi log thành công.`);
      }
    }

    // Xử lý gửi tin nhắn follow-up Ngày 1 & Ngày 3
    const accountIds = Object.keys(leadsByAccount);
    for (const accIdStr of accountIds) {
      const accountId = parseInt(accIdStr, 10);
      const items = leadsByAccount[accountId];
      
      if (!isWithinWorkingHours()) {
        logCallback(`[Follow-up] Ngoài khung giờ gửi tin nhắn. Bỏ qua gửi follow-up cho Zalo ID ${accountId}.`);
        continue;
      }

      const loggedIn = await isZaloLoggedIn(accountId);
      if (!loggedIn) {
        logCallback(`[Follow-up] Zalo ID ${accountId} chưa đăng nhập. Bỏ qua gửi follow-up.`);
        continue;
      }

      logCallback(`[Follow-up] Bắt đầu gửi follow-up cho ${items.length} leads qua Zalo ID ${accountId}...`);
      
      try {
        await initZaloSession(accountId, logCallback, true);
        for (const item of items) {
          // Kiểm tra xem chiến dịch có bị dừng đột ngột giữa chừng không
          const checkStatus = await get('SELECT value FROM configs WHERE key = "zalo_campaign_status"');
          if (!checkStatus || checkStatus.value !== 'active') {
            logCallback('[Follow-up] Chiến dịch Zalo bị tạm dừng. Dừng tiến trình gửi follow-up.');
            break;
          }

          const { lead, stage, template } = item;
          if (!template) {
            logCallback(`[Follow-up] Lead ID ${lead.id} stage ${stage} không có template tin nhắn. Bỏ qua.`);
            continue;
          }
          try {
            logCallback(`[Follow-up] Đang gửi tin nhắn stage ${stage} cho "${lead.brand_name}" (${lead.phone})...`);
            await sendZaloMessageDirect(accountId, lead.phone, template, logCallback);
            
            await run(`
              UPDATE leads 
              SET zalo_followup_stage = ?, 
                  last_followup_at = CURRENT_TIMESTAMP, 
                  updated_at = CURRENT_TIMESTAMP 
              WHERE id = ?
            `, [stage, lead.id]);
            
            logCallback(`[Follow-up] Đã cập nhật lead ID ${lead.id} lên stage ${stage}.`);
            await new Promise(r => setTimeout(r, 5000));
          } catch (err) {
            logCallback(`[Follow-up Error] Lỗi gửi follow-up cho lead ID ${lead.id}: ${err.message}`);
          }
        }
      } catch (err) {
        logCallback(`[Follow-up Error] Lỗi khi xử lý phiên Zalo ID ${accountId}: ${err.message}`);
      } finally {
        await closeZaloSession(accountId);
      }
    }

  } catch (err) {
    logCallback(`[Follow-up Error] Lỗi trong Follow-up Campaign Worker: ${err.message}`);
  }
}

// Luồng 2: Chiến dịch gửi tin nhắn kết bạn Zalo tự động (chạy song song dựa trên danh sách đã xác thực)
export async function runZaloCampaignWorker() {
  if (isZaloWorkerRunning) return;

  const campaignStatusRow = await get('SELECT value FROM configs WHERE key = "zalo_campaign_status"');
  const campaignStatus = campaignStatusRow ? campaignStatusRow.value : 'idle';

  if (campaignStatus !== 'active') {
    logZalo('Chiến dịch gửi Zalo đang tạm dừng.');
    return;
  }

  isZaloWorkerRunning = true;
  logZalo('--- BẮT ĐẦU CHẠY LUỒNG GỬI ZALO TỰ ĐỘNG ---');

  try {
    // Chạy chiến dịch chăm sóc Follow-up (1-3-5 ngày) & chuyển giao
    await runFollowUpCampaignWorker(logZalo);

    const connectedAccounts = await all("SELECT id, assigned_regions FROM zalo_accounts WHERE status = 'connected'");

    if (connectedAccounts.length > 0) {
      logZalo(`Tìm thấy ${connectedAccounts.length} tài khoản Zalo đang kết nối hoạt động.`);

      for (const acc of connectedAccounts) {
        // Kiểm tra xem chiến dịch có bị tạm dừng đột ngột không trước khi xử lý tài khoản tiếp theo
        const checkStatus = await get('SELECT value FROM configs WHERE key = "zalo_campaign_status"');
        if (!checkStatus || checkStatus.value !== 'active') {
          logZalo('Chiến dịch gửi Zalo bị tạm dừng. Dừng tiến trình gửi tin.');
          break;
        }

        const accountId = acc.id;
        const loggedIn = await isZaloLoggedIn(accountId);
        if (!loggedIn) {
          logZalo(`Tài khoản Zalo ID ${accountId} chưa thực sự đăng nhập. Bỏ qua.`);
          continue;
        }

        // 1. Tính giới hạn ngày
        let startDateRow = await get('SELECT value FROM configs WHERE key = "campaign_start_date"');
        let startDateStr = startDateRow ? startDateRow.value : null;
        if (!startDateStr) {
          startDateStr = new Date().toISOString();
          await run('INSERT OR REPLACE INTO configs (key, value) VALUES ("campaign_start_date", ?)', [startDateStr]);
        }
        const startDate = new Date(startDateStr);
        const daysDiff = Math.floor((new Date() - startDate) / (1000 * 60 * 60 * 24));
        
        let dailyLimit = 50;
        if (daysDiff >= 7 && daysDiff < 15) {
          dailyLimit = 70;
        } else if (daysDiff >= 15) {
          dailyLimit = 100;
        }

        // Đếm số người đã gửi hôm nay
        const now = new Date();
        const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
        const vnTime = new Date(utcTime + (7 * 60 * 60 * 1000));
        vnTime.setHours(0, 0, 0, 0);
        const vnStartOfDayInUTC = new Date(vnTime.getTime() - (7 * 60 * 60 * 1000));
        const startOfDayIso = vnStartOfDayInUTC.toISOString();

        const sentTodayRow = await get(`
          SELECT COUNT(DISTINCT lead_id) as count 
          FROM zalo_chat_logs 
          WHERE (sender = 'me' OR sender = 'bot') 
            AND timestamp >= ?
            AND zalo_account_id = ?
        `, [startOfDayIso, accountId]);
        const sentToday = sentTodayRow ? sentTodayRow.count : 0;

        logZalo(`[Zalo ID ${accountId}] Ngày thứ ${daysDiff + 1}. Giới hạn: ${dailyLimit}. Đã gửi hôm nay: ${sentToday}.`);

        if (sentToday >= dailyLimit) {
          logZalo(`[Zalo ID ${accountId}] Đã đạt giới hạn gửi trong ngày (${sentToday}/${dailyLimit}). Tạm dừng gửi thêm.`);
          continue;
        }

        const remaining = dailyLimit - sentToday;
        // Lấy danh sách đã xác thực trước đó có zalo_status = 'pending'
        let query = `
          SELECT l.id FROM leads l
          WHERE (l.verification_status = 'verified' OR l.verification_status = 'partially_verified') 
            AND l.zalo_status = 'pending' 
            AND (l.assigned_zalo_account_id = ? OR l.assigned_zalo_account_id IS NULL)
        `;
        const params = [accountId];

        if (acc.assigned_regions) {
          const regions = acc.assigned_regions.split(',').map(r => r.trim()).filter(Boolean);
          if (regions.length > 0) {
            const regionConditions = regions.map(() => `l.city LIKE ?`).join(' OR ');
            query += ` AND (${regionConditions})`;
            regions.forEach(r => params.push(`%${r}%`));
          }
        }

        query += ` LIMIT ?`;
        params.push(remaining);

        const pendingZaloLeads = await all(query, params);
        logZalo(`[Zalo ID ${accountId}] Tìm thấy ${pendingZaloLeads.length} danh bạ chờ gửi Zalo.`);

        for (const lead of pendingZaloLeads) {
          // Kiểm tra xem chiến dịch có bị tạm dừng đột ngột không trước khi xử lý lead tiếp theo
          const currentCampaignStatus = await get('SELECT value FROM configs WHERE key = "zalo_campaign_status"');
          if (!currentCampaignStatus || currentCampaignStatus.value !== 'active') {
            logZalo('Chiến dịch gửi Zalo bị tạm dừng. Dừng vòng lặp gửi tin.');
            break;
          }

          // Kiểm tra khung giờ gửi tin nhắn (Working hours)
          if (!isWithinWorkingHours()) {
            logZalo('Ngoài khung giờ gửi tin nhắn chiến dịch tự động (VN 8h30-12h00, 13h30-17h00). Tạm dừng gửi.');
            break;
          }

          try {
            await initZaloSession(accountId, logZalo, true);
            try {
              await sendZaloInvite(accountId, lead.id, logZalo);
            } finally {
              await closeZaloSession(accountId);
            }
            
            // Nghỉ giải lao 10 phút (600 giây) nhưng kiểm tra mỗi giây để có thể ngắt ngay lập tức
            logZalo('Nghỉ giải lao 10 phút (600 giây) trước khi gửi tiếp theo...');
            let interrupted = false;
            for (let i = 0; i < 600; i++) {
              await new Promise(r => setTimeout(r, 1000));
              
              const innerStatus = await get('SELECT value FROM configs WHERE key = "zalo_campaign_status"');
              if (!innerStatus || innerStatus.value !== 'active') {
                logZalo('Chiến dịch gửi Zalo đã bị tạm dừng trong thời gian nghỉ. Ngắt nghỉ giải lao.');
                interrupted = true;
                break;
              }
            }
            if (interrupted) break;
          } catch (err) {
            logZalo(`Lỗi gửi Zalo lead ID ${lead.id}: ${err.message}`);
          }
        }
      }
    } else {
      logZalo('Không có tài khoản Zalo nào đang kết nối hoạt động. Bỏ qua gửi tin nhắn tự động.');
    }

  } catch (err) {
    logZalo(`Lỗi trong luồng chiến dịch gửi Zalo: ${err.message}`);
  } finally {
    isZaloWorkerRunning = false;
    logZalo('--- HOÀN TẤT CHU KỲ GỬI ZALO ---');

    // Tiếp tục kiểm tra lại sau 30 giây để gửi cho lead mới cào/verify xong
    const statusCheck = await get('SELECT value FROM configs WHERE key = "zalo_campaign_status"');
    if (statusCheck && statusCheck.value === 'active') {
      setTimeout(runZaloCampaignWorker, 30000);
    }
  }
}

export async function startScheduler() {
  logMaps('Bắt đầu khởi chạy bộ lập lịch tự động (Scheduled Check)...');
  
  // Tự động khôi phục các tác vụ cào bị kẹt (running -> pending) khi khởi động
  try {
    const resetResult = await run(
      "UPDATE scheduler_queue SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE status = 'running'"
    );
    if (resetResult && resetResult.changes > 0) {
      logMaps(`[Scheduler] Đã tự động khôi phục ${resetResult.changes} tác vụ bị kẹt ở trạng thái "running" về "pending".`);
    }
  } catch (err) {
    logMaps(`[Scheduler Error] Lỗi khi tự động khôi phục tác vụ kẹt: ${err.message}`);
  }

  // Khởi động các worker cào & xác thực
  run('INSERT OR IGNORE INTO configs (key, value) VALUES (?, ?)', ['scheduler_status', 'active'])
    .then(() => {
      runScraperWorker();
      runVerifierWorker();
    });

  // Khởi động luồng Zalo Campaign
  run('INSERT OR IGNORE INTO configs (key, value) VALUES (?, ?)', ['zalo_campaign_status', 'idle'])
    .then(() => {
      runZaloCampaignWorker();
    });

  // Check queue status periodically every 5 minutes, including daily auto-activation at or after 08:30 VN time
  setInterval(async () => {
    // 1. Daily auto-activation check (at or after 08:30 AM VN time)
    try {
      const now = new Date();
      const options = { timeZone: 'Asia/Ho_Chi_Minh', hour: 'numeric', minute: 'numeric', year: 'numeric', month: 'numeric', day: 'numeric', hour12: false };
      const formatter = new Intl.DateTimeFormat('vi-VN', options);
      const parts = formatter.formatToParts(now);
      
      const hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
      const minute = parseInt(parts.find(p => p.type === 'minute').value, 10);
      const year = parts.find(p => p.type === 'year').value;
      const month = parts.find(p => p.type === 'month').value;
      const day = parts.find(p => p.type === 'day').value;
      const todayStr = `${year}-${month}-${day}`; // e.g. "2026-6-25"

      const lastActivationRow = await get('SELECT value FROM configs WHERE key = "last_daily_activation"');
      const lastActivation = lastActivationRow ? lastActivationRow.value : '';

      // Activate if it is a new day and time is >= 08:30 AM VN time
      if (todayStr !== lastActivation && (hour > 8 || (hour === 8 && minute >= 30))) {
        logMaps(`[Scheduler] Kích hoạt tự động hàng ngày (VN 08:30+). Ngày mới: ${todayStr}`);
        await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['last_daily_activation', todayStr]);
        await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['scheduler_status', 'active']);
      }
    } catch (err) {
      logMaps(`[Scheduler Error] Lỗi kiểm tra kích hoạt tự động hàng ngày: ${err.message}`);
    }

    // 2. Start workers if active
    const statusRow = await get('SELECT value FROM configs WHERE key = "scheduler_status"');
    if (statusRow && statusRow.value === 'active') {
      if (!isScraperWorkerRunning) runScraperWorker();
      if (!isVerifierWorkerRunning) runVerifierWorker();
    }
  }, 1000 * 60 * 5);

  // Check Zalo campaign status periodically every 5 minutes
  setInterval(async () => {
    const statusRow = await get('SELECT value FROM configs WHERE key = "zalo_campaign_status"');
    if (statusRow && statusRow.value === 'active' && !isZaloWorkerRunning) {
      runZaloCampaignWorker();
    }
  }, 1000 * 60 * 5);

  // Sync Zalo chat logs periodically every 30 minutes
  setInterval(async () => {
    try {
      const connectedAccounts = await all("SELECT id FROM zalo_accounts WHERE status = 'connected'");
      if (connectedAccounts.length === 0) return;
      
      logMaps('--- BẮT ĐẦU ĐỒNG BỘ TIN NHẮN ZALO TỰ ĐỘNG (ĐỊNH KỲ 30 PHÚT) ---');
      
      for (const acc of connectedAccounts) {
        const accountId = acc.id;
        try {
          await initZaloSession(accountId, logMaps, true);
          const loggedIn = await isZaloLoggedIn(accountId);
          if (!loggedIn) {
            await closeZaloSession(accountId);
            continue;
          }

          const contactedLeads = await all(
            "SELECT id FROM leads WHERE zalo_status IN ('message_sent', 'friend_request_sent') AND assigned_zalo_account_id = ?",
            [accountId]
          );
          
          logMaps(`[Zalo ID ${accountId}] Tìm thấy ${contactedLeads.length} lead cần đồng bộ tin nhắn.`);
          for (const lead of contactedLeads) {
            try {
              await syncZaloChat(accountId, lead.id, logMaps);
              await new Promise(r => setTimeout(r, 3000)); // Delay 3 seconds between leads
            } catch (err) {
              logMaps(`Lỗi đồng bộ Zalo chat cho lead ID ${lead.id}: ${err.message}`);
            }
          }
        } catch (err) {
          logMaps(`Lỗi đồng bộ định kỳ tài khoản Zalo ID ${accountId}: ${err.message}`);
        } finally {
          await closeZaloSession(accountId);
        }
      }
      logMaps('--- HOÀN TẤT ĐỒNG BỘ TIN NHẮN ZALO ---');
    } catch (err) {
      logMaps(`Lỗi trong tiến trình đồng bộ tin nhắn định kỳ: ${err.message}`);
    }
  }, 1000 * 60 * 30);

  // Check and trigger email reports every minute
  setInterval(async () => {
    try {
      const { checkAndSendScheduledEmail } = await import('./email.js');
      await checkAndSendScheduledEmail();
    } catch (err) {
      logMaps(`Lỗi kiểm tra email định kỳ: ${err.message}`);
    }
  }, 1000 * 60);
}
