import { get, run, all } from './database.js';
import { scrapeGoogleMaps } from './scraper.js';
import { verifyLead } from './verifier.js';
import { sendZaloInvite, isZaloLoggedIn, syncZaloChat } from './zalo.js';
import { log } from './logger.js';

let isWorkerRunning = false;

function isWithinWorkingHours() {
  const options = { timeZone: 'Asia/Ho_Chi_Minh', hour: 'numeric', minute: 'numeric', hour12: false };
  const formatter = new Intl.DateTimeFormat('vi-VN', options);
  const parts = formatter.formatToParts(new Date());
  
  const hourPart = parts.find(p => p.type === 'hour');
  const minutePart = parts.find(p => p.type === 'minute');
  
  const hour = parseInt(hourPart.value, 10);
  const minute = parseInt(minutePart.value, 10);
  
  // Morning: 08:30 - 12:00 (11:59 is allowed, 12:00 is limit)
  const isMorning = (hour > 8 && hour < 12) || (hour === 8 && minute >= 30);
  
  // Afternoon: 13:30 - 17:00 (16:59 is allowed, 17:00 is limit)
  const isAfternoon = (hour > 13 && hour < 17) || (hour === 13 && minute >= 30);
  
  return isMorning || isAfternoon;
}

// Task runner worker loop
export async function runQueueWorker() {
  if (isWorkerRunning) return;
  
  // Check if automation status is enabled in database
  const statusRow = await get('SELECT value FROM configs WHERE key = "scheduler_status"');
  const schedulerStatus = statusRow ? statusRow.value : 'idle';
  
  if (schedulerStatus !== 'active') {
    log('Tiến trình tự động hóa đang tạm dừng (Idle).');
    await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['current_task', 'Tạm dừng (Idle)']);
    return;
  }

  // Check working hours constraint (8:30 - 12:00 and 13:30 - 17:00 VN time)
  if (!isWithinWorkingHours()) {
    log('Ngoài khung giờ gửi tin nhắn chiến dịch tự động (Cho phép: Sáng 8h30-12h00, Chiều 13h30-17h00 theo giờ VN).');
    await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['current_task', 'Nghỉ ngoài khung giờ gửi tin VN (8h30-12h, 13h30-17h)']);
    return;
  }

  isWorkerRunning = true;
  log('--- KHỞI ĐỘNG CRAWLER QUEUE WORKER ---');

  try {
    // 1. Get next pending job from queue
    const job = await get('SELECT * FROM scheduler_queue WHERE status = "pending" ORDER BY id ASC LIMIT 1');
    
    if (!job) {
      log('Hàng đợi cào trống! Đã xử lý toàn bộ từ khóa và địa điểm.');
      await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['scheduler_status', 'idle']);
      await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['current_task', 'Đã hoàn thành toàn bộ hàng đợi']);
      isWorkerRunning = false;
      return;
    }

    log(`[Tác vụ mới] Bắt đầu xử lý hàng đợi ID ${job.id}: cào "${job.keyword}" tại "${job.location}"`);
    await run('UPDATE scheduler_queue SET status = "running", updated_at = CURRENT_TIMESTAMP WHERE id = ?', [job.id]);
    await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['current_task', `Đang cào: "${job.keyword}" tại "${job.location}"`]);

    // 2. Google Maps Scraping (Targeting 50 leads as requested by user)
    const query = `${job.keyword} ${job.location}`;
    const scrapedLeads = await scrapeGoogleMaps(query, 50);
    const leadsCount = scrapedLeads.length;
    log(`Đã hoàn thành cào GMap. Tìm thấy ${leadsCount} leads.`);
    
    // Update queue job
    await run('UPDATE scheduler_queue SET status = "completed", leads_found = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [leadsCount, job.id]);

    // 3. Verify Leads
    await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['current_task', `Đang xác thực thông tin cho ${leadsCount} leads vừa cào...`]);
    // Fetch all unverified leads
    const unverifiedLeads = await all('SELECT id FROM leads WHERE verification_status = "unverified" LIMIT 50');
    log(`Bắt đầu xác thực danh bạ cho ${unverifiedLeads.length} leads đang chờ...`);
    
    for (const lead of unverifiedLeads) {
      try {
        await verifyLead(lead.id);
        await new Promise(r => setTimeout(r, 2000)); // Delay for IP protection
      } catch (err) {
        log(`Lỗi xác thực lead ID ${lead.id}: ${err.message}`);
      }
    }

    // 4. Zalo Messaging Campaign (Throttle limits: max 30 per worker cycle, safe delays)
    await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['current_task', 'Đang gửi lời mời chiến dịch Zalo...']);
    
    const campaignStatusRow = await get('SELECT value FROM configs WHERE key = "zalo_campaign_status"');
    const campaignStatus = campaignStatusRow ? campaignStatusRow.value : 'idle';
    
    if (campaignStatus !== 'active') {
      log('Chiến dịch gửi tin nhắn kết bạn Zalo đang tạm dừng. Bỏ qua gửi tin nhắn chiến dịch.');
    } else {
      // Fetch all active connected Zalo accounts
      const connectedAccounts = await all("SELECT id, assigned_regions FROM zalo_accounts WHERE status = 'connected'");
      
      if (connectedAccounts.length > 0) {
        log(`Tìm thấy ${connectedAccounts.length} tài khoản Zalo đang kết nối để gửi tin nhắn chiến dịch.`);
        
        for (const acc of connectedAccounts) {
          // Kiểm tra xem chiến dịch có bị tạm dừng đột ngột không trước khi xử lý tài khoản tiếp theo
          const checkStatus = await get('SELECT value FROM configs WHERE key = "zalo_campaign_status"');
          if (!checkStatus || checkStatus.value !== 'active') {
            log('Chiến dịch gửi Zalo bị tạm dừng. Dừng tiến trình gửi tin.');
            break;
          }

          const accountId = acc.id;
          const loggedIn = await isZaloLoggedIn(accountId);
          if (!loggedIn) {
            log(`Tài khoản Zalo ID ${accountId} chưa thực sự đăng nhập (Hoặc mất phiên). Bỏ qua.`);
            continue;
          }

          // 1. Kiểm tra ngày bắt đầu chiến dịch để tính giới hạn hàng ngày
          let startDateRow = await get('SELECT value FROM configs WHERE key = "campaign_start_date"');
          let startDateStr = startDateRow ? startDateRow.value : null;
          if (!startDateStr) {
            startDateStr = new Date().toISOString();
            await run('INSERT OR REPLACE INTO configs (key, value) VALUES ("campaign_start_date", ?)', [startDateStr]);
          }
          
          const startDate = new Date(startDateStr);
          const daysDiff = Math.floor((new Date() - startDate) / (1000 * 60 * 60 * 24));
          
          // Giới hạn theo ngày (50 người trong 7 ngày đầu, 70 người sau 7 ngày, 100 người sau 15 ngày)
          let dailyLimit = 50;
          if (daysDiff >= 7 && daysDiff < 15) {
            dailyLimit = 70;
          } else if (daysDiff >= 15) {
            dailyLimit = 100;
          }
          
          // Đếm số người đã gửi hôm nay bằng tài khoản này (bao gồm cả bot gửi từ webhook)
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
          
          log(`[Zalo ID ${accountId}] Ngày thứ ${daysDiff + 1}. Giới hạn: ${dailyLimit}. Đã gửi hôm nay: ${sentToday}.`);
          
          if (sentToday >= dailyLimit) {
            log(`[Zalo ID ${accountId}] Đã đạt giới hạn gửi trong ngày (${sentToday}/${dailyLimit}). Tạm dừng gửi thêm.`);
            continue;
          }

          const remaining = dailyLimit - sentToday;
          // Lấy lead được gán cho tài khoản này hoặc chưa gán cho ai (NULL)
          let query = `
            SELECT l.id FROM leads l
            WHERE (l.verification_status = 'verified' OR l.verification_status = 'partially_verified') 
              AND l.zalo_status = 'pending' 
              AND (l.assigned_zalo_account_id = ? OR l.assigned_zalo_account_id IS NULL)
          `;
          const params = [accountId];

          if (acc.assigned_regions) {
            const regions = acc.assigned_regions.split(',')
              .map(r => r.trim())
              .filter(Boolean);
            
            if (regions.length > 0) {
              const regionConditions = regions.map(() => `l.city LIKE ?`).join(' OR ');
              query += ` AND (${regionConditions})`;
              regions.forEach(r => params.push(`%${r}%`));
            }
          }

          query += ` LIMIT ?`;
          params.push(remaining);

          const pendingZaloLeads = await all(query, params);
          
          log(`[Zalo ID ${accountId}] Tìm thấy ${pendingZaloLeads.length} danh bạ chờ gửi Zalo.`);
          for (const lead of pendingZaloLeads) {
            // Kiểm tra xem chiến dịch có bị tạm dừng đột ngột không trước khi xử lý lead tiếp theo
            const currentCampaignStatus = await get('SELECT value FROM configs WHERE key = "zalo_campaign_status"');
            if (!currentCampaignStatus || currentCampaignStatus.value !== 'active') {
              log('Chiến dịch gửi Zalo bị tạm dừng. Dừng vòng lặp gửi tin.');
              break;
            }

            try {
              await sendZaloInvite(accountId, lead.id);
              
              // Nghỉ giải lao 5 phút (300 giây) nhưng kiểm tra mỗi giây để có thể ngắt ngay lập tức
              log('Nghỉ giải lao 5 phút (300 giây) trước khi gửi tiếp theo...');
              let interrupted = false;
              for (let i = 0; i < 300; i++) {
                await new Promise(r => setTimeout(r, 1000));
                
                const innerStatus = await get('SELECT value FROM configs WHERE key = "zalo_campaign_status"');
                if (!innerStatus || innerStatus.value !== 'active') {
                  log('Chiến dịch gửi Zalo đã bị tạm dừng trong thời gian nghỉ. Ngắt nghỉ giải lao.');
                  interrupted = true;
                  break;
                }
              }
              if (interrupted) break;
            } catch (err) {
              log(`Lỗi gửi Zalo lead ID ${lead.id}: ${err.message}`);
            }
          }
        }
      } else {
        log('Không có tài khoản Zalo nào đang kết nối hoạt động. Bỏ qua gửi tin nhắn tự động.');
      }
    }

    log(`--- HOÀN TẤT TÁC VỤ HÀNG ĐỢI ID ${job.id} ---`);
    await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['current_task', 'Đang nghỉ giải lao giữa các tác vụ...']);

  } catch (err) {
    log(`Lỗi trong luồng Worker: ${err.message}`);
  } finally {
    isWorkerRunning = false;
    
    // Check if worker should run the next job in the queue
    const statusCheck = await get('SELECT value FROM configs WHERE key = "scheduler_status"');
    if (statusCheck && statusCheck.value === 'active') {
      // Delay 1 minute before running the next search query to prevent Google Maps IP limits
      log('Nghỉ giải lao 60 giây trước khi bắt đầu tác vụ tiếp theo...');
      setTimeout(runQueueWorker, 60000);
    } else {
      await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['current_task', 'Tạm dừng (Idle)']);
    }
  }
}

