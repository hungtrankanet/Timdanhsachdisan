import { get, all } from './src/database.js';

async function run() {
  // 1. Get current active task config
  const taskRow = await get('SELECT value FROM configs WHERE key = "current_task"');
  const activeTask = taskRow ? taskRow.value : 'N/A';

  // 2. Get active running job from queue
  const runningJob = await get('SELECT * FROM scheduler_queue WHERE status = "running"');
  
  // 3. Get unique keywords in queue
  const keywords = await all('SELECT DISTINCT keyword FROM scheduler_queue');
  const keywordList = keywords.map(k => k.keyword);

  // 4. Get unique locations in queue
  const locations = await all('SELECT DISTINCT location FROM scheduler_queue');
  const locationList = locations.map(l => l.location);

  // 5. Count queue status breakdown
  const pendingCount = await get('SELECT COUNT(*) as c FROM scheduler_queue WHERE status = "pending"');
  const completedCount = await get('SELECT COUNT(*) as c FROM scheduler_queue WHERE status = "completed"');
  const runningCount = await get('SELECT COUNT(*) as c FROM scheduler_queue WHERE status = "running"');

  console.log(JSON.stringify({
    activeTask,
    runningJob,
    keywordList,
    locationListLength: locationList.length,
    locationSample: locationList.slice(0, 10),
    pendingCount: pendingCount.c,
    completedCount: completedCount.c,
    runningCount: runningCount.c
  }, null, 2));
  process.exit(0);
}

run().catch(console.error);
