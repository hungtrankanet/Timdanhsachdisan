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

    const resScraperDelay = await fetch('/api/config/scraper_delay');
    const dataScraperDelay = await resScraperDelay.json();
    if (dataScraperDelay.value) document.getElementById('scraper-delay').value = dataScraperDelay.value;

    const resVerifierDelay = await fetch('/api/config/verifier_delay');
    const dataVerifierDelay = await resVerifierDelay.json();
    if (dataVerifierDelay.value) document.getElementById('verifier-delay').value = dataVerifierDelay.value;

    const resVerifierSpacing = await fetch('/api/config/verifier_spacing');
    const dataVerifierSpacing = await resVerifierSpacing.json();
    if (dataVerifierSpacing.value) document.getElementById('verifier-spacing').value = dataVerifierSpacing.value;
  } catch (err) {
    console.error(err);
  }
}

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

async function saveTimingConfig() {
  const btn = document.getElementById('btn-save-timing');
  if (!btn) return;
  const originalText = btn.textContent;
  btn.textContent = 'Đang lưu...';
  btn.disabled = true;

  const scraperDelay = document.getElementById('scraper-delay').value.trim();
  const verifierDelay = document.getElementById('verifier-delay').value.trim();
  const verifierSpacing = document.getElementById('verifier-spacing').value.trim();

  try {
    const configs = [
      { key: 'scraper_delay', value: scraperDelay },
      { key: 'verifier_delay', value: verifierDelay },
      { key: 'verifier_spacing', value: verifierSpacing }
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
      appendConsole('Đã lưu cấu hình giãn cách hoạt động (Tối ưu CPU) thành công.', 'system');
      showToast('Đã lưu cấu hình giãn cách hoạt động thành công!', 'success');
      loadConfig();
    } else {
      showToast('Lỗi lưu cấu hình giãn cách!', 'error');
    }
  } catch (err) {
    showToast(`Lỗi kết nối: ${err.message}`, 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

