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
  db.all("SELECT DISTINCT location FROM scheduler_queue", [], (err, rows) => {
    if (err) console.error(err);
    else {
      console.log('Distinct locations (total', rows.length, '):');
      console.log(rows.map(r => r.location));
    }
  });
}
