import { all } from '../src/database.js';

async function run() {
  const rows = await all(`
    SELECT location, status, COUNT(*) as count 
    FROM scheduler_queue 
    GROUP BY location, status
  `);
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

run().catch(console.error);
