// Zalo Inbox CRM Frontend Logic
let activeLeadId = null;
let chatList = [];
let messagesList = [];
let inboxInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  setupInboxTabs();
  setupInboxEventListeners();
});

// Tab Setup
function setupInboxTabs() {
  const btnDashboard = document.getElementById('btn-tab-dashboard');
  const btnInbox = document.getElementById('btn-tab-inbox');
  const viewDashboard = document.getElementById('view-dashboard');
  const viewInbox = document.getElementById('view-inbox');

  btnDashboard.addEventListener('click', () => {
    btnDashboard.classList.add('active');
    btnInbox.classList.remove('active');
    viewDashboard.classList.add('active-view');
    viewInbox.classList.remove('active-view');
    
    // Stop polling inbox
    if (inboxInterval) {
      clearInterval(inboxInterval);
      inboxInterval = null;
    }
  });

  btnInbox.addEventListener('click', () => {
    btnInbox.classList.add('active');
    btnDashboard.classList.remove('active');
    viewInbox.classList.add('active-view');
    viewDashboard.classList.remove('active-view');
    
    // Start loading chats
    loadChats();
    // Poll inbox chats list every 10 seconds
    if (inboxInterval) clearInterval(inboxInterval);
    inboxInterval = setInterval(() => {
      loadChats(false); // Silent load
      if (activeLeadId) {
        loadActiveChat(activeLeadId, false); // Silent load chat messages
      }
    }, 10000);
  });
}

// Event Listeners for Inbox
function setupInboxEventListeners() {
  const searchInput = document.getElementById('inbox-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterContacts(e.target.value.trim());
    });
  }

  const accountFilter = document.getElementById('inbox-account-filter');
  if (accountFilter) {
    accountFilter.addEventListener('change', () => {
      // Clear active lead chat area when switching account filter
      const chatArea = document.getElementById('inbox-chat-area');
      if (chatArea) {
        chatArea.innerHTML = `
          <div class="chat-placeholder">
            <p>Chọn một cuộc hội thoại từ danh sách để xem tin nhắn</p>
          </div>
        `;
      }
      activeLeadId = null;
      loadChats(true);
    });
  }

  const btnSyncAll = document.getElementById('btn-sync-all-chats');
  if (btnSyncAll) {
    btnSyncAll.addEventListener('click', syncAllChatsManual);
  }
}

// Fetch and render conversations lists (Left column)
async function loadChats(showLoading = true) {
  const contactsContainer = document.getElementById('inbox-contacts');
  if (showLoading && contactsContainer.children.length === 0) {
    contactsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-style: italic;">Đang tải danh sách...</div>';
  }

  try {
    const filterSelect = document.getElementById('inbox-account-filter');
    const accountId = filterSelect ? filterSelect.value : '';
    const url = accountId ? `/api/zalo/chats?account_id=${accountId}` : '/api/zalo/chats';

    const res = await fetch(url);
    if (!res.ok) throw new Error('Cannot fetch chats');
    chatList = await res.json();
    renderContactsList(chatList);
  } catch (err) {
    console.error('Error fetching chats:', err);
  }
}

function renderContactsList(chats) {
  const contactsContainer = document.getElementById('inbox-contacts');
  if (chats.length === 0) {
    contactsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-style: italic;">Chưa có hội thoại Zalo nào.</div>';
    return;
  }

  // Filter with current search input
  const searchVal = document.getElementById('inbox-search-input')?.value.trim().toLowerCase() || '';
  const filtered = chats.filter(c => 
    c.brand_name.toLowerCase().includes(searchVal) || 
    (c.phone && c.phone.includes(searchVal))
  );

  contactsContainer.innerHTML = '';
  filtered.forEach(chat => {
    const div = document.createElement('div');
    div.className = `contact-item ${activeLeadId === chat.id ? 'active' : ''}`;
    div.onclick = () => selectContact(chat.id, chat.brand_name, chat.phone, chat.zalo_status);

    // Format time
    let timeStr = 'N/A';
    if (chat.last_message_time) {
      const d = parseDateSafe(chat.last_message_time);
      timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    }

    div.innerHTML = `
      <div class="contact-item-header">
        <span class="contact-name">${chat.brand_name}</span>
        <span class="contact-time">${timeStr}</span>
      </div>
      <div style="font-size: 11px; color: var(--accent-gold); font-weight: 600;">SĐT: ${chat.phone || 'N/A'}</div>
      <div class="contact-last-msg">${chat.last_message || 'Không có tin nhắn'}</div>
    `;
    contactsContainer.appendChild(div);
  });
}

function filterContacts(query) {
  renderContactsList(chatList);
}

