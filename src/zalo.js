import puppeteer from 'puppeteer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { run, get, all } from './database.js';
import { log } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const userDataDir = join(__dirname, '../zalo_user_data');

// Map để quản lý các phiên Zalo chạy song song (key: accountId, value: { browser, page, screenshotInterval })
const activeSessions = new Map();

export async function isZaloLoggedIn(accountId = 'default') {
  const session = activeSessions.get(accountId);
  if (!session || !session.browser || !session.page) return false;
  try {
    const searchInput = await session.page.$('input[placeholder*="Tìm kiếm"], input[placeholder*="Search"], #contact-search-input');
    return searchInput !== null;
  } catch (e) {
    return false;
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

  logCallback(`Khởi chạy trình duyệt Zalo Web cho tài khoản ID ${accountId} (headless: ${headless})...`);
  const sessionDir = join(userDataDir, `account_${accountId}`);
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: headless,
    userDataDir: sessionDir,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-notifications',
      '--window-size=1280,800'
    ]
  });

  const page = (await browser.pages())[0] || await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  
  logCallback(`[Zalo ID ${accountId}] Đang tải trang chat.zalo.me...`);
  await page.goto('https://chat.zalo.me', { waitUntil: 'networkidle2', timeout: 60000 });
  
  // Lưu thông tin phiên tạm thời vào Map
  const sessionData = { browser, page, screenshotInterval: null };
  activeSessions.set(accountId, sessionData);

  const loggedIn = await isZaloLoggedIn(accountId);
  if (loggedIn) {
    logCallback(`[Zalo ID ${accountId}] Phiên đăng nhập được tải thành công.`);
    // Cập nhật database trạng thái tài khoản
    await run("UPDATE zalo_accounts SET status = 'connected', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [accountId]);
  } else {
    logCallback(`[Zalo ID ${accountId}] Yêu cầu đăng nhập. Bắt đầu chụp ảnh mã QR...`);
    
    // Start taking screenshots periodically for the frontend
    const snapPath = join(__dirname, `../public/zalo_screenshot_${accountId}.png`);
    if (fs.existsSync(snapPath)) fs.unlinkSync(snapPath);

    sessionData.screenshotInterval = setInterval(async () => {
      try {
        const session = activeSessions.get(accountId);
        if (!session || !session.page) return;
        
        const loggedInNow = await isZaloLoggedIn(accountId);
        if (loggedInNow) {
          logCallback(`[Zalo ID ${accountId}] Đăng nhập thành công! Đang tắt bộ chụp màn hình...`);
          clearInterval(session.screenshotInterval);
          session.screenshotInterval = null;
          
          if (fs.existsSync(snapPath)) fs.unlinkSync(snapPath);
          
          // Cập nhật tên hiển thị và SĐT của Zalo sau khi đăng nhập thành công
          const profileInfo = await session.page.evaluate(() => {
            const nameEl = document.querySelector('.current-user-name') || document.querySelector('[class*="profile"]');
            return nameEl ? nameEl.innerText.trim() : 'Zalo Account';
          });
          
          await run(
            "UPDATE zalo_accounts SET status = 'connected', display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [profileInfo, accountId]
          );
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
  try {
    const db = await import('./database.js');
    const connectedAccounts = await db.all("SELECT id FROM zalo_accounts WHERE status = 'connected'");
    logCallback(`Đang khôi phục ${connectedAccounts.length} phiên kết nối Zalo đã có từ trước...`);
    for (const acc of connectedAccounts) {
      try {
        await initZaloSession(acc.id, logCallback, true); // Khởi chạy không giao diện để chạy ngầm
      } catch (err) {
        logCallback(`Lỗi khôi phục tài khoản Zalo ID ${acc.id}: ${err.message}`);
      }
    }
  } catch (err) {
    logCallback(`Lỗi trong luồng khôi phục phiên Zalo: ${err.message}`);
  }
}

export async function sendZaloInvite(accountId, leadId, logCallback = log) {
  const session = activeSessions.get(accountId);
  if (!session || !session.page) {
    throw new Error(`Chưa thiết lập phiên kết nối Zalo cho tài khoản ID ${accountId}.`);
  }
  const zaloPage = session.page;

  const lead = await get('SELECT * FROM leads WHERE id = ?', [leadId]);
  if (!lead || !lead.phone) {
    logCallback(`Lead ${leadId} không có số điện thoại. Bỏ qua.`);
    return;
  }

  const phone = lead.phone.trim();
  logCallback(`[Zalo ID ${accountId}] Đang tiến hành gửi Zalo cho: ${lead.brand_name} (${phone})`);

  try {
    const searchInputSelector = 'input[placeholder*="Tìm kiếm"], input[placeholder*="Search"], #contact-search-input';
    await zaloPage.waitForSelector(searchInputSelector, { timeout: 15000 });
    
    await zaloPage.click(searchInputSelector, { clickCount: 3 });
    await zaloPage.keyboard.press('Backspace');
    await new Promise(r => setTimeout(r, 500));
    
    await zaloPage.type(searchInputSelector, phone, { delay: 100 });
    await new Promise(r => setTimeout(r, 2000));
    await zaloPage.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 2000));

    const notFound = await zaloPage.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Không tìm thấy kết quả') || 
             text.includes('Số điện thoại chưa đăng ký') ||
             text.includes('chưa sử dụng Zalo');
    });

    if (notFound) {
      logCallback(`[Zalo ID ${accountId}] SĐT chưa đăng ký Zalo: ${phone}`);
      await run("UPDATE leads SET zalo_status = 'not_found', zalo_notes = 'Số điện thoại chưa đăng ký Zalo', assigned_zalo_account_id = ? WHERE id = ?", [accountId, leadId]);
      return;
    }

    await zaloPage.waitForSelector('#richInput, div[contenteditable="true"]', { timeout: 10000 });

    const friendStatus = await zaloPage.evaluate(async () => {
      const buttons = Array.from(document.querySelectorAll('button, div, span'));
      const addFriendBtn = buttons.find(b => b.innerText && b.innerText.trim() === 'Kết bạn');
      if (addFriendBtn) {
        addFriendBtn.click();
        return 'clicked';
      }
      return 'already_friend';
    });

    let notes = [];
    if (friendStatus === 'clicked') {
      logCallback(`[Zalo ID ${accountId}] Đang mở hộp thoại gửi lời mời kết bạn...`);
      await new Promise(r => setTimeout(r, 1500));
      
      const requestText = `Chào anh/chị, em bên dự án Trăm Năm Di Sản Sơn Mài. Muốn kết bạn gửi thông tin tặng quyền hội viên ạ.`;
      
      await zaloPage.evaluate((text) => {
        const textareas = Array.from(document.querySelectorAll('textarea, input[type="text"]'));
        const box = textareas.find(t => t.value !== undefined) || document.querySelector('.modal textarea');
        if (box) {
          box.value = '';
          box.focus();
        }
      });
      
      await zaloPage.keyboard.down('Control');
      await zaloPage.keyboard.press('A');
      await zaloPage.keyboard.up('Control');
      await zaloPage.keyboard.press('Backspace');
      await zaloPage.type('textarea, input[type="text"]', requestText, { delay: 50 });
      await new Promise(r => setTimeout(r, 1000));
      
      await zaloPage.evaluate(() => {
        const modalButtons = Array.from(document.querySelectorAll('.modal button, div[role="dialog"] button'));
        const sendBtn = modalButtons.find(b => b.innerText && (b.innerText.includes('Kết bạn') || b.innerText.includes('Gửi')));
        if (sendBtn) sendBtn.click();
      });
      
      notes.push('Đã gửi kết bạn.');
      await new Promise(r => setTimeout(r, 2000));
    } else {
      logCallback(`[Zalo ID ${accountId}] Đã là bạn bè hoặc không thấy nút kết bạn.`);
      notes.push('Đã là bạn bè/Không cần kết bạn.');
    }

    logCallback(`[Zalo ID ${accountId}] Đang soạn và gửi tin nhắn chiến dịch...`);
    const messageText = `Kính gửi anh/chị,\n\nEm đại diện Ban tổ chức "Hành trình Trăm năm Di sản Hội họa Sơn mài Mỹ thuật Việt Nam".\n\nChúng em xin gửi tặng anh/chị quyền lợi hội viên viết bài miễn phí giới thiệu thương hiệu và tác phẩm trên trang web chính thức của dự án: https://tramnamdisanhoihoavasonmai.vn\n\nĐồng thời, trân trọng kính mời anh/chị đăng sản phẩm lên trang để cộng đồng bình chọn các tác phẩm sơn mài tiêu biểu.\n\nChúc anh/chị nhiều sức khỏe và sáng tạo!`;
    
    const chatInputSelector = '#richInput, div[contenteditable="true"]';
    await zaloPage.click(chatInputSelector);
    await new Promise(r => setTimeout(r, 500));

    await zaloPage.keyboard.down('Control');
    await zaloPage.keyboard.press('A');
    await zaloPage.keyboard.up('Control');
    await zaloPage.keyboard.press('Backspace');
    
    const lines = messageText.split('\n');
    for (let line of lines) {
      await zaloPage.type(chatInputSelector, line);
      await zaloPage.keyboard.down('Shift');
      await zaloPage.keyboard.press('Enter');
      await zaloPage.keyboard.up('Shift');
    }
    
    await new Promise(r => setTimeout(r, 1000));
    await zaloPage.keyboard.press('Enter');
    logCallback(`[Zalo ID ${accountId}] Đã nhấn Enter để gửi tin nhắn.`);
    
    // Wait to verify if message was successfully sent or blocked
    await new Promise(r => setTimeout(r, 2000));
    
    const blockReason = await zaloPage.evaluate(() => {
      const text = document.body.innerText;
      if (text.includes('không thể nhắn tin') || text.includes('chưa thể gửi tin nhắn') || text.includes('bị chặn')) {
        return 'blocked';
      }
      if (text.includes('chỉ nhận tin nhắn từ bạn bè')) {
        return 'only_friends';
      }
      return null;
    });

    let finalStatus = 'message_sent';
    if (blockReason === 'blocked') {
      logCallback(`[Zalo ID ${accountId}] Phát hiện bị chặn nhắn tin cho SĐT: ${phone}`);
      notes.push('Bị chặn nhắn tin.');
      finalStatus = 'blocked';
    } else if (blockReason === 'only_friends') {
      logCallback(`[Zalo ID ${accountId}] Phát hiện chỉ nhận tin nhắn từ bạn bè cho SĐT: ${phone}`);
      notes.push('Chỉ nhận bạn bè (Đã gửi kết bạn).');
      finalStatus = 'friend_request_sent';
    } else {
      logCallback(`[Zalo ID ${accountId}] Đã gửi tin nhắn mời thành công.`);
      notes.push('Đã gửi tin mời.');
    }

    await run("UPDATE leads SET zalo_status = ?, zalo_notes = ?, assigned_zalo_account_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [finalStatus, notes.join(' | '), accountId, leadId]);
    
    // Lưu tin nhắn chiến dịch vừa gửi vào chat log của lead nếu không bị chặn hoàn toàn
    if (finalStatus !== 'blocked') {
      const nowIso = new Date().toISOString();
      await run(
        "INSERT OR IGNORE INTO zalo_chat_logs (lead_id, sender, message, timestamp, zalo_account_id) VALUES (?, 'me', ?, ?, ?)",
        [leadId, messageText, nowIso, accountId]
      );
    }
    
  } catch (err) {
    logCallback(`Lỗi gửi Zalo từ tài khoản ${accountId} đến ${phone}: ${err.message}`);
    await run("UPDATE leads SET zalo_status = 'failed', zalo_notes = ?, assigned_zalo_account_id = ? WHERE id = ?", [err.message, accountId, leadId]);
  }
}

export async function syncZaloChat(accountId, leadId, logCallback = log) {
  const session = activeSessions.get(accountId);
  if (!session || !session.page) {
    throw new Error(`Chưa thiết lập phiên kết nối Zalo cho tài khoản ID ${accountId}.`);
  }
  const zaloPage = session.page;

  const lead = await get('SELECT * FROM leads WHERE id = ?', [leadId]);
  if (!lead || !lead.phone) {
    logCallback(`Lead ${leadId} không có số điện thoại. Bỏ qua.`);
    return;
  }

  // Assign the lead to this Zalo account if it's currently unassigned
  if (lead.assigned_zalo_account_id === null) {
    await run('UPDATE leads SET assigned_zalo_account_id = ? WHERE id = ?', [accountId, leadId]);
  }

  const phone = lead.phone.trim();
  logCallback(`[Zalo ID ${accountId}] Đang tiến hành đồng bộ Zalo chat cho: ${lead.brand_name} (${phone})`);

  try {
    const searchInputSelector = 'input[placeholder*="Tìm kiếm"], input[placeholder*="Search"], #contact-search-input';
    await zaloPage.waitForSelector(searchInputSelector, { timeout: 15000 });
    
    await zaloPage.click(searchInputSelector, { clickCount: 3 });
    await zaloPage.keyboard.press('Backspace');
    await new Promise(r => setTimeout(r, 500));
    
    await zaloPage.type(searchInputSelector, phone, { delay: 100 });
    await new Promise(r => setTimeout(r, 2000));
    await zaloPage.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 2000));

    const notFound = await zaloPage.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Không tìm thấy kết quả') || 
             text.includes('Số điện thoại chưa đăng ký') ||
             text.includes('chưa sử dụng Zalo');
    });

    if (notFound) {
      logCallback(`[Zalo ID ${accountId}] SĐT chưa đăng ký Zalo hoặc không tìm thấy: ${phone}`);
      return;
    }

    // Wait for the message items to appear or timeout
    try {
      await zaloPage.waitForSelector('.chat-item, [class*="chat-item"]', { timeout: 5000 });
    } catch (e) {
      logCallback(`[Zalo ID ${accountId}] Chưa có tin nhắn nào trong hội thoại này.`);
    }

    const scrapedMessages = await zaloPage.evaluate(() => {
      const chatContainer = document.querySelector('.chat-message-list') || 
                            document.querySelector('.chat-date-picker-container')?.parentElement || 
                            document.querySelector('[class*="chat-message"]');
      if (!chatContainer) return [];

      const rectContainer = chatContainer.getBoundingClientRect();
      const centerContainer = rectContainer.left + rectContainer.width / 2;

      const items = Array.from(chatContainer.querySelectorAll('.chat-item, [class*="chat-item"]'));
      
      return items.map(item => {
        const rectItem = item.getBoundingClientRect();
        const itemCenter = rectItem.left + rectItem.width / 2;
        
        // Phân loại sender: ưu tiên kiểm tra class .chatted-me của Zalo Web, fallback bằng tọa độ center
        const hasChattedMe = item.classList.contains('chatted-me') || 
                             item.querySelector('.chatted-me') || 
                             item.querySelector('[class*="chatted-me"]');
        const sender = hasChattedMe ? 'me' : (itemCenter > centerContainer ? 'me' : 'client');
        
        const textContainer = item.querySelector('.card') || 
                              item.querySelector('.text') || 
                              item.querySelector('[class*="card"]') || 
                              item.querySelector('[class*="text"]') || 
                              item;
        
        let text = '';
        if (textContainer) {
          const cloned = textContainer.cloneNode(true);
          const toRemove = cloned.querySelectorAll('.msg-time, .time-status, [class*="time"], [class*="status"]');
          toRemove.forEach(el => el.remove());
          text = cloned.innerText ? cloned.innerText.trim() : '';
        }
        
        return { sender, text };
      }).filter(x => x.text && x.text.length > 0);
    });

    logCallback(`[Zalo ID ${accountId}] Đã cào được ${scrapedMessages.length} tin nhắn từ giao diện Zalo Web.`);

    if (scrapedMessages.length === 0) return;

    // Fetch existing messages from db
    const dbMessages = await all('SELECT sender, message FROM zalo_chat_logs WHERE lead_id = ? AND zalo_account_id = ? ORDER BY id ASC', [leadId, accountId]);

    let newMessages = [];
    if (dbMessages.length === 0) {
      newMessages = scrapedMessages;
    } else {
      // Find the best overlap using sequence matching
      let matchIdx = -1;
      for (let i = scrapedMessages.length - 1; i >= 0; i--) {
        let isMatch = true;
        for (let j = 0; j <= i; j++) {
          const dbIdx = dbMessages.length - 1 - (i - j);
          if (dbIdx < 0 || dbMessages[dbIdx].sender !== scrapedMessages[j].sender || dbMessages[dbIdx].message !== scrapedMessages[j].message) {
            isMatch = false;
            break;
          }
        }
        if (isMatch) {
          matchIdx = i;
          break;
        }
      }

      if (matchIdx !== -1) {
        newMessages = scrapedMessages.slice(matchIdx + 1);
      } else {
        // Fallback: match the last message
        const lastDb = dbMessages[dbMessages.length - 1];
        const lastMatchingScrapedIdx = scrapedMessages
          .map((m, idx) => ({ m, idx }))
          .reverse()
          .find(x => x.m.sender === lastDb.sender && x.m.text === lastDb.message);

        if (lastMatchingScrapedIdx) {
          newMessages = scrapedMessages.slice(lastMatchingScrapedIdx.idx + 1);
        } else {
          newMessages = scrapedMessages;
        }
      }
    }

    logCallback(`[Zalo ID ${accountId}] Số tin nhắn mới cần lưu: ${newMessages.length}`);
    const nowIso = new Date().toISOString();
    for (const msg of newMessages) {
      await run(
        'INSERT INTO zalo_chat_logs (lead_id, sender, message, timestamp, zalo_account_id) VALUES (?, ?, ?, ?, ?)',
        [leadId, msg.sender, msg.text, nowIso, accountId]
      );

      // Trigger chatbot webhook if configured and sender is client
      if (msg.sender === 'client') {
        (async () => {
          try {
            const webhookUrlRow = await get("SELECT value FROM configs WHERE key = 'n8n_chatbot_webhook_url'");
            const webhookUrl = webhookUrlRow ? webhookUrlRow.value : '';
            if (webhookUrl && webhookUrl.trim() !== '') {
              // Fetch Zalo account name
              const accountRow = await get("SELECT custom_name, display_name FROM zalo_accounts WHERE id = ?", [accountId]);
              const accountName = accountRow ? (accountRow.custom_name || accountRow.display_name || `Account #${accountId}`) : `Account #${accountId}`;
              
              const payload = {
                event: 'new_message',
                zalo_account_id: parseInt(accountId, 10),
                zalo_account_name: accountName,
                lead_id: parseInt(leadId, 10),
                lead_name: lead.brand_name,
                phone: phone,
                message: msg.text,
                sender: 'client',
                timestamp: nowIso
              };

              logCallback(`[Chatbot] Đang gửi tin nhắn mới đến n8n Webhook...`);
              
              const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });

              if (response.ok) {
                const result = await response.json();
                if (result && result.reply && result.reply.trim() !== '') {
                  logCallback(`[Chatbot] Nhận phản hồi tự động từ n8n cho SĐT ${phone}: "${result.reply}"`);
                  // Call sendZaloMessageDirect to reply via Zalo Web
                  await sendZaloMessageDirect(accountId, phone, result.reply, logCallback);
                } else {
                  logCallback(`[Chatbot] Phản hồi rỗng từ n8n (Không cần trả lời tự động).`);
                }
              } else {
                logCallback(`[Chatbot Error] n8n Webhook trả về lỗi HTTP ${response.status}`);
              }
            }
          } catch (err) {
            logCallback(`[Chatbot Error] Gặp lỗi khi kích hoạt chatbot n8n cho SĐT ${phone}: ${err.message}`);
          }
        })();
      }
    }
  } catch (err) {
    logCallback(`Lỗi đồng bộ Zalo chat tài khoản ${accountId} đến ${phone}: ${err.message}`);
  }
}

