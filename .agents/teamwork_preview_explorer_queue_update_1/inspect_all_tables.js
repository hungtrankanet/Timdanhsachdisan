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
  db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log('Tables:', rows.map(r => r.name));
    
    rows.forEach(tableRow => {
      const name = tableRow.name;
      db.get(`SELECT count(*) as c FROM ${name}`, [], (err, countRow) => {
        console.log(`Table ${name} count:`, countRow ? countRow.c : 'error');
      });
    });
  });

  // check all rows in configs
  db.all("SELECT * FROM configs", [], (err, rows) => {
    console.log('Configs rows:', rows);
  });
}
