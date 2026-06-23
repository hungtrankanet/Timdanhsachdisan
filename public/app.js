// Frontend application logic for Lacquer Art Scraper Dashboard

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  const token = localStorage.getItem('crm_token');
  if (token && token.startsWith('session_token_lacquer_art_2026')) {
    const role = token.split('_').pop();
    localStorage.setItem('crm_role', role);
    
    const overlay = document.getElementById('login-overlay');
    if (overlay) overlay.style.display = 'none';
    
    applyRoleBasedVisibility(role);
    initAppComponents();
  } else {
    const overlay = document.getElementById('login-overlay');
    if (overlay) overlay.style.display = 'flex';
  }
}

function applyRoleBasedVisibility(role) {
  const adminFields = document.querySelectorAll('.admin-only-field');
  adminFields.forEach(el => {
    if (role === 'admin') {
      el.style.display = (el.tagName === 'BUTTON' || el.tagName === 'SPAN') ? 'inline-block' : 'block';
    } else {
      el.style.display = 'none';
    }
  });
}

function initAppComponents() {
  loadLeads();
  loadConfig();
  if (window.loadAccounts) window.loadAccounts();
  loadQueue();
  updateSystemStatus();
  setupEventListeners();
  setupLogStream();
  
  // Auto refresh leads table every 15 seconds
  setInterval(loadLeads, 15000);
  // Auto refresh queue table every 5 seconds
  setInterval(loadQueue, 5000);
  // Auto check system status every 3 seconds
  setInterval(updateSystemStatus, 3000);
  // Auto check accounts every 10 seconds
  setInterval(() => {
    if (window.loadAccounts) window.loadAccounts();
  }, 10000);
}

async function handleLogin(e) {
  e.preventDefault();
  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');
  const errorMsg = document.getElementById('login-error-msg');
  
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      localStorage.setItem('crm_token', data.token);
      localStorage.setItem('crm_role', data.role);
      applyRoleBasedVisibility(data.role);
      document.getElementById('login-overlay').style.display = 'none';
      showToast('Đăng nhập thành công!', 'success');
      initAppComponents();
    } else {
      errorMsg.textContent = data.error || 'Đăng nhập thất bại!';
      errorMsg.style.display = 'block';
    }
  } catch (err) {
    errorMsg.textContent = 'Lỗi kết nối máy chủ!';
    errorMsg.style.display = 'block';
  }
}
window.handleLogin = handleLogin;

let currentLeadsPage = 1;
const leadsPerPage = 10;
let allLeads = [];

// 1. Fetch and render leads list
async function loadLeads() {
  try {
    const res = await fetch('/api/leads');
    if (!res.ok) throw new Error('Failed to fetch leads');
    allLeads = await res.json();
    renderLeadsPage();
  } catch (err) {
    console.error(err);
    appendConsole(`Lỗi tải dữ liệu leads: ${err.message}`, 'error');
  }
}

