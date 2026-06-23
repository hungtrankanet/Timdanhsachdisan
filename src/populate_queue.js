import { run } from './database.js';

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

// Compile list of target districts/wards in the 8 specified provinces (excluding HCM entirely)
const LOCATIONS = [
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

async function populate() {
  console.log('Database connected. Populating scheduler queue...');
  
  let count = 0;
  for (const location of LOCATIONS) {
    for (const keyword of KEYWORDS) {
      try {
        const result = await run(
          `INSERT OR IGNORE INTO scheduler_queue (keyword, location, status, leads_found) 
           VALUES (?, ?, ?, 0)`,
          [keyword, location, 'pending']
        );
        if (result.changes > 0) {
          count++;
        }
      } catch (err) {
        console.error('Error inserting queue item:', err.message);
      }
    }
  }

  console.log(`Successfully populated ${count} new search queries in the scheduler queue!`);
  process.exit(0);
}

populate().catch(console.error);
