import { all } from '../src/database.js';

async function run() {
  const tables = await all("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('Tables:', tables.map(t => t.name));
  
  if (tables.map(t => t.name).includes('zalo_chat_logs')) {
    const count = await all("SELECT COUNT(*) as c FROM zalo_chat_logs");
    console.log('zalo_chat_logs count:', count[0].c);
  }
  process.exit(0);
}

run().catch(console.error);