function renderLeadsPage() {
  const tbody = document.getElementById('leads-tbody');
  if (!tbody) return;
  
  if (allLeads.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">Không có dữ liệu. Vui lòng chạy trình cào Google Maps.</td></tr>`;
    document.getElementById('leads-pagination-info').textContent = '0 - 0 của 0';
    document.getElementById('btn-prev-page').disabled = true;
    document.getElementById('btn-next-page').disabled = true;
    return;
  }

  const totalPages = Math.ceil(allLeads.length / leadsPerPage);
  if (currentLeadsPage > totalPages) {
    currentLeadsPage = totalPages;
  }
  if (currentLeadsPage < 1) {
    currentLeadsPage = 1;
  }

  const startIdx = (currentLeadsPage - 1) * leadsPerPage;
  const endIdx = Math.min(startIdx + leadsPerPage, allLeads.length);
  const pageLeads = allLeads.slice(startIdx, endIdx);

  tbody.innerHTML = '';
  pageLeads.forEach(lead => {
    const tr = document.createElement('tr');
    
    // Verification Badge
    let verifyBadge = '';
    if (lead.verification_status === 'verified') {
      verifyBadge = '<span class="badge badge-success">Đã xác thực</span>';
    } else if (lead.verification_status === 'partially_verified') {
      verifyBadge = '<span class="badge badge-warning">Khớp 1 phần</span>';
    } else if (lead.verification_status === 'invalid') {
      verifyBadge = '<span class="badge badge-error">Lỗi thông tin</span>';
    } else {
      verifyBadge = '<span class="badge badge-pending">Chưa xác thực</span>';
    }

    // Zalo Status Badge
    let zaloBadge = '';
    if (lead.zalo_status === 'message_sent') {
      zaloBadge = '<span class="badge badge-success">Đã gửi tin mời</span>';
    } else if (lead.zalo_status === 'friend_request_sent') {
      zaloBadge = '<span class="badge badge-warning">Đã gửi kết bạn</span>';
    } else if (lead.zalo_status === 'not_found') {
      zaloBadge = '<span class="badge badge-error">Không dùng Zalo</span>';
    } else if (lead.zalo_status === 'failed') {
      zaloBadge = '<span class="badge badge-error">Lỗi gửi</span>';
    } else {
      zaloBadge = '<span class="badge badge-pending">Chưa gửi</span>';
    }

    // Address string
    const addrString = [lead.ward, lead.district, lead.city].filter(Boolean).join(', ') || lead.address || 'N/A';

    // Website & FB Links
    let linksHTML = '<div class="table-links-col">';
    if (lead.website) {
      linksHTML += `<a href="${lead.website}" target="_blank" class="table-link">Website</a>`;
    }
    if (lead.facebook) {
      linksHTML += `<a href="${lead.facebook}" target="_blank" class="table-link">Facebook</a>`;
    }
    if (!lead.website && !lead.facebook) {
      linksHTML += '<span class="text-muted">Không có</span>';
    }
    linksHTML += '</div>';

    tr.innerHTML = `
      <td style="font-weight: 600;">${lead.brand_name}</td>
      <td>${lead.phone || '<span class="text-muted">Không có</span>'}</td>
      <td>${linksHTML}</td>
      <td>${addrString}</td>
      <td>
        ${verifyBadge}
        ${lead.verification_notes ? `<div style="font-size: 10px; color: var(--text-muted); margin-top: 4px; max-width: 200px;">${lead.verification_notes}</div>` : ''}
      </td>
      <td>
        ${zaloBadge}
        ${lead.zalo_notes ? `<div style="font-size: 10px; color: var(--text-muted); margin-top: 4px; max-width: 200px;">${lead.zalo_notes}</div>` : ''}
      </td>
      <td>
        <div class="table-actions">
          <button class="btn btn-primary-outline btn-sm" onclick="verifySingleLead(${lead.id})">Xác thực</button>
          <button class="btn btn-secondary btn-sm" onclick="sendZaloSingleLead(${lead.id})">Gửi Zalo</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Update pagination UI controls
  document.getElementById('leads-pagination-info').textContent = `${startIdx + 1} - ${endIdx} của ${allLeads.length}`;
  document.getElementById('current-page-num').textContent = `Trang ${currentLeadsPage} / ${totalPages}`;
  document.getElementById('btn-prev-page').disabled = currentLeadsPage === 1;
  document.getElementById('btn-next-page').disabled = currentLeadsPage === totalPages;
}

// 2. Load settings configuration
async function loadConfig() {
  try {
    const resUrl = await fetch('/api/config/sheets_web_app_url');
    const dataUrl = await resUrl.json();
    const sheetBadge = document.getElementById('status-sheet-badge');
    if (dataUrl.value) {
      document.getElementById('sheets-url').value = dataUrl.value;
      sheetBadge.textContent = 'Đã liên kết';
      sheetBadge.style.color = '#d4af37';
    } else {
      sheetBadge.textContent = 'Chưa cấu hình';
      sheetBadge.style.color = 'var(--accent-red)';
    }

    const resToken = await fetch('/api/config/sheets_secret_token');
    const dataToken = await resToken.json();
    if (dataToken.value) {
      document.getElementById('sheets-token').value = dataToken.value;
    }

    // Load n8n chatbot settings
    const resChatbotUrl = await fetch('/api/config/n8n_chatbot_webhook_url');
    const dataChatbotUrl = await resChatbotUrl.json();
    if (dataChatbotUrl.value) {
      document.getElementById('chatbot-webhook-url').value = dataChatbotUrl.value;
    }
    
    const resChatbotToken = await fetch('/api/config/n8n_webhook_token');
    const dataChatbotToken = await resChatbotToken.json();
    if (dataChatbotToken.value) {
      document.getElementById('chatbot-webhook-token').value = dataChatbotToken.value;
    }

    // Load email report settings
    const resSmtpHost = await fetch('/api/config/smtp_host');
    const dataSmtpHost = await resSmtpHost.json();
    if (dataSmtpHost.value) document.getElementById('smtp-host').value = dataSmtpHost.value;

    const resSmtpPort = await fetch('/api/config/smtp_port');
    const dataSmtpPort = await resSmtpPort.json();
    if (dataSmtpPort.value) document.getElementById('smtp-port').value = dataSmtpPort.value;

    const resSmtpUser = await fetch('/api/config/smtp_user');
    const dataSmtpUser = await resSmtpUser.json();
    if (dataSmtpUser.value) document.getElementById('smtp-user').value = dataSmtpUser.value;

    const resSmtpPass = await fetch('/api/config/smtp_pass');
    const dataSmtpPass = await resSmtpPass.json();
    if (dataSmtpPass.value) document.getElementById('smtp-pass').value = dataSmtpPass.value;

    const resReceiver = await fetch('/api/config/report_receiver');
    const dataReceiver = await resReceiver.json();
    if (dataReceiver.value) document.getElementById('report-receiver').value = dataReceiver.value;

    const resEnabled = await fetch('/api/config/email_reporting_enabled');
    const dataEnabled = await resEnabled.json();
    if (dataEnabled.value) {
      document.getElementById('email-reporting-enabled').checked = (dataEnabled.value === 'true');
    }
  } catch (err) {
    console.error(err);
  }
}

async function saveChatbotConfig() {
  const btn = document.getElementById('btn-save-chatbot');
  const originalText = btn.textContent;
  btn.textContent = 'Đang lưu...';
  btn.disabled = true;

  const url = document.getElementById('chatbot-webhook-url').value.trim();
  const token = document.getElementById('chatbot-webhook-token').value.trim();
  try {
    const resUrl = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'n8n_chatbot_webhook_url', value: url })
    });
    
    const resToken = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'n8n_webhook_token', value: token })
    });

    if (resUrl.ok && resToken.ok) {
      appendConsole('Đã lưu cấu hình Chatbot n8n thành công.', 'system');
      showToast('Đã lưu cấu hình Chatbot n8n thành công!', 'success');
    } else {
      showToast('Lỗi lưu cấu hình Chatbot!', 'error');
    }
  } catch (err) {
    showToast(`Lỗi kết nối: ${err.message}`, 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function saveEmailConfig() {
  const btn = document.getElementById('btn-save-email');
  const originalText = btn.textContent;
  btn.textContent = 'Đang lưu...';
  btn.disabled = true;

  const host = document.getElementById('smtp-host').value.trim();
  const port = document.getElementById('smtp-port').value.trim();
  const user = document.getElementById('smtp-user').value.trim();
  const pass = document.getElementById('smtp-pass').value.trim();
  const receiver = document.getElementById('report-receiver').value.trim();
  const enabled = document.getElementById('email-reporting-enabled').checked ? 'true' : 'false';

  try {
    const configs = [
      { key: 'smtp_host', value: host },
      { key: 'smtp_port', value: port },
      { key: 'smtp_user', value: user },
      { key: 'smtp_pass', value: pass },
      { key: 'report_receiver', value: receiver },
      { key: 'email_reporting_enabled', value: enabled }
    ];

    let allOk = true;
    for (const conf of configs) {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conf)
      });
      if (!res.ok) allOk = false;
    }

    if (allOk) {
      appendConsole('Đã lưu cấu hình Email báo cáo thành công.', 'system');
      showToast('Đã lưu cấu hình Email báo cáo thành công!', 'success');
      loadConfig();
    } else {
      showToast('Lỗi lưu cấu hình Email!', 'error');
    }
  } catch (err) {
    showToast(`Lỗi kết nối: ${err.message}`, 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function handleDbUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!confirm('Bạn có chắc chắn muốn tải lên và thay thế cơ sở dữ liệu trên server bằng file cục bộ?')) {
    e.target.value = '';
    return;
  }

  showToast('Đang tải lên cơ sở dữ liệu...', 'info');
  const token = localStorage.getItem('crm_token');

  try {
    const res = await fetch('/api/admin/upload-db', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Authorization': token
      },
      body: file
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Đã cập nhật database thành công! Đang tải lại trang...', 'success');
      setTimeout(() => window.location.reload(), 1500);
    } else {
      showToast(data.error || 'Lỗi tải lên cơ sở dữ liệu.', 'error');
    }
  } catch (err) {
    showToast(`Lỗi kết nối: ${err.message}`, 'error');
  } finally {
    e.target.value = '';
  }
}

async function handleZaloSessionsUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!confirm('Bạn có chắc chắn muốn tải lên và ghi đè các session Zalo hiện tại trên server bằng file zip cục bộ?')) {
    e.target.value = '';
    return;
  }

  showToast('Đang tải lên các session Zalo...', 'info');
  const token = localStorage.getItem('crm_token');

  try {
    const res = await fetch('/api/admin/upload-zalo-sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Authorization': token
      },
      body: file
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Đã tải lên và giải nén Zalo sessions thành công!', 'success');
    } else {
      showToast(data.error || 'Lỗi tải lên zalo sessions.', 'error');
    }
  } catch (err) {
    showToast(`Lỗi kết nối: ${err.message}`, 'error');
  } finally {
    e.target.value = '';
  }
}


// Staff Management Functions
let cachedStaffs = [];

function setupStaffUI() {
  const btnManage = document.getElementById('btn-manage-staff');
  const modal = document.getElementById('staff-modal');
  const btnClose = document.getElementById('btn-close-staff-modal');
  const form = document.getElementById('create-staff-form');

  if (btnManage) {
    btnManage.addEventListener('click', () => {
      modal.style.display = 'flex';
      loadStaffs();
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      modal.style.display = 'none';
      cancelEditStaff();
    });
  }

  if (form) {
    form.addEventListener('submit', createStaff);
  }
}

async function loadStaffs() {
  const tbody = document.getElementById('staff-tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Đang tải danh sách...</td></tr>';
  
  try {
    const res = await fetch('/api/users');
    if (!res.ok) throw new Error('Cannot load staff accounts');
    const users = await res.json();
    cachedStaffs = users;
    
    tbody.innerHTML = '';
    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">Chưa có tài khoản nào.</td></tr>';
      return;
    }
    
    users.forEach(u => {
      const tr = document.createElement('tr');
      
      const dateObj = parseDateSafe(u.created_at);
      const dateStr = dateObj.toLocaleDateString('vi-VN') + ' ' + dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      
      const isSystemAdmin = u.username === 'admin';
      const deleteBtn = isSystemAdmin 
        ? '' 
        : `<button class="btn btn-primary-outline btn-sm" style="border-color: var(--accent-red); color: var(--accent-red); padding: 2px 8px; font-size: 11px; margin-left: 5px;" onclick="deleteStaff(${u.id})">Xóa</button>`;
      const editBtn = `<button class="btn btn-primary-outline btn-sm" style="border-color: var(--accent-gold); color: var(--accent-gold); padding: 2px 8px; font-size: 11px;" onclick="startEditStaff(${u.id})">Sửa</button>`;
      
      const actionHtml = `<div style="display: flex; justify-content: flex-end; gap: 5px;">${editBtn}${deleteBtn}</div>`;
        
      tr.innerHTML = `
        <td style="font-weight:600;">${u.username}</td>
        <td><span class="badge ${u.role === 'admin' ? 'badge-success' : 'badge-pending'}">${u.role.toUpperCase()}</span></td>
        <td style="color: var(--text-muted);">${dateStr}</td>
        <td style="text-align: right;">${actionHtml}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--accent-red);">${err.message}</td></tr>`;
  }
}

