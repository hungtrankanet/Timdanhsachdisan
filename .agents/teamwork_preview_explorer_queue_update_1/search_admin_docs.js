import fs from 'fs';
import path from 'path';

const keywords = [
  'sáp nhập', 'chia tách', 'nghị quyết', 'hành chính', 'đơn vị hành chính',
  'ward', 'commune', 'district', 'reorganization', '2025', 'july',
  'lâm đồng', 'cần thơ', 'an giang', 'vĩnh long', 'đồng tháp', 'cà mau', 'tây ninh', 'bình thuận'
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
        if (['.md', '.txt', '.json', '.js', '.mjs', '.sql', '.html', '.csv', '.xml'].includes(ext)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const matched = [];
          for (const kw of keywords) {
            if (content.toLowerCase().includes(kw.toLowerCase())) {
              matched.push(kw);
            }
          }
          if (matched.length >= 2) { // Match at least two keywords to filter out noise
            results.push({ path: fullPath, matched });
          }
        }
      }
    }
  } catch (err) {
    // Ignore error
  }
  return results;
}

const found = searchDir('C:\\PROJECT KANETTRAN');
console.log('Search Results:');
found.forEach(f => {
  console.log(`- ${f.path} (matched: ${f.matched.join(', ')})`);
});
process.exit(0);
