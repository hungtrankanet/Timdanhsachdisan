import { syncLeadToSheet } from './src/sheets.js';
import { get } from './src/database.js';

async function test() {
  console.log('Fetching lead ID 5...');
  const lead = await get('SELECT * FROM leads WHERE id = 5');
  if (!lead) {
    console.error('Lead ID 5 not found in database.');
    process.exit(1);
  }
  console.log('Lead details:', lead.brand_name, lead.phone);
  
  console.log('Triggering sheet sync...');
  const success = await syncLeadToSheet(lead);
  if (success) {
    console.log('Test sync completed successfully! Please check your Google Sheet tabs.');
  } else {
    console.error('Test sync failed! Check logs above.');
  }
  process.exit(0);
}

test().catch(console.error);
