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

async function loadProgressStats() {
  try {
    const res = await fetch('/api/stats/progress');
    if (!res.ok) return;
    const data = await res.json();
    const barTextEl = document.getElementById('progress-bar-text');
    const barFillEl = document.getElementById('progress-bar-fill');
    if (barTextEl && barFillEl) {
      barTextEl.textContent = `Đã xác thực ${data.verified_leads.toLocaleString('vi-VN')} / ${data.target.toLocaleString('vi-VN')} nghệ nhân (${data.percentage}%)`;
      barFillEl.style.width = `${data.percentage}%`;
    }
  } catch (err) {
    console.error('Lỗi khi tải tiến độ chiến dịch:', err);
  }
}

function initAppComponents() {
  if (typeof loadLeads === 'function') loadLeads();
  if (typeof loadConfig === 'function') loadConfig();
  if (window.loadAccounts) window.loadAccounts();
  if (typeof loadQueue === 'function') loadQueue();
  if (typeof updateSystemStatus === 'function') updateSystemStatus();
  setupEventListeners();
  if (typeof setupLogStream === 'function') setupLogStream();
  loadProgressStats();
  
  if (typeof loadLeads === 'function') setInterval(loadLeads, 15000);
  if (typeof loadQueue === 'function') setInterval(loadQueue, 5000);
  if (typeof updateSystemStatus === 'function') setInterval(updateSystemStatus, 3000);
  setInterval(loadProgressStats, 10000);
  setInterval(() => {
    if (window.loadAccounts) window.loadAccounts();
  }, 10000);
}

async function handleLogin(e) {
  e.preventDefault();
  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');
  const errorMsg = document.getElementById('login-error-msg');
  
  const username = usernameInput ? usernameInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value.trim() : '';
  
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
      const overlay = document.getElementById('login-overlay');
      if (overlay) overlay.style.display = 'none';
      if (typeof showToast === 'function') {
        showToast('Đăng nhập thành công!', 'success');
      }
      initAppComponents();
    } else {
      if (errorMsg) {
        errorMsg.textContent = data.error || 'Đăng nhập thất bại!';
        errorMsg.style.display = 'block';
      }
    }
  } catch (err) {
    if (errorMsg) {
      errorMsg.textContent = 'Lỗi kết nối máy chủ!';
      errorMsg.style.display = 'block';
    }
  }
}

function setupEventListeners() {
  const btnStartScrape = document.getElementById('btn-start-scrape');
  if (btnStartScrape && typeof startScrape === 'function') {
    btnStartScrape.addEventListener('click', startScrape);
  }
  const btnForceScheduler = document.getElementById('btn-force-scheduler');
  if (btnForceScheduler && typeof forceScheduler === 'function') {
    btnForceScheduler.addEventListener('click', forceScheduler);
  }
  const btnToggleAutomation = document.getElementById('btn-toggle-automation');
  if (btnToggleAutomation && typeof toggleAutomation === 'function') {
    btnToggleAutomation.addEventListener('click', toggleAutomation);
  }
  const btnToggleZalo = document.getElementById('btn-toggle-zalo-campaign');
  if (btnToggleZalo && typeof toggleZaloCampaign === 'function') {
    btnToggleZalo.addEventListener('click', toggleZaloCampaign);
  }
  const btnAddQueue = document.getElementById('btn-add-queue');
  if (btnAddQueue && typeof addToQueue === 'function') {
    btnAddQueue.addEventListener('click', addToQueue);
  }
  const btnSaveSheet = document.getElementById('btn-save-sheet');
  if (btnSaveSheet && typeof saveConfig === 'function') {
    btnSaveSheet.addEventListener('click', saveConfig);
  }
  const btnSaveChatbot = document.getElementById('btn-save-chatbot');
  if (btnSaveChatbot && typeof saveChatbotConfig === 'function') {
    btnSaveChatbot.addEventListener('click', saveChatbotConfig);
  }
  const btnSaveEmail = document.getElementById('btn-save-email');
  if (btnSaveEmail && typeof saveEmailConfig === 'function') {
    btnSaveEmail.addEventListener('click', saveEmailConfig);
  }
  
  const btnConnect = document.getElementById('btn-connect-zalo');
  if (btnConnect && typeof connectZalo === 'function') {
    btnConnect.addEventListener('click', connectZalo);
  }
  
  const btnRefreshLeads = document.getElementById('btn-refresh-leads');
  if (btnRefreshLeads && typeof loadLeads === 'function') {
    btnRefreshLeads.addEventListener('click', loadLeads);
  }

  const filterSelect = document.getElementById('lead-status-filter');
  if (filterSelect && typeof renderLeadsPage === 'function') {
    filterSelect.addEventListener('change', () => {
      currentLeadsPage = 1;
      renderLeadsPage();
    });
  }
  
  const btnBulkDelete = document.getElementById('btn-bulk-delete-filtered');
  if (btnBulkDelete && typeof deleteFilteredLeads === 'function') {
    btnBulkDelete.addEventListener('click', deleteFilteredLeads);
  }
  
  if (typeof setupStaffUI === 'function') setupStaffUI();
  if (typeof setupPendingReviewUI === 'function') setupPendingReviewUI();

  const btnUploadDbTrig = document.getElementById('btn-upload-db-trigger');
  const inputUploadDb = document.getElementById('input-upload-db');
  if (btnUploadDbTrig && inputUploadDb && typeof handleDbUpload === 'function') {
    btnUploadDbTrig.addEventListener('click', () => inputUploadDb.click());
    inputUploadDb.addEventListener('change', handleDbUpload);
  }

  const btnUploadZaloTrig = document.getElementById('btn-upload-zalo-trigger');
  const inputUploadZalo = document.getElementById('input-upload-zalo');
  if (btnUploadZaloTrig && inputUploadZalo && typeof handleZaloSessionsUpload === 'function') {
    btnUploadZaloTrig.addEventListener('click', () => inputUploadZalo.click());
    inputUploadZalo.addEventListener('change', handleZaloSessionsUpload);
  }

  const btnPrev = document.getElementById('btn-prev-page');
  const btnNext = document.getElementById('btn-next-page');
  if (btnPrev && typeof renderLeadsPage === 'function') {
    btnPrev.addEventListener('click', () => {
      if (currentLeadsPage > 1) {
        currentLeadsPage--;
        renderLeadsPage();
      }
    });
  }
  if (btnNext && typeof renderLeadsPage === 'function') {
    btnNext.addEventListener('click', () => {
      const totalPages = Math.ceil(activeLeadsList.length / leadsPerPage);
      if (currentLeadsPage < totalPages) {
        currentLeadsPage++;
        renderLeadsPage();
      }
    });
  }
  
  const btnCloseModal = document.getElementById('btn-close-modal');
  if (btnCloseModal && typeof closeZaloModal === 'function') {
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

window.handleLogin = handleLogin;
