import { all } from '../src/database.js';

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

async function run() {
  console.log('--- VERIFICATION START ---');

  // 1. Check duplicate entries
  const duplicates = await all(`
    SELECT keyword, location, COUNT(*) as count 
    FROM scheduler_queue 
    GROUP BY keyword, location 
    HAVING count > 1
  `);
  console.log('1. Duplicate entries count:', duplicates.length);
  if (duplicates.length > 0) {
    console.error('FAIL: Found duplicates!', duplicates);
  } else {
    console.log('PASS: No duplicate entries found in scheduler_queue.');
  }

  // 2. Check pending HCMC tasks
  const pendingHCMC = await all(`
    SELECT DISTINCT location FROM scheduler_queue 
    WHERE status = 'pending' AND (location LIKE '%Hồ Chí Minh%' OR location LIKE '%HCM%')
  `);
  console.log('2. Pending HCMC locations count:', pendingHCMC.length);
  if (pendingHCMC.length > 0) {
    console.error('FAIL: Found pending HCMC tasks!', pendingHCMC);
  } else {
    console.log('PASS: No pending HCMC tasks.');
  }

  // 3. Check pending locations matching target locations
  const pendingLocations = await all(`
    SELECT DISTINCT location FROM scheduler_queue 
    WHERE status = 'pending'
  `);
  console.log('3. Total pending locations:', pendingLocations.length);
  
  const pendingLocNames = pendingLocations.map(p => p.location);
  const unmatchedPending = pendingLocNames.filter(loc => !TARGET_LOCATIONS.includes(loc));
  const missingPending = TARGET_LOCATIONS.filter(loc => !pendingLocNames.includes(loc));

  if (unmatchedPending.length > 0) {
    console.error('FAIL: Found pending locations not in the target list:', unmatchedPending);
  } else {
    console.log('PASS: All pending locations are in the target list.');
  }

  if (missingPending.length > 0) {
    console.error('FAIL: Target locations missing from pending status:', missingPending);
  } else {
    console.log('PASS: All target locations are present in pending status.');
  }

  // 4. Verify total pending count (should be 34 locations * 8 keywords = 272 tasks)
  const totalPendingTasks = await all(`
    SELECT COUNT(*) as count FROM scheduler_queue WHERE status = 'pending'
  `);
  console.log('4. Total pending tasks count:', totalPendingTasks[0].count);
  if (totalPendingTasks[0].count === 272) {
    console.log('PASS: Total pending tasks is exactly 272.');
  } else {
    console.error(`FAIL: Expected 272 pending tasks, got ${totalPendingTasks[0].count}.`);
  }

  console.log('--- VERIFICATION END ---');
  process.exit(0);
}

run().catch(console.error);
