import { all } from '../../src/database.js';

async function main() {
  try {
    const tables = await all("SELECT name FROM sqlite_master WHERE type='table'");
    console.log("--- TABLES ---");
    console.log(tables);
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}

main();
