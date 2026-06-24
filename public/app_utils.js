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
    return new Date(dateStr.replace(' ', 'T') + 'Z');
  }
  return new Date(dateStr);
}

// SSE Log Stream setup
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
      if (typeof loadLeads === 'function') {
        loadLeads();
      }
    }
  };

  source.onerror = (err) => {
    console.error('SSE Error:', err);
    source.close();
    setTimeout(setupLogStream, 5000);
  };
}
