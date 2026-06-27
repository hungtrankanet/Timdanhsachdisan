import puppeteer from 'puppeteer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { run } from './database.js';
import { log } from './logger.js';
import { activeSessions, isZaloLoggedIn } from './zalo_state.js';

export { activeSessions, isZaloLoggedIn } from './zalo_state.js';
export { sendZaloInvite, syncZaloChat, sendZaloMessageDirect } from './zalo_actions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const userDataDir = join(__dirname, '../zalo_user_data');

function cleanChromeLock(sessionDir, logCallback = log) {
  try {
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    for (const file of lockFiles) {
      const lockPath = join(sessionDir, file);
      try {
        if (fs.existsSync(lockPath) || fs.lstatSync(lockPath)) {
          fs.unlinkSync(lockPath);
          logCallback(`[Zalo Init] Đã dọn dẹp file lock Chrome: ${file}`);
        }
      } catch (e) {}
    }
  } catch (err) {
    console.error('[Zalo Init] Lỗi dọn dẹp file lock Chrome:', err.message);
  }
}

export async function initZaloSession(accountId = 'default', logCallback = log, headless = true) {
  if (activeSessions.has(accountId)) {
    try {
      const session = activeSessions.get(accountId);
      await session.browser.version();
      logCallback(`Phiên Zalo ID ${accountId} đã hoạt động.`);
      return;
    } catch (e) {
      activeSessions.delete(accountId);
    }
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const runHeadless = isProduction ? true : headless;

  logCallback(`Khởi chạy trình duyệt Zalo Web cho tài khoản ID ${accountId} (headless: ${runHeadless})...`);
  const sessionDir = join(userDataDir, `account_${accountId}`);
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  cleanChromeLock(sessionDir, logCallback);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: runHeadless,
      userDataDir: sessionDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-notifications',
        '--window-size=1280,800',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--no-first-run',
        '--no-zygote',
        '--js-flags="--max-old-space-size=256"'
      ]
    });
  } catch (err) {
    logCallback(`[LỖI KHỞI CHẠY BROWSER] Thất bại khi mở Zalo ID ${accountId}: ${err.message}`);
    throw err;
  }

  const page = (await browser.pages())[0] || await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  
  logCallback(`[Zalo ID ${accountId}] Đang tải trang chat.zalo.me...`);
  await page.goto('https://chat.zalo.me', { waitUntil: 'networkidle2', timeout: 60000 });
  
  const sessionData = { browser, page, screenshotInterval: null };
  activeSessions.set(accountId, sessionData);

  const loggedIn = await isZaloLoggedIn(accountId, true);
  if (loggedIn) {
    logCallback(`[Zalo ID ${accountId}] Phiên đăng nhập được tải thành công.`);
    await run("UPDATE zalo_accounts SET status = 'connected', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [accountId]);
  } else {
    logCallback(`[Zalo ID ${accountId}] Yêu cầu đăng nhập. Bắt đầu chụp ảnh mã QR...`);
    
    const snapPath = join(__dirname, `../public/zalo_screenshot_${accountId}.png`);
    if (fs.existsSync(snapPath)) fs.unlinkSync(snapPath);

    sessionData.screenshotInterval = setInterval(async () => {
      try {
        const session = activeSessions.get(accountId);
        if (!session || !session.page) return;
        
        const loggedInNow = await isZaloLoggedIn(accountId, true);
        if (loggedInNow) {
          logCallback(`[Zalo ID ${accountId}] Đăng nhập thành công! Đang tắt bộ chụp màn hình...`);
          clearInterval(session.screenshotInterval);
          session.screenshotInterval = null;
          
          if (fs.existsSync(snapPath)) fs.unlinkSync(snapPath);
          
          const profileInfo = await session.page.evaluate(() => {
            const nameEl = document.querySelector('.current-user-name') || document.querySelector('[class*="profile"]');
            return nameEl ? nameEl.innerText.trim() : 'Zalo Account';
          }).catch(() => 'Zalo Account');
          
          await run(
            "UPDATE zalo_accounts SET status = 'connected', display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [profileInfo, accountId]
          );

          // GIỮ SESSION SỐNG — không đóng browser sau đăng nhập
          // Campaign worker sẽ dùng activeSessions để gửi tin
          logCallback(`[Zalo ID ${accountId}] Phiên Zalo đang chạy nền sẵn sàng gửi tin.`);
          return;
        }

        await session.page.screenshot({ path: snapPath });
      } catch (err) {
        console.error(`Error taking Zalo QR for account ${accountId}:`, err.message);
      }
    }, 2000);
  }
}

export async function closeZaloSession(accountId = 'default') {
  const session = activeSessions.get(accountId);
  if (session) {
    if (session.screenshotInterval) {
      clearInterval(session.screenshotInterval);
    }
    try {
      const snapPath = join(__dirname, `../public/zalo_screenshot_${accountId}.png`);
      if (fs.existsSync(snapPath)) fs.unlinkSync(snapPath);
    } catch(e) {}
    
    try {
      await session.browser.close();
    } catch(e) {}
    activeSessions.delete(accountId);
  }
  
  await run("UPDATE zalo_accounts SET status = 'disconnected', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [accountId]);
}

export async function restoreZaloSessions(logCallback = log) {
  logCallback('[Zalo] Khởi động chế độ On-Demand. Bỏ qua việc tự động chạy Chrome cho tất cả tài khoản.');
}
