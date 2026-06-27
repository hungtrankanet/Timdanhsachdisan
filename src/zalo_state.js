import { get } from './database.js';

export const activeSessions = new Map();

export async function isZaloLoggedIn(accountId = 'default') {
  // 1. Kiểm tra live browser session trước
  const session = activeSessions.get(String(accountId));
  if (session && session.browser && session.page) {
    try {
      const searchInput = await session.page.$('input[placeholder*="Tìm kiếm"], input[placeholder*="Search"], #contact-search-input');
      if (searchInput !== null) return true;
    } catch (e) {}
  }
  // 2. Fallback: kiểm tra DB status (On-Demand mode khi browser đã đóng)
  try {
    const row = await get('SELECT status FROM zalo_accounts WHERE id = ?', [accountId]);
    return row && row.status === 'connected';
  } catch (e) {
    return false;
  }
}
