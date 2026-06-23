import puppeteer from 'puppeteer';
import { run, get } from './database.js';
import { log } from './logger.js';

export function parseAddress(addressStr) {
  if (!addressStr) return { ward: '', district: '', city: '' };
  
  let clean = addressStr.replace(/, Việt Nam$/i, '').replace(/, Vietnam$/i, '').trim();
  let parts = clean.split(',').map(p => p.trim());
  
  let city = parts.length > 0 ? parts[parts.length - 1] : '';
  let district = parts.length > 1 ? parts[parts.length - 2] : '';
  let ward = parts.length > 2 ? parts[parts.length - 3] : '';
  
  return { ward, district, city };
}

export async function scrapeGoogleMaps(query, limit = 20, logCallback = log) {
  logCallback(`Bắt đầu cào Google Maps cho từ khóa: "${query}" (giới hạn: ${limit})`);
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--lang=vi-VN'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7' });

  try {
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    logCallback(`Đang mở trang tìm kiếm: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    logCallback('Đang cuộn danh sách kết quả để tải thêm...');
    
    let feedSelector = 'div[role="feed"]';
    try {
      await page.waitForSelector(feedSelector, { timeout: 10000 });
    } catch (e) {
      logCallback('Không tìm thấy danh sách kết quả cuộn. Kiểm tra xem có phải trang chi tiết đơn lẻ không...');
      feedSelector = null;
    }

    if (feedSelector) {
      let previousHeight = 0;
      let currentHeight = await page.evaluate((sel) => {
        const feed = document.querySelector(sel);
        return feed ? feed.scrollHeight : 0;
      }, feedSelector);

      let scrolledCount = 0;
      while (currentHeight > previousHeight && scrolledCount < 15) {
        previousHeight = currentHeight;
        await page.evaluate((sel) => {
          const feed = document.querySelector(sel);
          if (feed) feed.scrollBy(0, 2000);
        }, feedSelector);
        
        await new Promise(r => setTimeout(r, 2000));
        
        currentHeight = await page.evaluate((sel) => {
          const feed = document.querySelector(sel);
          return feed ? feed.scrollHeight : 0;
        }, feedSelector);
        scrolledCount++;
        logCallback(`Cuộn lần ${scrolledCount}... Đã tải thêm dữ liệu.`);
      }
    }

    const placeUrls = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
      return links.map(a => a.href);
    });

    const uniqueUrls = [...new Set(placeUrls)].slice(0, limit);
    logCallback(`Tìm thấy ${uniqueUrls.length} địa điểm duy nhất. Đang trích xuất chi tiết...`);

    const scrapedLeads = [];

    for (let i = 0; i < uniqueUrls.length; i++) {
      const url = uniqueUrls[i];
      logCallback(`[${i + 1}/${uniqueUrls.length}] Đang xử lý: ${url}`);
      
      try {
        const detailPage = await browser.newPage();
        await detailPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        
        await detailPage.waitForSelector('h1', { timeout: 15000 });
        
        const details = await detailPage.evaluate(() => {
          const nameEl = document.querySelector('h1');
          const brand_name = nameEl ? nameEl.textContent.trim() : '';

          const phoneEl = document.querySelector('[data-item-id^="phone:tel:"]');
          let phone = phoneEl ? phoneEl.getAttribute('data-item-id').replace('phone:tel:', '').trim() : '';
          
          if (!phone) {
            const els = Array.from(document.querySelectorAll('button[aria-label*="Điện thoại:"], button[aria-label*="Phone:"]'));
            if (els.length > 0) {
              phone = els[0].getAttribute('aria-label').replace(/Điện thoại:\s*/i, '').replace(/Phone:\s*/i, '').trim();
            }
          }

          const webEl = document.querySelector('[data-item-id="authority"]');
          let website = webEl ? webEl.getAttribute('href') : '';
          
          if (!website) {
            const els = Array.from(document.querySelectorAll('a[aria-label*="Website:"], a[aria-label*="Trang web:"]'));
            if (els.length > 0) {
              website = els[0].getAttribute('href');
            }
          }

          const addrEl = document.querySelector('[data-item-id="address"]');
          let address = addrEl ? addrEl.textContent.trim() : '';
          
          if (!address) {
            const els = Array.from(document.querySelectorAll('button[aria-label*="Địa chỉ:"], button[aria-label*="Address:"]'));
            if (els.length > 0) {
              address = els[0].getAttribute('aria-label').replace(/Địa chỉ:\s*/i, '').replace(/Address:\s*/i, '').trim();
            }
          }

          const categoryEl = document.querySelector('button[jsaction*="pane.rating.category"]') || 
                             document.querySelector('[class*="fontBodyMedium"] button') ||
                             document.querySelector('button[aria-label*="Category"]');
          const category = categoryEl ? categoryEl.textContent.trim() : '';

          return { brand_name, phone, website, address, category };
        });

        const { ward, district, city } = parseAddress(details.address);
        
        // Kiểm tra độ phù hợp chuyên ngành di sản sơn mài trước khi lưu
        const relResult = await checkRelevance(details.brand_name, details.address, details.category, details.website, logCallback);

        const lead = {
          brand_name: details.brand_name,
          phone: details.phone,
          website: details.website,
          address: details.address,
          ward,
          district,
          city,
          verification_status: relResult.status,
          verification_notes: `[Điểm: ${relResult.score}] ${relResult.reason}`,
          zalo_status: 'pending'
        };

        logCallback(`Cào được: ${lead.brand_name} | SĐT: ${lead.phone || 'Không có'} | Web: ${lead.website || 'Không có'} | Danh mục: "${details.category || 'Không có'}" | Trạng thái: ${lead.verification_status} (Điểm: ${relResult.score})`);
        
        if (lead.brand_name) {
          scrapedLeads.push(lead);
          try {
            // 1. Kiểm tra xem đã có bản ghi nào trùng cả thương hiệu và địa chỉ chưa
            const existingSamePlace = await get(
              "SELECT id, phone FROM leads WHERE brand_name = ? AND address = ?",
              [lead.brand_name, lead.address || '']
            );

            if (existingSamePlace) {
              const cleanPhone = lead.phone ? lead.phone.trim() : '';
              const existingPhone = existingSamePlace.phone ? existingSamePlace.phone.trim() : '';

              if (cleanPhone === existingPhone) {
                logCallback(`Bản ghi "${lead.brand_name}" tại địa chỉ này với SĐT "${lead.phone}" đã tồn tại hoàn toàn. Bỏ qua.`);
                await detailPage.close();
                continue;
              } else {
                // Trùng thương hiệu & địa điểm nhưng khác số điện thoại
                logCallback(`Phát hiện trùng thương hiệu "${lead.brand_name}" và địa điểm nhưng khác SĐT (Cũ: "${existingPhone}", Mới: "${cleanPhone}"). Tiến hành lưu thêm để xác thực.`);
              }
            }

            // 2. Kiểm tra xem số điện thoại này đã tồn tại ở bất kỳ bản ghi nào chưa (vì phone là UNIQUE)
            if (lead.phone) {
              const existingWithPhone = await get("SELECT id FROM leads WHERE phone = ?", [lead.phone.trim()]);
              if (existingWithPhone) {
                logCallback(`Số điện thoại "${lead.phone}" đã tồn tại ở bản ghi khác trong cơ sở dữ liệu. Bỏ qua.`);
                await detailPage.close();
                continue;
              }
            }

            // 3. Nếu chưa trùng hoàn toàn hoặc có số điện thoại mới, tiến hành lưu vào DB
            await run(
              `INSERT INTO leads (brand_name, phone, website, address, ward, district, city, verification_status, verification_notes, zalo_status) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [lead.brand_name, lead.phone || null, lead.website || null, lead.address || null, lead.ward || null, lead.district || null, lead.city || null, lead.verification_status, lead.verification_notes, 'pending']
            );
            logCallback(`Đã lưu "${lead.brand_name}" (SĐT: ${lead.phone || 'Không có'}, Trạng thái: ${lead.verification_status}) vào cơ sở dữ liệu.`);
          } catch (dbErr) {
            logCallback(`Lỗi DB khi lưu: ${dbErr.message}`);
          }
        }

        await detailPage.close();
      } catch (err) {
        logCallback(`Lỗi trích xuất địa điểm từ ${url}: ${err.message}`);
      }
      
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
    }

    logCallback(`Hoàn thành cào Google Maps. Đã thu thập ${scrapedLeads.length} địa điểm.`);
    return scrapedLeads;
  } catch (err) {
    logCallback(`Trình cào gặp lỗi: ${err.message}`);
    throw err;
  } finally {
    await browser.close();
  }
}