function startEditStaff(id) {
  const staff = cachedStaffs.find(u => u.id === id);
  if (!staff) return;

  document.getElementById('staff-edit-id').value = staff.id;
  
  const usernameInput = document.getElementById('staff-username');
  const passwordInput = document.getElementById('staff-password');
  const roleSelect = document.getElementById('staff-role');
  const formTitle = document.getElementById('staff-form-title');
  const submitBtn = document.getElementById('btn-staff-submit');
  const cancelBtn = document.getElementById('btn-staff-cancel-edit');
  const errorMsg = document.getElementById('staff-error-msg');

  errorMsg.style.display = 'none';
  usernameInput.value = staff.username;
  passwordInput.value = staff.password || '';
  roleSelect.value = staff.role;

  if (staff.username === 'admin') {
    usernameInput.disabled = true;
    roleSelect.disabled = true;
  } else {
    usernameInput.disabled = false;
    roleSelect.disabled = false;
  }

  formTitle.textContent = 'Sửa thông tin tài khoản';
  submitBtn.textContent = 'Lưu';
  cancelBtn.style.display = 'inline-block';
}

function cancelEditStaff() {
  document.getElementById('staff-edit-id').value = '';
  
  const usernameInput = document.getElementById('staff-username');
  const passwordInput = document.getElementById('staff-password');
  const roleSelect = document.getElementById('staff-role');
  const formTitle = document.getElementById('staff-form-title');
  const submitBtn = document.getElementById('btn-staff-submit');
  const cancelBtn = document.getElementById('btn-staff-cancel-edit');
  const errorMsg = document.getElementById('staff-error-msg');

  errorMsg.style.display = 'none';
  usernameInput.value = '';
  passwordInput.value = '';
  roleSelect.value = 'staff';

  usernameInput.disabled = false;
  roleSelect.disabled = false;

  formTitle.textContent = 'Thêm tài khoản nhân viên mới';
  submitBtn.textContent = 'Tạo mới';
  cancelBtn.style.display = 'none';
}

