import sqlite3 from 'sqlite3';
import { join } from 'path';

const dbPath = join(process.cwd(), 'data.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    inspect();
  }
});

function inspect() {
  db.all("SELECT location, COUNT(*) as count FROM scheduler_queue WHERE status = 'pending' GROUP BY location", [], (err, rows) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log('Pending locations count:', rows.length);
    
    let targetCount = 0;
    let nonTargetCount = 0;
    const targets = ['Cần Thơ', 'Lâm Đồng', 'An Giang', 'Vĩnh Long', 'Đồng Tháp', 'Cà Mau', 'Tây Ninh', 'Bình Thuận'];
    
    rows.forEach(r => {
      const isTarget = targets.some(t => r.location.endsWith(t) || r.location.includes(t));
      if (isTarget) {
        targetCount += r.count;
      } else {
        nonTargetCount += r.count;
        console.log(`Non-target pending: "${r.location}" (count: ${r.count})`);
      }
    });
    
    console.log('Total target pending:', targetCount);
    console.log('Total non-target pending:', nonTargetCount);
    process.exit(0);
  });
}
