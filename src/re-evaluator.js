import { all, run, get } from './database.js';
import { fetchWebContent, evaluateRelevance } from './scraper.js';
import { log } from './logger.js';

let isReEvaluating = false;
let reEvaluatorInterval = null;

export async function startReEvaluatorWorker() {
  try {
    const completedRow = await get('SELECT value FROM configs WHERE key = "re_evaluator_completed"');
    if (completedRow && completedRow.value === 'true') {
      log('[Re-Evaluator] Đã hoàn thành tra soát dữ liệu cũ trước đó. Worker dừng hoạt động.');
      return;
    }
  } catch (err) {
    log(`[Re-Evaluator Error] Lỗi khi kiểm tra cấu hình hoàn thành: ${err.message}`);
  }

  log('[Re-Evaluator] Khởi động bộ lập lịch tra soát dữ liệu cũ tự động...');
  
  // Auto-recover previously rejected/pending framing shops to re-evaluate them under the new rules
  try {
    const resetResult = await run(
      `UPDATE leads 
       SET verification_status = 'pending_review', 
           verification_notes = NULL 
       WHERE (verification_status = 'rejected' OR verification_status = 'pending_review')
         AND (
           brand_name LIKE '%khung tranh%' OR brand_name LIKE '%Khung Tranh%' OR
           brand_name LIKE '%mỹ nghệ%' OR brand_name LIKE '%Mỹ nghệ%' OR
           brand_name LIKE '%thêu%' OR brand_name LIKE '%Thêu%' OR
           brand_name LIKE '%mỹ thuật%' OR brand_name LIKE '%Mỹ thuật%'
         )`
    );
    if (resetResult && resetResult.changes > 0) {
      log(`[Re-Evaluator] Đã tự động phục hồi ${resetResult.changes} địa điểm cũ (khung tranh, mỹ nghệ, thêu, mỹ thuật) bị bỏ lỡ trước đó để chấm điểm lại.`);
    }
  } catch (err) {
    log(`[Re-Evaluator Error] Lỗi khi phục hồi các địa điểm khung tranh cũ: ${err.message}`);
  }

  // Run immediately on startup, then check every 15 minutes
  runReEvaluationCycle().catch(err => {
    log(`[Re-Evaluator Error] Lỗi vòng chạy: ${err.message}`);
  });

  reEvaluatorInterval = setInterval(() => {
    runReEvaluationCycle().catch(err => {
      log(`[Re-Evaluator Error] Lỗi vòng chạy: ${err.message}`);
    });
  }, 15 * 60 * 1000); // 15 minutes
}

async function runReEvaluationCycle() {
  try {
    const completedRow = await get('SELECT value FROM configs WHERE key = "re_evaluator_completed"');
    if (completedRow && completedRow.value === 'true') {
      log('[Re-Evaluator] Tra soát hoàn thành. Đang dọn dẹp bộ lập lịch...');
      if (reEvaluatorInterval) {
        clearInterval(reEvaluatorInterval);
        reEvaluatorInterval = null;
      }
      return;
    }
  } catch (err) {
    log(`[Re-Evaluator Error] Lỗi kiểm tra hoàn thành trong chu kỳ: ${err.message}`);
  }

  if (isReEvaluating) {
    log('[Re-Evaluator] Vòng chạy trước vẫn đang xử lý. Bỏ qua chu kỳ này.');
    return;
  }

  isReEvaluating = true;
  log('[Re-Evaluator] Bắt đầu quét các địa điểm cũ chưa được chấm điểm...');

  try {
    // Select leads that don't have new scoring note [Điểm: ...]
    const unscoredLeads = await all(
      `SELECT * FROM leads 
       WHERE verification_notes IS NULL 
          OR (verification_notes NOT LIKE '[Điểm:%' AND verification_notes NOT LIKE 'Được phê duyệt thủ công%' AND verification_notes NOT LIKE 'Bị bác bỏ bởi%')
       ORDER BY id ASC`
    );

    if (unscoredLeads.length === 0) {
      log('[Re-Evaluator] Không phát hiện địa điểm cũ nào chưa được chấm điểm. Đã hoàn thành nhiệm vụ và dừng worker.');
      await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['re_evaluator_completed', 'true']);
      if (reEvaluatorInterval) {
        clearInterval(reEvaluatorInterval);
        reEvaluatorInterval = null;
      }
      isReEvaluating = false;
      return;
    }

    log(`[Re-Evaluator] Phát hiện ${unscoredLeads.length} địa điểm cũ cần chấm điểm lại. Tiến hành xử lý ngầm (giãn cách 4s để tránh nghẽn)...`);

    for (let i = 0; i < unscoredLeads.length; i++) {
      const lead = unscoredLeads[i];
      
      // Delay between fetches to be gentle on target websites
      if (i > 0) {
        await new Promise(r => setTimeout(r, 4000));
      }

      try {
        log(`[Re-Evaluator] [${i + 1}/${unscoredLeads.length}] Đang xử lý: ${lead.brand_name} (ID: ${lead.id})`);
        
        let webContent = '';
        if (lead.website && lead.website.trim() !== '') {
          webContent = await fetchWebContent(lead.website, () => {}); // silent fetch
        }

        // Category is empty for old data, we pass null
        const relResult = evaluateRelevance(
          lead.brand_name,
          lead.address,
          null, // No category in old leads
          lead.website,
          webContent,
          () => {} // silent log
        );

        // Keep status if already confirmed (verified, partially_verified)
        // If it was 'invalid', but scores >= 4 and has a phone, promote to 'partially_verified'
        let finalStatus = relResult.status;
        
        if (lead.verification_status === 'verified' || lead.verification_status === 'partially_verified') {
          finalStatus = lead.verification_status;
          log(`[Re-Evaluator] Bảo lưu trạng thái gốc "${lead.verification_status}" cho ID ${lead.id}. (Điểm chấm lại: ${relResult.score})`);
        } else if (lead.verification_status === 'invalid') {
          if (relResult.score >= 3 && lead.phone && lead.phone.trim() !== '') {
            finalStatus = 'partially_verified';
            log(`[Re-Evaluator] Nâng cấp trạng thái ID ${lead.id}: "invalid" -> "partially_verified" vì là địa điểm tiềm năng cao (Điểm: ${relResult.score})`);
          } else {
            finalStatus = 'invalid';
            log(`[Re-Evaluator] Bảo lưu trạng thái gốc "invalid" cho ID ${lead.id}. (Điểm chấm lại: ${relResult.score})`);
          }
        } else {
          log(`[Re-Evaluator] Cập nhật trạng thái ID ${lead.id}: "${lead.verification_status}" -> "${finalStatus}" (Điểm: ${relResult.score})`);
        }

        const newNotes = `[Điểm: ${relResult.score}] ${relResult.reason}`;

        await run(
          `UPDATE leads 
           SET verification_status = ?, 
               verification_notes = ?, 
               updated_at = CURRENT_TIMESTAMP 
           WHERE id = ?`,
          [finalStatus, newNotes, lead.id]
        );

      } catch (err) {
        log(`[Re-Evaluator] Lỗi khi xử lý lead ID ${lead.id}: ${err.message}`);
      }
    }

    log('[Re-Evaluator] Hoàn thành chu kỳ tra soát dữ liệu cũ.');
  } catch (err) {
    log(`[Re-Evaluator] Lỗi tiến trình tra soát: ${err.message}`);
  } finally {
    isReEvaluating = false;
  }
}
