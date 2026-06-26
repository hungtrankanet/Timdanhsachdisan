// AI Agent Dashboard Logic

document.addEventListener('DOMContentLoaded', () => {
  setupAiEventListeners();
});

// Load Config
async function loadAiAgentConfig() {
  try {
    const res = await fetch('/api/ai/config');
    if (!res.ok) throw new Error('Không thể tải cấu hình AI.');
    const config = await res.json();
    
    document.getElementById('chatbot-enabled').checked = config.chatbot_enabled === 'true';
    document.getElementById('groq-api-key').value = config.groq_api_key || '';
    document.getElementById('chatbot-keywords').value = config.chatbot_inscope_keywords || '';
    
    let cannedRepliesText = config.chatbot_canned_replies || '[]';
    try {
      const arr = JSON.parse(cannedRepliesText);
      cannedRepliesText = JSON.stringify(arr, null, 2);
    } catch(e) {}
    document.getElementById('chatbot-canned-replies').value = cannedRepliesText;
    
    document.getElementById('followup-day1-template').value = config.zalo_day1_template || '';
    document.getElementById('followup-day3-template').value = config.zalo_day3_template || '';
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

// Load FAQs
async function loadFAQs() {
  try {
    const res = await fetch('/api/ai/faq');
    if (!res.ok) throw new Error('Không thể tải cơ sở tri thức.');
    const faqs = await res.json();
    
    const tbody = document.getElementById('faq-tbody');
    const headerTitle = document.getElementById('faq-header-title');
    if (headerTitle) {
      headerTitle.textContent = `Cơ sở tri thức FAQ (${faqs.length} câu)`;
    }
    
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (faqs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" class="loading-cell" style="color: var(--text-muted); text-align: center; padding: 20px;">Cơ sở tri thức trống. Vui lòng thêm thủ công hoặc dán tài liệu trích xuất tự động.</td></tr>`;
      return;
    }
    
    faqs.forEach(faq => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 600; color: #fff; vertical-align: top; padding: 12px;">${escapeHtml(faq.question)}</td>
        <td style="color: var(--text-muted); vertical-align: top; padding: 12px; white-space: pre-wrap;">${escapeHtml(faq.answer)}</td>
        <td style="text-align: right; vertical-align: top; padding: 12px;">
          <button class="btn btn-secondary-outline btn-sm btn-edit-faq" data-id="${faq.id}">Sửa</button>
          <button class="btn btn-primary-outline btn-sm btn-delete-faq" data-id="${faq.id}" style="border-color: var(--accent-red); color: var(--accent-red); margin-left: 5px;">Xóa</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    
    tbody.querySelectorAll('.btn-edit-faq').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.target.getAttribute('data-id'), 10);
        const faq = faqs.find(f => f.id === id);
        if (faq) openEditFaqForm(faq);
      });
    });
    
    tbody.querySelectorAll('.btn-delete-faq').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.getAttribute('data-id');
        if (confirm('Bạn có chắc chắn muốn xóa câu hỏi/đáp này không?')) {
          await deleteFaq(id);
        }
      });
    });
    
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

