import sqlite3 from 'sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '../../data.db');

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

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  runChecks();
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function runChecks() {
  try {
    console.log('--- DB INTEGRITY VERIFICATION START ---');

    // 1. Verify Unique Index exists on (keyword, location) in scheduler_queue
    console.log('\nChecking index on scheduler_queue...');
    const indexes = await all(`PRAGMA index_list('scheduler_queue')`);
    console.log('Indexes on scheduler_queue:', JSON.stringify(indexes, null, 2));

    let hasUniqueIndex = false;
    for (const idx of indexes) {
      if (idx.unique === 1) {
        // Let's verify the columns of this index
        const cols = await all(`PRAGMA index_info('${idx.name}')`);
        console.log(`Index ${idx.name} columns:`, JSON.stringify(cols, null, 2));
        const colNames = cols.map(c => c.name);
        if (colNames.includes('keyword') && colNames.includes('location') && colNames.length === 2) {
          hasUniqueIndex = true;
          console.log(`Found unique index matching (keyword, location): ${idx.name}`);
        }
      }
    }

    if (!hasUniqueIndex) {
      console.log('ERROR: Unique index on (keyword, location) NOT found!');
    } else {
      console.log('SUCCESS: Unique index on (keyword, location) exists.');
    }

    // 2. Verify new wards/communes populated in scheduler_queue and represent genuine locations (the 34 target locations)
    console.log('\nChecking target locations in scheduler_queue...');
    const locationsInQueue = await all(`SELECT DISTINCT location FROM scheduler_queue`);
    console.log(`Total unique locations in queue: ${locationsInQueue.length}`);

    const locationsSet = new Set(locationsInQueue.map(l => l.location));
    let missingLocations = [];
    for (const targetLoc of TARGET_LOCATIONS) {
      if (!locationsSet.has(targetLoc)) {
        missingLocations.push(targetLoc);
      }
    }

    if (missingLocations.length > 0) {
      console.log(`ERROR: Missing target locations in scheduler_queue:`, missingLocations);
    } else {
      console.log('SUCCESS: All 34 target locations are present in scheduler_queue.');
    }

    // 3. Verify status of non-target pending tasks (should be 'paused')
    console.log('\nChecking status of non-target pending tasks...');
    const pendingNonTarget = await all(`
      SELECT * FROM scheduler_queue 
      WHERE status = 'pending' 
        AND location NOT IN (${TARGET_LOCATIONS.map(() => '?').join(',')})
    `, TARGET_LOCATIONS);

    if (pendingNonTarget.length > 0) {
      console.log(`ERROR: Found ${pendingNonTarget.length} non-target pending tasks! Examples:`, pendingNonTarget.slice(0, 5));
    } else {
      console.log('SUCCESS: No non-target pending tasks found in scheduler_queue (all paused/done/other status).');
    }

    // Let's also check if there are non-target tasks and what status they have
    const nonTargetStatuses = await all(`
      SELECT status, count(*) as count FROM scheduler_queue 
      WHERE location NOT IN (${TARGET_LOCATIONS.map(() => '?').join(',')})
      GROUP BY status
    `, TARGET_LOCATIONS);
    console.log('Status of non-target locations in queue:', nonTargetStatuses);

    // Let's print summary counts
    const totalPending = await get(`SELECT count(*) as count FROM scheduler_queue WHERE status = 'pending'`);
    const totalPaused = await get(`SELECT count(*) as count FROM scheduler_queue WHERE status = 'paused'`);
    const totalOther = await get(`SELECT count(*) as count FROM scheduler_queue WHERE status NOT IN ('pending', 'paused')`);
    console.log(`Queue Summary: Pending=${totalPending.count}, Paused=${totalPaused.count}, Other=${totalOther.count}`);

    console.log('\n--- DB INTEGRITY VERIFICATION END ---');
    process.exit(0);
  } catch (error) {
    console.error('Error in verification script:', error);
    process.exit(1);
  }
}
