import fs from 'fs';
import path from 'path';

const keywords = [
  '2025',
  'July 1',
  'reorganization',
  'Cần Thơ',
  'Lâm Đồng',
  'An Giang',
  'Vĩnh Long',
  'Đồng Tháp',
  'Cà Mau',
  'Tây Ninh',
  'Bình Thuận',
  'administrative'
];

function searchDir(dir) {
  let results = [];
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fullPath.includes('node_modules') || fullPath.includes('.git') || fullPath.includes('zalo_user_data') || fullPath.includes('node')) {
        continue;
      }
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        results = results.concat(searchDir(fullPath));
      } else if (stat.isFile()) {
        const ext = path.extname(fullPath).toLowerCase();
        if (['.md', '.txt', '.json', '.js', '.mjs', '.sql', '.html'].includes(ext)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          for (const kw of keywords) {
            if (content.toLowerCase().includes(kw.toLowerCase())) {
              results.push({ path: fullPath, kw });
              break;
            }
          }
        }
      }
    }
  } catch (err) {
    // Ignore error
  }
  return results;
}

const found = searchDir('C:/PROJECT KANETTRAN');
console.log('Search Results:');
console.log(found.map(f => `${f.path} (matched: ${f.kw})`));
process.exit(0);
