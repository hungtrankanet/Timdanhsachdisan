import fs from 'fs';
import path from 'path';

function scanC() {
  const rootDirs = fs.readdirSync('C:/');
  console.log('Root directories in C:/:', rootDirs);
}
scanC();
process.exit(0);
