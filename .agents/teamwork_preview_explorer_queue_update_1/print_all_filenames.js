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

console.log('Total files:', allFiles.length);
allFiles.forEach(f => console.log(f));
process.exit(0);