// Select contact
function selectContact(leadId, brandName, phone, zaloStatus) {
  activeLeadId = leadId;
  
  // Highlight active
  const items = document.querySelectorAll('.contact-item');
  items.forEach(el => el.classList.remove('active'));
  
  // Find clicked item
  const contactsContainer = document.getElementById('inbox-contacts');
  renderContactsList(chatList); // Re-render to show active visual border

  // Render chat wrapper layout
  const chatArea = document.getElementById('inbox-chat-area');
  chatArea.innerHTML = `
    <div class="chat-header">
      <div class="chat-header-info">
        <h3>${brandName}</h3>
        <p>SĐT: ${phone || 'N/A'} | Trạng thái: ${getFriendlyZaloStatus(zaloStatus)}</p>
      </div>
      <div>
        <button class="btn btn-secondary btn-sm" id="btn-sync-chat-now" onclick="syncChatManual(${leadId})">Đồng bộ ngay</button>
      </div>
    </div>
    <div class="chat-messages" id="chat-messages-box">
      <div style="padding: 40px; text-align: center; color: var(--text-muted); font-style: italic;">Đang tải hội thoại...</div>
    </div>
  `;

  loadActiveChat(leadId);
}

// Fetch chat messages (Right column)
async function loadActiveChat(leadId, showLoading = true) {
  const box = document.getElementById('chat-messages-box');
  try {
    const filterSelect = document.getElementById('inbox-account-filter');
    const accountId = filterSelect ? filterSelect.value : '';
    const url = accountId ? `/api/zalo/chats/${leadId}?account_id=${accountId}` : `/api/zalo/chats/${leadId}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('Cannot load history');
    messagesList = await res.json();
    
    if (!box) return;
    box.innerHTML = '';
    
    if (messagesList.length === 0) {
      box.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-muted); font-style: italic;">Chưa có lịch sử tin nhắn trong cơ sở dữ liệu. Vui lòng bấm "Đồng bộ ngay" để đồng bộ dữ liệu chat từ Zalo Web.</div>';
      return;
    }

    messagesList.forEach(msg => {
      const row = document.createElement('div');
      row.className = `message-row ${(msg.sender === 'me' || msg.sender === 'bot') ? 'me' : 'client'}`;

      let timeStr = '';
      if (msg.timestamp) {
        const d = parseDateSafe(msg.timestamp);
        timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      }

      row.innerHTML = `
        <div class="message-bubble">
          <div>${msg.message.replace(/\n/g, '<br>')}</div>
          <span class="message-time-stamp">${timeStr}</span>
        </div>
      `;
      box.appendChild(row);
    });

    // Scroll to bottom
    box.scrollTop = box.scrollHeight;
  } catch (err) {
    console.error('Error fetching chat history:', err);
  }
}

// Manual sync trigger
async function syncChatManual(leadId) {
  const btn = document.getElementById('btn-sync-chat-now');
  if (btn) {
    btn.textContent = 'Đang đồng bộ...';
    btn.disabled = true;
  }

  // Use the toast function from app.js if exposed, or fallback
  if (window.showToast) {
    window.showToast('Đang yêu cầu đồng bộ Zalo Web...', 'info');
  } else {
    alert('Đang tiến hành đồng bộ Zalo...');
  }

  try {
    const filterSelect = document.getElementById('inbox-account-filter');
    const accountId = filterSelect ? filterSelect.value : '';
    const url = accountId ? `/api/zalo/chats/${leadId}/sync?account_id=${accountId}` : `/api/zalo/chats/${leadId}/sync`;
    
    const res = await fetch(url, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Sync request failed');
    }
    
    if (window.showToast) {
      window.showToast('Yêu cầu đồng bộ Zalo đã được gửi!', 'success');
    }
    
    // Wait 5 seconds then reload active chat
    setTimeout(() => {
      loadChats(false);
      if (activeLeadId === leadId) {
        loadActiveChat(leadId, false);
      }
    }, 5000);
  } catch (err) {
    if (window.showToast) {
      window.showToast(`Lỗi đồng bộ: ${err.message}`, 'error');
    } else {
      alert(`Lỗi: ${err.message}`);
    }
  } finally {
    if (btn) {
      btn.textContent = 'Đồng bộ ngay';
      btn.disabled = false;
    }
  }
}

// Expose sync function globally for inline onclick binders
window.syncChatManual = syncChatManual;
window.syncAllChatsManual = syncAllChatsManual;

async function syncAllChatsManual() {
  const btn = document.getElementById('btn-sync-all-chats');
  const originalText = btn ? btn.textContent : 'Đồng bộ tất cả tin nhắn';
  if (btn) {
    btn.textContent = 'Đang đồng bộ tất cả...';
    btn.disabled = true;
  }

  if (window.showToast) {
    window.showToast('Bắt đầu đồng bộ tất cả tin nhắn Zalo...', 'info');
  }

  try {
    const res = await fetch('/api/zalo/chats/sync-all', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    
    if (window.showToast) {
      window.showToast('Tiến trình đồng bộ tất cả tin nhắn đang chạy ngầm!', 'success');
    }
    
    setTimeout(() => {
      loadChats(false);
    }, 5000);
  } catch (err) {
    if (window.showToast) {
      window.showToast(`Lỗi: ${err.message}`, 'error');
    }
  } finally {
    if (btn) {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }
}

// Helper: Friendly Zalo Status
function getFriendlyZaloStatus(status) {
  switch(status) {
    case 'message_sent': return 'Đã gửi tin mời';
    case 'friend_request_sent': return 'Đã gửi kết bạn';
    case 'not_found': return 'Không dùng Zalo';
    case 'failed': return 'Gặp lỗi';
    default: return 'Chưa kết nối';
  }
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
