import { all } from '../../src/database.js';

async function main() {
  try {
    const targetProvinces = [
      'Cần Thơ', 'Lâm Đồng', 'An Giang', 'Vĩnh Long', 
      'Đồng Tháp', 'Cà Mau', 'Tây Ninh', 'Bình Thuận'
    ];
    
    // Build SQL condition
    const conditions = targetProvinces.map(p => `location NOT LIKE '%${p}%'`).join(' AND ');
    
    const query = `
      SELECT id, keyword, location, status 
      FROM scheduler_queue 
      WHERE status = 'pending' AND (${conditions})
    `;
    
    const rows = await all(query);
    console.log(`Number of pending tasks that would be paused: ${rows.length}`);
    console.log('Sample tasks to pause (first 10):');
    console.log(rows.slice(0, 10));
    
    const keepQuery = `
      SELECT id, keyword, location, status 
      FROM scheduler_queue 
      WHERE status = 'pending' AND NOT (${conditions})
    `;
    const keepRows = await all(keepQuery);
    console.log(`Number of pending tasks that would REMAIN pending (target provinces): ${keepRows.length}`);
    console.log('Sample target tasks (first 10):');
    console.log(keepRows.slice(0, 10));

  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}

main();
