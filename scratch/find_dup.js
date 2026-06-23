import { all } from '../src/database.js';

async function run() {
  const rows = await all("SELECT * FROM scheduler_queue WHERE location = 'test_loc_1781765723134' OR keyword = 'test_dup_1781765723134'");
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

run().catch(console.error);
