import { get, run, all } from './database.js';
import { log } from './logger.js';
import { activeSessions, isZaloLoggedIn } from './zalo_state.js';

export async function sendZaloInvite(accountId, leadId, logCallback = log) {
  let session = activeSessions.get(accountId);
  let shouldClose = false;
  
  if (!session || !session.page) {
    logCallback(`[Zalo ID ${accountId}] Không tìm thấy session hoạt động. Khởi chạy trình duyệt tự động...`);
    const { initZaloSession } = await import('./zalo.js');
    await initZaloSession(accountId, logCallback, true);
    session = activeSessions.get(accountId);
    shouldClose = true;
  }

  if (!session || !session.page) {
    throw new Error(`Không thể khởi chạy phiên kết nối Zalo cho tài khoản ID ${accountId}.`);
  }
  const zaloPage = session.page;

  const lead = await get('SELECT * FROM leads WHERE id = ?', [leadId]);
  if (!lead || !lead.phone) {
    logCallback(`Lead ${leadId} không có số điện thoại. Bỏ qua.`);
    if (shouldClose) {
      const { closeZaloSession } = await import('./zalo.js');
      await closeZaloSession(accountId);
    }
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

    await run("UPDATE leads SET zalo_status = ?, zalo_notes = ?, assigned_zalo_account_id = ?, zalo_followup_stage = 0, last_followup_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [finalStatus, notes.join(' | '), accountId, leadId]);
    
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
  } finally {
    if (shouldClose) {
      const { closeZaloSession } = await import('./zalo.js');
      await closeZaloSession(accountId);
    }
  }
}

export async function syncZaloChat(accountId, leadId, logCallback = log) {
  let session = activeSessions.get(accountId);
  let shouldClose = false;
  
  if (!session || !session.page) {
    logCallback(`[Zalo ID ${accountId}] Không tìm thấy session hoạt động cho sync. Khởi chạy tự động...`);
    const { initZaloSession } = await import('./zalo.js');
    await initZaloSession(accountId, logCallback, true);
    session = activeSessions.get(accountId);
    shouldClose = true;
  }

  if (!session || !session.page) {
    throw new Error(`Không thể khởi chạy phiên kết nối Zalo cho tài khoản ID ${accountId}.`);
  }
  const zaloPage = session.page;

  const lead = await get('SELECT * FROM leads WHERE id = ?', [leadId]);
  if (!lead || !lead.phone) {
    logCallback(`Lead ${leadId} không có số điện thoại. Bỏ qua.`);
    if (shouldClose) {
      const { closeZaloSession } = await import('./zalo.js');
      await closeZaloSession(accountId);
    }
    return;
  }

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

    const dbMessages = await all('SELECT sender, message FROM zalo_chat_logs WHERE lead_id = ? AND zalo_account_id = ? ORDER BY id ASC', [leadId, accountId]);

    let newMessages = [];
    if (dbMessages.length === 0) {
      newMessages = scrapedMessages;
    } else {
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

      if (msg.sender === 'client') {
        // Dừng luồng follow-up ngay lập tức khi khách nhắn tin phản hồi
        await run(
          "UPDATE leads SET zalo_followup_stage = -1, zalo_status = 'client_replied', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [leadId]
        );
        logCallback(`[Chatbot] Đã cập nhật trạng thái lead ID ${leadId} thành 'client_replied' và stage -1 (Dừng follow-up).`);

        (async () => {
          try {
            const enabledRow = await get("SELECT value FROM configs WHERE key = 'chatbot_enabled'");
            const isEnabled = enabledRow ? enabledRow.value === 'true' : false;

            if (isEnabled) {
              const groqKeyRow = await get("SELECT value FROM configs WHERE key = 'groq_api_key'");
              const groqApiKey = groqKeyRow ? groqKeyRow.value : '';
              
              const keywordsRow = await get("SELECT value FROM configs WHERE key = 'chatbot_inscope_keywords'");
              const keywordsStr = keywordsRow ? keywordsRow.value : '';
              const keywords = keywordsStr.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);

              const cannedRepliesRow = await get("SELECT value FROM configs WHERE key = 'chatbot_canned_replies'");
              let cannedReplies = [];
              try {
                cannedReplies = JSON.parse(cannedRepliesRow ? cannedRepliesRow.value : '[]');
              } catch (e) {
                cannedReplies = [];
              }
              if (!Array.isArray(cannedReplies) || cannedReplies.length === 0) {
                cannedReplies = ["Dạ, hiện tại em chưa rõ câu hỏi của anh/chị. Anh/chị cần hỗ trợ thông tin gì ạ?"];
              }

              const msgTextLower = msg.text.toLowerCase();
              const isInScope = keywords.length === 0 || keywords.some(kw => msgTextLower.includes(kw));

              if (!isInScope) {
                const randomReply = cannedReplies[Math.floor(Math.random() * cannedReplies.length)];
                logCallback(`[Chatbot] Phát hiện tin nhắn ngoài luồng cho SĐT ${phone}. Gửi tin nhắn mẫu sẵn: "${randomReply}"`);
                await sendZaloMessageDirect(accountId, phone, randomReply, logCallback);
              } else {
                if (!groqApiKey) {
                  logCallback(`[Chatbot Error] Đã bật AI Chatbot nhưng chưa cấu hình Groq API Key.`);
                  const randomReply = cannedReplies[Math.floor(Math.random() * cannedReplies.length)];
                  await sendZaloMessageDirect(accountId, phone, randomReply, logCallback);
                } else {
                  const faqs = await all('SELECT question, answer FROM knowledge_base');
                  
                  const systemPrompt = `Bạn là một trợ lý AI thông minh, tư vấn cho khách hàng về dự án "Hành trình Trăm năm Di sản Hội họa Sơn mài Mỹ thuật Việt Nam".
Hãy sử dụng bộ tài liệu câu hỏi - trả lời (FAQ) dưới đây để trả lời câu hỏi của khách hàng một cách chính xác, ngắn gọn, lịch sự bằng tiếng Việt. 
Không bịa đặt thông tin. Nếu thông tin không nằm trong FAQ, hãy trả lời khéo léo rằng anh/chị vui lòng chờ giây lát, ban tổ chức sẽ liên hệ hỗ trợ thêm chi tiết.

Bộ tài liệu FAQ:
${faqs.map(faq => `Q: ${faq.question}\nA: ${faq.answer}`).join('\n\n')}
`;

                  logCallback(`[Chatbot] Đang gọi Groq API (llama3-8b-8192) để trả lời câu hỏi trong luồng...`);
                  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${groqApiKey}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      model: 'llama3-8b-8192',
                      messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: msg.text }
                      ],
                      temperature: 0.7
                    })
                  });

                  if (response.ok) {
                    const data = await response.json();
                    const replyText = data.choices?.[0]?.message?.content?.trim();
                    if (replyText) {
                      logCallback(`[Chatbot] Trả lời tự động bằng AI cho SĐT ${phone}: "${replyText}"`);
                      await sendZaloMessageDirect(accountId, phone, replyText, logCallback);
                    } else {
                      logCallback(`[Chatbot Error] Groq API trả về phản hồi rỗng.`);
                    }
                  } else {
                    const errText = await response.text();
                    logCallback(`[Chatbot Error] Groq API trả về lỗi HTTP ${response.status}: ${errText}`);
                  }
                }
              }
            } else {
              const webhookUrlRow = await get("SELECT value FROM configs WHERE key = 'n8n_chatbot_webhook_url'");
              const webhookUrl = webhookUrlRow ? webhookUrlRow.value : '';
              if (webhookUrl && webhookUrl.trim() !== '') {
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

                logCallback(`[Chatbot n8n] Đang gửi tin nhắn mới đến n8n Webhook...`);
                const response = await fetch(webhookUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload)
                });

                if (response.ok) {
                  const result = await response.json();
                  if (result && result.reply && result.reply.trim() !== '') {
                    logCallback(`[Chatbot n8n] Nhận phản hồi tự động từ n8n cho SĐT ${phone}: "${result.reply}"`);
                    await sendZaloMessageDirect(accountId, phone, result.reply, logCallback);
                  }
                }
              }
            }
          } catch (err) {
            logCallback(`[Chatbot Error] Gặp lỗi khi xử lý trả lời tự động cho SĐT ${phone}: ${err.message}`);
          }
        })();
      }
    }
  } catch (err) {
    logCallback(`Lỗi đồng bộ Zalo chat tài khoản ${accountId} đến ${phone}: ${err.message}`);
  } finally {
    if (shouldClose) {
      const { closeZaloSession } = await import('./zalo.js');
      await closeZaloSession(accountId);
    }
  }
}

export async function sendZaloMessageDirect(accountId, phone, messageText, logCallback = log) {
  let session = activeSessions.get(accountId);
  let shouldClose = false;
  
  if (!session || !session.page) {
    logCallback(`[Zalo ID ${accountId}] Không tìm thấy session hoạt động cho gửi tin trực tiếp. Khởi chạy tự động...`);
    const { initZaloSession } = await import('./zalo.js');
    await initZaloSession(accountId, logCallback, true);
    session = activeSessions.get(accountId);
    shouldClose = true;
  }

  if (!session || !session.page) {
    throw new Error(`Không thể khởi chạy phiên kết nối Zalo cho tài khoản ID ${accountId}.`);
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
  } finally {
    if (shouldClose) {
      const { closeZaloSession } = await import('./zalo.js');
      await closeZaloSession(accountId);
    }
  }
}
