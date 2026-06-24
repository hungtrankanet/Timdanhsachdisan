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
      if (typeof showToast === 'function') {
        showToast(editId ? 'Đã cập nhật thông tin tài khoản thành công!' : 'Đã tạo tài khoản nhân viên thành công!', 'success');
      }
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
      if (typeof showToast === 'function') {
        showToast('Đã xóa tài khoản thành công!', 'success');
      }
      loadStaffs();
    } else {
      if (typeof showToast === 'function') {
        showToast(data.error || 'Lỗi xóa tài khoản.', 'error');
      }
    }
  } catch (err) {
    if (typeof showToast === 'function') {
      showToast('Lỗi kết nối máy chủ.', 'error');
    }
  }
}

function setupPendingReviewUI() {
  const btnManage = document.getElementById('btn-manage-pending');
  const modal = document.getElementById('pending-modal');
  const btnClose = document.getElementById('btn-close-pending-modal');
  const btnApproveAll = document.getElementById('btn-approve-all-pending');
  const btnRejectAll = document.getElementById('btn-reject-all-pending');

  if (btnManage) {
    btnManage.addEventListener('click', () => {
      modal.style.display = 'flex';
      loadPendingLeads();
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  if (btnApproveAll) {
    btnApproveAll.addEventListener('click', approveAllPending);
  }

  if (btnRejectAll) {
    btnRejectAll.addEventListener('click', rejectAllPending);
  }
}

async function loadPendingLeads() {
  const tbody = document.getElementById('pending-tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Đang tải danh sách chờ duyệt...</td></tr>';
  
  try {
    const res = await fetch('/api/leads/pending_review');
    if (!res.ok) throw new Error('Không thể tải danh sách chờ duyệt');
    const leads = await res.json();
    
    tbody.innerHTML = '';
    if (leads.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">Không có địa điểm nào đang chờ duyệt.</td></tr>';
      return;
    }
    
    leads.forEach(lead => {
      const tr = document.createElement('tr');
      
      tr.innerHTML = `
        <td style="font-weight:600;">${lead.brand_name}</td>
        <td>${lead.phone || '<span class="text-muted">Không có</span>'}</td>
        <td>${lead.address || '<span class="text-muted">Không có</span>'}</td>
        <td><span style="color: var(--text-muted); font-size: 11px;">${lead.verification_notes || ''}</span></td>
        <td style="text-align: right;">
          <div style="display: flex; justify-content: flex-end; gap: 5px;">
            <button class="btn btn-secondary btn-sm" onclick="approveLead(${lead.id})">Duyệt</button>
            <button class="btn btn-primary-outline btn-sm" style="border-color: var(--accent-red); color: var(--accent-red);" onclick="rejectLead(${lead.id})">Bác bỏ</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--accent-red);">${err.message}</td></tr>`;
  }
}

async function approveLead(id) {
  try {
    const res = await fetch(`/api/leads/${id}/approve`, { method: 'POST' });
    if (!res.ok) throw new Error('Không thể phê duyệt địa điểm');
    if (typeof showToast === 'function') {
      showToast('Đã phê duyệt địa điểm thành công!', 'success');
    }
    loadPendingLeads();
    if (typeof loadLeads === 'function') loadLeads();
  } catch (err) {
    if (typeof showToast === 'function') {
      showToast(`Lỗi: ${err.message}`, 'error');
    }
  }
}

async function rejectLead(id) {
  if (!confirm('Bạn có chắc chắn muốn bác bỏ địa điểm này?')) return;
  try {
    const res = await fetch(`/api/leads/${id}/reject`, { method: 'POST' });
    if (!res.ok) throw new Error('Không thể bác bỏ địa điểm');
    if (typeof showToast === 'function') {
      showToast('Đã bác bỏ địa điểm thành công!', 'success');
    }
    loadPendingLeads();
    if (typeof loadLeads === 'function') loadLeads();
  } catch (err) {
    if (typeof showToast === 'function') {
      showToast(`Lỗi: ${err.message}`, 'error');
    }
  }
}

async function approveAllPending() {
  if (!confirm('Bạn có chắc chắn muốn phê duyệt tất cả các địa điểm đang chờ duyệt?')) return;
  try {
    const res = await fetch('/api/leads/pending_review/approve-all', { method: 'POST' });
    if (!res.ok) throw new Error('Không thể phê duyệt hàng loạt');
    if (typeof showToast === 'function') {
      showToast('Đã phê duyệt tất cả địa điểm đang chờ duyệt!', 'success');
    }
    loadPendingLeads();
    if (typeof loadLeads === 'function') loadLeads();
  } catch (err) {
    if (typeof showToast === 'function') {
      showToast(`Lỗi: ${err.message}`, 'error');
    }
  }
}

async function rejectAllPending() {
  if (!confirm('Bạn có chắc chắn muốn bác bỏ tất cả các địa điểm đang chờ duyệt?')) return;
  try {
    const res = await fetch('/api/leads/pending_review/reject-all', { method: 'POST' });
    if (!res.ok) throw new Error('Không thể bác bỏ hàng loạt');
    if (typeof showToast === 'function') {
      showToast('Đã bác bỏ tất cả địa điểm đang chờ duyệt!', 'success');
    }
    loadPendingLeads();
    if (typeof loadLeads === 'function') loadLeads();
  } catch (err) {
    if (typeof showToast === 'function') {
      showToast(`Lỗi: ${err.message}`, 'error');
    }
  }
}

window.deleteStaff = deleteStaff;
window.startEditStaff = startEditStaff;
window.cancelEditStaff = cancelEditStaff;
window.approveLead = approveLead;
window.rejectLead = rejectLead;
