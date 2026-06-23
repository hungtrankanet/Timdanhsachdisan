import fs from 'fs';
const content = fs.readFileSync('C:\\Users\\PC\\Downloads\\1C26TTL_00000024\\1C26TTL_00000024.xml', 'utf8');
console.log(content.substring(0, 1000));
process.exit(0);