export function startScheduler() {
  log('Bắt đầu khởi chạy bộ lập lịch tự động (Scheduled Check)...');
  
  // Set default status as active if not configured
  run('INSERT OR IGNORE INTO configs (key, value) VALUES (?, ?)', ['scheduler_status', 'active'])
    .then(() => {
      // Start the worker loop immediately
      runQueueWorker();
    });

  // Check queue status periodically every 5 minutes in case it was paused/resumed
  setInterval(async () => {
    const statusRow = await get('SELECT value FROM configs WHERE key = "scheduler_status"');
    if (statusRow && statusRow.value === 'active' && !isWorkerRunning) {
      runQueueWorker();
    }
  }, 1000 * 60 * 5);

  // Sync Zalo chat logs periodically every 30 minutes
  setInterval(async () => {
    try {
      const connectedAccounts = await all("SELECT id FROM zalo_accounts WHERE status = 'connected'");
      if (connectedAccounts.length === 0) return;
      
      log('--- BẮT ĐẦU ĐỒNG BỘ TIN NHẮN ZALO TỰ ĐỘNG (ĐỊNH KỲ 30 PHÚT) ---');
      
      for (const acc of connectedAccounts) {
        const accountId = acc.id;
        const loggedIn = await isZaloLoggedIn(accountId);
        if (!loggedIn) continue;

        // Lấy lead được chăm sóc bởi tài khoản này
        const contactedLeads = await all(
          "SELECT id FROM leads WHERE zalo_status IN ('message_sent', 'friend_request_sent') AND assigned_zalo_account_id = ?",
          [accountId]
        );
        
        log(`[Zalo ID ${accountId}] Tìm thấy ${contactedLeads.length} lead cần đồng bộ tin nhắn.`);
        for (const lead of contactedLeads) {
          try {
            await syncZaloChat(accountId, lead.id);
            await new Promise(r => setTimeout(r, 3000)); // Delay 3 seconds between leads
          } catch (err) {
            log(`Lỗi đồng bộ Zalo chat cho lead ID ${lead.id}: ${err.message}`);
          }
        }
      }
      log('--- HOÀN TẤT ĐỒNG BỘ TIN NHẮN ZALO ---');
    } catch (err) {
      log(`Lỗi trong tiến trình đồng bộ tin nhắn định kỳ: ${err.message}`);
    }
  }, 1000 * 60 * 30);

  // Check and trigger email reports every minute
  setInterval(async () => {
    try {
      const { checkAndSendScheduledEmail } = await import('./email.js');
      await checkAndSendScheduledEmail();
    } catch (err) {
      log(`Lỗi kiểm tra email định kỳ: ${err.message}`);
    }
  }, 1000 * 60);
}
