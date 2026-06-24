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
app.use(express.json());
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