export async function sendZaloMessageDirect(accountId, phone, messageText, logCallback = log) {
  const session = activeSessions.get(accountId);
  if (!session || !session.page) {
    throw new Error(`Chưa thiết lập phiên kết nối Zalo cho tài khoản ID ${accountId}.`);
  }
  const zaloPage = session.page;

  logCallback(`[Zalo ID ${accountId}] Đang tiến hành gửi tin trực tiếp cho SĐT: ${phone}`);

  try {
    const searchInputSelector = 'input[placeholder*="Tìm kiếm"], input[placeholder*="Search"], #contact-search-input';
    await zaloPage.waitForSelector(searchInputSelector, { timeout: 15000 });
    
    await zaloPage.click(searchInputSelector, { clickCount: 3 });
    await zaloPage.keyboard.press('Backspace');
    await new Promise(r => setTimeout(r, 500));
    
    await zaloPage.type(searchInputSelector, phone, { delay: 100 });
    await new Promise(r => setTimeout(r, 2000));
    await zaloPage.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 2000));

    const notFound = await zaloPage.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Không tìm thấy kết quả') || 
             text.includes('Số điện thoại chưa đăng ký') ||
             text.includes('chưa sử dụng Zalo');
    });

    if (notFound) {
      logCallback(`[Zalo ID ${accountId}] SĐT chưa đăng ký Zalo hoặc không tìm thấy: ${phone}`);
      throw new Error(`Số điện thoại ${phone} không sử dụng Zalo.`);
    }

    await zaloPage.waitForSelector('#richInput, div[contenteditable="true"]', { timeout: 10000 });
    
    const chatInputSelector = '#richInput, div[contenteditable="true"]';
    await zaloPage.click(chatInputSelector);
    await new Promise(r => setTimeout(r, 500));

    await zaloPage.keyboard.down('Control');
    await zaloPage.keyboard.press('A');
    await zaloPage.keyboard.up('Control');
    await zaloPage.keyboard.press('Backspace');
    
    const lines = messageText.split('\n');
    for (let line of lines) {
      await zaloPage.type(chatInputSelector, line);
      await zaloPage.keyboard.down('Shift');
      await zaloPage.keyboard.press('Enter');
      await zaloPage.keyboard.up('Shift');
    }
    
    await new Promise(r => setTimeout(r, 1000));
    await zaloPage.keyboard.press('Enter');
    logCallback(`[Zalo ID ${accountId}] Đã gửi tin nhắn trực tiếp đến ${phone} thành công.`);

    // Lưu log và gán/tạo lead tương ứng
    let lead = await get('SELECT id FROM leads WHERE phone = ?', [phone]);
    let leadId;
    if (lead) {
      leadId = lead.id;
      await run('UPDATE leads SET assigned_zalo_account_id = ? WHERE id = ? AND assigned_zalo_account_id IS NULL', [accountId, leadId]);
    } else {
      const res = await run(
        "INSERT INTO leads (brand_name, phone, verification_status, zalo_status, assigned_zalo_account_id) VALUES (?, ?, 'unverified', 'message_sent', ?)",
        [`Khách hàng Zalo ${phone}`, phone, accountId]
      );
      leadId = res.id;
    }

    const nowIso = new Date().toISOString();
    await run(
      "INSERT INTO zalo_chat_logs (lead_id, sender, message, timestamp, zalo_account_id) VALUES (?, 'bot', ?, ?, ?)",
      [leadId, messageText, nowIso, accountId]
    );

  } catch (err) {
    logCallback(`Lỗi gửi tin nhắn trực tiếp đến ${phone}: ${err.message}`);
    throw err;
  }
}

