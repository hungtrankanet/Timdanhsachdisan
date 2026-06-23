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
  db.all(
    `SELECT keyword, location, COUNT(*) as count 
     FROM scheduler_queue 
     GROUP BY keyword, location 
     HAVING count > 1`, 
    [], 
    (err, rows) => {
      if (err) {
        console.error(err);
        return;
      }
      console.log('Duplicate (keyword, location) pairs count:', rows.length);
      console.log(rows);
      process.exit(0);
    }
  );
}
