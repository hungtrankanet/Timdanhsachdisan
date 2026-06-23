import fs from 'fs';
import path from 'path';

const searchPaths = [
  'C:/Users/PC/Desktop',
  'C:/Users/PC/Documents',
  'C:/Users/PC/Downloads'
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
        list.push(fullPath);
      }
    }
  } catch (e) {}
  return list;
}

let allFiles = [];
for (const sp of searchPaths) {
  allFiles = allFiles.concat(listAllFiles(sp));
}

console.log('Searching file content for "Cần Thơ", "Lâm Đồng", etc...');
const matches = [];
for (const f of allFiles) {
  const ext = path.extname(f).toLowerCase();
  if (['.txt', '.md', '.json', '.xml', '.doc', '.docx', '.pdf'].includes(ext)) {
    try {
      // For binary files, just read the first few KB as string (rough check)
      const buffer = fs.readFileSync(f);
      const content = buffer.toString('utf8').toLowerCase();
      if (content.includes('cần thơ') || content.includes('lâm đồng') || content.includes('an giang') || content.includes('vĩnh long') || content.includes('đồng tháp') || content.includes('cà mau') || content.includes('tây ninh') || content.includes('bình thuận')) {
        matches.push(f);
      }
    } catch (e) {}
  }
}

console.log('Matches:', matches);
process.exit(0);