async function createStaff(e) {
  e.preventDefault();
  const editIdInput = document.getElementById('staff-edit-id');
  const usernameInput = document.getElementById('staff-username');
  const passwordInput = document.getElementById('staff-password');
  const roleSelect = document.getElementById('staff-role');
  const errorMsg = document.getElementById('staff-error-msg');
  
  const editId = editIdInput.value;
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  const role = roleSelect.value;
  errorMsg.style.display = 'none';
  
  try {
    let res;
    if (editId) {
      res = await fetch(`/api/users/${editId}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role })
      });
    } else {
      res = await fetch('/api/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role })
      });
    }
    const data = await res.json();
    if (res.ok) {
      showToast(editId ? 'Đã cập nhật thông tin tài khoản thành công!' : 'Đã tạo tài khoản nhân viên thành công!', 'success');
      cancelEditStaff();
      loadStaffs();
    } else {
      errorMsg.textContent = data.error || (editId ? 'Lỗi cập nhật tài khoản.' : 'Lỗi tạo tài khoản.');
      errorMsg.style.display = 'block';
    }
  } catch (err) {
    errorMsg.textContent = 'Lỗi kết nối máy chủ.';
    errorMsg.style.display = 'block';
  }
}

async function deleteStaff(id) {
  if (!confirm('Bạn có chắc chắn muốn xóa tài khoản nhân viên này?')) return;
  
  try {
    const res = await fetch(`/api/users/${id}/delete`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast('Đã xóa tài khoản thành công!', 'success');
      loadStaffs();
    } else {
      showToast(data.error || 'Lỗi xóa tài khoản.', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối máy chủ.', 'error');
  }
}

window.deleteStaff = deleteStaff;
window.startEditStaff = startEditStaff;
window.cancelEditStaff = cancelEditStaff;


// 3. Save config
async function saveConfig() {
  const btn = document.getElementById('btn-save-sheet');
  const originalText = btn.textContent;
  btn.textContent = 'Đang lưu...';
  btn.disabled = true;

  const url = document.getElementById('sheets-url').value.trim();
  const token = document.getElementById('sheets-token').value.trim();
  try {
    const resUrl = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'sheets_web_app_url', value: url })
    });
    
    const resToken = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'sheets_secret_token', value: token })
    });

    if (resUrl.ok && resToken.ok) {
      appendConsole('Đã lưu thành công cấu hình URL và Khóa bảo mật Google Sheets.', 'system');
      showToast('Đã lưu cấu hình Google Sheets thành công!', 'success');
      loadConfig();
    } else {
      appendConsole('Lỗi lưu cấu hình.', 'error');
      showToast('Lỗi lưu cấu hình Google Sheets!', 'error');
    }
  } catch (err) {
    appendConsole(`Lỗi kết nối: ${err.message}`, 'error');
    showToast(`Lỗi kết nối: ${err.message}`, 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// 4. Check Zalo instance login status
async function checkZaloStatus() {
  try {
    const res = await fetch('/api/zalo/status');
    const data = await res.json();
    const badge = document.getElementById('zalo-status-badge');
    const statusZaloBadge = document.getElementById('status-zalo-badge');
    const btn = document.getElementById('btn-connect-zalo');
    
    if (data.loggedIn) {
      badge.textContent = 'Zalo: Đã kết nối';
      badge.className = 'badge badge-success';
      statusZaloBadge.textContent = 'Đã kết nối';
      statusZaloBadge.style.color = '#2e7d32';
      btn.textContent = 'Đóng Zalo';
    } else {
      badge.textContent = 'Zalo: Chưa kết nối';
      badge.className = 'badge badge-error';
      statusZaloBadge.textContent = 'Chưa kết nối';
      statusZaloBadge.style.color = 'var(--accent-red)';
      btn.textContent = 'Kết nối Zalo Web';
    }
  } catch (err) {
    console.error(err);
  }
}

// 5. Connect Zalo
let qrPollInterval = null;

async function connectZalo() {
  const btn = document.getElementById('btn-connect-zalo');
  if (btn.textContent === 'Đóng Zalo') {
    appendConsole('Đang đóng phiên Zalo...');
    showToast('Đang ngắt kết nối Zalo...', 'info');
    await fetch('/api/zalo/close', { method: 'POST' });
    checkZaloStatus();
    showToast('Đã đóng phiên kết nối Zalo.', 'success');
    return;
  }

  appendConsole('Đang khởi động Zalo Web chạy ngầm... Vui lòng đợi mã QR xuất hiện.', 'system');
  showToast('Đang khởi động kết nối Zalo ngầm...', 'info');
  btn.disabled = true;
  btn.textContent = 'Đang kết nối...';

  try {
    const modal = document.getElementById('zalo-modal');
    const qrImg = document.getElementById('zalo-qr-img');
    modal.style.display = 'flex';
    
    fetch('/api/zalo/init', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.loggedIn) {
          appendConsole('Zalo đã kết nối thành công từ phiên trước.', 'system');
          showToast('Zalo kết nối thành công!', 'success');
          closeZaloModal();
        }
      });
      
    if (qrPollInterval) clearInterval(qrPollInterval);
    qrPollInterval = setInterval(async () => {
      qrImg.src = 'zalo_screenshot.png?t=' + Date.now();
      
      const res = await fetch('/api/zalo/status');
      const data = await res.json();
      if (data.loggedIn) {
        appendConsole('Đăng nhập Zalo thành công!', 'system');
        showToast('Đăng nhập Zalo thành công!', 'success');
        closeZaloModal();
        checkZaloStatus();
      }
    }, 2000);

  } catch (err) {
    appendConsole(`Lỗi kết nối Zalo: ${err.message}`, 'error');
    showToast(`Lỗi kết nối: ${err.message}`, 'error');
    closeZaloModal();
  } finally {
    btn.disabled = false;
    checkZaloStatus();
  }
}

function closeZaloModal() {
  const modal = document.getElementById('zalo-modal');
  modal.style.display = 'none';
  if (qrPollInterval) {
    clearInterval(qrPollInterval);
    qrPollInterval = null;
  }
}


// 6. Action: Verify Lead
async function verifySingleLead(id) {
  appendConsole(`Đang kích hoạt xác thực cho Lead ID: ${id}...`, 'system');
  try {
    const res = await fetch(`/api/verify/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.status === 'started') {
      appendConsole(`Đã bắt đầu tiến trình xác thực.`, 'system');
    }
  } catch (err) {
    appendConsole(`Lỗi kích hoạt xác thực: ${err.message}`, 'error');
  }
}

// 7. Action: Send Zalo Invite
async function sendZaloSingleLead(id) {
  appendConsole(`Đang kích hoạt gửi Zalo cho Lead ID: ${id}...`, 'system');
  try {
    const res = await fetch(`/api/zalo/send/${id}`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Request failed');
    }
    appendConsole(`Đã bắt đầu gửi tin nhắn mời Zalo.`, 'system');
  } catch (err) {
    appendConsole(`Lỗi kích hoạt gửi Zalo: ${err.message}`, 'error');
  }
}

// 8. Action: Start Scraper
async function startScrape() {
  const query = document.getElementById('search-query').value.trim();
  const limit = document.getElementById('search-limit').value;
  
  if (!query) {
    alert('Vui lòng nhập từ khóa tìm kiếm.');
    return;
  }

  appendConsole(`Kích hoạt cào Google Maps cho từ khóa: "${query}"...`, 'system');
  try {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit })
    });
    const data = await res.json();
    if (data.status === 'started') {
      appendConsole('Trình cào Google Maps đã chạy ngầm.', 'system');
    }
  } catch (err) {
    appendConsole(`Lỗi kích hoạt cào: ${err.message}`, 'error');
  }
}

