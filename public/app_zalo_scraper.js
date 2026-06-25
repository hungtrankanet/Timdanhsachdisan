let qrPollInterval = null;

async function checkZaloStatus() {
  try {
    const res = await fetch('/api/zalo/status');
    const data = await res.json();
    const badge = document.getElementById('zalo-status-badge');
    const statusZaloBadge = document.getElementById('status-zalo-badge');
    const btn = document.getElementById('btn-connect-zalo');
    
    if (data.loggedIn) {
      if (badge) {
        badge.textContent = 'Zalo: Đã kết nối';
        badge.className = 'badge badge-success';
      }
      if (statusZaloBadge) {
        statusZaloBadge.textContent = 'Đã kết nối';
        statusZaloBadge.style.color = '#2e7d32';
      }
      if (btn) {
        btn.textContent = 'Đóng Zalo';
      }
    } else {
      if (badge) {
        badge.textContent = 'Zalo: Chưa kết nối';
        badge.className = 'badge badge-error';
      }
      if (statusZaloBadge) {
        statusZaloBadge.textContent = 'Chưa kết nối';
        statusZaloBadge.style.color = 'var(--accent-red)';
      }
      if (btn) {
        btn.textContent = 'Kết nối Zalo Web';
      }
    }
  } catch (err) {
    console.error(err);
  }
}

async function connectZalo() {
  const btn = document.getElementById('btn-connect-zalo');
  if (btn && btn.textContent === 'Đóng Zalo') {
    if (typeof appendConsole === 'function') appendConsole('Đang đóng phiên Zalo...');
    if (typeof showToast === 'function') showToast('Đang ngắt kết nối Zalo...', 'info');
    await fetch('/api/zalo/close', { method: 'POST' });
    checkZaloStatus();
    if (typeof showToast === 'function') showToast('Đã đóng phiên kết nối Zalo.', 'success');
    return;
  }

  if (typeof appendConsole === 'function') {
    appendConsole('Đang khởi động Zalo Web chạy ngầm... Vui lòng đợi mã QR xuất hiện.', 'system');
  }
  if (typeof showToast === 'function') showToast('Đang khởi động kết nối Zalo ngầm...', 'info');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Đang kết nối...';
  }

  try {
    const modal = document.getElementById('zalo-modal');
    const qrImg = document.getElementById('zalo-qr-img');
    if (modal) modal.style.display = 'flex';
    
    fetch('/api/zalo/init', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.loggedIn) {
          if (typeof appendConsole === 'function') appendConsole('Zalo đã kết nối thành công từ phiên trước.', 'system');
          if (typeof showToast === 'function') showToast('Zalo kết nối thành công!', 'success');
          closeZaloModal();
        }
      });
      
    if (qrPollInterval) clearInterval(qrPollInterval);
    qrPollInterval = setInterval(async () => {
      if (qrImg) qrImg.src = 'zalo_screenshot.png?t=' + Date.now();
      
      const res = await fetch('/api/zalo/status');
      const data = await res.json();
      if (data.loggedIn) {
        if (typeof appendConsole === 'function') appendConsole('Đăng nhập Zalo thành công!', 'system');
        if (typeof showToast === 'function') showToast('Đăng nhập Zalo thành công!', 'success');
        closeZaloModal();
        checkZaloStatus();
      }
    }, 2000);

  } catch (err) {
    if (typeof appendConsole === 'function') appendConsole(`Lỗi kết nối Zalo: ${err.message}`, 'error');
    if (typeof showToast === 'function') showToast(`Lỗi kết nối: ${err.message}`, 'error');
    closeZaloModal();
  } finally {
    if (btn) btn.disabled = false;
    checkZaloStatus();
  }
}

function closeZaloModal() {
  const modal = document.getElementById('zalo-modal');
  if (modal) modal.style.display = 'none';
  if (qrPollInterval) {
    clearInterval(qrPollInterval);
    qrPollInterval = null;
  }
}

async function startScrape() {
  const queryEl = document.getElementById('search-query');
  const limitEl = document.getElementById('search-limit');
  const query = queryEl ? queryEl.value.trim() : '';
  const limit = limitEl ? limitEl.value : '10';
  
  if (!query) {
    alert('Vui lòng nhập từ khóa tìm kiếm.');
    return;
  }

  if (typeof appendConsole === 'function') {
    appendConsole(`Kích hoạt cào Google Maps cho từ khóa: "${query}"...`, 'system');
  }
  try {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit })
    });
    const data = await res.json();
    if (data.status === 'started') {
      if (typeof appendConsole === 'function') appendConsole('Trình cào Google Maps đã chạy ngầm.', 'system');
    }
  } catch (err) {
    if (typeof appendConsole === 'function') {
      appendConsole(`Lỗi kích hoạt cào: ${err.message}`, 'error');
    }
  }
}

