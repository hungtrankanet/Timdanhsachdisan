# Handoff Report - Queue Update

## 1. Observation
* **Database Index Update**:
  Modified `src/database.js` inside the `initDb()` function to create the unique index `idx_scheduler_queue_keyword_location` on `scheduler_queue (keyword, location)`.
  Verbatim modified section from `src/database.js`:
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

      db.run(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduler_queue_keyword_location
        ON scheduler_queue (keyword, location)
      `);
  ```

* **Queue Population Update**:
  Modified `src/populate_queue.js` to replace the `LOCATIONS` array with the 34 target locations (excluding HCMC) and updated the query from `INSERT INTO` to `INSERT OR IGNORE INTO`.
  Verbatim modified insert logic:
  ```javascript
        const result = await run(
          `INSERT OR IGNORE INTO scheduler_queue (keyword, location, status, leads_found) 
           VALUES (?, ?, ?, 0)`,
          [keyword, location, 'pending']
        );
        if (result.changes > 0) {
          count++;
        }
  ```

* **API Safety Update**:
  Modified `/api/queue` POST endpoint in `src/server.js` to use `INSERT OR IGNORE INTO` and check if `result.changes === 0`.
  Verbatim updated code:
  ```javascript
  app.post('/api/queue', async (req, res) => {
    const { keyword, location } = req.body;
    if (!keyword || !location) return res.status(400).json({ error: 'Missing keyword or location' });
    try {
      const result = await run(
        'INSERT OR IGNORE INTO scheduler_queue (keyword, location, status, leads_found) VALUES (?, ?, ?, 0)',
        [keyword.trim(), location.trim(), 'pending']
      );
      if (result.changes === 0) {
        return res.status(400).json({ error: 'Task already exists in the queue.' });
      }
      log(`Đã thêm vào hàng đợi cào: "${keyword}" tại "${location}"`);
      res.json({ success: true, id: result.id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  ```

* **Migration Script Execution**:
  Created `src/update_queue.js` and ran `node src/update_queue.js`. The command output was:
  ```
  --- KHỞI ĐẦU TIẾN TRÌNH CẬP NHẬT HÀNG ĐỢI ---
  Đang dọn dẹp trùng lặp trong hàng đợi...
  Database connected successfully at: C:\PROJECT KANETTRAN\Timdanhsachdisan\data.db
  Đang tạo chỉ mục UNIQUE...
  Đang tạm dừng các tác vụ ngoài 34 địa phương mục tiêu...
  Đã tạm dừng 32 tác vụ.
  Đang thêm các đơn vị hành chính mới và tỉnh mục tiêu...
  Đã thêm mới thành công 0 tác vụ vào hàng đợi.
  --- HOÀN TẤT CẬP NHẬT HÀNG ĐỢI ---
  ```

* **Test Suite Execution**:
  Ran `node test_pipeline.js` successfully with output:
  ```
  --- BẮT ĐẦU CHẠY KIỂM THỬ TỰ ĐỘNG ---
  1. Đang kiểm tra bộ phân tích địa chỉ (parseAddress)...
  ...
  4. Đang kiểm tra tương tác cơ sở dữ liệu (SQLite)...
  ...
  --- TẤT CẢ CÁC BÀI KIỂM THỬ ĐÃ THÀNH CÔNG! ---
  ```

* **Queue State Verification**:
  Running `node scratch/check_queue.mjs` outputs a JSON array verifying that:
  - All old/superseded target province locations (e.g., `Phường 2, Đà Lạt, Lâm Đồng`, `Mỹ Long, Long Xuyên, An Giang`, `Long Hồ, Long Hồ, Vĩnh Long`, `Mỹ An, Tháp Mười, Đồng Tháp`) and HCMC locations are set to `'paused'`.
  - All target locations are set to `'pending'`.
  - No duplicates exist in the queue.

## 2. Logic Chain
1. Enforcing database level uniqueness via `idx_scheduler_queue_keyword_location` UNIQUE index on `(keyword, location)` guarantees that no duplicates are stored in `scheduler_queue`.
2. Utilizing `INSERT OR IGNORE` in both `populate_queue.js` and `update_queue.js` allows the application to gracefully skip duplicates instead of throwing constraint violation exceptions.
3. The POST `/api/queue` endpoint checks `result.changes === 0` to identify ignored rows and correctly returns a 400 Bad Request if the task already exists.
4. Setting status to `'paused'` for all pending tasks that do not match the 34 target locations ensures that only the new target locations are fetched by the crawler (which relies on `status = 'pending'`).

## 3. Caveats
- No caveats.

## 4. Conclusion
The database schema has been successfully updated with a unique index, the queue generation scripts have been expanded to use 34 target locations and handle conflicts gracefully, non-target/superseded tasks have been paused, and the entire test pipeline executes successfully.

## 5. Verification Method
1. **Run migration checking**:
   Verify that duplicates are ignored and new unique constraints exist:
   ```bash
   node src/update_queue.js
   ```
2. **Run test pipeline**:
   Verify the integrity of database connections, address parser, and verifying functions:
   ```bash
   node test_pipeline.js
   ```
3. **Verify queue state**:
   Check task distributions and confirm no non-target tasks are set to `'pending'`:
   ```bash
   node scratch/check_queue.mjs
   ```
