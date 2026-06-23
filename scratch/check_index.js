import { all } from '../src/database.js';

async function run() {
  const indexInfo = await all("PRAGMA index_list('scheduler_queue')");
  console.log('Index List:', JSON.stringify(indexInfo, null, 2));

  for (const idx of indexInfo) {
    const detail = await all(`PRAGMA index_info('${idx.name}')`);
    console.log(`Index ${idx.name} detail:`, JSON.stringify(detail, null, 2));
  }
  process.exit(0);
}

run().catch(console.error);
