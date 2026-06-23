# Handoff Report: Prioritize Target Provinces and 2025 Divisions Reorganizations

This handoff report summarizes the findings, reasoning, and design recommendations for updating the crawler queue to focus on 8 target provinces and include their post-July-2025 divisions.

---

## 1. Observation

- **Database Path**: `c:/PROJECT KANETTRAN/Timdanhsachdisan/data.db`
- **Scheduler Queue Table**: `scheduler_queue` currently contains 430 rows.
  - Completed: 52
  - Running: 2 (IDs 50 and another)
  - Pending: 376 (152 non-target/HCMC, 224 target)
- **Codebase Locations**:
  - `src/database.js`: Defines table schema and initializes SQLite connection.
  - `src/populate_queue.js`: Declares target locations and keyword arrays, and populates `scheduler_queue` via:
    ```javascript
    await run(
      `INSERT INTO scheduler_queue (keyword, location, status, leads_found) 
       VALUES (?, ?, ?, 0)`,
      [keyword, location, 'pending']
    );
    ```
  - `src/scheduler.js`: Fetches next pending task using:
    ```javascript
    const job = await get('SELECT * FROM scheduler_queue WHERE status = "pending" ORDER BY id ASC LIMIT 1');
    ```
- **Constraint Inspection**: Checking the database for duplicate `(keyword, location)` pairs returned 0 rows, meaning there are no current duplicates.
- **Administrative Changes**: No files containing official division tables existed in local folders. We identified the exact reorganizations for the 8 provinces (Cần Thơ, Lâm Đồng, An Giang, Vĩnh Long, Đồng Tháp, Cà Mau, Tây Ninh, Bình Thuận) under the relevant resolutions of the National Assembly Standing Committee.

---

## 2. Logic Chain

1. **Pausing HCMC & Non-Target Tasks**: Since `src/scheduler.js` retrieves tasks where `status = "pending"`, setting non-target pending tasks to `'paused'` will exclude them from the queue processing loop without deleting them. This is achieved via a targeted SQL `UPDATE` statement filtering out the 8 target provinces.
2. **Preventing Duplicates**: Adding a unique index `idx_scheduler_queue_keyword_location` on `scheduler_queue(keyword, location)` will prevent any duplicate search queries. Because there are no existing duplicates, the index creation will succeed immediately.
3. **Queue Generator Safe Inserts**: The current script `src/populate_queue.js` uses `INSERT INTO`, which would fail and stop on duplicate errors once the unique index is added. Changing this to `INSERT OR IGNORE` ensures that the script runs smoothly, skipping existing pairs and only inserting new ones.
4. **Division Reorganization Update**: Wards and communes that were merged (e.g. merging Phường An Phú, An Nghiệp, An Cư into Phường Thới Bình in Ninh Kiều, Cần Thơ) must be removed or replaced by their target reorganized wards in `populate_queue.js` to ensure search efforts focus on current administrative areas.

---

## 3. Caveats

- **Assumptions**: We assume the crawler is targeting search queries in the form `"[keyword] [ward], [district], [province]"` as defined in the original `src/populate_queue.js`.
- **Areas Not Investigated**: The specific scraping mechanism of Google Maps (`src/scraper.js`) and the Zalo invitation flow (`src/zalo.js`) were not investigated because they do not affect queue population and prioritization.

---

## 4. Conclusion

The database does not contain duplicate queue items currently, making it safe to apply a unique index directly. The implementation should:
1. Run a SQL script to pause non-target pending tasks.
2. Add a `CREATE UNIQUE INDEX` statement to the database initializer and existing database.
3. Update `src/populate_queue.js` with the reorganized wards/districts and `INSERT OR IGNORE` syntax.

---

## 5. Verification Method

### 5.1 Verification Commands
1. **Verify No Pending HCMC Tasks**:
   ```bash
   node -e "import('./src/database.js').then(db => db.all(\"SELECT count(*) as c FROM scheduler_queue WHERE status = 'pending' AND location LIKE '%Hồ Chí Minh%'\").then(console.log))"
   ```
   *Expected output: `{ c: 0 }`*
2. **Verify Unique Index**:
   ```bash
   node -e "import('./src/database.js').then(db => db.run(\"INSERT INTO scheduler_queue (keyword, location) VALUES ('sơn mài', 'An Khánh, Ninh Kiều, Cần Thơ')\").catch(e => console.log('Passed:', e.message)))"
   ```
   *Expected output: `Passed: UNIQUE constraint failed: scheduler_queue.keyword, scheduler_queue.location`*
3. **Verify Queue Generation**:
   Run the test pipeline to verify there are no syntax errors:
   ```bash
   node test_pipeline.js
   ```
