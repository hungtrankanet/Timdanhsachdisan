import fs from 'fs';
import path from 'path';

const searchPaths = [
  'C:/PROJECT KANETTRAN',
  'C:/Users/PC/Desktop',
  'C:/Users/PC/Documents',
  'C:/Users/PC/Downloads'
];

function findResolutionFiles(dir, depth = 0) {
  if (depth > 6) return [];
  let found = [];
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fullPath.includes('node_modules') || fullPath.includes('.git') || fullPath.includes('.gemini') || fullPath.includes('node') || fullPath.includes('zalo_user_data')) {
        continue;
      }
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        found = found.concat(findResolutionFiles(fullPath, depth + 1));
      } else {
        const lower = file.toLowerCase();
        if (lower.includes('resolution') || lower.includes('nghị quyết') || lower.includes('hanh_chinh') || lower.includes('hành chính') || lower.includes('sap_xep') || lower.includes('sắp xếp')) {
          found.push(fullPath);
        }
      }
    }
  } catch (e) {}
  return found;
}

const results = [];
for (const sp of searchPaths) {
  results.push(...findResolutionFiles(sp));
}
console.log('Results:', results);
process.exit(0);
