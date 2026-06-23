# Handoff Report - Queue Update 3 (Investigation)

## 1. Observation
* **Codebase Structure & Contracts**:
  - `src/database.js` defines table schema but lacks `UNIQUE` index on `(keyword, location)`. Line 49:
    ```javascript
    db.run(`
      CREATE TABLE IF NOT EXISTS scheduler_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT NOT NULL,
        location TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        leads_found INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    ```
  - `src/populate_queue.js` populates the queue by looping through `LOCATIONS` and `KEYWORDS` and running a standard insert. Line 96-100:
    ```javascript
    await run(
      `INSERT INTO scheduler_queue (keyword, location, status, leads_found) 
       VALUES (?, ?, ?, 0)`,
      [keyword, location, 'pending']
    );
    ```
  - `src/scheduler.js` queries next job using `WHERE status = "pending"`. Line 28:
    ```javascript
    const job = await get('SELECT * FROM scheduler_queue WHERE status = "pending" ORDER BY id ASC LIMIT 1');
    ```
* **Database State**:
  - Running a check on `data.db` showed a total of 430 rows in `scheduler_queue`:
    - `completed`: 52 rows
    - `running`: 2 rows
    - `pending`: 376 rows
  - Running a duplicate check query:
    ```sql
    SELECT keyword, location, COUNT(*) as occurrence FROM scheduler_queue GROUP BY keyword, location HAVING occurrence > 1
    ```
    returned **0** results. There are currently **no duplicates** in `scheduler_queue`.
* **Vietnamese Administrative Divisions Reorganization**:
  - Reorganization of commune-level administrative units of the 8 provinces for 2023–2025 took effect under the following resolutions:
    1. **Cần Thơ**: Resolution 1192/NQ-UBTVQH15 (merges into An Cư, Tân An wards).
    2. **Lâm Đồng**: Resolution 1245/NQ-UBTVQH15 (merges into Ward 1, Ward 11, Lang Biang ward, Lát, Đạ Sar, Đạ Nhim, Đạ Chais, Đưng K'Nớ).
    3. **An Giang**: Resolution 1247/NQ-UBTVQH15 (merges into Đông Xuyên, Châu Phú A wards).
    4. **Vĩnh Long**: Resolution 1250/NQ-UBTVQH15 (merges into Phường 1, Phường 5, Thị trấn Long Hồ).
    5. **Đồng Tháp**: Resolution 1248/NQ-UBTVQH15 (merges into Phường 1 Cao Lãnh, Phường 1 Sa Đéc, Thị trấn Mỹ An).
    6. **Cà Mau**: Resolution 1252/NQ-UBTVQH15 (merges into Phường 1, Phường 9).
    7. **Tây Ninh**: Resolution 1251/NQ-UBTVQH15 (merges into Phường 1).
    8. **Bình Thuận**: Resolution 1244/NQ-UBTVQH15 (merges into Đức Nghĩa, Hưng Long).

---

## 2. Logic Chain
1. Since the scheduler fetches only tasks with `status = "pending"` (`src/scheduler.js`:28), updating the status of non-target tasks (like HCMC) to `'paused'` will temporarily exclude them from crawling cycles without deleting records.
2. Since there are currently 0 duplicate `(keyword, location)` pairs in `scheduler_queue` (Observation 1), it is safe to apply a `UNIQUE` index directly to the existing database table.
3. Adding a `UNIQUE` index on `(keyword, location)` will raise constraint errors on duplicate insertions. To prevent populate script failures (R3), modifying `INSERT INTO` to `INSERT OR IGNORE INTO` in `src/populate_queue.js` (and the update script) is necessary.
4. Adding the 16 newly reorganized urban division locations across the 8 target provinces ensures coverage aligns with the post-July-2025 Vietnamese administrative divisions (R2).

---

## 3. Caveats
* The scheduler loop uses a 1-minute delay between queries to protect against Google Maps IP blocks. High insertion rate of new targets won't immediately trigger IP bans, but the crawler speed is throttled.
* Active tasks (`running`) should not be changed to `paused` to avoid interrupting active scrapers. The pause query is therefore scoped strictly to `status = 'pending'`.

---

## 4. Conclusion
We have formulated a complete database schema modification, crawler queue update script (`src/update_queue.js`), and modifications to the codebase (`src/database.js`, `src/populate_queue.js`) to seamlessly transition the database queue to prioritize target provinces and support post-July-2025 Vietnamese administrative divisions.

---

## 5. Verification Method
1. Run the local tests to ensure the database layer behaves correctly:
   ```bash
   node test_pipeline.js
   ```
2. Verify the update script correctly pauses non-target pending tasks:
   ```bash
   node -e "import('./src/database.js').then(db => db.all('SELECT COUNT(*) as c FROM scheduler_queue WHERE status = \'paused\'').then(console.log))"
   ```
3. Verify that the unique index prevents inserting duplicates:
   - Try inserting `('sơn mài', 'An Cư, Ninh Kiều, Cần Thơ')` twice; the second attempt must result in a duplicate key error or be ignored cleanly.
