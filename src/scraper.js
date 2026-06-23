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

          return { brand_name, phone, website, address };
        });

        const { ward, district, city } = parseAddress(details.address);
        
        const lead = {
          brand_name: details.brand_name,
          phone: details.phone,
          website: details.website,
          address: details.address,
          ward,
          district,
          city,
          verification_status: 'unverified',
          zalo_status: 'pending'
        };

        logCallback(`Cào được: ${lead.brand_name} | SĐT: ${lead.phone || 'Không có'} | Web: ${lead.website || 'Không có'}`);
        
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
              `INSERT INTO leads (brand_name, phone, website, address, ward, district, city, verification_status, zalo_status) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [lead.brand_name, lead.phone || null, lead.website || null, lead.address || null, lead.ward || null, lead.district || null, lead.city || null, 'unverified', 'pending']
            );
            logCallback(`Đã lưu "${lead.brand_name}" (SĐT: ${lead.phone || 'Không có'}) vào cơ sở dữ liệu.`);
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
