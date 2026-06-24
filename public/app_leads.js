let currentLeadsPage = 1;
const leadsPerPage = 10;
let allLeads = [];
let activeLeadsList = [];

async function loadLeads() {
  try {
    const res = await fetch('/api/leads');
    if (!res.ok) throw new Error('Failed to fetch leads');
    allLeads = await res.json();
    renderLeadsPage();
  } catch (err) {
    console.error(err);
    if (typeof appendConsole === 'function') {
      appendConsole(`Lỗi tải dữ liệu leads: ${err.message}`, 'error');
    }
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

  const filterSelect = document.getElementById('lead-status-filter');
  const filterVal = filterSelect ? filterSelect.value : 'all';
  const bulkDeleteBtn = document.getElementById('btn-bulk-delete-filtered');

  const showBulkDeleteFor = ['pending_review', 'partially_verified', 'ready_zalo', 'verified'];
  if (bulkDeleteBtn) {
    if (showBulkDeleteFor.includes(filterVal)) {
      bulkDeleteBtn.style.display = 'inline-block';
      let displayFilterText = '';
      if (filterVal === 'pending_review') displayFilterText = 'Chờ duyệt';
      else if (filterVal === 'partially_verified') displayFilterText = 'Khớp 1 phần';
      else if (filterVal === 'ready_zalo') displayFilterText = 'Sẵn sàng qua Zalo';
      else if (filterVal === 'verified') displayFilterText = 'Đã xác thực';
      bulkDeleteBtn.textContent = `Xóa toàn bộ [${displayFilterText}]`;
    } else {
      bulkDeleteBtn.style.display = 'none';
    }
  }

  if (filterVal === 'ready_zalo') {
    activeLeadsList = allLeads.filter(lead => 
      (lead.verification_status === 'verified' || lead.verification_status === 'partially_verified') &&
      lead.zalo_status === 'pending'
    );
  } else if (filterVal === 'verified') {
    activeLeadsList = allLeads.filter(lead => lead.verification_status === 'verified');
  } else if (filterVal === 'partially_verified') {
    activeLeadsList = allLeads.filter(lead => lead.verification_status === 'partially_verified');
  } else if (filterVal === 'pending_review') {
    activeLeadsList = allLeads.filter(lead => lead.verification_status === 'pending_review');
  } else if (filterVal === 'rejected') {
    activeLeadsList = allLeads.filter(lead => lead.verification_status === 'rejected');
  } else if (filterVal === 'invalid') {
    activeLeadsList = allLeads.filter(lead => lead.verification_status === 'invalid');
  } else if (filterVal === 'unverified') {
    activeLeadsList = allLeads.filter(lead => lead.verification_status !== 'verified' && lead.verification_status !== 'partially_verified' && lead.verification_status !== 'invalid' && lead.verification_status !== 'pending_review' && lead.verification_status !== 'rejected');
  } else {
    activeLeadsList = [...allLeads];
  }

  if (activeLeadsList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">Không có dữ liệu phù hợp với bộ lọc.</td></tr>`;
    document.getElementById('leads-pagination-info').textContent = '0 - 0 của 0';
    document.getElementById('btn-prev-page').disabled = true;
    document.getElementById('btn-next-page').disabled = true;
    document.getElementById('current-page-num').textContent = 'Trang 1 / 1';
    return;
  }

  const totalPages = Math.ceil(activeLeadsList.length / leadsPerPage);
  if (currentLeadsPage > totalPages) {
    currentLeadsPage = totalPages;
  }
  if (currentLeadsPage < 1) {
    currentLeadsPage = 1;
  }

  const startIdx = (currentLeadsPage - 1) * leadsPerPage;
  const endIdx = Math.min(startIdx + leadsPerPage, activeLeadsList.length);
  const pageLeads = activeLeadsList.slice(startIdx, endIdx);

  tbody.innerHTML = '';
  pageLeads.forEach(lead => {
    const tr = document.createElement('tr');
    
    let verifyBadge = '';
    if (lead.verification_status === 'verified') {
      verifyBadge = '<span class="badge badge-success">Đã xác thực</span>';
    } else if (lead.verification_status === 'partially_verified') {
      verifyBadge = '<span class="badge badge-warning">Khớp 1 phần</span>';
    } else if (lead.verification_status === 'invalid') {
      verifyBadge = '<span class="badge badge-error">Lỗi thông tin</span>';
    } else if (lead.verification_status === 'pending_review') {
      verifyBadge = '<span class="badge badge-warning">Chờ duyệt</span>';
    } else if (lead.verification_status === 'rejected') {
      verifyBadge = '<span class="badge badge-error">Bác bỏ</span>';
    } else {
      verifyBadge = '<span class="badge badge-pending">Chưa xác thực</span>';
    }

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

    const addrString = [lead.ward, lead.district, lead.city].filter(Boolean).join(', ') || lead.address || 'N/A';

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
          <button class="btn btn-primary-outline btn-sm" style="border-color: var(--accent-red); color: var(--accent-red);" onclick="deleteSingleLead(${lead.id})">Xóa</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('leads-pagination-info').textContent = `${startIdx + 1} - ${endIdx} của ${activeLeadsList.length}`;
  document.getElementById('current-page-num').textContent = `Trang ${currentLeadsPage} / ${totalPages}`;
  document.getElementById('btn-prev-page').disabled = currentLeadsPage === 1;
  document.getElementById('btn-next-page').disabled = currentLeadsPage === totalPages;
}

async function verifySingleLead(id) {
  if (typeof appendConsole === 'function') {
    appendConsole(`Đang kích hoạt xác thực cho Lead ID: ${id}...`, 'system');
  }
  try {
    const res = await fetch(`/api/verify/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.status === 'started') {
      if (typeof appendConsole === 'function') {
        appendConsole(`Đã bắt đầu tiến trình xác thực.`, 'system');
      }
    }
  } catch (err) {
    if (typeof appendConsole === 'function') {
      appendConsole(`Lỗi kích hoạt xác thực: ${err.message}`, 'error');
    }
  }
}

async function sendZaloSingleLead(id) {
  if (typeof appendConsole === 'function') {
    appendConsole(`Đang kích hoạt gửi Zalo cho Lead ID: ${id}...`, 'system');
  }
  try {
    const res = await fetch(`/api/zalo/send/${id}`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Request failed');
    }
    if (typeof appendConsole === 'function') {
      appendConsole(`Đã bắt đầu gửi tin nhắn mời Zalo.`, 'system');
    }
  } catch (err) {
    if (typeof appendConsole === 'function') {
      appendConsole(`Lỗi kích hoạt gửi Zalo: ${err.message}`, 'error');
    }
  }
}

async function deleteSingleLead(id) {
  if (!confirm('Bạn có chắc chắn muốn xóa liên hệ này khỏi cơ sở dữ liệu?')) return;
  try {
    const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.success) {
      if (typeof showToast === 'function') {
        showToast('Đã xóa liên hệ thành công!', 'success');
      }
      loadLeads();
    } else {
      throw new Error(data.error || 'Failed to delete');
    }
  } catch (err) {
    if (typeof showToast === 'function') {
      showToast(`Lỗi khi xóa: ${err.message}`, 'error');
    }
  }
}

async function deleteFilteredLeads() {
  const filterSelect = document.getElementById('lead-status-filter');
  const filterVal = filterSelect ? filterSelect.value : 'all';
  
  let displayFilterText = '';
  if (filterVal === 'pending_review') displayFilterText = 'Chờ duyệt';
  else if (filterVal === 'partially_verified') displayFilterText = 'Khớp 1 phần';
  else if (filterVal === 'ready_zalo') displayFilterText = 'Sẵn sàng qua Zalo';
  else if (filterVal === 'verified') displayFilterText = 'Đã xác thực';
  
  if (!displayFilterText) return;
  if (activeLeadsList.length === 0) {
    if (typeof showToast === 'function') {
      showToast('Danh sách trống, không có gì để xóa!', 'error');
    }
    return;
  }
  
  const confirmMsg = `CẢNH BÁO: Bạn có chắc chắn muốn xóa TOÀN BỘ ${activeLeadsList.length} liên hệ đang thuộc bộ lọc [${displayFilterText}] khỏi cơ sở dữ liệu không?\nHành động này không thể hoàn tác!`;
  if (!confirm(confirmMsg)) return;
  
  try {
    const ids = activeLeadsList.map(lead => lead.id);
    const res = await fetch('/api/leads/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      if (typeof showToast === 'function') {
        showToast(`Đã xóa thành công ${ids.length} liên hệ!`, 'success');
      }
      loadLeads();
    } else {
      throw new Error(data.error || 'Bulk delete failed');
    }
  } catch (err) {
    if (typeof showToast === 'function') {
      showToast(`Lỗi khi xóa hàng loạt: ${err.message}`, 'error');
    }
  }
}

window.verifySingleLead = verifySingleLead;
window.sendZaloSingleLead = sendZaloSingleLead;
window.deleteSingleLead = deleteSingleLead;
