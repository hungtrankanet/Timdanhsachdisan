import express from 'express';
import cors from 'cors';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { all, run, get, dbReady } from './database.js';
import { scrapeGoogleMaps } from './scraper.js';
import { verifyLead } from './verifier.js';
import { restoreZaloSessions, initZaloSession, closeZaloSession, syncZaloChat, sendZaloMessageDirect, isZaloLoggedIn, sendZaloInvite } from './zalo.js';
import { logger, log } from './logger.js';
import { startScheduler, runQueueWorker, runZaloCampaignWorker } from './scheduler.js';
import { sendDailyReport } from './email.js';



const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, '../public')));

// 1. API: List all leads
app.get('/api/leads', async (req, res) => {
  try {
    const leads = await all('SELECT * FROM leads ORDER BY created_at DESC');
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1b. API: List pending review leads
app.get('/api/leads/pending_review', async (req, res) => {
  try {
    const leads = await all("SELECT id, brand_name, phone, website, address, verification_notes, created_at FROM leads WHERE verification_status = 'pending_review' ORDER BY id DESC");
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1c. API: Approve a lead
app.post('/api/leads/:id/approve', async (req, res) => {
  try {
    await run("UPDATE leads SET verification_status = 'unverified', verification_notes = 'Được phê duyệt thủ công bởi quản trị viên', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1d. API: Reject a lead
app.post('/api/leads/:id/reject', async (req, res) => {
  try {
    await run("UPDATE leads SET verification_status = 'rejected', verification_notes = 'Bị bác bỏ bởi quản trị viên', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1e. API: Approve all pending review leads
app.post('/api/leads/pending_review/approve-all', async (req, res) => {
  try {
    await run("UPDATE leads SET verification_status = 'unverified', verification_notes = 'Được phê duyệt hàng loạt bởi quản trị viên', updated_at = CURRENT_TIMESTAMP WHERE verification_status = 'pending_review'");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1f. API: Reject all pending review leads
app.post('/api/leads/pending_review/reject-all', async (req, res) => {
  try {
    await run("UPDATE leads SET verification_status = 'rejected', verification_notes = 'Bị bác bỏ hàng loạt bởi quản trị viên', updated_at = CURRENT_TIMESTAMP WHERE verification_status = 'pending_review'");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. API: Save config key-value
app.post('/api/config', async (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'Missing key' });
  try {
    await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', [key, value]);
    res.json({ success: true, key, value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. API: Get config
app.get('/api/config/:key', async (req, res) => {
  try {
    const row = await get('SELECT value FROM configs WHERE key = ?', [req.params.key]);
    res.json({ key: req.params.key, value: row ? row.value : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. API: Start Scraping Job (Async)
app.post('/api/scrape', async (req, res) => {
  const { query, limit } = req.body;
  if (!query) return res.status(400).json({ error: 'Missing search query' });

  // Run scraper asynchronously
  const maxLimit = parseInt(limit, 10) || 10;
  log(`Bắt đầu tiến trình cào Google Maps không đồng bộ với từ khóa: "${query}"...`);
  
  scrapeGoogleMaps(query, maxLimit)
    .then(leads => {
      log(`Tiến trình cào hoàn tất. Đã tìm thấy ${leads.length} leads.`);
    })
    .catch(err => {
      log(`Lỗi trong tiến trình cào: ${err.message}`);
    });

  res.json({ status: 'started', message: 'Scraper task has been launched in the background.' });
});

// 5. API: Verify single lead (Async)
app.post('/api/verify/:id', async (req, res) => {
  const id = req.params.id;
  log(`Bắt đầu tiến trình xác thực cho lead ID: ${id}...`);
  
  verifyLead(id)
    .then(lead => {
      log(`Xác thực hoàn tất cho lead: ${lead.brand_name} (Status: ${lead.verification_status})`);
    })
    .catch(err => {
      log(`Lỗi xác thực lead ID ${id}: ${err.message}`);
    });

  res.json({ status: 'started', message: 'Verification task launched.' });
});

// 6. API: Get all Zalo accounts
app.get('/api/zalo/accounts', async (req, res) => {
  try {
    const accounts = await all('SELECT * FROM zalo_accounts ORDER BY id ASC');
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6b. API: Create a new Zalo account profile
app.post('/api/zalo/accounts/create', async (req, res) => {
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
app.post('/api/zalo/accounts/:id/init', async (req, res) => {
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
app.get('/api/zalo/accounts/:id/status', async (req, res) => {
  const accountId = req.params.id;
  try {
    const loggedIn = await isZaloLoggedIn(accountId);
    res.json({ loggedIn });
  } catch (err) {
    res.json({ loggedIn: false, error: err.message });
  }
});

// 6e. API: Disconnect Zalo account session
app.post('/api/zalo/accounts/:id/close', async (req, res) => {
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
app.post('/api/zalo/accounts/:id/delete', async (req, res) => {
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
app.post('/api/zalo/init', async (req, res) => {
  try {
    await initZaloSession('default', log, false);
    const loggedIn = await isZaloLoggedIn('default');
    res.json({ status: 'initialized', loggedIn });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/zalo/status', async (req, res) => {
  try {
    const loggedIn = await isZaloLoggedIn('default');
    res.json({ loggedIn });
  } catch (e) {
    res.json({ loggedIn: false });
  }
});

app.post('/api/zalo/close', async (req, res) => {
  try {
    await closeZaloSession('default');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 9. API: Send Zalo invitation to single lead (Async, accepts ?account_id=...)
app.post('/api/zalo/send/:id', async (req, res) => {
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

// 9b. API: Force scheduler execution (runQueueWorker)
app.post('/api/scheduler/force', async (req, res) => {
  log('Kích hoạt chạy luồng Worker thủ công...');
  runQueueWorker()
    .then(() => log('Hoàn thành chạy luồng Worker thủ công.'))
    .catch(err => log(`Lỗi luồng Worker: ${err.message}`));
  res.json({ status: 'started', message: 'Queue worker executed.' });
});

// 9c. API: Toggle scheduler status
app.post('/api/scheduler/toggle', async (req, res) => {
  const { status } = req.body; // 'active' or 'idle'
  if (!status) return res.status(400).json({ error: 'Missing status' });
  try {
    await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['scheduler_status', status]);
    log(`Đã thay đổi trạng thái Tự động hóa sang: "${status}"`);
    if (status === 'active') {
      runQueueWorker(); // Trigger worker
    }
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9c-2. API: Toggle Zalo campaign status
app.post('/api/zalo/campaign/toggle', async (req, res) => {
  const { status } = req.body; // 'active' or 'idle'
  if (!status) return res.status(400).json({ error: 'Missing status' });
  try {
    await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['zalo_campaign_status', status]);
    log(`Đã thay đổi trạng thái Chiến dịch Zalo sang: "${status}"`);
    if (status === 'active') {
      runZaloCampaignWorker(); // Trigger Zalo worker to start sending immediately
    }
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9d. API: Get system state status
app.get('/api/status', async (req, res) => {
  try {
    const statusRow = await get('SELECT value FROM configs WHERE key = "scheduler_status"');
    const campaignStatusRow = await get('SELECT value FROM configs WHERE key = "zalo_campaign_status"');
    const taskRow = await get('SELECT value FROM configs WHERE key = "current_task"');
    const sheetsRow = await get('SELECT value FROM configs WHERE key = "sheets_web_app_url"');
    
    const activeAcc = await get("SELECT COUNT(*) as count FROM zalo_accounts WHERE status = 'connected'");
    const loggedIn = activeAcc && activeAcc.count > 0;
    
    res.json({
      scheduler_status: statusRow ? statusRow.value : 'idle',
      zalo_campaign_status: campaignStatusRow ? campaignStatusRow.value : 'idle',
      current_task: taskRow ? taskRow.value : 'Tạm dừng (Idle)',
      zalo_logged_in: loggedIn,
      sheets_configured: !!(sheetsRow && sheetsRow.value)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9e. API: Get crawler queue
app.get('/api/queue', async (req, res) => {
  try {
    const queue = await all('SELECT * FROM scheduler_queue ORDER BY id DESC LIMIT 100');
    res.json(queue);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9f. API: Add item to crawler queue
app.post('/api/queue', async (req, res) => {
  const { keyword, location } = req.body;
  if (!keyword || !location) return res.status(400).json({ error: 'Missing keyword or location' });
  try {
    const result = await run(
      'INSERT OR IGNORE INTO scheduler_queue (keyword, location, status, leads_found) VALUES (?, ?, ?, 0)',
      [keyword.trim(), location.trim(), 'pending']
    );
    if (result.changes === 0) {
      return res.status(400).json({ error: 'Task already exists in the queue.' });
    }
    log(`Đã thêm vào hàng đợi cào: "${keyword}" tại "${location}"`);
    res.json({ success: true, id: result.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9g. API: Get all Zalo chats (leads with conversations, optional ?account_id=...)
app.get('/api/zalo/chats', async (req, res) => {
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
app.get('/api/zalo/chats/:lead_id', async (req, res) => {
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
app.post('/api/zalo/chats/:lead_id/sync', async (req, res) => {
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
app.post('/api/zalo/accounts/:id/rename', async (req, res) => {
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
app.post('/api/zalo/chats/sync-all', async (req, res) => {
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
app.post('/api/zalo/accounts/:id/regions', async (req, res) => {
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
app.post('/api/webhook/n8n/reply', async (req, res) => {
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

// 9n. API: Dashboard Authentication
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await get('SELECT * FROM users WHERE username = ?', [username]);
    if (user && user.password === password) {
      res.json({ 
        success: true, 
        token: `session_token_lacquer_art_2026_${user.role}`, 
        role: user.role,
        username: user.username
      });
    } else {
      res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9o. API: Get all staff accounts (Admin-only filter is done UI-side, but API allows it)
app.get('/api/users', async (req, res) => {
  try {
    const users = await all('SELECT id, username, password, role, created_at FROM users');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9p. API: Create a new user profile
app.post('/api/users/create', async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Thiếu tên đăng nhập hoặc mật khẩu.' });
  }
  try {
    const userRole = role === 'admin' ? 'admin' : 'staff';
    await run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username.trim(), password.trim(), userRole]);
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// 9q. API: Delete a user profile
app.post('/api/users/:id/delete', async (req, res) => {
  const { id } = req.params;
  try {
    const user = await get('SELECT username FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
    }
    if (user.username === 'admin') {
      return res.status(400).json({ error: 'Không thể xóa tài khoản admin hệ thống.' });
    }
    await run('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9r. API: Update a user profile
app.post('/api/users/:id/update', async (req, res) => {
  const { id } = req.params;
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Thiếu tên đăng nhập, mật khẩu hoặc vai trò.' });
  }
  try {
    const existing = await get('SELECT username FROM users WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
    }
    if (existing.username === 'admin') {
      // System admin can only update password
      await run('UPDATE users SET password = ? WHERE id = ?', [password.trim(), id]);
    } else {
      const userRole = role === 'admin' ? 'admin' : 'staff';
      await run('UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?', [username.trim(), password.trim(), userRole, id]);
    }
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// 9s. API: Upload Database File (Admin-only)
app.post('/api/admin/upload-db', express.raw({ type: 'application/octet-stream', limit: '100mb' }), async (req, res) => {
  const token = req.headers['authorization'];
  if (!token || !token.startsWith('session_token_lacquer_art_2026_admin')) {
    return res.status(401).json({ error: 'Mã xác thực không hợp lệ hoặc thiếu quyền Admin.' });
  }

  try {
    const dbPath = process.env.DB_PATH || join(__dirname, '../data.db');
    
    // Ensure parent folder exists
    const dbDir = dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Write binary buffer directly to file
    fs.writeFileSync(dbPath, req.body);
    log('Đã cập nhật cơ sở dữ liệu data.db thành công từ yêu cầu tải lên.');
    res.json({ success: true, message: 'Đã tải lên và thay thế file database thành công.' });
  } catch (err) {
    log(`Lỗi tải lên database: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// 9t. API: Upload Zalo Sessions Zip (Admin-only)
app.post('/api/admin/upload-zalo-sessions', express.raw({ type: 'application/octet-stream', limit: '100mb' }), async (req, res) => {
  const token = req.headers['authorization'];
  if (!token || !token.startsWith('session_token_lacquer_art_2026_admin')) {
    return res.status(401).json({ error: 'Mã xác thực không hợp lệ hoặc thiếu quyền Admin.' });
  }

  try {
    const tempZipPath = join(__dirname, '../temp_sessions.zip');
    
    // Write req.body directly as the zip file
    fs.writeFileSync(tempZipPath, req.body);
    
    // Extract using adm-zip
    const zip = new AdmZip(tempZipPath);
    const targetDir = join(__dirname, '../zalo_user_data');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    zip.extractAllTo(targetDir, true);
    
    // Delete temp zip file
    if (fs.existsSync(tempZipPath)) {
      fs.unlinkSync(tempZipPath);
    }
    
    log('Đã cập nhật và giải nén thành công session zalo_user_data.');
    res.json({ success: true, message: 'Đã tải lên và khôi phục Zalo Sessions thành công.' });
  } catch (err) {
    log(`Lỗi tải lên Zalo sessions: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});


// 10. SSE: Log stream for dashboard
app.get('/api/logs', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const onLog = ({ formatted, type }) => {
    res.write(`data: ${JSON.stringify({ message: formatted, type })}\n\n`);
  };

  logger.on('log', onLog);

  req.on('close', () => {
    logger.removeListener('log', onLog);
  });
});

dbReady.then(() => {
  app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
    startScheduler();
    restoreZaloSessions().then(() => log('Khôi phục xong các phiên kết nối Zalo đã lưu.'));
  });
}).catch(err => {
  console.error('Failed to initialize database, server cannot start:', err);
});
