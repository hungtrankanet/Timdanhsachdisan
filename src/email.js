import nodemailer from 'nodemailer';
import { get, run, all } from './database.js';
import { log } from './logger.js';

// Get daily statistics from database
async function getDailyStats() {
  const now = new Date();
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  const vnTime = new Date(utcTime + (7 * 60 * 60 * 1000));
  vnTime.setHours(0, 0, 0, 0);
  const vnStartOfDayInUTC = new Date(vnTime.getTime() - (7 * 60 * 60 * 1000));
  const startOfDayIso = vnStartOfDayInUTC.toISOString();

  // 1. Leads verified today
  const verifiedRow = await get(
    "SELECT COUNT(*) as count FROM leads WHERE (verification_status = 'verified' OR verification_status = 'partially_verified') AND updated_at >= ?",
    [startOfDayIso]
  );
  const verifiedCount = verifiedRow ? verifiedRow.count : 0;

  // 2. Zalo messages sent today
  const sentMsgsRow = await get(
    "SELECT COUNT(*) as count FROM zalo_chat_logs WHERE (sender = 'me' OR sender = 'bot') AND timestamp >= ?",
    [startOfDayIso]
  );
  const sentMsgsCount = sentMsgsRow ? sentMsgsRow.count : 0;

  // 3. Friend requests sent today (zalo_status updated today)
  const friendRequestsRow = await get(
    "SELECT COUNT(*) as count FROM leads WHERE zalo_status = 'friend_request_sent' AND updated_at >= ?",
    [startOfDayIso]
  );
  const friendRequestsCount = friendRequestsRow ? friendRequestsRow.count : 0;

  // 4. Active Zalo Accounts status
  const accounts = await all("SELECT id, display_name, phone, status, custom_name, assigned_regions FROM zalo_accounts");

  // 5. Crawler Queue Status
  const pendingJobsRow = await get("SELECT COUNT(*) as count FROM scheduler_queue WHERE status = 'pending'");
  const pendingJobsCount = pendingJobsRow ? pendingJobsRow.count : 0;

  const completedJobsRow = await get(
    "SELECT COUNT(*) as count FROM scheduler_queue WHERE status = 'completed' AND updated_at >= ?",
    [startOfDayIso]
  );
  const completedJobsCount = completedJobsRow ? completedJobsRow.count : 0;

  return {
    verifiedCount,
    sentMsgsCount,
    friendRequestsCount,
    accounts,
    pendingJobsCount,
    completedJobsCount,
    reportDate: vnTime.toLocaleDateString('vi-VN')
  };
}

