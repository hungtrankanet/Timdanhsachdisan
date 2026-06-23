# Synthesis of Codebase & Administrative Division Investigation

## Consensus
1. **Existing Database State**: The database `data.db` currently contains 430 tasks in `scheduler_queue` (52 completed, 2 running, 376 pending). There are no duplicate `(keyword, location)` pairs in the database.
2. **Missing Constraints**: There is currently no `UNIQUE` index or constraint on `(keyword, location)` in the database schema.
3. **Exclusivity Requirement**: Pending HCMC and non-target tasks (totaling 152 pending tasks) should be set to `paused` to exclude them from the current crawl without deleting them or modifying the main query of `scheduler.js` (which only looks for `status = 'pending'`).
4. **Duplication Prevention**:
   - Add a unique index `idx_scheduler_queue_keyword_location` on `(keyword, location)`.
   - Update `populate_queue.js` and `/api/queue` in `src/server.js` to use `INSERT OR IGNORE` or handle conflicts.

## Reconciled Administrative Division Changes (July 1st, 2025)
- **Cần Thơ**: Ninh Kiều District merged An Phú, An Nghiệp, and An Cư into **Thới Bình ward** (Resolution 1192). Merged An Hội, An Lạc, and Tân An into **Tân An ward**.
- **Lâm Đồng**: Lac Duong District merged into Da Lat City. Đà Lạt Ward 2 merged into **Ward 1**, and Ward 12 merged into **Ward 11**. Town of Lạc Dương became **Lang Biang ward**. Communes of Lạc Dương (Lát, Đạ Sar, Đa Nhim, Đạ Chais, Đưng K'Nớ) became communes under Đà Lạt.
- **An Giang**: Long Xuyên City merged Mỹ Xuyên ward into **Đông Xuyên ward**. Châu Đốc City merged Vĩnh Mỹ commune into **Châu Phú A ward**.
- **Vĩnh Long**: Vĩnh Long City merged Phường 2 into **Phường 1**, and Phường 8 into **Phường 5**. Long Hồ District merged Phú Đức commune into **Thị trấn Long Hồ**.
- **Đồng Tháp**: Cao Lãnh City merged Phường 2 into **Phường 1**. Sa Đéc City merged Phường 2 into **Phường 1**. Tháp Mười District merged Mỹ An commune into **Thị trấn Mỹ An**.
- **Cà Mau**: Cà Mau City merged Phường 2 into **Phường 1**, Phường 4 into **Phường 9**, and Phường 7 into **Phường 8**.
- **Tây Ninh**: Tây Ninh City merged Phường 2 into **Phường 1**.
- **Bình Thuận**: Phan Thiết City merged Đức Nghĩa, Đức Thắng, and Lạc Đạo into **Đức Nghĩa ward**. Merged Bình Hưng and Hưng Long into **Hưng Long ward**.

## Actionable Strategy
1. **DB Migration**: Create index on `(keyword, location)`, delete any duplicates if any (precaution), and update HCMC/non-target pending tasks to `paused`.
2. **Code Updates**:
   - Update `src/database.js` table initialization.
   - Update `src/populate_queue.js` locations list and replace `INSERT` with `INSERT OR IGNORE`.
   - Update `src/server.js` to use `INSERT OR IGNORE` for `/api/queue`.
3. **Execution & Run**:
   - Write and run the migration script `src/update_queue.js` to update the database.
   - Start the server and verify execution.
