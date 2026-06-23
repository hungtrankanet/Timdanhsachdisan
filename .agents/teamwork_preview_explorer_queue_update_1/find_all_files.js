import fs from 'fs';
import path from 'path';

const searchPaths = [
  'C:/Users/PC/Desktop',
  'C:/Users/PC/Documents',
  'C:/Users/PC/Downloads',
  'C:/PROJECT KANETTRAN'
];

function listAllFiles(dir, depth = 0) {
  if (depth > 6) return [];
  let list = [];
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fullPath.includes('AppData') || fullPath.includes('node_modules') || fullPath.includes('.git') || fullPath.includes('.gemini') || fullPath.includes('node')) {
        continue;
      }
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        list = list.concat(listAllFiles(fullPath, depth + 1));
      } else {
        list.push({ path: fullPath, size: stat.size });
      }
    }
  } catch (e) {}
  return list;
}

console.log('Scanning...');
let allFiles = [];
for (const sp of searchPaths) {
  allFiles = allFiles.concat(listAllFiles(sp));
}

console.log(`Total files found: ${allFiles.length}`);
const keywords = ['nghị quyết', 'resolution', 'hành chính', 'sáp nhập', 'tỉnh', 'thành phố', 'huyện', 'xã', 'phường', 'division', 'reorganization', 'july', '2025', '1-7', '1_7'];
const matched = allFiles.filter(f => {
  const name = path.basename(f.path).toLowerCase();
  return keywords.some(k => name.includes(k));
});

console.log('Matched files by name:');
console.log(matched);
process.exit(0);
