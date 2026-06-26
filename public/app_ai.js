// AI Agent Dashboard Logic

let draftFaqs = [];

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
    document.getElementById('gemini-api-key').value = config.gemini_api_key || '';
    document.getElementById('chatbot-keywords').value = config.chatbot_inscope_keywords || '';
    
    let cannedRepliesText = config.chatbot_canned_replies || '[]';
    try {
      const arr = JSON.parse(cannedRepliesText);
      cannedRepliesText = JSON.stringify(arr, null, 2);
    } catch(e) {}
    document.getElementById('chatbot-canned-replies').value = cannedRepliesText;
    
    document.getElementById('followup-day1-template').value = config.zalo_day1_template || '';
    document.getElementById('followup-day3-template').value = config.zalo_day3_template || '';

    // Restore saved raw document
    const savedDoc = config.ai_raw_document || '';
    const extractTextarea = document.getElementById('ai-extract-text');
    if (extractTextarea && savedDoc) {
      extractTextarea.value = savedDoc;
      const statusEl = document.getElementById('doc-save-status');
      if (statusEl) statusEl.textContent = '✅ Đã lưu';
    }
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
      const gemini_api_key = document.getElementById('gemini-api-key').value.trim();
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
          body: JSON.stringify({ chatbot_enabled, groq_api_key, gemini_api_key, chatbot_inscope_keywords, chatbot_canned_replies })
        });
        if (res.ok) {
          if (typeof showToast === 'function') showToast('Đã lưu cấu hình AI Agent thành công!', 'success');
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

  // Extract FAQ & Configs (Gemini AI Proposal)
  const btnExtractFaq = document.getElementById('btn-extract-faq');
  if (btnExtractFaq) {
    btnExtractFaq.addEventListener('click', async () => {
      const text = document.getElementById('ai-extract-text').value.trim();
      if (!text) {
        if (typeof showToast === 'function') showToast('Vui lòng nhập nội dung tài liệu để trích xuất.', 'error');
        return;
      }
      
      btnExtractFaq.disabled = true;
      btnExtractFaq.textContent = 'Đang phân tích tri thức (Gemini)...';
      
      try {
        const res = await fetch('/api/ai/extract-faq', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        const data = await res.json();
        
        if (res.ok && data.success) {
          if (typeof showToast === 'function') showToast(`Gemini đã trích xuất thành công các đề xuất cấu hình và tri thức!`, 'success');
          
          // Populate drafts
          document.getElementById('draft-keywords').value = data.chatbot_inscope_keywords || '';
          
          let cannedText = '[]';
          if (Array.isArray(data.chatbot_canned_replies)) {
            cannedText = JSON.stringify(data.chatbot_canned_replies, null, 2);
          }
          document.getElementById('draft-canned-replies').value = cannedText;
          document.getElementById('draft-day1-template').value = data.zalo_day1_template || '';
          document.getElementById('draft-day3-template').value = data.zalo_day3_template || '';
          
          draftFaqs = Array.isArray(data.faqs) ? data.faqs : [];
          renderDraftFaqs();
          
          // Show draft container
          const draftContainer = document.getElementById('ai-extract-preview-container');
          draftContainer.style.display = 'block';
          draftContainer.scrollIntoView({ behavior: 'smooth' });
          
          document.getElementById('ai-extract-text').value = '';
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

  // Save All drafts
  const btnSaveAllDrafts = document.getElementById('btn-save-all-drafts');
  if (btnSaveAllDrafts) {
    btnSaveAllDrafts.addEventListener('click', async () => {
      const chatbot_inscope_keywords = document.getElementById('draft-keywords').value.trim();
      let chatbot_canned_replies = document.getElementById('draft-canned-replies').value.trim();
      const zalo_day1_template = document.getElementById('draft-day1-template').value.trim();
      const zalo_day3_template = document.getElementById('draft-day3-template').value.trim();
      
      const groq_api_key = document.getElementById('groq-api-key').value.trim();
      const gemini_api_key = document.getElementById('gemini-api-key').value.trim();

      // Validate canned replies JSON
      try {
        const parsed = JSON.parse(chatbot_canned_replies);
        if (!Array.isArray(parsed)) throw new Error();
        chatbot_canned_replies = JSON.stringify(parsed);
      } catch (e) {
        if (typeof showToast === 'function') {
          showToast('Câu trả lời ngoài luồng nháp phải là một JSON array hợp lệ.', 'error');
        }
        return;
      }

      // Collect FAQs from inputs to ensure latest edits are caught
      const faqList = [];
      const faqItems = document.querySelectorAll('.draft-faq-item');
      faqItems.forEach((el, index) => {
        const question = el.querySelector('.draft-faq-question').value.trim();
        const answer = el.querySelector('.draft-faq-answer').value.trim();
        if (question && answer) {
          faqList.push({ question, answer });
        }
      });

      try {
        const res = await fetch('/api/ai/save-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            configs: {
              chatbot_inscope_keywords,
              chatbot_canned_replies,
              zalo_day1_template,
              zalo_day3_template,
              groq_api_key,
              gemini_api_key
            },
            faqs: faqList
          })
        });

        if (res.ok) {
          if (typeof showToast === 'function') showToast('Đã lưu cấu hình & cơ sở tri thức FAQ thành công!', 'success');
          document.getElementById('ai-extract-preview-container').style.display = 'none';
          draftFaqs = [];
          loadAiAgentConfig();
          loadFAQs();
        } else {
          throw new Error('Lỗi lưu toàn bộ tri thức.');
        }
      } catch (err) {
        if (typeof showToast === 'function') showToast(err.message, 'error');
      }
    });
  }

  // Cancel drafts
  const btnCancelAllDrafts = document.getElementById('btn-cancel-all-drafts');
  if (btnCancelAllDrafts) {
    btnCancelAllDrafts.addEventListener('click', () => {
      if (confirm('Bạn có chắc chắn muốn hủy bỏ bản nháp trích xuất này không?')) {
        document.getElementById('ai-extract-preview-container').style.display = 'none';
        draftFaqs = [];
      }
    });
  }

  // Bottom save button — delegates to the top save button's handler
  const btnSaveAllDraftsBottom = document.getElementById('btn-save-all-drafts-bottom');
  if (btnSaveAllDraftsBottom && btnSaveAllDrafts) {
    btnSaveAllDraftsBottom.addEventListener('click', () => {
      btnSaveAllDrafts.click();
    });
  }

  // Save raw document button
  const btnSaveRawDoc = document.getElementById('btn-save-raw-doc');
  const extractTextarea = document.getElementById('ai-extract-text');
  const docSaveStatus = document.getElementById('doc-save-status');

  // Mark unsaved when user types
  if (extractTextarea && docSaveStatus) {
    extractTextarea.addEventListener('input', () => {
      docSaveStatus.textContent = '● Chưa lưu';
      docSaveStatus.style.color = 'var(--accent-gold)';
    });
  }

  if (btnSaveRawDoc && extractTextarea) {
    btnSaveRawDoc.addEventListener('click', async () => {
      const ai_raw_document = extractTextarea.value;
      btnSaveRawDoc.disabled = true;
      btnSaveRawDoc.textContent = 'Đang lưu...';
      try {
        const res = await fetch('/api/ai/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ai_raw_document })
        });
        if (res.ok) {
          const now = new Date().toLocaleTimeString('vi-VN');
          if (docSaveStatus) {
            docSaveStatus.textContent = `✅ Đã lưu lúc ${now}`;
            docSaveStatus.style.color = 'var(--text-muted)';
          }
          if (typeof showToast === 'function') showToast('Đã lưu tài liệu thành công!', 'success');
        } else {
          throw new Error('Lỗi khi lưu tài liệu.');
        }
      } catch (err) {
        if (typeof showToast === 'function') showToast(err.message, 'error');
      } finally {
        btnSaveRawDoc.disabled = false;
        btnSaveRawDoc.textContent = '💾 Lưu tài liệu';
      }
    });
  }

  // Add blank draft FAQ
  const btnAddDraftFaq = document.getElementById('btn-add-draft-faq');
  if (btnAddDraftFaq) {
    btnAddDraftFaq.addEventListener('click', () => {
      syncDraftInputsToMemory();
      draftFaqs.push({ question: '', answer: '' });
      renderDraftFaqs();
    });
  }

  // Clear all FAQ
  const btnClearAll = document.getElementById('btn-clear-all-faq');
  if (btnClearAll) {
    btnClearAll.addEventListener('click', async () => {
      if (confirm('CẢNH BÁO: Bạn có chắc chắn muốn xóa toàn bộ tri thức FAQ trong hệ thống? Hành động này không thể hoàn tác.')) {
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

  // Manual Add FAQ trigger
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

// Render Draft FAQs
function renderDraftFaqs() {
  const container = document.getElementById('draft-faq-list');
  if (!container) return;
  container.innerHTML = '';
  
  if (draftFaqs.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px;">Không có câu hỏi nháp. Hãy bấm "+ Thêm câu hỏi nháp" để tạo thủ công.</div>`;
    return;
  }
  
  draftFaqs.forEach((faq, index) => {
    const card = document.createElement('div');
    card.className = 'glass-card draft-faq-item';
    card.style.background = 'rgba(255,255,255,0.02)';
    card.style.padding = '15px';
    card.style.marginBottom = '0';
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <span style="font-size: 12px; color: var(--accent-gold); font-weight: bold;">Câu hỏi nháp #${index + 1}</span>
        <button class="btn btn-primary-outline btn-sm btn-delete-draft-faq" data-index="${index}" style="border-color: var(--accent-red); color: var(--accent-red); padding: 3px 8px; font-size: 11px;">Xóa nháp</button>
      </div>
      <div class="form-group" style="margin-bottom: 10px;">
        <input type="text" class="draft-faq-question" style="background: rgba(0,0,0,0.5); padding: 8px 12px;" placeholder="Nhập câu hỏi..." value="${escapeHtml(faq.question)}">
      </div>
      <div class="form-group" style="margin-bottom: 0;">
        <textarea class="draft-faq-answer" rows="2" style="background: rgba(0,0,0,0.5); padding: 8px 12px;" placeholder="Nhập câu trả lời...">${escapeHtml(faq.answer)}</textarea>
      </div>
    `;
    container.appendChild(card);
  });
  
  container.querySelectorAll('.btn-delete-draft-faq').forEach(btn => {
    btn.addEventListener('click', (e) => {
      syncDraftInputsToMemory();
      const index = parseInt(e.target.getAttribute('data-index'), 10);
      draftFaqs.splice(index, 1);
      renderDraftFaqs();
    });
  });
}

// Sync values from draft inputs to memory before modifying draftFaqs array structure
function syncDraftInputsToMemory() {
  const faqItems = document.querySelectorAll('.draft-faq-item');
  faqItems.forEach((el, index) => {
    if (draftFaqs[index]) {
      draftFaqs[index].question = el.querySelector('.draft-faq-question').value;
      draftFaqs[index].answer = el.querySelector('.draft-faq-answer').value;
    }
  });
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
