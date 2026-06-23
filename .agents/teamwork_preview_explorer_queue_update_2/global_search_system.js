import fs from 'fs';
import path from 'path';

const keywords = [
  'sắp xếp đơn vị hành chính',
  'nghị quyết',
  'hành chính',
  'Cần Thơ',
  'Lâm Đồng',
  'An Giang',
  'Vĩnh Long',
  'Đồng Tháp',
  'Cà Mau',
  'Tây Ninh',
  'Bình Thuận'
];

function searchDir(dir, depth = 0) {
  if (depth > 5) return []; // Limit depth to avoid infinite loop
  let results = [];
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fullPath.includes('AppData') || fullPath.includes('node_modules') || fullPath.includes('.git') || fullPath.includes('.gemini') || fullPath.includes('node')) {
        continue;
      }
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        results = results.concat(searchDir(fullPath, depth + 1));
      } else if (stat.isFile()) {
        const ext = path.extname(fullPath).toLowerCase();
        if (['.md', '.txt', '.json', '.js', '.mjs', '.sql', '.html', '.pdf', '.docx'].includes(ext)) {
          // just filter based on name first to be super fast
          const lowerName = file.toLowerCase();
          if (lowerName.includes('sap_xep') || lowerName.includes('hanh_chinh') || lowerName.includes('resolution') || lowerName.includes('nghị quyết') || lowerName.includes('don_vi') || lowerName.includes('reorganization') || lowerName.includes('division') || lowerName.includes('ward') || lowerName.includes('commune') || lowerName.includes('vietnam')) {
            results.push({ path: fullPath, reason: 'filename' });
          } else {
            // Check content if size is small
            if (stat.size < 500000 && ['.md', '.txt', '.json', '.html'].includes(ext)) {
              const content = fs.readFileSync(fullPath, 'utf8');
              for (const kw of keywords) {
                if (content.toLowerCase().includes(kw.toLowerCase())) {
                  results.push({ path: fullPath, reason: 'content: ' + kw });
                  break;
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {
    // Ignore
  }
  return results;
}

const searchPaths = [
  'C:/Users/PC/Desktop',
  'C:/Users/PC/Documents',
  'C:/Users/PC/Downloads',
  'C:/PROJECT KANETTRAN'
];

let allFound = [];
for (const sp of searchPaths) {
  console.log('Searching', sp);
  allFound = allFound.concat(searchDir(sp));
}

console.log('Found:', allFound);
process.exit(0);
