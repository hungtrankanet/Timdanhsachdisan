import puppeteer from 'puppeteer';
import { get, run, all } from './database.js';
import { scrapeGoogleMaps } from './scraper.js';
import { verifyLead } from './verifier.js';
import { sendZaloInvite, isZaloLoggedIn, syncZaloChat, initZaloSession, closeZaloSession } from './zalo.js';
import { log, logMaps, logZalo } from './logger.js';

let isWorkerRunning = false;
let isZaloWorkerRunning = false;

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

// Luồng 1: Tác vụ cào Google Maps & Xác thực số điện thoại
export async function runQueueWorker() {
  if (isWorkerRunning) return;
  
  // Check if automation status is enabled in database
  const statusRow = await get('SELECT value FROM configs WHERE key = "scheduler_status"');
  const schedulerStatus = statusRow ? statusRow.value : 'idle';
  
  if (schedulerStatus !== 'active') {
    logMaps('Tiến trình tự động hóa cào Maps đang tạm dừng (Idle).');
    await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['current_task', 'Tạm dừng (Idle)']);
    return;
  }

  isWorkerRunning = true;
  logMaps('--- KHỞI ĐỘNG CRAWLER QUEUE WORKER ---');

  try {
    // 1. Get next pending job from queue
    const job = await get('SELECT * FROM scheduler_queue WHERE status = "pending" ORDER BY id ASC LIMIT 1');
    
    if (!job) {
      logMaps('Hàng đợi cào trống! Đã xử lý toàn bộ từ khóa và địa điểm.');
      await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['scheduler_status', 'idle']);
      await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['current_task', 'Đã hoàn thành toàn bộ hàng đợi']);
      isWorkerRunning = false;
      return;
    }

    logMaps(`[Tác vụ mới] Bắt đầu xử lý hàng đợi ID ${job.id}: cào "${job.keyword}" tại "${job.location}"`);
    await run('UPDATE scheduler_queue SET status = "running", updated_at = CURRENT_TIMESTAMP WHERE id = ?', [job.id]);
    await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['current_task', `Đang cào: "${job.keyword}" tại "${job.location}"`]);

    // 2. Google Maps Scraping (Targeting 50 leads)
    const query = `${job.keyword} ${job.location}`;
    const scrapedLeads = await scrapeGoogleMaps(query, 50);
    const leadsCount = scrapedLeads.length;
    logMaps(`Đã hoàn thành cào GMap. Tìm thấy ${leadsCount} leads.`);
    
    // Update queue job
    await run('UPDATE scheduler_queue SET status = "completed", leads_found = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [leadsCount, job.id]);

    // 3. Verify Leads (with 2 seconds delay to protect Google quota/IP block)
    await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['current_task', `Đang xác thực thông tin cho ${leadsCount} leads vừa cào...`]);
    const unverifiedLeads = await all('SELECT id FROM leads WHERE verification_status = "unverified" LIMIT 50');
    logMaps(`Bắt đầu xác thực danh bạ cho ${unverifiedLeads.length} leads đang chờ...`);
    
    let sharedBrowser = null;
    try {
      if (unverifiedLeads.length > 0) {
        sharedBrowser = await puppeteer.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions',
            '--no-first-run',
            '--no-zygote',
            '--js-flags="--max-old-space-size=128"'
          ],
        });
      }

      for (const lead of unverifiedLeads) {
        // Check scheduler status before each verification
        const checkStatus = await get('SELECT value FROM configs WHERE key = "scheduler_status"');
        if (!checkStatus || checkStatus.value !== 'active') {
          logMaps('Tiến trình tự động hóa cào Maps bị tạm dừng trong khi đang xác thực. Dừng xác thực.');
          break;
        }

        try {
          await verifyLead(lead.id, logMaps, sharedBrowser);
          await new Promise(r => setTimeout(r, 2000)); // 2 seconds delay for IP protection
        } catch (err) {
          logMaps(`Lỗi xác thực lead ID ${lead.id}: ${err.message}`);
        }
      }
    } catch (launchErr) {
      logMaps(`Lỗi khởi tạo trình duyệt dùng chung cho xác thực: ${launchErr.message}`);
    } finally {
      if (sharedBrowser) {
        try {
          await sharedBrowser.close();
          logMaps('Đã đóng trình duyệt xác thực dùng chung.');
        } catch (closeErr) {}
      }
    }

    logMaps(`--- HOÀN TẤT TÁC VỤ HÀNG ĐỢI ID ${job.id} ---`);
    await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['current_task', 'Đang nghỉ giải lao giữa các tác vụ...']);

  } catch (err) {
    logMaps(`Lỗi trong luồng Worker cào Maps: ${err.message}`);
  } finally {
    isWorkerRunning = false;
    
    // Check if worker should run the next job in the queue
    const statusCheck = await get('SELECT value FROM configs WHERE key = "scheduler_status"');
    if (statusCheck && statusCheck.value === 'active') {
      logMaps('Nghỉ giải lao 60 giây trước khi bắt đầu tác vụ tiếp theo...');
      setTimeout(runQueueWorker, 60000);
    } else {
      await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['current_task', 'Tạm dừng (Idle)']);
    }
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
            
            // Nghỉ giải lao 5 phút (300 giây) nhưng kiểm tra mỗi giây để có thể ngắt ngay lập tức
            logZalo('Nghỉ giải lao 5 phút (300 giây) trước khi gửi tiếp theo...');
            let interrupted = false;
            for (let i = 0; i < 300; i++) {
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

export function startScheduler() {
  logMaps('Bắt đầu khởi chạy bộ lập lịch tự động (Scheduled Check)...');
  
  // Khởi động luồng 1 (Scraper & Verifier)
  run('INSERT OR IGNORE INTO configs (key, value) VALUES (?, ?)', ['scheduler_status', 'active'])
    .then(() => {
      runQueueWorker();
    });

  // Khởi động luồng 2 (Zalo Campaign)
  run('INSERT OR IGNORE INTO configs (key, value) VALUES (?, ?)', ['zalo_campaign_status', 'idle'])
    .then(() => {
      runZaloCampaignWorker();
    });

  // Check queue status periodically every 5 minutes in case it was paused/resumed
  setInterval(async () => {
    const statusRow = await get('SELECT value FROM configs WHERE key = "scheduler_status"');
    if (statusRow && statusRow.value === 'active' && !isWorkerRunning) {
      runQueueWorker();
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
