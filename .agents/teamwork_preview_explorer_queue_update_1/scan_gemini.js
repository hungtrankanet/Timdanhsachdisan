import fs from 'fs';
import path from 'path';

function listAllFiles(dir, depth = 0) {
  if (depth > 6) return [];
  let list = [];
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fullPath.includes('node_modules') || fullPath.includes('.git')) {
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

const allFiles = listAllFiles('C:/Users/PC/.gemini');
console.log('Gemini files:', allFiles.length);
allFiles.forEach(f => {
  if (f.toLowerCase().includes('resolution') || f.toLowerCase().includes('nghị quyết') || f.toLowerCase().includes('can_tho') || f.toLowerCase().includes('cần thơ') || f.toLowerCase().includes('lâm đồng') || f.toLowerCase().includes('lam_dong')) {
    console.log('Matched:', f);
  }
});
process.exit(0);
