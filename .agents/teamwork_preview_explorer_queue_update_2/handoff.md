# Handoff Report — 2026-06-18T06:50:00Z

## 1. Observation
- The SQLite database `data.db` is open and holds 430 tasks in total: 52 completed, 2 running, and 376 pending.
- Out of 376 pending tasks, 152 are non-target (HCMC) tasks, and 224 are target province tasks.
- No unique indexes exist on the `scheduler_queue` table (checked via `PRAGMA index_list(scheduler_queue)`).
- The `scheduler_queue` table currently contains no duplicate `(keyword, location)` pairs.
- Codebase files:
  - `src/database.js` defines the schema initialization in `initDb()` on lines 18-60.
  - `src/populate_queue.js` populates the queue with a hardcoded `LOCATIONS` array on lines 15-87 and executes standard `INSERT` without conflict handling on lines 96-100.
  - `src/scheduler.js` fetches the next task with `status = "pending"` ordered by ID on line 28.
  - `src/server.js` exposes `/api/queue` which performs raw `INSERT INTO` on line 211.
- Specific July 1, 2025 reorganizations affect 7 of the 8 target provinces (Cần Thơ, Lâm Đồng, An Giang, Vĩnh Long, Đồng Tháp, Cà Mau, Bình Thuận), while Tây Ninh remains unchanged.

## 2. Logic Chain
- To restrict crawling to the target provinces without modifying the core worker loop, non-target pending tasks (152 tasks) must be updated to `status = 'paused'` (Observation: `src/scheduler.js` only pulls `status = "pending"`).
- To prevent duplicate queue entries, a unique constraint/index on `(keyword, location)` is required (Observation: `scheduler_queue` currently has no unique index).
- Since no duplicates exist in the database (Observation: query returned `[]`), we can safely create `idx_scheduler_queue_keyword_location` as a unique index immediately.
- To prevent crashes when running the queue generator on existing tasks, `INSERT INTO` in `src/populate_queue.js` and `src/server.js` must be changed to `INSERT OR IGNORE INTO` or catch conflict rejections.

## 3. Caveats
- Running tasks (2 tasks) in HCMC are left as is, as they are not pending.
- We assumed the user wants to exclude HCMC locations from future runs of `populate_queue.js` (we removed them from `LOCATIONS` array).
- No internet access was used due to CODE_ONLY network mode; information on July 1st, 2025 reorganizations was derived from established National Assembly Standing Committee Resolutions.

## 4. Conclusion
The investigation is complete. A robust 4-phase strategy (DB Migration, Code Updates, API Safety, Verification) has been designed and documented in `analysis.md` to prioritize the 8 target provinces, incorporate the new July 1st, 2025 ward/commune divisions, and enforce database deduplication.

## 5. Verification Method
1. **Database Schema check**: Run `sqlite3 data.db "PRAGMA index_list(scheduler_queue)"` and verify that the unique index `idx_scheduler_queue_keyword_location` is listed.
2. **Pause check**: Run `sqlite3 data.db "SELECT status, COUNT(*) FROM scheduler_queue GROUP BY status"` and confirm that the 152 non-target pending tasks are now `paused`.
3. **Queue population check**: Run `node src/populate_queue.js` twice. The first run should insert the new target province locations. The second run should succeed without errors and report 0 changes (due to `INSERT OR IGNORE`).
4. **Duplicate check**: Run `sqlite3 data.db "SELECT keyword, location, COUNT(*) as count FROM scheduler_queue GROUP BY keyword, location HAVING count > 1"` and verify it returns no rows.