// 8b. Action: Force Scheduler
async function forceScheduler() {
  appendConsole('Kích hoạt tiến trình tự động hóa hàng ngày...', 'system');
  try {
    const res = await fetch('/api/scheduler/force', { method: 'POST' });
    const data = await res.json();
    if (data.status === 'started') {
      appendConsole('Tiến trình xoay vòng cào GMap -> Xác thực -> Zalo đã khởi động chạy ngầm.', 'system');
    }
  } catch (err) {
    appendConsole(`Lỗi kích hoạt tiến trình tự động: ${err.message}`, 'error');
  }
}

// 8c. Action: Load Crawler Queue
async function loadQueue() {
  try {
    const res = await fetch('/api/queue');
    if (!res.ok) throw new Error('Failed to fetch queue');
    const queue = await res.json();
    
    const tbody = document.getElementById('queue-tbody');
    if (queue.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">Hàng đợi đang trống.</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    queue.forEach(item => {
      const tr = document.createElement('tr');
      
      let statusBadge = '';
      if (item.status === 'completed') {
        statusBadge = '<span class="badge badge-success">Hoàn thành</span>';
      } else if (item.status === 'running') {
        statusBadge = '<span class="badge badge-warning">Đang cào...</span>';
      } else if (item.status === 'failed') {
        statusBadge = '<span class="badge badge-error">Lỗi</span>';
      } else {
        statusBadge = '<span class="badge badge-pending">Chờ xử lý</span>';
      }

      const dateObj = parseDateSafe(item.updated_at);
      const timeStr = dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      const dateStr = dateObj.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      const formattedDate = `${timeStr} ${dateStr}`;

      tr.innerHTML = `
        <td style="font-weight: 600; color: var(--accent-gold);">${item.keyword}</td>
        <td>${item.location}</td>
        <td><strong>${item.leads_found}</strong> leads</td>
        <td>${statusBadge}</td>
        <td style="color: var(--text-muted); font-size: 11px;">${formattedDate}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
  }
}

// 8d. Action: Update System Status Banner State
async function updateSystemStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    
    const statusTitle = document.getElementById('system-status-title');
    const currentTask = document.getElementById('system-current-task');
    const statusDot = document.getElementById('system-status-dot');
    const toggleBtn = document.getElementById('btn-toggle-automation');
    const statusZaloBadge = document.getElementById('status-zalo-badge');
    const statusSheetBadge = document.getElementById('status-sheet-badge');
    
    if (data.scheduler_status === 'active') {
      statusTitle.textContent = 'Hệ thống tự động: Đang hoạt động';
      statusTitle.style.color = '#fff';
      statusDot.className = 'status-indicator-dot glowing-green';
      toggleBtn.textContent = 'Tạm Dừng Tự Động';
      toggleBtn.className = 'btn btn-primary btn-sm';
    } else {
      statusTitle.textContent = 'Hệ thống tự động: Tạm dừng';
      statusTitle.style.color = 'var(--text-muted)';
      statusDot.className = 'status-indicator-dot';
      statusDot.style.backgroundColor = '#424242';
      statusDot.style.boxShadow = 'none';
      toggleBtn.textContent = 'Bật Tự Động Hóa';
      toggleBtn.className = 'btn btn-secondary btn-sm';
    }
    
    currentTask.textContent = data.current_task;
    
    if (data.sheets_configured) {
      statusSheetBadge.textContent = 'Đã liên kết';
      statusSheetBadge.style.color = '#d4af37';
    } else {
      statusSheetBadge.textContent = 'Chưa cấu hình';
      statusSheetBadge.style.color = 'var(--accent-red)';
    }

    if (data.zalo_logged_in) {
      statusZaloBadge.textContent = 'Đã kết nối';
      statusZaloBadge.style.color = '#2e7d32';
    } else {
      statusZaloBadge.textContent = 'Chưa kết nối';
      statusZaloBadge.style.color = 'var(--accent-red)';
    }

    // Cập nhật trạng thái chiến dịch Zalo
    const zaloCampaignBadge = document.getElementById('zalo-campaign-status-badge');
    const zaloCampaignBtn = document.getElementById('btn-toggle-zalo-campaign');
    if (zaloCampaignBadge && zaloCampaignBtn) {
      if (data.zalo_campaign_status === 'active') {
        zaloCampaignBadge.textContent = 'Đang gửi tin';
        zaloCampaignBadge.style.color = '#2e7d32';
        zaloCampaignBtn.textContent = 'Dừng gửi Zalo';
        zaloCampaignBtn.className = 'btn btn-primary';
      } else {
        zaloCampaignBadge.textContent = 'Đang dừng gửi';
        zaloCampaignBadge.style.color = 'var(--accent-red)';
        zaloCampaignBtn.textContent = 'Gửi tin nhắn kết bạn Zalo';
        zaloCampaignBtn.className = 'btn btn-secondary';
      }
    }
  } catch (err) {
    console.error(err);
  }
}

// 8e. Action: Toggle Automation
async function toggleAutomation() {
  const toggleBtn = document.getElementById('btn-toggle-automation');
  const currentStatus = toggleBtn.textContent.includes('Tạm Dừng') ? 'idle' : 'active';
  
  showToast(currentStatus === 'active' ? 'Đang kích hoạt tự động hóa hàng đợi...' : 'Đang tạm dừng tự động hóa...', 'info');
  
  try {
    const res = await fetch('/api/scheduler/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: currentStatus })
    });
    if (res.ok) {
      showToast(currentStatus === 'active' ? 'Đã bật Tự động hóa!' : 'Đã tạm dừng Tự động hóa!', 'success');
      updateSystemStatus();
      loadQueue();
    }
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, 'error');
  }
}

// 8e-2. Action: Toggle Zalo Campaign
async function toggleZaloCampaign() {
  const toggleBtn = document.getElementById('btn-toggle-zalo-campaign');
  if (!toggleBtn) return;
  const currentStatus = toggleBtn.textContent.includes('Dừng gửi') ? 'idle' : 'active';
  
  showToast(currentStatus === 'active' ? 'Đang kích hoạt chiến dịch gửi Zalo...' : 'Đang tạm dừng chiến dịch gửi Zalo...', 'info');
  
  try {
    const res = await fetch('/api/zalo/campaign/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: currentStatus })
    });
    if (res.ok) {
      showToast(currentStatus === 'active' ? 'Đã kích hoạt chiến dịch Zalo!' : 'Đã dừng chiến dịch Zalo!', 'success');
      updateSystemStatus();
    }
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, 'error');
  }
}

// 8f. Action: Add to queue
async function addToQueue() {
  const keywordInput = document.getElementById('queue-keyword');
  const locationInput = document.getElementById('queue-location');
  const keyword = keywordInput.value.trim();
  const location = locationInput.value.trim();
  
  if (!keyword || !location) {
    alert('Vui lòng nhập đầy đủ Từ khóa và Địa điểm.');
    return;
  }
  
  try {
    const res = await fetch('/api/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, location })
    });
    if (res.ok) {
      showToast('Đã thêm thành công vào hàng đợi!', 'success');
      keywordInput.value = '';
      locationInput.value = '';
      loadQueue();
    } else {
      showToast('Lỗi thêm hàng đợi.', 'error');
    }
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, 'error');
  }
}

// 9. Event Listeners Setup
function setupEventListeners() {
  document.getElementById('btn-start-scrape').addEventListener('click', startScrape);
  document.getElementById('btn-force-scheduler').addEventListener('click', forceScheduler);
  document.getElementById('btn-toggle-automation').addEventListener('click', toggleAutomation);
  if (document.getElementById('btn-toggle-zalo-campaign')) {
    document.getElementById('btn-toggle-zalo-campaign').addEventListener('click', toggleZaloCampaign);
  }
  document.getElementById('btn-add-queue').addEventListener('click', addToQueue);
  document.getElementById('btn-save-sheet').addEventListener('click', saveConfig);
  document.getElementById('btn-save-chatbot').addEventListener('click', saveChatbotConfig);
  document.getElementById('btn-save-email').addEventListener('click', saveEmailConfig);
  
  const btnConnect = document.getElementById('btn-connect-zalo');
  if (btnConnect) btnConnect.addEventListener('click', connectZalo);
  
  document.getElementById('btn-refresh-leads').addEventListener('click', loadLeads);
  setupStaffUI();

  // Data sync upload handlers
  const btnUploadDbTrig = document.getElementById('btn-upload-db-trigger');
  const inputUploadDb = document.getElementById('input-upload-db');
  if (btnUploadDbTrig && inputUploadDb) {
    btnUploadDbTrig.addEventListener('click', () => inputUploadDb.click());
    inputUploadDb.addEventListener('change', handleDbUpload);
  }

  const btnUploadZaloTrig = document.getElementById('btn-upload-zalo-trigger');
  const inputUploadZalo = document.getElementById('input-upload-zalo');
  if (btnUploadZaloTrig && inputUploadZalo) {
    btnUploadZaloTrig.addEventListener('click', () => inputUploadZalo.click());
    inputUploadZalo.addEventListener('change', handleZaloSessionsUpload);
  }

  // Pagination button handlers
  const btnPrev = document.getElementById('btn-prev-page');
  const btnNext = document.getElementById('btn-next-page');
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (currentLeadsPage > 1) {
        currentLeadsPage--;
        renderLeadsPage();
      }
    });
  }
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      const totalPages = Math.ceil(allLeads.length / leadsPerPage);
      if (currentLeadsPage < totalPages) {
        currentLeadsPage++;
        renderLeadsPage();
      }
    });
  }
  
  const btnCloseModal = document.getElementById('btn-close-modal');
  if (btnCloseModal) {
    btnCloseModal.addEventListener('click', () => {
      closeZaloModal();
      fetch('/api/zalo/close', { method: 'POST' }).then(() => {
        if (window.loadAccounts) window.loadAccounts();
      });
    });
  }

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.removeItem('crm_token');
      localStorage.removeItem('crm_role');
      window.location.reload();
    });
  }
}

// 10. SSE Log Stream setup
function setupLogStream() {
  const source = new EventSource('/api/logs');
  
  source.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'zalo') {
      appendZaloConsole(data.message);
    } else {
      appendConsole(data.message);
    }
    // Refresh leads table on success steps
    if (data.message.includes('Lưu') || data.message.includes('hoàn tất') || data.message.includes('nhận')) {
      loadLeads();
    }
  };

  source.onerror = (err) => {
    console.error('SSE Error:', err);
    source.close();
    // Reconnect after 5s
    setTimeout(setupLogStream, 5000);
  };
}

// Helper: Append line to log console
function appendConsole(text, type = 'info') {
  const consoleBox = document.getElementById('log-console');
  if (!consoleBox) return;
  const div = document.createElement('div');
  div.className = `log-line ${type}`;
  div.textContent = text;
  consoleBox.appendChild(div);
  consoleBox.scrollTop = consoleBox.scrollHeight;
}

// Helper: Append line to Zalo log console
function appendZaloConsole(text, type = 'info') {
  const consoleBox = document.getElementById('zalo-log-console');
  if (!consoleBox) return;
  const div = document.createElement('div');
  div.className = `log-line ${type}`;
  div.textContent = text;
  consoleBox.appendChild(div);
  consoleBox.scrollTop = consoleBox.scrollHeight;
}

// Helper: Show UX Toast Notification
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 100);
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Helper: Parse SQLite date safely for local timezone
function parseDateSafe(dateStr) {
  if (!dateStr) return new Date();
  if (dateStr.indexOf('Z') === -1 && dateStr.indexOf('+') === -1) {
    // Convert SQLite format "YYYY-MM-DD HH:MM:SS" to ISO "YYYY-MM-DDTHH:MM:SSZ"
    return new Date(dateStr.replace(' ', 'T') + 'Z');
  }
  return new Date(dateStr);
}

// Expose functions to global window for onclick inline binders
window.verifySingleLead = verifySingleLead;
window.sendZaloSingleLead = sendZaloSingleLead;

