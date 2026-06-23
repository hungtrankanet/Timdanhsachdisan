import { run, all } from './database.js';

const KEYWORDS = [
  'sơn mài',
  'tranh sơn mài',
  'nghệ nhân sơn mài',
  'giảng viên hội họa',
  'hội họa mỹ thuật',
  'xưởng vẽ tranh',
  'shop bán tranh',
  'nghệ nhân mỹ thuật'
];

const TARGET_LOCATIONS = [
  // Cần Thơ (6 locations)
  'An Khánh, Ninh Kiều, Cần Thơ',
  'Xuân Khánh, Ninh Kiều, Cần Thơ',
  'Thới Bình, Ninh Kiều, Cần Thơ',
  'Tân An, Ninh Kiều, Cần Thơ',
  'Hưng Phú, Cái Răng, Cần Thơ',
  'An Thới, Bình Thủy, Cần Thơ',
  
  // Lâm Đồng (6 locations)
  'Phường 1, Đà Lạt, Lâm Đồng',
  'Phường 9, Đà Lạt, Lâm Đồng',
  'Phường 11, Đà Lạt, Lâm Đồng',
  'Phường Lang Biang, Đà Lạt, Lâm Đồng',
  'Liên Nghĩa, Đức Trọng, Lâm Đồng',
  'Phường 1, Bảo Lộc, Lâm Đồng',
  
  // An Giang (4 locations)
  'Mỹ Bình, Long Xuyên, An Giang',
  'Đông Xuyên, Long Xuyên, An Giang',
  'Châu Phú A, Châu Đốc, An Giang',
  'Thị trấn Núi Sập, Thoại Sơn, An Giang',
  
  // Vĩnh Long (3 locations)
  'Phường 1, Vĩnh Long',
  'Phường 4, Vĩnh Long',
  'Thị trấn Long Hồ, Long Hồ, Vĩnh Long',
  
  // Đồng Tháp (3 locations)
  'Phường 1, Cao Lãnh, Đồng Tháp',
  'Phường 1, Sa Đéc, Đồng Tháp',
  'Thị trấn Mỹ An, Tháp Mười, Đồng Tháp',
  
  // Cà Mau (4 locations)
  'Phường 5, Cà Mau',
  'Phường 9, Cà Mau',
  'Phường 8, Cà Mau',
  'Sông Đốc, Trần Văn Thời, Cà Mau',
  
  // Tây Ninh (3 locations)
  'Phường 1, Tây Ninh',
  'Phường 3, Tây Ninh',
  'Trảng Bàng, Trảng Bàng, Tây Ninh',
  
  // Bình Thuận (5 locations)
  'Mũi Né, Phan Thiết, Bình Thuận',
  'Phú Thủy, Phan Thiết, Bình Thuận',
  'Phường Đức Nghĩa, Phan Thiết, Bình Thuận',
  'Phường Hưng Long, Phan Thiết, Bình Thuận',
  'La Gi, La Gi, Bình Thuận'
];

async function runMigration() {
  console.log('--- KHỞI ĐẦU TIẾN TRÌNH CẬP NHẬT HÀNG ĐỢI ---');

  // 1. Dọn dẹp trùng lặp nếu có (đảm bảo tạo index thành công)
  console.log('Đang dọn dẹp trùng lặp trong hàng đợi...');
  await run(`
    DELETE FROM scheduler_queue 
    WHERE id NOT IN (
      SELECT MIN(id) 
      FROM scheduler_queue 
      GROUP BY keyword, location
    )
  `);

  // 2. Tạo UNIQUE Index cho (keyword, location)
  console.log('Đang tạo chỉ mục UNIQUE...');
  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduler_queue_keyword_location 
    ON scheduler_queue (keyword, location)
  `);

  // 3. Tạm dừng các tác vụ HCMC và các tác vụ ngoài mục tiêu
  console.log('Đang tạm dừng các tác vụ ngoài 34 địa phương mục tiêu...');
  const placeHolders = TARGET_LOCATIONS.map(() => '?').join(',');
  const pauseResult = await run(`
    UPDATE scheduler_queue 
    SET status = 'paused', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'pending' 
      AND location NOT IN (${placeHolders})
  `, TARGET_LOCATIONS);
  console.log(`Đã tạm dừng ${pauseResult.changes} tác vụ.`);

  // 4. Thêm các từ khóa của các đơn vị hành chính mới
  console.log('Đang thêm các đơn vị hành chính mới và tỉnh mục tiêu...');
  let insertCount = 0;
  for (const location of TARGET_LOCATIONS) {
    for (const keyword of KEYWORDS) {
      try {
        const result = await run(`
          INSERT OR IGNORE INTO scheduler_queue (keyword, location, status, leads_found) 
          VALUES (?, ?, 'pending', 0)
        `, [keyword, location]);
        if (result.changes > 0) {
          insertCount++;
        }
      } catch (err) {
        console.error('Lỗi chèn hàng đợi:', err.message);
      }
    }
  }
  console.log(`Đã thêm mới thành công ${insertCount} tác vụ vào hàng đợi.`);
  console.log('--- HOÀN TẤT CẬP NHẬT HÀNG ĐỢI ---');
  process.exit(0);
}

runMigration().catch(console.error);
