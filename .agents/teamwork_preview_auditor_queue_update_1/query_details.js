import sqlite3 from 'sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '../../data.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  runQuery();
});

const TARGET_LOCATIONS = [
  'An Khánh, Ninh Kiều, Cần Thơ',
  'Xuân Khánh, Ninh Kiều, Cần Thơ',
  'Thới Bình, Ninh Kiều, Cần Thơ',
  'Tân An, Ninh Kiều, Cần Thơ',
  'Hưng Phú, Cái Răng, Cần Thơ',
  'An Thới, Bình Thủy, Cần Thơ',
  'Phường 1, Đà Lạt, Lâm Đồng',
  'Phường 9, Đà Lạt, Lâm Đồng',
  'Phường 11, Đà Lạt, Lâm Đồng',
  'Phường Lang Biang, Đà Lạt, Lâm Đồng',
  'Liên Nghĩa, Đức Trọng, Lâm Đồng',
  'Phường 1, Bảo Lộc, Lâm Đồng',
  'Mỹ Bình, Long Xuyên, An Giang',
  'Đông Xuyên, Long Xuyên, An Giang',
  'Châu Phú A, Châu Đốc, An Giang',
  'Thị trấn Núi Sập, Thoại Sơn, An Giang',
  'Phường 1, Vĩnh Long',
  'Phường 4, Vĩnh Long',
  'Thị trấn Long Hồ, Long Hồ, Vĩnh Long',
  'Phường 1, Cao Lãnh, Đồng Tháp',
  'Phường 1, Sa Đéc, Đồng Tháp',
  'Thị trấn Mỹ An, Tháp Mười, Đồng Tháp',
  'Phường 5, Cà Mau',
  'Phường 9, Cà Mau',
  'Phường 8, Cà Mau',
  'Sông Đốc, Trần Văn Thời, Cà Mau',
  'Phường 1, Tây Ninh',
  'Phường 3, Tây Ninh',
  'Trảng Bàng, Trảng Bàng, Tây Ninh',
  'Mũi Né, Phan Thiết, Bình Thuận',
  'Phú Thủy, Phan Thiết, Bình Thuận',
  'Phường Đức Nghĩa, Phan Thiết, Bình Thuận',
  'Phường Hưng Long, Phan Thiết, Bình Thuận',
  'La Gi, La Gi, Bình Thuận'
];

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function runQuery() {
  // Let's find any non-target location task with status = 'running'
  const nonTargetRunning = await all(`
    SELECT * FROM scheduler_queue 
    WHERE status = 'running' 
      AND location NOT IN (${TARGET_LOCATIONS.map(() => '?').join(',')})
  `, TARGET_LOCATIONS);
  console.log('Non-target running tasks:', nonTargetRunning);

  // Let's check if there are any non-target locations and print their unique names
  const nonTargetLocations = await all(`
    SELECT DISTINCT location FROM scheduler_queue 
    WHERE location NOT IN (${TARGET_LOCATIONS.map(() => '?').join(',')})
  `, TARGET_LOCATIONS);
  console.log('Non-target locations (first 10):', nonTargetLocations.slice(0, 10));

  // Let's check status breakdown of all tasks
  const allBreakdown = await all(`
    SELECT status, count(*) as count FROM scheduler_queue GROUP BY status
  `);
  console.log('Status breakdown (all):', allBreakdown);

  // Let's check target locations status breakdown
  const targetBreakdown = await all(`
    SELECT status, count(*) as count FROM scheduler_queue 
    WHERE location IN (${TARGET_LOCATIONS.map(() => '?').join(',')})
    GROUP BY status
  `, TARGET_LOCATIONS);
  console.log('Status breakdown (target):', targetBreakdown);

  db.close();
}
