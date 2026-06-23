import { get } from './src/database.js';

async function run() {
  const total = await get('SELECT COUNT(*) as c FROM leads');
  const verified = await get('SELECT COUNT(*) as c FROM leads WHERE verification_status = "verified"');
  const partially = await get('SELECT COUNT(*) as c FROM leads WHERE verification_status = "partially_verified"');
  const invalid = await get('SELECT COUNT(*) as c FROM leads WHERE verification_status = "invalid"');
  const unverified = await get('SELECT COUNT(*) as c FROM leads WHERE verification_status = "unverified"');
  const zaloSent = await get('SELECT COUNT(*) as c FROM leads WHERE zalo_status = "message_sent"');
  const zaloFriend = await get('SELECT COUNT(*) as c FROM leads WHERE zalo_status = "friend_request_sent"');
  const zaloNotFound = await get('SELECT COUNT(*) as c FROM leads WHERE zalo_status = "not_found"');
  const synced = await get('SELECT COUNT(*) as c FROM leads WHERE sheet_sync_status = "synced"');
  const queueTotal = await get('SELECT COUNT(*) as c FROM scheduler_queue');
  const queueCompleted = await get('SELECT COUNT(*) as c FROM scheduler_queue WHERE status = "completed"');

  console.log(JSON.stringify({
    total: total.c,
    verified: verified.c,
    partially: partially.c,
    invalid: invalid.c,
    unverified: unverified.c,
    zaloSent: zaloSent.c,
    zaloFriend: zaloFriend.c,
    zaloNotFound: zaloNotFound.c,
    synced: synced.c,
    queueTotal: queueTotal.c,
    queueCompleted: queueCompleted.c
  }, null, 2));
  process.exit(0);
}

run().catch(console.error);
