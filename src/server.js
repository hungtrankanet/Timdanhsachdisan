import express from 'express';
import cors from 'cors';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { all, run, get, dbReady } from './database.js';
import { scrapeGoogleMaps } from './scraper.js';
import { verifyLead } from './verifier.js';
import { restoreZaloSessions } from './zalo.js';
import { logger, log } from './logger.js';
import zaloRoutes from './routes_zalo.js';
import { startScheduler, runQueueWorker, runZaloCampaignWorker, runScraperWorker, runVerifierWorker, closeWorkerBrowsers } from './scheduler.js';
import { sendDailyReport } from './email.js';
import { startReEvaluatorWorker } from './re-evaluator.js';




const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(join(__dirname, '../public')));
app.use(zaloRoutes);

// 1. API: List all leads
app.get('/api/leads', (req, res) => {
  all('SELECT * FROM leads ORDER BY created_at DESC').then(d => res.json(d)).catch(e => res.status(500).json({ error: e.message }));
});
// 1b. API: List pending review leads
app.get('/api/leads/pending_review', (req, res) => {
  all("SELECT id, brand_name, phone, website, address, verification_notes, created_at FROM leads WHERE verification_status = 'pending_review' ORDER BY id DESC").then(d => res.json(d)).catch(e => res.status(500).json({ error: e.message }));
});
// 1c. API: Approve a lead
app.post('/api/leads/:id/approve', (req, res) => {
  run("UPDATE leads SET verification_status = 'unverified', verification_notes = 'Được phê duyệt thủ công bởi quản trị viên', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.params.id]).then(() => res.json({ success: true })).catch(e => res.status(500).json({ error: e.message }));
});
// 1d. API: Reject a lead
app.post('/api/leads/:id/reject', (req, res) => {
  run("UPDATE leads SET verification_status = 'rejected', verification_notes = 'Bị bác bỏ bởi quản trị viên', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.params.id]).then(() => res.json({ success: true })).catch(e => res.status(500).json({ error: e.message }));
});
// 1e. API: Approve all pending review leads
app.post('/api/leads/pending_review/approve-all', (req, res) => {
  run("UPDATE leads SET verification_status = 'unverified', verification_notes = 'Được phê duyệt hàng loạt bởi quản trị viên', updated_at = CURRENT_TIMESTAMP WHERE verification_status = 'pending_review'").then(() => res.json({ success: true })).catch(e => res.status(500).json({ error: e.message }));
});
// 1f. API: Reject all pending review leads
app.post('/api/leads/pending_review/reject-all', (req, res) => {
  run("UPDATE leads SET verification_status = 'rejected', verification_notes = 'Bị bác bỏ hàng loạt bởi quản trị viên', updated_at = CURRENT_TIMESTAMP WHERE verification_status = 'pending_review'").then(() => res.json({ success: true })).catch(e => res.status(500).json({ error: e.message }));
});
// 1g. API: Delete a single lead
app.delete('/api/leads/:id', (req, res) => {
  run("DELETE FROM leads WHERE id = ?", [req.params.id]).then(() => res.json({ success: true })).catch(e => res.status(500).json({ error: e.message }));
});
// 1h. API: Bulk delete leads
app.post('/api/leads/bulk-delete', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Danh sách ID không hợp lệ.' });
  const placeholders = ids.map(() => '?').join(',');
  run(`DELETE FROM leads WHERE id IN (${placeholders})`, ids).then(() => res.json({ success: true })).catch(e => res.status(500).json({ error: e.message }));
});
// 2. API: Save config key-value
app.post('/api/config', (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'Missing key' });
  run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', [key, value]).then(() => res.json({ success: true, key, value })).catch(e => res.status(500).json({ error: e.message }));
});
// 3. API: Get config
app.get('/api/config/:key', (req, res) => {
  get('SELECT value FROM configs WHERE key = ?', [req.params.key]).then(row => res.json({ key: req.params.key, value: row ? row.value : null })).catch(e => res.status(500).json({ error: e.message }));
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



// 9b. API: Force scheduler execution (runScraperWorker & runVerifierWorker in parallel)
app.post('/api/scheduler/force', async (req, res) => {
  log('Kích hoạt chạy luồng Worker thủ công...');
  try {
    await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['scheduler_status', 'active']);
  } catch (err) {
    log(`Lỗi khi cập nhật trạng thái tự động hóa: ${err.message}`);
  }
  Promise.all([
    runScraperWorker(),
    runVerifierWorker()
  ])
    .then(() => log('Hoàn thành chạy luồng Worker thủ công.'))
    .catch(err => log(`Lỗi luồng Worker: ${err.message}`));
  res.json({ status: 'started', message: 'Queue workers executed.' });
});

// 9c. API: Toggle scheduler status
app.post('/api/scheduler/toggle', async (req, res) => {
  const { status } = req.body; // 'active' or 'idle'
  if (!status) return res.status(400).json({ error: 'Missing status' });
  try {
    await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['scheduler_status', status]);
    log(`Đã thay đổi trạng thái Tự động hóa sang: "${status}"`);
    if (status === 'active') {
      runScraperWorker();
      runVerifierWorker();
    } else {
      closeWorkerBrowsers();
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

// GET /api/stats/progress
app.get('/api/stats/progress', async (req, res) => {
  try {
    const totalRow = await get('SELECT COUNT(*) as count FROM leads');
    const verifiedRow = await get("SELECT COUNT(*) as count FROM leads WHERE verification_status IN ('verified', 'partially_verified')");
    
    const total_leads = totalRow ? totalRow.count : 0;
    const verified_leads = verifiedRow ? verifiedRow.count : 0;
    const target = 10000;
    const percentage = Math.min(100, Number(((verified_leads / target) * 100).toFixed(2)));
    
    res.json({
      total_leads,
      verified_leads,
      target,
      percentage
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9e. API: Get crawler queue
app.get('/api/queue', async (req, res) => {
  try {
    const queue = await all(`
      SELECT * FROM scheduler_queue 
      WHERE status != 'completed' 
      ORDER BY CASE WHEN status = 'running' THEN 0 ELSE 1 END, id ASC 
      LIMIT 10
    `);
    
    const counts = await all("SELECT status, COUNT(*) as count FROM scheduler_queue GROUP BY status");
    let pendingCount = 0;
    let runningCount = 0;
    let completedCount = 0;
    for (const row of counts) {
      if (row.status === 'pending') pendingCount = row.count;
      else if (row.status === 'running') runningCount = row.count;
      else if (row.status === 'completed') completedCount = row.count;
    }
    const totalCount = pendingCount + runningCount + completedCount;
    const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    res.json({
      tasks: queue,
      pendingCount,
      runningCount,
      completedCount,
      totalCount,
      progress
    });
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

// 9f_bulk. API: Add multiple items to crawler queue (bulk import)
app.post('/api/queue/bulk', async (req, res) => {
  const { jobs } = req.body;
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return res.status(400).json({ error: 'Danh sách tác vụ không hợp lệ.' });
  }

  let successCount = 0;
  let ignoreCount = 0;
  let errorCount = 0;

  try {
    await run('BEGIN TRANSACTION');
    for (const job of jobs) {
      const keyword = job.keyword?.trim();
      const location = job.location?.trim();
      if (!keyword || !location) {
        errorCount++;
        continue;
      }
      const result = await run(
        'INSERT OR IGNORE INTO scheduler_queue (keyword, location, status, leads_found) VALUES (?, ?, ?, 0)',
        [keyword, location, 'pending']
      );
      if (result.changes > 0) {
        successCount++;
      } else {
        ignoreCount++;
      }
    }
    await run('COMMIT');
    log(`Nhập hàng loạt: đã thêm mới ${successCount} tác vụ, bỏ qua ${ignoreCount} trùng lặp, lỗi ${errorCount} tác vụ.`);
    res.json({ success: true, added: successCount, ignored: ignoreCount, errors: errorCount });
  } catch (err) {
    try {
      await run('ROLLBACK');
    } catch (_) {}
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


// --- AI Chatbot & FAQ API Routes ---

// Get AI Config
app.get('/api/ai/config', async (req, res) => {
  try {
    const keys = ['groq_api_key', 'gemini_api_key', 'chatbot_enabled', 'chatbot_inscope_keywords', 'chatbot_canned_replies', 'zalo_day1_template', 'zalo_day3_template', 'ai_raw_document'];
    const placeholders = keys.map(() => '?').join(',');
    const rows = await all(`SELECT key, value FROM configs WHERE key IN (${placeholders})`, keys);
    const config = {
      groq_api_key: '',
      gemini_api_key: '',
      chatbot_enabled: 'false',
      chatbot_inscope_keywords: '',
      chatbot_canned_replies: '[]',
      zalo_day1_template: '',
      zalo_day3_template: '',
      ai_raw_document: ''
    };
    
    for (const row of rows) {
      config[row.key] = row.value;
    }
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update AI Config
app.post('/api/ai/config', async (req, res) => {
  const { groq_api_key, gemini_api_key, chatbot_enabled, chatbot_inscope_keywords, chatbot_canned_replies, zalo_day1_template, zalo_day3_template, ai_raw_document } = req.body;
  try {
    const updates = [
      { key: 'groq_api_key', value: groq_api_key },
      { key: 'gemini_api_key', value: gemini_api_key },
      { key: 'chatbot_enabled', value: chatbot_enabled },
      { key: 'chatbot_inscope_keywords', value: chatbot_inscope_keywords },
      { key: 'chatbot_canned_replies', value: chatbot_canned_replies },
      { key: 'zalo_day1_template', value: zalo_day1_template },
      { key: 'zalo_day3_template', value: zalo_day3_template },
      { key: 'ai_raw_document', value: ai_raw_document }
    ];
    
    await run('BEGIN TRANSACTION');
    for (const u of updates) {
      if (u.value !== undefined) {
        await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', [u.key, String(u.value)]);
      }
    }
    await run('COMMIT');
    res.json({ success: true });
  } catch (err) {
    try { await run('ROLLBACK'); } catch (_) {}
    res.status(500).json({ error: err.message });
  }
});

// Get all FAQs
app.get('/api/ai/faq', async (req, res) => {
  try {
    const faqs = await all('SELECT * FROM knowledge_base ORDER BY id DESC');
    res.json(faqs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add single FAQ
app.post('/api/ai/faq', async (req, res) => {
  const { question, answer } = req.body;
  if (!question || !answer) {
    return res.status(400).json({ error: 'Thiếu câu hỏi hoặc câu trả lời.' });
  }
  try {
    const result = await run('INSERT INTO knowledge_base (question, answer) VALUES (?, ?)', [question.trim(), answer.trim()]);
    res.json({ success: true, id: result.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update FAQ
app.put('/api/ai/faq/:id', async (req, res) => {
  const { id } = req.params;
  const { question, answer } = req.body;
  if (!question || !answer) {
    return res.status(400).json({ error: 'Thiếu câu hỏi hoặc câu trả lời.' });
  }
  try {
    await run('UPDATE knowledge_base SET question = ?, answer = ? WHERE id = ?', [question.trim(), answer.trim(), id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete FAQ
app.delete('/api/ai/faq/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await run('DELETE FROM knowledge_base WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear all FAQs
app.delete('/api/ai/faq', async (req, res) => {
  try {
    await run('DELETE FROM knowledge_base');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI FAQ & Config Extraction
app.post('/api/ai/extract-faq', async (req, res) => {
  const { text } = req.body;
  if (!text || text.trim() === '') {
    return res.status(400).json({ error: 'Nội dung văn bản trống.' });
  }

  try {
    const geminiKeyRow = await get("SELECT value FROM configs WHERE key = 'gemini_api_key'");
    const geminiApiKey = geminiKeyRow ? geminiKeyRow.value : '';
    if (!geminiApiKey) {
      return res.status(400).json({ error: 'Chưa cấu hình Gemini API Key.' });
    }

    const systemPrompt = `Bạn là một trợ lý AI chuyên nghiệp phân tích văn bản và thiết lập cấu hình Zalo Chatbot Agent.
Nhiệm vụ của bạn là đọc kỹ tài liệu thô do người dùng cung cấp và trích xuất thành bộ cấu hình đề xuất cho Chatbot, gồm:
1. Danh sách câu hỏi (question) và câu trả lời (answer) tương ứng (FAQ) bám sát tài liệu.
2. Danh sách các từ khóa liên quan đến dự án (keywords) phân tách bằng dấu phẩy để nhận diện tin nhắn trong luồng.
3. Danh sách 2 câu trả lời mẫu sẵn ngoài luồng (canned_replies) lịch sự, chung chung khi khách hỏi vấn đề khác.
4. Tin nhắn mẫu kịch bản chăm sóc Ngày 1 (zalo_day1_template) ngắn gọn, hỏi thăm xem khách đã đọc thông tin chưa.
5. Tin nhắn mẫu kịch bản chăm sóc Ngày 3 (zalo_day3_template) ngắn gọn, nhắc lại quyền lợi hội viên viết bài miễn phí.

Hãy trả về duy nhất một đối tượng JSON có cấu trúc chính xác như sau:
{
  "faqs": [
    {
      "question": "Câu hỏi trích xuất...",
      "answer": "Câu trả lời..."
    }
  ],
  "chatbot_inscope_keywords": "từ khóa 1, từ khóa 2, từ khóa 3...",
  "chatbot_canned_replies": [
    "Phản hồi ngoài luồng 1...",
    "Phản hồi ngoài luồng 2..."
  ],
  "zalo_day1_template": "Tin nhắn ngày 1...",
  "zalo_day3_template": "Tin nhắn ngày 3..."
}
Không viết bất kỳ lời dẫn giải nào, không định dạng markdown \`\`\`json ở đầu và cuối, chỉ trả về chuỗi JSON object hợp lệ.`;

    // Try models in order — auto-fallback if a model is deprecated
    const GEMINI_MODELS = [
      'gemini-2.5-flash',
      'gemini-2.5-flash-preview-05-20',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash-latest'
    ];

    let response = null;
    let usedModel = null;
    for (const model of GEMINI_MODELS) {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\nNội dung tài liệu thô:\n${text}` }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      });
      if (response.ok) { usedModel = model; break; }
      const isDeprecated = response.status === 404;
      if (!isDeprecated) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `Gemini API (${model}) returned HTTP ${response.status}: ${errText}` });
      }
      console.warn(`[Gemini] Model "${model}" không khả dụng (404), thử model tiếp theo...`);
    }

    if (!response || !response.ok) {
      return res.status(500).json({ error: 'Tất cả Gemini model đều không khả dụng. Vui lòng kiểm tra lại API Key.' });
    }

    const data = await response.json();
    console.log(`[Gemini] Đã dùng model: ${usedModel}`);
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!content) {
      return res.status(500).json({ error: 'Gemini API không trả về nội dung.' });
    }

    let cleanJson = content;
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    cleanJson = cleanJson.trim();

    let extractedData;
    try {
      extractedData = JSON.parse(cleanJson);
    } catch (e) {
      console.error('Failed to parse JSON from Gemini:', cleanJson);
      return res.status(500).json({ error: 'Không thể parse JSON từ phản hồi của Gemini. Vui lòng thử lại.', raw: content });
    }

    res.json({ success: true, ...extractedData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/ai/save-all', async (req, res) => {
  const { configs, faqs } = req.body;
  try {
    await run('BEGIN TRANSACTION');

    if (configs) {
      const keys = ['chatbot_enabled', 'chatbot_inscope_keywords', 'chatbot_canned_replies', 'zalo_day1_template', 'zalo_day3_template', 'groq_api_key', 'gemini_api_key'];
      for (const key of keys) {
        if (configs[key] !== undefined) {
          await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', [key, String(configs[key])]);
        }
      }
    }

    if (Array.isArray(faqs)) {
      for (const faq of faqs) {
        if (faq.question && faq.answer) {
          await run('INSERT INTO knowledge_base (question, answer) VALUES (?, ?)', [faq.question.trim(), faq.answer.trim()]);
        }
      }
    }

    await run('COMMIT');
    res.json({ success: true });
  } catch (err) {
    try { await run('ROLLBACK'); } catch (_) {}
    res.status(500).json({ error: err.message });
  }
});

// Get lead transfer logs
app.get('/api/ai/transfer-logs', async (req, res) => {
  try {
    const logs = await all(`
      SELECT t.*, l.brand_name, l.phone, 
             a1.custom_name as from_account_name, a1.display_name as from_account_display,
             a2.custom_name as to_account_name, a2.display_name as to_account_display
      FROM lead_transfer_logs t
      LEFT JOIN leads l ON t.lead_id = l.id
      LEFT JOIN zalo_accounts a1 ON t.from_account_id = a1.id
      LEFT JOIN zalo_accounts a2 ON t.to_account_id = a2.id
      ORDER BY t.id DESC
    `);
    res.json(logs);
  } catch (err) {
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
    startReEvaluatorWorker();
    restoreZaloSessions().then(() => log('Khôi phục xong các phiên kết nối Zalo đã lưu.'));
  });
}).catch(err => {
  console.error('Failed to initialize database, server cannot start:', err);
});
