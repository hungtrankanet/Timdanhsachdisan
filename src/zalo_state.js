export const activeSessions = new Map();

export async function isZaloLoggedIn(accountId = 'default') {
  const session = activeSessions.get(accountId);
  if (!session || !session.browser || !session.page) return false;
  try {
    const searchInput = await session.page.$('input[placeholder*="Tìm kiếm"], input[placeholder*="Search"], #contact-search-input');
    return searchInput !== null;
  } catch (e) {
    return false;
  }
}
