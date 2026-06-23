import fs from 'fs';
import path from 'path';

const keywords = ['sap_xep', 'sắp xếp', 'hanh_chinh', 'hành chính', 'nghị quyết', 'resolution', 'reorganization', 'commune', 'ward', 'division', 'vietnam'];

function search(dir) {
  let found = [];
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const lower = file.toLowerCase();
      
      // Skip common system and bulky dirs
      if (lower.startsWith('.') || 
          lower.includes('node_modules') || 
          lower.includes('appdata') || 
          lower.includes('microsoft') || 
          lower.includes('chrome') || 
          lower.includes('zalo_user_data') ||
          lower.includes('package-lock') ||
          lower.includes('node_modules')) {
        continue;
      }
      
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (e) {
        continue;
      }

      if (stat.isDirectory()) {
        found = found.concat(search(fullPath));
      } else if (stat.isFile()) {
        const matches = keywords.some(k => lower.includes(k.toLowerCase()));
        if (matches) {
          found.push(fullPath);
        }
      }
    }
  } catch (e) {
    // skip
  }
  return found;
}

// Search C:\PROJECT KANETTRAN, C:\Users\PC\Desktop, C:\Users\PC\Documents, C:\Users\PC\Downloads
const results = [];
results.push(...search('C:\\PROJECT KANETTRAN'));
results.push(...search('C:\\Users\\PC'));

console.log('Search Results:');
console.log(results);
process.exit(0);
