// Zalo Multi-Account Management Logic
let accountPollingIntervals = {};

document.addEventListener('DOMContentLoaded', () => {
  setupAccountsUI();
});

function setupAccountsUI() {
  const btnManage = document.getElementById('btn-manage-zalo');
  const modal = document.getElementById('zalo-accounts-modal');
  const btnClose = document.getElementById('btn-close-accounts-modal');
  const btnCreate = document.getElementById('btn-create-account');

  if (btnManage) {
    btnManage.addEventListener('click', () => {
      modal.style.display = 'flex';
      loadAccounts();
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      modal.style.display = 'none';
      // Clear all active connection QR polling intervals when closing
      Object.keys(accountPollingIntervals).forEach(accountId => {
        clearInterval(accountPollingIntervals[accountId]);
        delete accountPollingIntervals[accountId];
      });
    });
  }

  if (btnCreate) {
    btnCreate.addEventListener('click', createNewAccount);
  }
}

// Fetch and display Zalo accounts
async function loadAccounts() {
  const container = document.getElementById('accounts-list-container');
  if (!container) return;

  const btnCreate = document.getElementById('btn-create-account');
  const isStaff = localStorage.getItem('crm_role') === 'staff';

  if (btnCreate) {
    btnCreate.style.display = isStaff ? 'none' : 'block';
  }

  try {
    const res = await fetch('/api/zalo/accounts');
    if (!res.ok) throw new Error('Cannot fetch accounts');
    const accounts = await res.json();
    
    // Update header status badge
    updateHeaderBadge(accounts);
    // Render dropdown in inbox
    updateInboxAccountDropdown(accounts);

    if (accounts.length === 0) {
      container.innerHTML = `
        <div style="padding: 30px; text-align: center; color: var(--text-muted); font-style: italic; border: 1px dashed var(--card-border); border-radius: 8px;">
          Chưa có tài khoản Zalo nào. Vui lòng bấm nút "+ Thêm Tài Khoản Mới" ở trên để bắt đầu.
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    accounts.forEach(acc => {
      const card = document.createElement('div');
      card.className = 'glass-card';
      card.style.padding = '15px';
      card.style.borderColor = acc.status === 'connected' ? 'var(--accent-gold)' : 'var(--card-border)';
      
      let statusBadge = '';
      if (acc.status === 'connected') {
        statusBadge = '<span class="badge badge-success">Đang hoạt động</span>';
      } else if (accountPollingIntervals[acc.id]) {
        statusBadge = '<span class="badge badge-warning">Đang kết nối...</span>';
      } else {
        statusBadge = '<span class="badge badge-pending">Chưa kết nối</span>';
      }

      const displayName = acc.custom_name || acc.display_name || `Tài khoản Zalo #${acc.id}`;
      const subName = acc.custom_name && acc.display_name ? `(${acc.display_name})` : '';
      const hasPolling = !!accountPollingIntervals[acc.id];

      let actionButtons = '';
      const renameBtn = isStaff ? '' : `<button class="btn btn-secondary-outline btn-sm" onclick="renameAccount(${acc.id}, '${acc.custom_name || ''}')">Đổi tên</button>`;
      
      if (acc.status === 'connected') {
        actionButtons = isStaff ? '' : `
          ${renameBtn}
          <button class="btn btn-primary-outline btn-sm" onclick="disconnectAccount(${acc.id})">Ngắt kết nối</button>
        `;
      } else if (hasPolling) {
        actionButtons = isStaff ? '' : `
          <button class="btn btn-primary-outline btn-sm" onclick="disconnectAccount(${acc.id})">Hủy kết nối</button>
        `;
      } else {
        actionButtons = isStaff ? '' : `
          ${renameBtn}
          <button class="btn btn-secondary btn-sm" onclick="connectAccount(${acc.id})">Kết nối</button>
          <button class="btn btn-primary-outline btn-sm" onclick="deleteAccount(${acc.id})" style="border-color: var(--accent-red); color: var(--accent-red);">Xóa</button>
        `;
      }

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h4 style="font-size: 15px; font-weight: 600; color: #fff; margin-bottom: 4px;">
              ${displayName} <span style="font-size: 12px; color: var(--text-muted); font-weight: normal; margin-left: 5px;">${subName}</span>
            </h4>
            <div style="display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--text-muted);">
              <span>ID: ${acc.id}</span>
              <span>•</span>
              ${statusBadge}
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            ${actionButtons}
          </div>
        </div>
        
        <!-- Region config bar -->
        <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed rgba(255,255,255,0.05); display: flex; align-items: center; gap: 10px; font-size: 12px;">
          <span style="color: var(--text-muted); font-weight: 600;">Khu vực gán:</span>
          <input type="text" id="regions-input-${acc.id}" value="${acc.assigned_regions || ''}" placeholder="${isStaff ? 'Chưa cấu hình khu vực' : 'Vd: Hà Nội, Cần Thơ (Để trống nếu nhận tất cả)'}" ${isStaff ? 'disabled' : ''} style="background: rgba(0,0,0,0.5); border: 1px solid var(--card-border); border-radius: 4px; padding: 4px 8px; color: #fff; flex: 1; font-size: 11px; outline: none; font-family: var(--font-family-sans);">
          ${isStaff ? '' : `<button class="btn btn-secondary-outline btn-sm" onclick="saveAccountRegions(${acc.id})" style="padding: 3px 8px; font-size: 10px;">Lưu</button>`}
        </div>
        
        <!-- QR Code slot for active connecting status -->
        <div id="qr-section-${acc.id}" style="display: ${hasPolling ? 'block' : 'none'}; margin-top: 15px; text-align: center; background: rgba(0,0,0,0.5); padding: 20px; border-radius: 12px; border: 1px dashed var(--accent-gold);">
          <p style="font-size: 14px; color: #fff; margin-bottom: 15px; font-weight: 600;">Quét mã QR dưới đây bằng điện thoại của bạn:</p>
          <div style="background: #fff; padding: 10px; display: inline-flex; justify-content: center; align-items: center; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); margin: 0 auto; max-width: 100%;">
            <img id="qr-img-${acc.id}" src="/zalo_screenshot_${acc.id}.png?t=${Date.now()}" style="width: 100%; max-width: 480px; height: auto; display: block;" alt="QR Code loading...">
          </div>
          <p style="font-size: 12px; color: var(--accent-gold); margin-top: 15px; font-weight: 600;">Đang kết nối... Vui lòng quét mã QR để đăng nhập</p>
        </div>
      `;
      
      container.appendChild(card);
    });

  } catch (err) {
    console.error('Error loading Zalo accounts:', err);
  }
}

// Create a new empty Zalo account profile
async function createNewAccount() {
  const btn = document.getElementById('btn-create-account');
  btn.disabled = true;
  btn.textContent = 'Đang tạo...';

  try {
    const res = await fetch('/api/zalo/accounts/create', { method: 'POST' });
    if (!res.ok) throw new Error('Create request failed');
    const data = await res.json();
    if (data.success) {
      if (window.showToast) window.showToast('Đã tạo profile tài khoản Zalo mới thành công!', 'success');
      loadAccounts();
    }
  } catch (err) {
    if (window.showToast) window.showToast(`Lỗi: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '+ Thêm Tài Khoản Mới';
  }
}

// Start Zalo login flow for account
async function connectAccount(id) {
  if (window.showToast) window.showToast(`Đang khởi tạo trình duyệt Zalo ID ${id} ngầm...`, 'info');
  
  // Set polling placeholder state
  accountPollingIntervals[id] = setInterval(() => pollQrCode(id), 2000);
  loadAccounts(); // Re-render to show QR section

  try {
    const res = await fetch(`/api/zalo/accounts/${id}/init`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to initialize session');
    const data = await res.json();
    if (data.loggedIn) {
      if (window.showToast) window.showToast(`Tài khoản Zalo ID ${id} đã đăng nhập từ trước!`, 'success');
      stopPolling(id);
      loadAccounts();
    }
  } catch (err) {
    if (window.showToast) window.showToast(`Lỗi kết nối Zalo ID ${id}: ${err.message}`, 'error');
    stopPolling(id);
    loadAccounts();
  }
}

// Stop polling QR code for account
function stopPolling(id) {
  if (accountPollingIntervals[id]) {
    clearInterval(accountPollingIntervals[id]);
    delete accountPollingIntervals[id];
  }
}

// Poll for QR screenshot updates and login status
async function pollQrCode(id) {
  const qrImg = document.getElementById(`qr-img-${id}`);
  if (qrImg) {
    qrImg.src = `/zalo_screenshot_${id}.png?t=` + Date.now();
  }

  try {
    const res = await fetch(`/api/zalo/accounts/${id}/status`);
    const data = await res.json();
    if (data.loggedIn) {
      if (window.showToast) window.showToast(`Tài khoản Zalo ID ${id} kết nối thành công!`, 'success');
      stopPolling(id);
      loadAccounts();
      
      // Update main dashboard status indicators
      if (window.updateSystemStatus) window.updateSystemStatus();
      if (window.loadLeads) window.loadLeads();
    }
  } catch (err) {
    console.error(`Error checking status for account ${id}:`, err);
  }
}

// Disconnect/Logout Zalo account session
async function disconnectAccount(id) {
  stopPolling(id);
  if (window.showToast) window.showToast(`Đang đóng kết nối Zalo ID ${id}...`, 'info');
  
  try {
    const res = await fetch(`/api/zalo/accounts/${id}/close`, { method: 'POST' });
    if (res.ok) {
      if (window.showToast) window.showToast(`Đã ngắt kết nối Zalo ID ${id}.`, 'success');
      loadAccounts();
      if (window.updateSystemStatus) window.updateSystemStatus();
    }
  } catch (err) {
    if (window.showToast) window.showToast(`Lỗi: ${err.message}`, 'error');
  }
}

// Delete Zalo account configuration
async function deleteAccount(id) {
  if (!confirm(`Bạn có chắc chắn muốn xóa cấu hình tài khoản Zalo ID ${id}? Thao tác này sẽ xóa toàn bộ cookie đăng nhập.`)) {
    return;
  }
  
  stopPolling(id);
  if (window.showToast) window.showToast(`Đang xóa tài khoản Zalo ID ${id}...`, 'info');

  try {
    const res = await fetch(`/api/zalo/accounts/${id}/delete`, { method: 'POST' });
    if (res.ok) {
      if (window.showToast) window.showToast(`Đã xóa hoàn toàn Zalo ID ${id}.`, 'success');
      loadAccounts();
    }
  } catch (err) {
    if (window.showToast) window.showToast(`Lỗi: ${err.message}`, 'error');
  }
}

// Update the Zalo account badge in header
function updateHeaderBadge(accounts) {
  const badge = document.getElementById('zalo-status-badge');
  if (!badge) return;

  const connectedCount = accounts.filter(a => a.status === 'connected').length;
  if (connectedCount > 0) {
    badge.textContent = `Zalo: ${connectedCount} hoạt động`;
    badge.className = 'badge badge-success';
  } else {
    badge.textContent = 'Zalo: 0 hoạt động';
    badge.className = 'badge badge-error';
  }
}

// Populate the inbox Zalo Account selection dropdown
function updateInboxAccountDropdown(accounts) {
  const dropdown = document.getElementById('inbox-account-filter');
  if (!dropdown) return;

  // Save current value
  const curValue = dropdown.value;

  // Re-generate dropdown options
  dropdown.innerHTML = '<option value="">Tất cả tài khoản Zalo</option>';
  accounts.forEach(acc => {
    const option = document.createElement('option');
    option.value = acc.id;
    const name = acc.custom_name || acc.display_name || `Tài khoản Zalo #${acc.id}`;
    const statusText = acc.status === 'connected' ? 'Hoạt động' : 'Offline';
    option.textContent = `${name} (${statusText})`;
    dropdown.appendChild(option);
  });

  // Restore value if still present
  if (Array.from(dropdown.options).some(o => o.value === curValue)) {
    dropdown.value = curValue;
  }
}

async function renameAccount(id, currentName) {
  const newName = prompt("Nhập tên gợi nhớ (tên riêng) cho tài khoản Zalo này:", currentName);
  if (newName === null) return; // user cancelled
  
  try {
    const res = await fetch(`/api/zalo/accounts/${id}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ custom_name: newName.trim() })
    });
    if (res.ok) {
      if (window.showToast) window.showToast('Đã đổi tên tài khoản thành công!', 'success');
      loadAccounts();
    }
  } catch (err) {
    if (window.showToast) window.showToast(`Lỗi đổi tên: ${err.message}`, 'error');
  }
}

async function saveAccountRegions(id) {
  const input = document.getElementById(`regions-input-${id}`);
  if (!input) return;
  const val = input.value.trim();
  
  try {
    const res = await fetch(`/api/zalo/accounts/${id}/regions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_regions: val })
    });
    if (res.ok) {
      if (window.showToast) window.showToast('Đã lưu cấu hình khu vực phụ trách!', 'success');
      loadAccounts();
    }
  } catch (err) {
    if (window.showToast) window.showToast(`Lỗi: ${err.message}`, 'error');
  }
}

// Expose functions globally for click handlers
window.connectAccount = connectAccount;
window.disconnectAccount = disconnectAccount;
window.deleteAccount = deleteAccount;
window.loadAccounts = loadAccounts;
window.renameAccount = renameAccount;
window.saveAccountRegions = saveAccountRegions;
