import express from 'express';
import { all, run, get } from './database.js';
import { initZaloSession, closeZaloSession, syncZaloChat, sendZaloMessageDirect, isZaloLoggedIn, sendZaloInvite } from './zalo.js';
import { log } from './logger.js';

const router = express.Router();

// 6. API: Get all Zalo accounts
router.get('/api/zalo/accounts', async (req, res) => {
  try {
    const accounts = await all('SELECT * FROM zalo_accounts ORDER BY id ASC');
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6b. API: Create a new Zalo account profile
router.post('/api/zalo/accounts/create', async (req, res) => {
  try {
    const result = await run("INSERT INTO zalo_accounts (session_dir, status) VALUES ('', 'disconnected')");
    const accountId = result.id;
    await run("UPDATE zalo_accounts SET session_dir = ? WHERE id = ?", [`account_${accountId}`, accountId]);
    res.json({ success: true, id: accountId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6c. API: Initialize Zalo login for account (headless: false)
router.post('/api/zalo/accounts/:id/init', async (req, res) => {
  const accountId = req.params.id;
  try {
    log(`[Zalo ID ${accountId}] Khởi chạy trình duyệt (chế độ có giao diện)...`);
    await initZaloSession(accountId, log, false);
    const loggedIn = await isZaloLoggedIn(accountId);
    res.json({ status: 'initialized', loggedIn });
  } catch (err) {
    log(`Lỗi khởi tạo Zalo ID ${accountId}: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// 6d. API: Check Zalo status for account
router.get('/api/zalo/accounts/:id/status', async (req, res) => {
  const accountId = req.params.id;
  try {
    const loggedIn = await isZaloLoggedIn(accountId);
    res.json({ loggedIn });
  } catch (err) {
    res.json({ loggedIn: false, error: err.message });
  }
});

// 6e. API: Disconnect Zalo account session
router.post('/api/zalo/accounts/:id/close', async (req, res) => {
  const accountId = req.params.id;
  try {
    await closeZaloSession(accountId);
    log(`[Zalo ID ${accountId}] Đã đóng phiên kết nối.`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6f. API: Delete Zalo account profile
router.post('/api/zalo/accounts/:id/delete', async (req, res) => {
  const accountId = req.params.id;
  try {
    await closeZaloSession(accountId);
    await run("DELETE FROM zalo_accounts WHERE id = ?", [accountId]);
    log(`[Zalo ID ${accountId}] Đã xóa cấu hình tài khoản.`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Legacy backward-compatibility endpoints (proxied to 'default' session)
router.post('/api/zalo/init', async (req, res) => {
  try {
    await initZaloSession('default', log, false);
    const loggedIn = await isZaloLoggedIn('default');
    res.json({ status: 'initialized', loggedIn });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/zalo/status', async (req, res) => {
  try {
    const loggedIn = await isZaloLoggedIn('default');
    res.json({ loggedIn });
  } catch (e) {
    res.json({ loggedIn: false });
  }
});

router.post('/api/zalo/close', async (req, res) => {
  try {
    await closeZaloSession('default');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 9. API: Send Zalo invitation to single lead (Async, accepts ?account_id=...)
router.post('/api/zalo/send/:id', async (req, res) => {
  const id = req.params.id;
  let accountId = req.query.account_id;
  
  try {
    if (!accountId) {
      const activeAcc = await get("SELECT id FROM zalo_accounts WHERE status = 'connected' LIMIT 1");
      if (!activeAcc) {
        return res.status(400).json({ error: 'Không có tài khoản Zalo nào đang kết nối hoạt động.' });
      }
      accountId = activeAcc.id;
    }

    const loggedIn = await isZaloLoggedIn(accountId);
    if (!loggedIn) {
      return res.status(400).json({ error: `Tài khoản Zalo ID ${accountId} chưa được kết nối.` });
    }

    log(`Bắt đầu tiến trình gửi tin nhắn Zalo thủ công cho lead ID: ${id} bằng tài khoản ID: ${accountId}...`);
    sendZaloInvite(accountId, id)
      .then(() => log(`Hoàn thành gửi tin Zalo cho lead ID: ${id}`))
      .catch(err => log(`Gặp lỗi khi gửi Zalo: ${err.message}`));

    res.json({ status: 'started', message: 'Zalo campaign sending launched.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9g. API: Get all Zalo chats (leads with conversations, optional ?account_id=...)
router.get('/api/zalo/chats', async (req, res) => {
  const { account_id } = req.query;
  try {
    let query = `
      SELECT l.id, l.brand_name, l.phone, l.zalo_status, l.assigned_zalo_account_id,
             (SELECT message FROM zalo_chat_logs WHERE lead_id = l.id ${account_id ? 'AND zalo_account_id = ?' : ''} ORDER BY id DESC LIMIT 1) as last_message,
             (SELECT timestamp FROM zalo_chat_logs WHERE lead_id = l.id ${account_id ? 'AND zalo_account_id = ?' : ''} ORDER BY id DESC LIMIT 1) as last_message_time
      FROM leads l
    `;
    const params = [];
    if (account_id) {
      params.push(account_id);
      params.push(account_id);
      query += ` WHERE EXISTS (SELECT 1 FROM zalo_chat_logs WHERE lead_id = l.id AND zalo_account_id = ?)`;
      params.push(account_id);
    } else {
      query += ` WHERE EXISTS (SELECT 1 FROM zalo_chat_logs WHERE lead_id = l.id)`;
    }
    query += ` ORDER BY last_message_time DESC`;
    const chats = await all(query, params);
    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9h. API: Get chat history for specific lead (optional ?account_id=...)
router.get('/api/zalo/chats/:lead_id', async (req, res) => {
  const leadId = req.params.lead_id;
  const { account_id } = req.query;
  try {
    let history;
    if (account_id) {
      history = await all('SELECT * FROM zalo_chat_logs WHERE lead_id = ? AND zalo_account_id = ? ORDER BY id ASC', [leadId, account_id]);
    } else {
      history = await all('SELECT * FROM zalo_chat_logs WHERE lead_id = ? ORDER BY id ASC', [leadId]);
    }
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9i. API: Sync Zalo chat manually for specific lead (optional ?account_id=...)
router.post('/api/zalo/chats/:lead_id/sync', async (req, res) => {
  const leadId = req.params.lead_id;
  let accountId = req.query.account_id || req.body.account_id;
  try {
    const lead = await get('SELECT assigned_zalo_account_id FROM leads WHERE id = ?', [leadId]);
    
    if (!accountId) {
      if (lead && lead.assigned_zalo_account_id) {
        const isAssignedLoggedIn = await isZaloLoggedIn(lead.assigned_zalo_account_id);
        if (isAssignedLoggedIn) {
          accountId = lead.assigned_zalo_account_id;
        }
      }
    }

    if (!accountId) {
      const activeAccs = await all("SELECT id FROM zalo_accounts WHERE status = 'connected'");
      for (const acc of activeAccs) {
        if (await isZaloLoggedIn(acc.id)) {
          accountId = acc.id;
          break;
        }
      }
    }
    
    if (!accountId) {
      return res.status(400).json({ error: 'Không có tài khoản Zalo nào đang kết nối hoạt động.' });
    }

    const loggedIn = await isZaloLoggedIn(accountId);
    if (!loggedIn) {
      return res.status(400).json({ error: `Tài khoản Zalo ID ${accountId} chưa được kết nối.` });
    }
    
    log(`Bắt đầu đồng bộ tin nhắn Zalo thủ công cho lead ID: ${leadId} bằng tài khoản ID: ${accountId}...`);
    syncZaloChat(accountId, leadId)
      .then(() => log(`Đồng bộ tin nhắn Zalo hoàn tất cho lead ID: ${leadId}`))
      .catch(err => log(`Lỗi đồng bộ tin nhắn Zalo lead ID ${leadId}: ${err.message}`));
      
    res.json({ success: true, message: 'Sync task started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9j. API: Rename Zalo account
router.post('/api/zalo/accounts/:id/rename', async (req, res) => {
  const accountId = req.params.id;
  const { custom_name } = req.body;
  try {
    await run('UPDATE zalo_accounts SET custom_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [custom_name, accountId]);
    log(`[Zalo ID ${accountId}] Đã đổi tên gợi nhớ thành: "${custom_name}"`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9k. API: Sync all chats for all connected accounts
router.post('/api/zalo/chats/sync-all', async (req, res) => {
  try {
    const connectedAccounts = await all("SELECT id FROM zalo_accounts WHERE status = 'connected'");
    if (connectedAccounts.length === 0) {
      return res.status(400).json({ error: 'Không có tài khoản Zalo nào đang kết nối hoạt động.' });
    }
    
    log('Bắt đầu kích hoạt đồng bộ toàn bộ cuộc trò chuyện cho tất cả các tài khoản Zalo đang kết nối...');
    
    // Run the sync process in the background
    (async () => {
      for (const acc of connectedAccounts) {
        const accountId = acc.id;
        const contactedLeads = await all(
          "SELECT id FROM leads WHERE zalo_status IN ('message_sent', 'friend_request_sent') AND (assigned_zalo_account_id = ? OR assigned_zalo_account_id IS NULL)",
          [accountId]
        );
        
        log(`[Zalo ID ${accountId}] Đang đồng bộ tin nhắn cho ${contactedLeads.length} leads...`);
        for (const lead of contactedLeads) {
          try {
            await syncZaloChat(accountId, lead.id);
            await new Promise(r => setTimeout(r, 2000)); // Delay between leads to be gentle
          } catch (err) {
            log(`Lỗi đồng bộ Zalo chat lead ID ${lead.id}: ${err.message}`);
          }
        }
      }
      log('Hoàn thành đồng bộ tất cả tin nhắn Zalo.');
    })();

    res.json({ success: true, message: 'Sync all task launched in background.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9l. API: Update Zalo account assigned regions
router.post('/api/zalo/accounts/:id/regions', async (req, res) => {
  const accountId = req.params.id;
  const { assigned_regions } = req.body;
  try {
    await run('UPDATE zalo_accounts SET assigned_regions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [assigned_regions, accountId]);
    log(`[Zalo ID ${accountId}] Cấu hình khu vực phụ trách thành công: "${assigned_regions}"`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9m. API: Webhook n8n Auto-Reply Gateway
router.post('/api/webhook/n8n/reply', async (req, res) => {
  const token = req.headers['x-webhook-token'] || req.query.token;
  try {
    const tokenRow = await get("SELECT value FROM configs WHERE key = 'n8n_webhook_token'");
    const secureToken = tokenRow ? tokenRow.value : 'n8n_zalo_secure_token_2026';
    
    if (!token || token !== secureToken) {
      return res.status(401).json({ error: 'Mã xác thực Webhook không hợp lệ.' });
    }
    
    const { phone, message, zalo_account_id } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: 'Thiếu số điện thoại (phone) hoặc nội dung tin nhắn (message).' });
    }
    
    let accountId = zalo_account_id;
    if (!accountId) {
      const lead = await get("SELECT assigned_zalo_account_id FROM leads WHERE phone = ?", [phone.trim()]);
      if (lead && lead.assigned_zalo_account_id) {
        const isAssignedConnected = await isZaloLoggedIn(lead.assigned_zalo_account_id);
        if (isAssignedConnected) {
          accountId = lead.assigned_zalo_account_id;
        }
      }
    }
    
    if (!accountId) {
      const activeAcc = await get("SELECT id FROM zalo_accounts WHERE status = 'connected' LIMIT 1");
      if (!activeAcc) {
        return res.status(400).json({ error: 'Không tìm thấy tài khoản Zalo nào đang kết nối để gửi tin nhắn.' });
      }
      accountId = activeAcc.id;
    }
    
    log(`[Webhook n8n] Nhận yêu cầu gửi tin nhắn đến ${phone} bằng Zalo ID ${accountId}...`);
    
    sendZaloMessageDirect(accountId, phone.trim(), message)
      .then(() => log(`[Webhook n8n] Đã gửi tin nhắn tự động đến SĐT ${phone} thành công.`))
      .catch(err => log(`[Webhook n8n] Gặp lỗi khi gửi tin nhắn đến SĐT ${phone}: ${err.message}`));
      
    res.json({ success: true, message: 'Yêu cầu gửi tin nhắn đã được ghi nhận và đang xử lý.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
