import sqlite3 from 'sqlite3';
import { join } from 'path';

const dbPath = join(process.cwd(), 'data.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Database connected successfully at:', dbPath);
    inspect();
  }
});

function inspect() {
  db.all("SELECT sql FROM sqlite_master WHERE type='table' AND name='scheduler_queue'", [], (err, rows) => {
    if (err) console.error(err);
    else console.log('scheduler_queue schema:', rows[0] ? rows[0].sql : 'none');
  });

  db.all("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='scheduler_queue'", [], (err, rows) => {
    if (err) console.error(err);
    else console.log('scheduler_queue indexes:', rows);
  });

  db.all("SELECT DISTINCT status FROM scheduler_queue", [], (err, rows) => {
    if (err) console.error(err);
    else console.log('scheduler_queue unique status values:', rows.map(r => r.status));
  });

  db.all("SELECT count(*), status FROM scheduler_queue group by status", [], (err, rows) => {
    if (err) console.error(err);
    else console.log('scheduler_queue status counts:', rows);
  });

  db.all("SELECT count(*) as count, location FROM scheduler_queue GROUP BY location ORDER BY count DESC LIMIT 10", [], (err, rows) => {
    if (err) console.error(err);
    else console.log('Top locations in queue:', rows);
  });
}
