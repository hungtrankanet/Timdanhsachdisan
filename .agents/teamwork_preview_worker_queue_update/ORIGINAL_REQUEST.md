## 2026-06-18T06:50:59Z
1. Read the global project scope in c:/PROJECT KANETTRAN/Timdanhsachdisan/PROJECT.md and the synthesis findings in c:/PROJECT KANETTRAN/Timdanhsachdisan/.agents/orchestrator/synthesis.md.
2. Implement the database index update in `src/database.js` inside the `initDb()` function so that `idx_scheduler_queue_keyword_location` UNIQUE index on `(keyword, location)` is automatically created.
3. Update `src/populate_queue.js`:
   - Replace the `LOCATIONS` array with the comprehensive list of 34 target location strings representing the 8 provinces and incorporating the new July 1, 2025 divisions (excluding HCMC entirely).
   - Change the query from `INSERT INTO` to `INSERT OR IGNORE INTO` to handle duplicate checks safely.
4. Update `src/server.js` endpoint `app.post('/api/queue')`:
   - Change the query to `INSERT OR IGNORE INTO` and handle potential conflict cases properly by checking if `result.changes === 0` and returning appropriate responses.
5. Create and run a migration script `src/update_queue.js`:
   - It must run precautionarily:
     a) Deduplicate existing tasks in `scheduler_queue` (by keeping the min ID for each keyword-location pair, if any duplicates exist).
     b) Create the UNIQUE index `idx_scheduler_queue_keyword_location` on `scheduler_queue (keyword, location)`.
     c) Pause existing non-target pending tasks (such as HCMC) by setting their status to `'paused'`.
     d) Populate the queue with the new target locations and the 8 keywords using `INSERT OR IGNORE`.
   - Run this script using the local Node command (e.g., `node src/update_queue.js` or the node.exe under the local `node` folder).
6. Run the test suite:
   - Run `node test_pipeline.js` and verify that the core functions of address parsing, phone extraction, Facebook extraction, and database operation run successfully.
7. Verify the queue state:
   - Run `node scratch/check_queue.mjs` or verify via sqlite queries that:
     a) Non-target pending tasks are paused.
     b) Target province tasks are pending.
     c) No duplicates exist.
8. Save your changes list and verification results in your handoff report at c:/PROJECT KANETTRAN/Timdanhsachdisan/.agents/teamwork_preview_worker_queue_update/handoff.md.
9. When complete, send a message to the Project Orchestrator (Conversation ID: 977f8886-db42-4f9c-86cb-78024f6180bd).
