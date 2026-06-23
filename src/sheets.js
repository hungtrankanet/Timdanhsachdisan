import { get } from './database.js';

export async function syncLeadToSheet(lead) {
  try {
    const configRow = await get('SELECT value FROM configs WHERE key = "sheets_web_app_url"');
    if (!configRow || !configRow.value) {
      console.warn('Google Sheets Web App URL not configured. Skipping sync.');
      return false;
    }

    // Get the security token from database or use the default
    const tokenRow = await get('SELECT value FROM configs WHERE key = "sheets_secret_token"');
    const token = tokenRow ? tokenRow.value : 'Toluckphattrien2026';

    const url = configRow.value;
    console.log(`Syncing lead [${lead.brand_name}] to Google Sheets with token...`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: token,
        brand_name: lead.brand_name || '',
        phone: lead.phone || '',
        website: lead.website || '',
        facebook: lead.facebook || '',
        address: lead.address || '',
        ward: lead.ward || '',
        district: lead.district || '',
        city: lead.city || '',
        verification_status: lead.verification_status || 'unverified',
        zalo_status: lead.zalo_status || 'pending',
        timestamp: new Date().toISOString()
      }),
    });

    if (!response.ok) {
      throw new Error(`Google Apps Script returned status ${response.status}`);
    }

    const result = await response.json();
    if (result && result.status === 'success') {
      console.log(`Successfully synced lead [${lead.brand_name}] to Google Sheets.`);
      return true;
    } else {
      console.error('Failed to sync to Google Sheets, error:', result.message || result);
      return false;
    }
  } catch (error) {
    console.error('Error in syncLeadToSheet:', error.message);
    return false;
  }
}