export async function sendDailyReport() {
  log('Bắt đầu chuẩn bị gửi báo cáo email định kỳ...');

  // Load configs
  const hostRow = await get("SELECT value FROM configs WHERE key = 'smtp_host'");
  const portRow = await get("SELECT value FROM configs WHERE key = 'smtp_port'");
  const userRow = await get("SELECT value FROM configs WHERE key = 'smtp_user'");
  const passRow = await get("SELECT value FROM configs WHERE key = 'smtp_pass'");
  const fromRow = await get("SELECT value FROM configs WHERE key = 'smtp_from'");
  const toRow = await get("SELECT value FROM configs WHERE key = 'report_receiver'");
  const enabledRow = await get("SELECT value FROM configs WHERE key = 'email_reporting_enabled'");

  const enabled = enabledRow ? enabledRow.value === 'true' : false;
  if (!enabled) {
    log('Báo cáo qua email chưa được kích hoạt (email_reporting_enabled = false). Bỏ qua.');
    return;
  }

  const host = hostRow ? hostRow.value : '';
  const port = portRow ? parseInt(portRow.value, 10) : 587;
  const user = userRow ? userRow.value : '';
  const pass = passRow ? passRow.value : '';
  const from = fromRow ? fromRow.value : `"Zalo CRM System" <${user}>`;
  const to = toRow ? toRow.value : '';

  if (!host || !user || !pass || !to) {
    log('Cấu hình SMTP chưa đầy đủ (smtp_host, smtp_user, smtp_pass, report_receiver). Không thể gửi.');
    return;
  }

  try {
    const stats = await getDailyStats();

    // Create SMTP transporter
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // True for 465, false for other ports
      auth: { user, pass },
      tls: { rejectUnauthorized: false }
    });

    // Build HTML email template
    let accountsHtml = '';
    stats.accounts.forEach(acc => {
      const name = acc.custom_name || acc.display_name || 'Tài khoản Zalo';
      const statusBadge = acc.status === 'connected' 
        ? '<span style="color:#2e7d32;font-weight:bold;">Đang kết nối</span>' 
        : '<span style="color:#c62828;font-weight:bold;">Mất kết nối</span>';
      
      accountsHtml += `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${name} (${acc.phone || 'N/A'})</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${statusBadge}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${acc.assigned_regions || 'Tất cả'}</td>
        </tr>
      `;
    });

    if (stats.accounts.length === 0) {
      accountsHtml = `<tr><td colspan="3" style="padding:8px;text-align:center;color:#666;">Chưa gán tài khoản Zalo nào.</td></tr>`;
    }

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #fcfcfc;">
        <h2 style="color: #8c1d1d; border-bottom: 2px solid #d4af37; padding-bottom: 10px; margin-top: 0;">Báo Cáo Hoạt Động Định Kỳ CRM - ${stats.reportDate}</h2>
        <p>Xin chào quản trị viên,</p>
        <p>Dưới đây là thống kê chi tiết các hoạt động tự động hóa của chiến dịch <strong>Trăm Năm Di Sản Sơn Mài</strong> ngày hôm nay:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr style="background-color: #f2f2f2;">
            <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Chỉ số hoạt động</th>
            <th style="padding: 10px; text-align: right; border-bottom: 1px solid #ddd;">Số lượng</th>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">Nghệ nhân & Cửa hàng đã xác thực mới</td>
            <td style="padding: 10px; text-align: right; border-bottom: 1px solid #ddd; font-weight: bold; color: #2e7d32;">${stats.verifiedCount}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">Lời mời kết bạn Zalo đã gửi</td>
            <td style="padding: 10px; text-align: right; border-bottom: 1px solid #ddd; font-weight: bold; color: #f57c00;">${stats.friendRequestsCount}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">Tin nhắn Zalo đã trao đổi (Bot + Staff)</td>
            <td style="padding: 10px; text-align: right; border-bottom: 1px solid #ddd; font-weight: bold; color: #1565c0;">${stats.sentMsgsCount}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">Tác vụ cào Google Maps đã hoàn thành</td>
            <td style="padding: 10px; text-align: right; border-bottom: 1px solid #ddd; font-weight: bold;">${stats.completedJobsCount}</td>
          </tr>
          <tr style="background-color: #fafafa;">
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">Tác vụ còn lại trong hàng đợi</td>
            <td style="padding: 10px; text-align: right; border-bottom: 1px solid #ddd; font-weight: bold; color: #757575;">${stats.pendingJobsCount}</td>
          </tr>
        </table>

        <h3 style="color: #8c1d1d; border-bottom: 1px dashed #d4af37; padding-bottom: 5px;">Trạng thái các tài khoản Zalo Web</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px;">
          <thead>
            <tr style="background-color:#eaeaea;">
              <th style="padding:8px;text-align:left;">Tài khoản</th>
              <th style="padding:8px;text-align:left;">Trạng thái</th>
              <th style="padding:8px;text-align:left;">Khu vực phụ trách</th>
            </tr>
          </thead>
          <tbody>
            ${accountsHtml}
          </tbody>
        </table>
        
        <p style="font-size: 12px; color: #666; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 10px;">
          Báo cáo này được tạo tự động từ hệ thống Zalo CRM Trăm Năm Di Sản Sơn Mài.<br/>
          Vui lòng không trả lời trực tiếp email này.
        </p>
      </div>
    `;

    await transporter.sendMail({
      from,
      to,
      subject: `[Zalo CRM] Báo Cáo Hoạt Động Định Kỳ ${stats.reportDate}`,
      html: htmlContent
    });

    log(`Đã gửi email báo cáo thành công tới: ${to}`);
    return true;
  } catch (err) {
    log(`Lỗi khi gửi báo cáo email: ${err.message}`);
    return false;
  }
}

// Check and trigger daily email report in scheduler loop
export async function checkAndSendScheduledEmail() {
  try {
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
    const vnTime = new Date(utcTime + (7 * 60 * 60 * 1000));
    
    const hour = vnTime.getHours();
    
    // Send report daily between 17:00 and 18:00 (5 PM to 6 PM VN Time)
    if (hour === 17) {
      const vnDateStr = vnTime.getFullYear() + '-' + String(vnTime.getMonth() + 1).padStart(2, '0') + '-' + String(vnTime.getDate()).padStart(2, '0');
      
      const lastSentRow = await get("SELECT value FROM configs WHERE key = 'last_email_report_date'");
      const lastSentDate = lastSentRow ? lastSentRow.value : '';
      
      if (lastSentDate !== vnDateStr) {
        log(`Đến giờ gửi báo cáo email hàng ngày VN (17h). Ngày báo cáo: ${vnDateStr}`);
        const success = await sendDailyReport();
        if (success) {
          await run("INSERT OR REPLACE INTO configs (key, value) VALUES ('last_email_report_date', ?)", [vnDateStr]);
        }
      }
    }
  } catch (err) {
    log(`Lỗi kiểm tra lịch gửi email: ${err.message}`);
  }
}