// Load Transfer Logs
async function loadTransferLogs() {
  try {
    const res = await fetch('/api/ai/transfer-logs');
    if (!res.ok) throw new Error('Không thể tải nhật ký chuyển giao.');
    const logs = await res.json();
    
    const tbody = document.getElementById('transfer-logs-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="loading-cell" style="color: var(--text-muted); text-align: center; padding: 20px;">Không có nhật ký chuyển giao khách hàng.</td></tr>`;
      return;
    }
    
    logs.forEach(log => {
      const fromAcc = log.from_account_name || log.from_account_display || `Tài khoản #${log.from_account_id}`;
      const toAcc = log.to_account_name || log.to_account_display || `Tài khoản #${log.to_account_id}`;
      const dateStr = new Date(log.created_at).toLocaleString('vi-VN');
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 600; color: #fff; padding: 12px;">${escapeHtml(log.brand_name || 'Khách hàng')}</td>
        <td style="padding: 12px;">${escapeHtml(log.phone || '')}</td>
        <td style="padding: 12px;">${escapeHtml(fromAcc)}</td>
        <td style="padding: 12px;"><strong style="color: var(--accent-gold);">${escapeHtml(toAcc)}</strong></td>
        <td style="padding: 12px;">${escapeHtml(log.reason || '')}</td>
        <td style="color: var(--text-muted); font-size: 12px; padding: 12px;">${dateStr}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Lỗi tải nhật ký chuyển giao:', err);
  }
}

// Setup Event Listeners
function setupAiEventListeners() {
  // Save AI Config
  const btnSaveAiConfig = document.getElementById('btn-save-ai-agent-config');
  if (btnSaveAiConfig) {
    btnSaveAiConfig.addEventListener('click', async () => {
      const chatbot_enabled = document.getElementById('chatbot-enabled').checked ? 'true' : 'false';
      const groq_api_key = document.getElementById('groq-api-key').value.trim();
      const chatbot_inscope_keywords = document.getElementById('chatbot-keywords').value.trim();
      
      let chatbot_canned_replies = document.getElementById('chatbot-canned-replies').value.trim();
      try {
        const parsed = JSON.parse(chatbot_canned_replies);
        if (!Array.isArray(parsed)) throw new Error();
        chatbot_canned_replies = JSON.stringify(parsed);
      } catch (e) {
        if (typeof showToast === 'function') {
          showToast('Câu trả lời ngoài luồng phải là một JSON array hợp lệ (vd: ["Câu 1", "Câu 2"])', 'error');
        }
        return;
      }
      
      try {
        const res = await fetch('/api/ai/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatbot_enabled, groq_api_key, chatbot_inscope_keywords, chatbot_canned_replies })
        });
        if (res.ok) {
          if (typeof showToast === 'function') showToast('Đã lưu cấu hình AI Chatbot thành công!', 'success');
          loadAiAgentConfig();
        } else {
          throw new Error('Lỗi lưu cấu hình.');
        }
      } catch (err) {
        if (typeof showToast === 'function') showToast(err.message, 'error');
      }
    });
  }

  // Save Follow-up Config
  const btnSaveFollowUp = document.getElementById('btn-save-followup-config');
  if (btnSaveFollowUp) {
    btnSaveFollowUp.addEventListener('click', async () => {
      const zalo_day1_template = document.getElementById('followup-day1-template').value.trim();
      const zalo_day3_template = document.getElementById('followup-day3-template').value.trim();
      
      try {
        const res = await fetch('/api/ai/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zalo_day1_template, zalo_day3_template })
        });
        if (res.ok) {
          if (typeof showToast === 'function') showToast('Đã lưu tin nhắn kịch bản follow-up thành công!', 'success');
          loadAiAgentConfig();
        } else {
          throw new Error('Lỗi lưu kịch bản.');
        }
      } catch (err) {
        if (typeof showToast === 'function') showToast(err.message, 'error');
      }
    });
  }

  // Extract FAQ
  const btnExtractFaq = document.getElementById('btn-extract-faq');
  if (btnExtractFaq) {
    btnExtractFaq.addEventListener('click', async () => {
      const text = document.getElementById('ai-extract-text').value.trim();
      if (!text) {
        if (typeof showToast === 'function') showToast('Vui lòng nhập nội dung tài liệu để trích xuất.', 'error');
        return;
      }
      
      btnExtractFaq.disabled = true;
      btnExtractFaq.textContent = 'Đang trích xuất...';
      
      try {
        const res = await fetch('/api/ai/extract-faq', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        const data = await res.json();
        
        if (res.ok && data.success) {
          if (typeof showToast === 'function') showToast(`Đã trích xuất thành công ${data.count} câu hỏi - đáp từ tài liệu!`, 'success');
          document.getElementById('ai-extract-text').value = '';
          loadFAQs();
        } else {
          throw new Error(data.error || 'Trích xuất tri thức thất bại.');
        }
      } catch (err) {
        if (typeof showToast === 'function') showToast(err.message, 'error');
      } finally {
        btnExtractFaq.disabled = false;
        btnExtractFaq.textContent = 'Bắt đầu trích xuất';
      }
    });
  }

  // Clear all FAQ
  const btnClearAll = document.getElementById('btn-clear-all-faq');
  if (btnClearAll) {
    btnClearAll.addEventListener('click', async () => {
      if (confirm('CẢNH BÁO: Bạn có chắc chắn muốn xóa toàn bộ tri thức FAQ? Hành động này không thể hoàn tác.')) {
        try {
          const res = await fetch('/api/ai/faq', { method: 'DELETE' });
          if (res.ok) {
            if (typeof showToast === 'function') showToast('Đã xóa sạch cơ sở tri thức FAQ!', 'success');
            loadFAQs();
          } else {
            throw new Error('Lỗi khi xóa.');
          }
        } catch (err) {
          if (typeof showToast === 'function') showToast(err.message, 'error');
        }
      }
    });
  }

  // Manual Add UI Trigger
  const btnAddManual = document.getElementById('btn-add-faq-manual');
  if (btnAddManual) {
    btnAddManual.addEventListener('click', () => {
      openAddFaqForm();
    });
  }

  // Cancel FAQ Form
  const btnCancelFaq = document.getElementById('btn-cancel-faq');
  if (btnCancelFaq) {
    btnCancelFaq.addEventListener('click', () => {
      closeFaqForm();
    });
  }

  // Save single FAQ
  const btnSaveFaq = document.getElementById('btn-save-faq');
  if (btnSaveFaq) {
    btnSaveFaq.addEventListener('click', async () => {
      const id = document.getElementById('faq-edit-id').value;
      const question = document.getElementById('faq-question').value.trim();
      const answer = document.getElementById('faq-answer').value.trim();
      
      if (!question || !answer) {
        if (typeof showToast === 'function') showToast('Vui lòng điền đủ câu hỏi và câu trả lời.', 'error');
        return;
      }
      
      try {
        let res;
        if (id) {
          res = await fetch(`/api/ai/faq/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, answer })
          });
        } else {
          res = await fetch('/api/ai/faq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, answer })
          });
        }
        
        if (res.ok) {
          if (typeof showToast === 'function') showToast(id ? 'Đã cập nhật câu hỏi/đáp!' : 'Đã thêm câu hỏi/đáp mới!', 'success');
          closeFaqForm();
          loadFAQs();
        } else {
          throw new Error('Không thể lưu câu hỏi/đáp.');
        }
      } catch (err) {
        if (typeof showToast === 'function') showToast(err.message, 'error');
      }
    });
  }
}

// FAQ Form Helpers
function openAddFaqForm() {
  document.getElementById('faq-form-container').style.display = 'block';
  document.getElementById('faq-form-title').textContent = 'Thêm câu hỏi đáp mới';
  document.getElementById('faq-edit-id').value = '';
  document.getElementById('faq-question').value = '';
  document.getElementById('faq-answer').value = '';
}

function openEditFaqForm(faq) {
  document.getElementById('faq-form-container').style.display = 'block';
  document.getElementById('faq-form-title').textContent = 'Cập nhật câu hỏi đáp';
  document.getElementById('faq-edit-id').value = faq.id;
  document.getElementById('faq-question').value = faq.question;
  document.getElementById('faq-answer').value = faq.answer;
  document.getElementById('faq-form-container').scrollIntoView({ behavior: 'smooth' });
}

function closeFaqForm() {
  document.getElementById('faq-form-container').style.display = 'none';
  document.getElementById('faq-edit-id').value = '';
  document.getElementById('faq-question').value = '';
  document.getElementById('faq-answer').value = '';
}

async function deleteFaq(id) {
  try {
    const res = await fetch(`/api/ai/faq/${id}`, { method: 'DELETE' });
    if (res.ok) {
      if (typeof showToast === 'function') showToast('Đã xóa câu hỏi/đáp!', 'success');
      loadFAQs();
    } else {
      throw new Error('Lỗi xóa câu hỏi/đáp.');
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

// HTML Escaper
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Expose functions globally
window.loadAiAgentConfig = loadAiAgentConfig;
window.loadFAQs = loadFAQs;
window.loadTransferLogs = loadTransferLogs;
