# Handoff Report — Queue Uniqueness & Scheduler Verification

## 1. Observation
- **Direct SQL duplicate insertion**: Running `node -e "import('./src/database.js').then(async db => { try { await db.run('INSERT INTO scheduler_queue (keyword, location) VALUES (\'sơn mài\', \'An Khánh, Ninh Kiều, Cần Thơ\')'); } catch (err) { console.log('Caught Expected Error:', err.message); } process.exit(0); })"` resulted in:
  ```
  Database connected successfully at: C:\PROJECT KANETTRAN\Timdanhsachdisan\data.db
  Caught Expected Error: SQLITE_CONSTRAINT: UNIQUE constraint failed: scheduler_queue.keyword, scheduler_queue.location
  ```
- **Populate queue script duplication**: Running `node src/populate_queue.js` resulted in:
  ```
  Database connected. Populating scheduler queue...
  Database connected successfully at: C:\PROJECT KANETTRAN\Timdanhsachdisan\data.db
  Successfully populated 0 new search queries in the scheduler queue!
  ```
- **API `/api/queue` duplicate insertion**: Launching the server on port 3001 and submitting the same `{ keyword, location }` twice returned:
  - First request: `200 OK` with `{ success: true, id: 2342 }`
  - Second request: `400 Bad Request` with `{ error: 'Task already exists in the queue.' }`
- **Pending HCMC tasks presence**: Running `node -e "import('./src/database.js').then(async db => { console.log(await db.all('SELECT * FROM scheduler_queue WHERE status = \'pending\' AND (location LIKE \'%Hồ Chí Minh%\' OR location LIKE \'%HCM%\')')); process.exit(0); })"` returned:
  ```
  []
  ```
  While `node scratch/check_queue.mjs` confirmed that all Hồ Chí Minh tasks have their status set to `'paused'`, and all target province tasks have status set to `'pending'`.
- **Scheduler SQL query**: The query in `src/scheduler.js` (line 28) reads:
  ```javascript
  const job = await get('SELECT * FROM scheduler_queue WHERE status = "pending" ORDER BY id ASC LIMIT 1');
  ```
- **Test Suite Results**: Running `node test_pipeline.js` outputs:
  ```
  --- BẮT ĐẦU CHẠY KIỂM THỬ TỰ ĐỘNG ---
  ...
  --- TẤT CẢ CÁC BÀI KIỂM THỬ ĐÃ THÀNH CÔNG! ---
  ```

## 2. Logic Chain
- Because `idx_scheduler_queue_keyword_location` is defined as a `UNIQUE INDEX ON scheduler_queue (keyword, location)` inside `src/database.js` (lines 61-63), SQLite strictly prevents any duplicate keyword-location pair from being inserted into the database. This is proven by the `SQLITE_CONSTRAINT` violation error observed in direct SQL insertion.
- The script `src/populate_queue.js` utilizes `INSERT OR IGNORE` which safely swallows database constraint exceptions on conflict. When executed multiple times, it results in 0 inserts and exits gracefully without polluting the database.
- The `src/server.js` Express route handles POST `/api/queue` by executing `INSERT OR IGNORE`. If no rows are changed (`result.changes === 0`), it returns a client-facing `400` status with a descriptive error message, ensuring that duplicate requests are cleanly blocked and communicated.
- The scheduler fetches pending tasks using status = "pending" ordered by ID ascending. Because all HCMC tasks are marked as "paused" in the database, the scheduler will successfully pick up only target province pending tasks in priority order.
- The complete pipeline test suite runs and passes successfully, verifying core database interactions, parsing, and normalization works correctly without errors.

## 3. Caveats
- No caveats. The verification was done locally on native environment and behaves exactly as expected.

## 4. Conclusion
The database index uniqueness constraints, script-based population, and POST API endpoints are correctly implemented to prevent duplicate tasks in the scheduler queue. The scheduler task selection works as expected, excluding HCMC tasks (paused) and prioritising target province pending tasks in order.

## 5. Verification Method
1. Run `node test_pipeline.js` to execute the basic test suite.
2. Run `node -e "import('./src/database.js').then(async db => { try { await db.run('INSERT INTO scheduler_queue (keyword, location) VALUES (\'sơn mài\', \'An Khánh, Ninh Kiều, Cần Thơ\')'); } catch (err) { console.log(err.message); } process.exit(0); })"` to verify that SQLite rejects duplicate records with `SQLITE_CONSTRAINT: UNIQUE constraint failed: scheduler_queue.keyword, scheduler_queue.location`.
3. Check status distributions using `node scratch/check_queue.mjs` to verify HCMC tasks are all paused.
