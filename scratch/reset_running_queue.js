import { run, all } from '../src/database.js';

async function resetQueue() {
  try {
    console.log('--- KHÔI PHỤC HÀNG ĐỢI BỊ KẸT ---');
    
    // Check how many are running before update
    const stuckJobs = await all('SELECT * FROM scheduler_queue WHERE status = "running"');
    console.log(`Tìm thấy ${stuckJobs.length} tác vụ đang bị kẹt ở trạng thái "running".`);
    console.table(stuckJobs);

    if (stuckJobs.length > 0) {
      // Update status to pending
      const result = await run(
        "UPDATE scheduler_queue SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE status = 'running'"
      );
      console.log(`Đã khôi phục thành công ${result.changes} tác vụ về trạng thái "pending".`);
    } else {
      console.log('Không có tác vụ nào bị kẹt.');
    }
  } catch (err) {
    console.error('Lỗi khi khôi phục hàng đợi:', err.message);
  } finally {
    process.exit(0);
  }
}

resetQueue();