async function forceScheduler() {
  if (typeof appendConsole === 'function') {
    appendConsole('Kích hoạt tiến trình tự động hóa hàng ngày...', 'system');
  }
  try {
    const res = await fetch('/api/scheduler/force', { method: 'POST' });
    const data = await res.json();
    if (data.status === 'started') {
      if (typeof appendConsole === 'function') {
        appendConsole('Tiến trình xoay vòng cào GMap -> Xác thực -> Zalo đã khởi động chạy ngầm.', 'system');
      }
    }
  } catch (err) {
    if (typeof appendConsole === 'function') {
      appendConsole(`Lỗi kích hoạt tiến trình tự động: ${err.message}`, 'error');
    }
  }
}

async function loadQueue() {
  try {
    const res = await fetch('/api/queue');
    if (!res.ok) throw new Error('Failed to fetch queue');
    const data = await res.json();
    
    const queue = data.tasks || [];
    const pendingCount = data.pendingCount || 0;
    const progress = data.progress !== undefined ? data.progress : 0;
    const totalCount = data.totalCount || 0;

    // Update progress elements in UI
    const progressContainer = document.getElementById('queue-progress-container');
    const pendingCountEl = document.getElementById('queue-pending-count');
    const progressBar = document.getElementById('queue-progress-bar');
    const progressPercent = document.getElementById('queue-progress-percent');

    if (progressContainer) {
      if (totalCount > 0) {
        progressContainer.style.display = 'inline-flex';
        if (pendingCountEl) pendingCountEl.textContent = pendingCount;
        if (progressBar) progressBar.style.width = `${progress}%`;
        if (progressPercent) progressPercent.textContent = `${progress}%`;
      } else {
        progressContainer.style.display = 'none';
      }
    }
    
    const tbody = document.getElementById('queue-tbody');
    if (!tbody) return;
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
    
    if (statusTitle && statusDot && toggleBtn) {
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
    }
    
    if (currentTask) currentTask.textContent = data.current_task;
    
    if (statusSheetBadge) {
      if (data.sheets_configured) {
        statusSheetBadge.textContent = 'Đã liên kết';
        statusSheetBadge.style.color = '#d4af37';
      } else {
        statusSheetBadge.textContent = 'Chưa cấu hình';
        statusSheetBadge.style.color = 'var(--accent-red)';
      }
    }

    if (statusZaloBadge) {
      if (data.zalo_logged_in) {
        statusZaloBadge.textContent = 'Đã kết nối';
        statusZaloBadge.style.color = '#2e7d32';
      } else {
        statusZaloBadge.textContent = 'Chưa kết nối';
        statusZaloBadge.style.color = 'var(--accent-red)';
      }
    }

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

async function toggleAutomation() {
  const toggleBtn = document.getElementById('btn-toggle-automation');
  if (!toggleBtn) return;
  const currentStatus = toggleBtn.textContent.includes('Tạm Dừng') ? 'idle' : 'active';
  
  if (typeof showToast === 'function') {
    showToast(currentStatus === 'active' ? 'Đang kích hoạt tự động hóa hàng đợi...' : 'Đang tạm dừng tự động hóa...', 'info');
  }
  
  try {
    const res = await fetch('/api/scheduler/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: currentStatus })
    });
    if (res.ok) {
      if (typeof showToast === 'function') {
        showToast(currentStatus === 'active' ? 'Đã bật Tự động hóa!' : 'Đã tạm dừng Tự động hóa!', 'success');
      }
      updateSystemStatus();
      loadQueue();
    }
  } catch (err) {
    if (typeof showToast === 'function') {
      showToast(`Lỗi: ${err.message}`, 'error');
    }
  }
}

async function toggleZaloCampaign() {
  const toggleBtn = document.getElementById('btn-toggle-zalo-campaign');
  if (!toggleBtn) return;
  const currentStatus = toggleBtn.textContent.includes('Dừng gửi') ? 'idle' : 'active';
  
  if (typeof showToast === 'function') {
    showToast(currentStatus === 'active' ? 'Đang kích hoạt chiến dịch gửi Zalo...' : 'Đang tạm dừng chiến dịch gửi Zalo...', 'info');
  }
  
  try {
    const res = await fetch('/api/zalo/campaign/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: currentStatus })
    });
    if (res.ok) {
      if (typeof showToast === 'function') {
        showToast(currentStatus === 'active' ? 'Đã kích hoạt chiến dịch Zalo!' : 'Đã dừng chiến dịch Zalo!', 'success');
      }
      updateSystemStatus();
    }
  } catch (err) {
    if (typeof showToast === 'function') {
      showToast(`Lỗi: ${err.message}`, 'error');
    }
  }
}

async function addToQueue() {
  const keywordInput = document.getElementById('queue-keyword');
  const locationInput = document.getElementById('queue-location');
  const keyword = keywordInput ? keywordInput.value.trim() : '';
  const location = locationInput ? locationInput.value.trim() : '';
  
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
      if (typeof showToast === 'function') {
        showToast('Đã thêm thành công vào hàng đợi!', 'success');
      }
      if (keywordInput) keywordInput.value = '';
      if (locationInput) locationInput.value = '';
      loadQueue();
    } else {
      if (typeof showToast === 'function') {
        showToast('Lỗi thêm hàng đợi.', 'error');
      }
    }
  } catch (err) {
    if (typeof showToast === 'function') {
      showToast(`Lỗi: ${err.message}`, 'error');
    }
  }
}
