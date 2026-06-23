import fs from 'fs';
import path from 'path';

function listFiles(dir) {
  let list = [];
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const full = path.join(dir, f);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          list.push({ path: full, isDir: true });
        } else {
          list.push({ path: full, isDir: false, size: stat.size });
        }
      } catch (e) {}
    }
  } catch (e) {}
  return list;
}

console.log('--- DESKTOP ---');
console.log(listFiles('C:\\Users\\PC\\Desktop'));

console.log('--- DOCUMENTS ---');
console.log(listFiles('C:\\Users\\PC\\Documents'));

console.log('--- DOWNLOADS ---');
console.log(listFiles('C:\\Users\\PC\\Downloads'));

process.exit(0);