export async function checkRelevance(brandName, address, category, websiteUrl, logCallback = log) {
  let webContent = '';
  if (websiteUrl && websiteUrl.trim() !== '') {
    webContent = await fetchWebContent(websiteUrl, logCallback);
  }
  return evaluateRelevance(brandName, address, category, websiteUrl, webContent, logCallback);
}

export async function fetchWebContent(url, logCallback = log) {
  if (!url) return '';
  let targetUrl = url.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'http://' + targetUrl;
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 seconds timeout
    
    let userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    if (targetUrl.includes('facebook.com')) {
      userAgent = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
    }

    const response = await fetch(targetUrl, {
      headers: { 
        'User-Agent': userAgent,
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (response.ok) {
      const html = await response.text();
      const metaInfo = extractMetaDescription(html);
      return html + ' ' + metaInfo;
    } else {
      logCallback(`[Fetch Web] Tải website thất bại (HTTP ${response.status}) cho: ${targetUrl}`);
    }
  } catch (err) {
    logCallback(`[Fetch Web] Lỗi khi quét website ${targetUrl}: ${err.message}`);
  }
  return '';
}

function extractMetaDescription(html) {
  let desc = '';
  const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
  if (ogDescMatch) {
    desc += ' ' + ogDescMatch[1];
  }
  
  const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  if (metaDescMatch) {
    desc += ' ' + metaDescMatch[1];
  }
  
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    desc += ' ' + titleMatch[1];
  }
  
  return desc.trim();
}

export function evaluateRelevance(brandName, address, category, websiteUrl, webContent = '', logCallback = log) {
  const keywordsT1 = [
    'sơn mài', 'tranh sơn mài', 'lacquer', 'lacquer painting', 'lacquerware', 'sơn mài mỹ nghệ', 'sơn mài nghệ thuật', 'vóc sơn mài', 'xưởng sơn mài', 'làng nghề sơn mài',
    'tranh nghệ thuật', 'phòng tranh', 'gallery', 'art gallery', 'mỹ thuật', 'fine art', 'tranh sơn dầu', 'tranh acrylic', 'họa sĩ', 'xưởng tranh', 'art studio',
    'gốm sứ mỹ nghệ', 'gốm nghệ thuật', 'ceramic art', 'pottery', 'gốm thủ công', 'làng gốm', 'xưởng gốm',
    'thổ cẩm', 'lụa thủ công', 'thêu tay', 'handmade', 'thủ công mỹ nghệ', 'handicraft', 'craft', 'artisan', 'nghệ nhân',
    'khung tranh', 'xưởng khung tranh', 'đóng khung tranh',
    'mỹ nghệ', 'tranh thêu', 'thêu'
  ];

  const keywordsT2 = [
    'xưởng', 'studio', 'workshop', 'cơ sở sản xuất', 'nhà sản xuất', 'design', 'thiết kế', 'décor', 'decor', 'trang trí nội thất', 'quà tặng nghệ thuật', 'tranh trang trí', 'tranh treo tường', 'nội thất nghệ thuật', 'souvenir', 'craftsmanship'
  ];

  const categoriesT3 = [
    'art gallery', 'art studio', 'artist', 'painting studio', 'pottery store', 'handicraft', 'craft store', 'art supply store', 'souvenir store', 'gift shop', 'manufacturer', 'art dealer', 'cultural center'
  ];

  const negativeKeywords = [
    'sơn nước', 'sơn epoxy', 'sơn xe', 'sơn nhà', 'sơn ô tô', 'bột trét', 'vật liệu xây dựng', 'trang điểm', 'nail', 'phun xăm', 'spa', 'in ấn quảng cáo', 'quán cà phê', 'nhà hàng', 'karaoke'
  ];

  const textToSearch = `${brandName || ''} ${address || ''} ${category || ''} ${webContent || ''}`;
  const searchBody = textToSearch.toLowerCase();
  const searchBodyNoAccent = removeAccents(searchBody);

  const matchedT1 = [];
  keywordsT1.forEach(kw => {
    const kwLower = kw.toLowerCase();
    const kwNoAccent = removeAccents(kwLower);
    if (searchBody.includes(kwLower) || searchBodyNoAccent.includes(kwNoAccent)) {
      matchedT1.push(kw);
    }
  });

  const matchedT2 = [];
  keywordsT2.forEach(kw => {
    const kwLower = kw.toLowerCase();
    const kwNoAccent = removeAccents(kwLower);
    if (searchBody.includes(kwLower) || searchBodyNoAccent.includes(kwNoAccent)) {
      matchedT2.push(kw);
    }
  });

  let matchedT3 = null;
  if (category) {
    const catLower = category.toLowerCase();
    const catLowerNoAccent = removeAccents(catLower);
    const foundCat = categoriesT3.find(cat => {
      const cLower = cat.toLowerCase();
      const cNoAccent = removeAccents(cLower);
      return catLower.includes(cLower) || catLowerNoAccent.includes(cNoAccent);
    });
    if (foundCat) {
      matchedT3 = category;
    }
  }

  const matchedNegatives = [];
  negativeKeywords.forEach(kw => {
    const kwLower = kw.toLowerCase();
    const kwNoAccent = removeAccents(kwLower);
    if (searchBody.includes(kwLower) || searchBodyNoAccent.includes(kwNoAccent)) {
      matchedNegatives.push(kw);
    }
  });

  const hasNoiThatGo = searchBody.includes('nội thất gỗ') || searchBodyNoAccent.includes('noi that go');
  const hasNgheThuat = searchBody.includes('nghệ thuật') || searchBody.includes('art') || searchBodyNoAccent.includes('nghe thuat');
  if (hasNoiThatGo && !hasNgheThuat) {
    matchedNegatives.push('nội thất gỗ (không nghệ thuật)');
  }

  let score = 0;
  let reasons = [];

  if (matchedT1.length > 0) {
    score += matchedT1.length * 3;
    reasons.push(`Khớp Tầng 1 (+${matchedT1.length * 3}đ): ${matchedT1.join(', ')}`);
  }

  if (matchedT1.length > 0 && matchedT2.length > 0) {
    score += matchedT2.length * 1;
    reasons.push(`Khớp Tầng 2 (+${matchedT2.length * 1}đ): ${matchedT2.join(', ')}`);
  } else if (matchedT2.length > 0) {
    reasons.push(`Khớp Tầng 2 nhưng không có Tầng 1 (0đ): ${matchedT2.join(', ')}`);
  }

  if (matchedT3) {
    score += 2;
    reasons.push(`Khớp Danh mục Tầng 3 (+2đ): ${matchedT3}`);
  }

  if (matchedNegatives.length > 0) {
    if (matchedT1.length === 0) {
      score -= matchedNegatives.length * 3;
      reasons.push(`Khớp Từ khóa loại trừ khi không có Tầng 1 (-${matchedNegatives.length * 3}đ): ${matchedNegatives.join(', ')}`);
    } else {
      reasons.push(`Có từ khóa loại trừ nhưng được bỏ qua vì đã khớp Tầng 1: ${matchedNegatives.join(', ')}`);
    }
  }

  if (websiteUrl && websiteUrl.trim() !== '') {
    if (webContent && webContent.trim() !== '') {
      score += 0.5;
      let webReasons = ['Website hoạt động (+0.5đ)'];
      
      const hasImageTags = webContent.includes('<img') || webContent.includes('og:image');
      const hasArtImageKeywords = ['gallery', 'photo', 'image', 'tác phẩm', 'san pham', 'sản phẩm', 'hình ảnh', 'hinh anh'].some(kw => webContent.toLowerCase().includes(kw));
      
      if (hasImageTags && hasArtImageKeywords) {
        score += 0.5;
        webReasons.push('phát hiện hình ảnh nghệ thuật (+0.5đ)');
      }
      reasons.push(webReasons.join(' & '));
    } else {
      reasons.push('Có website nhưng tải lỗi/không hoạt động (0đ)');
    }
  }

  let status = 'rejected';
  if (score > 3) {
    status = 'unverified';
  } else if (score > 0) {
    status = 'pending_review';
  }

  const reasonString = reasons.join('; ');
  logCallback(`[Chấm điểm độ phù hợp] Thương hiệu: "${brandName}" | Điểm: ${score} | Trạng thái: ${status} | Lý do: ${reasonString}`);

  return { status, score, reason: reasonString };
}

function removeAccents(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

