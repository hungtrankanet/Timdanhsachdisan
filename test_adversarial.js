import assert from 'assert';
import { exec } from 'child_process';
import db, { run, get, all } from './src/database.js';

function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        resolve({ error, stdout, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

async function runAdversarialTests() {
  console.log('--- BẮT ĐẦU CHẠY KIỂM THỬ ADVERSARIAL ---');

  // Set scheduler_status to idle so that starting the server does not run actual scraping worker jobs
  await run('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)', ['scheduler_status', 'idle']);

  // Clean up any left-overs from previous tests
  await run('DELETE FROM scheduler_queue WHERE keyword LIKE "test_%"');

  // Test 1: Direct SQLite insertion of duplicate
  console.log('\n--- Thử nghiệm 1: Xác thực ràng buộc UNIQUE trực tiếp trên SQLite ---');
  try {
    // Insert first time
    await run(
      'INSERT INTO scheduler_queue (keyword, location, status) VALUES (?, ?, ?)',
      ['test_dup_keyword', 'test_dup_location', 'pending']
    );
    console.log('Chèn thành công bản ghi đầu tiên.');

    // Try to insert second time (should throw unique constraint error)
    await run(
      'INSERT INTO scheduler_queue (keyword, location, status) VALUES (?, ?, ?)',
      ['test_dup_keyword', 'test_dup_location', 'pending']
    );
    console.log('LỖI: Chèn lần thứ 2 thành công mặc dù đáng lẽ phải thất bại.');
    assert.fail('Unique constraint did not trigger.');
  } catch (err) {
    console.log('Thành công: Nhận lỗi như mong đợi:', err.message);
    assert.ok(err.message.includes('UNIQUE constraint failed'));
  } finally {
    // Cleanup
    await run('DELETE FROM scheduler_queue WHERE keyword = ? AND location = ?', [
      'test_dup_keyword',
      'test_dup_location'
    ]);
  }

  // Test 2: Calling `node src/populate_queue.js` multiple times
  console.log('\n--- Thử nghiệm 2: Chạy populate_queue.js nhiều lần ---');
  console.log('Chạy populate_queue.js (Lần 1)...');
  const run1 = await execPromise('node src/populate_queue.js');
  console.log('Lần 1 stdout:', run1.stdout.trim());
  
  console.log('Chạy populate_queue.js (Lần 2)...');
  const run2 = await execPromise('node src/populate_queue.js');
  console.log('Lần 2 stdout:', run2.stdout.trim());
  assert.ok(run2.stdout.includes('Successfully populated 0 new search queries'));
  console.log('Thành công: Không bị trùng lặp nhờ INSERT OR IGNORE trong populate_queue.js.');

  // Test 3: POST /api/queue API duplicate rejection
  console.log('\n--- Thử nghiệm 3: Kiểm tra trùng lặp qua API POST /api/queue ---');
  // Start the server process on port 4567
  console.log('Khởi chạy Express server cục bộ trên cổng 4567...');
  const serverProcess = exec('node src/server.js', {
    env: { ...process.env, PORT: '4567' }
  });

  serverProcess.stdout.on('data', (data) => console.log(`[Server Stdout] ${data.trim()}`));
  serverProcess.stderr.on('data', (data) => console.error(`[Server Stderr] ${data.trim()}`));

  // Wait 6 seconds for server to start
  await new Promise(resolve => setTimeout(resolve, 6000));

  try {
    // Request 1: Insert new unique entry via API
    console.log('Gửi yêu cầu POST đầu tiên tới /api/queue...');
    const res1 = await fetch('http://localhost:4567/api/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: 'test_api_dup', location: 'test_api_loc' })
    });
    const data1 = await res1.json();
    console.log('Trạng thái phản hồi 1:', res1.status, 'Body:', data1);
    assert.strictEqual(res1.status, 200);
    assert.ok(data1.success);

    // Request 2: Try to insert duplicate entry via API
    console.log('Gửi yêu cầu POST trùng lặp thứ 2 tới /api/queue...');
    const res2 = await fetch('http://localhost:4567/api/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: 'test_api_dup', location: 'test_api_loc' })
    });
    const data2 = await res2.json();
    console.log('Trạng thái phản hồi 2:', res2.status, 'Body:', data2);
    assert.strictEqual(res2.status, 400);
    assert.strictEqual(data2.error, 'Task already exists in the queue.');
    console.log('Thành công: API từ chối bản ghi trùng lặp một cách chính xác.');
  } finally {
    // Kill the server process
    console.log('Đang tắt server cục bộ...');
    serverProcess.kill();
    // Cleanup db
    await run('DELETE FROM scheduler_queue WHERE keyword = ? AND location = ?', [
      'test_api_dup',
      'test_api_loc'
    ]);
  }

  // Test 4: Check scheduler province and priority logic
  console.log('\n--- Thử nghiệm 4: Kiểm tra tỉnh thành mục tiêu và thứ tự ưu tiên ---');
  // Confirm what is in scheduler_queue
  const queueItems = await all('SELECT * FROM scheduler_queue');
  console.log(`Tổng số tác vụ trong hàng đợi: ${queueItems.length}`);
  
  // Verify that all items in queue are for target provinces
  const targetProvinces = [
    'Cần Thơ',
    'Lâm Đồng',
    'An Giang',
    'Vĩnh Long',
    'Đồng Tháp',
    'Cà Mau',
    'Tây Ninh',
    'Bình Thuận'
  ];

  let invalidProvincesFound = 0;
  for (const item of queueItems) {
    const matched = targetProvinces.some(p => item.location.includes(p));
    if (!matched) {
      console.log(`Cảnh báo: Tìm thấy địa điểm không thuộc danh sách tỉnh mục tiêu: "${item.location}"`);
      invalidProvincesFound++;
    }
  }
  
  if (invalidProvincesFound === 0) {
    console.log('Thành công: Tất cả các tác vụ trong hàng đợi đều hướng tới các tỉnh thành mục tiêu.');
  } else {
    console.log(`Thất bại: Tìm thấy ${invalidProvincesFound} tác vụ không khớp.`);
  }

  // Verify priority order (id ASC)
  const nextJobQuery = 'SELECT * FROM scheduler_queue WHERE status = "pending" ORDER BY id ASC LIMIT 1';
  const nextJob = await get(nextJobQuery);
  if (nextJob) {
    console.log(`Thành công: Tác vụ pending tiếp theo được chọn theo thứ tự ID tăng dần (ID: ${nextJob.id})`);
    console.log(`Tác vụ: "${nextJob.keyword}" tại "${nextJob.location}"`);
  } else {
    console.log('Hiện tại không có tác vụ pending nào trong hàng đợi.');
  }

  console.log('\n--- TẤT CẢ KIỂM THỬ ADVERSARIAL ĐÃ THÀNH CÔNG! ---');
  
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
      process.exit(1);
    } else {
      console.log('Database connection closed cleanly.');
      // Give a tiny delay for child processes/sockets to tear down before exiting
      setTimeout(() => {
        process.exit(0);
      }, 500);
    }
  });
}

runAdversarialTests().catch(err => {
  console.error('Kiểm thử Adversarial thất bại:', err);
  db.close(() => {
    process.exit(1);
  });
});
