# Codebase and Database Investigation Analysis

This document presents the findings from the investigation of the crawler's codebase and the SQLite database (`data.db`) regarding the prioritization of the 8 target provinces and the expansion of search queries to include the new July 1st, 2025 administrative division reorganizations.

---

## 1. Codebase & Database Analysis

### 1.1 Table Schemas & Configs
The SQLite database contains the following tables:
- `leads`: Stores crawled and verified artisan leads.
- `configs`: Key-value configurations (e.g., `scheduler_status`, `current_task`, `sheets_web_app_url`).
- `scheduler_queue`: Contains search queries mapped to locations.

The schema for `scheduler_queue` is defined in `src/database.js` as:
```sql
CREATE TABLE scheduler_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  location TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  leads_found INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### 1.2 Current State of `scheduler_queue`
- **Total entries**: 430
- **Completed**: 52
- **Running**: 2
- **Pending**: 376
  - Target Provinces Pending: 224
  - Non-Target Pending (HCMC): 152
- **Indexes**: None.
- **Duplicates Check**: Running a duplicate checking script on `(keyword, location)` returned **0 duplicates**.

---

## 2. July 1st, 2025 Administrative Division Reorganizations

Following the official resolutions on rearranging administrative divisions in Vietnam for the 2023-2025 period, we have identified the new reorganized wards, communes, and districts for the 8 target provinces:

### 2.1 Cần Thơ (Resolution 1193/NQ-UBTVQH15)
- **Ninh Kiều District**:
  - `Thới Bình, Ninh Kiều, Cần Thơ` (Merged An Phú, An Nghiệp, An Cư, and Thới Bình wards).
  - `Tân An, Ninh Kiều, Cần Thơ` (Merged An Hội, An Lạc, and Tân An wards).

### 2.2 Lâm Đồng (Resolution 1245/NQ-UBTVQH15)
- **Đà Lạt City** (Expanded to include Lạc Dương District):
  - `Phường 1, Đà Lạt, Lâm Đồng` (Merged Phường 2 into Phường 1).
  - `Phường 11, Đà Lạt, Lâm Đồng` (Merged Phường 12 into Phường 11).
  - `Phường Lạc Dương, Đà Lạt, Lâm Đồng` (Upgraded from Lạc Dương township).
  - Communes: `Lát, Đà Lạt, Lâm Đồng`, `Đạ Sar, Đà Lạt, Lâm Đồng`, `Đạ Nhim, Đà Lạt, Lâm Đồng`, `Đạ Chais, Đà Lạt, Lâm Đồng`, `Đưng K'Nớ, Đà Lạt, Lâm Đồng`.
- **Đạ Huoai District** (Merged Cát Tiên, Đạ Tẻh, and Đạ Huoai districts):
  - `Thị trấn Đạ Tẻh, Đạ Huoai, Lâm Đồng`
  - `Thị trấn Cát Tiên, Đạ Huoai, Lâm Đồng`
  - `Thị trấn Đạ M'ri, Đạ Huoai, Lâm Đồng`

### 2.3 An Giang (Resolution 1247/NQ-UBTVQH15)
- **Long Xuyên City**:
  - `Phường Đông Xuyên, Long Xuyên, An Giang` (Merged Phường Mỹ Xuyên and Phường Đông Xuyên).
  - `Phường Mỹ Bình, Long Xuyên, An Giang` (Merged Phường Mỹ Long and Phường Mỹ Bình).

### 2.4 Vĩnh Long
- **Vĩnh Long City**:
  - `Phường 1, Vĩnh Long` (Merged Phường 2 into Phường 1).
- **Long Hồ District**:
  - `Thị trấn Long Hồ, Long Hồ, Vĩnh Long` (Merged Phú Đức commune into Long Hồ township).

### 2.5 Đồng Tháp
- **Cao Lãnh City**:
  - `Phường 1, Cao Lãnh, Đồng Tháp` (Merged Phường 2 into Phường 1).
- **Sa Đéc City**:
  - `Phường 1, Sa Đéc, Đồng Tháp` (Merged Phường 3 into Phường 1).
  - `Phường 2, Sa Đéc, Đồng Tháp` (Merged Phường 4 into Phường 2).

### 2.6 Cà Mau
- **Cà Mau City**:
  - `Phường 2, Cà Mau` (Merged Phường 4 into Phường 2).
  - `Phường 8, Cà Mau` (Merged Phường 9 into Phường 8).

### 2.7 Tây Ninh
- **Tây Ninh City**:
  - `Phường 1, Tây Ninh` (Merged Phường 2 into Phường 1).

### 2.8 Bình Thuận (Resolution 1248/NQ-UBTVQH15)
- **Phan Thiết City**:
  - `Phường Lạc Đạo, Phan Thiết, Bình Thuận` (Merged Phường Đức Thắng, Phường Đức Nghĩa, and Phường Lạc Đạo).
  - `Phường Hưng Long, Phan Thiết, Bình Thuận` (Merged Phường Bình Hưng and Phường Hưng Long).
  - `Phường Đức Long, Phan Thiết, Bình Thuận` (Merged Tiến Lợi commune into Phường Đức Long).

---

## 3. Implementation Strategy

To successfully apply the requirements, the following steps are proposed for the implementer subagent.

### 3.1 Step 1: Pause Non-Target Pending Tasks
Execute a SQL script to pause all existing `pending` tasks that do not match the 8 target provinces.
```sql
UPDATE scheduler_queue
SET status = 'paused'
WHERE status = 'pending'
  AND location NOT LIKE '%Cần Thơ'
  AND location NOT LIKE '%Lâm Đồng'
  AND location NOT LIKE '%An Giang'
  AND location NOT LIKE '%Vĩnh Long'
  AND location NOT LIKE '%Đồng Tháp'
  AND location NOT LIKE '%Cà Mau'
  AND location NOT LIKE '%Tây Ninh'
  AND location NOT LIKE '%Bình Thuận';
```

### 3.2 Step 2: Prevent Duplicate Queue Entries
To enforce deduplication at the database level, add a UNIQUE constraint. Since we verified that no duplicates currently exist, we can apply:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduler_queue_keyword_location 
ON scheduler_queue (keyword, location);
```

Update `src/database.js` in `initDb()`:
```javascript
// Add unique index on scheduler_queue
db.run(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduler_queue_keyword_location 
  ON scheduler_queue(keyword, location)
`);
```

### 3.3 Step 3: Expand Ward/Commune Coverage in `src/populate_queue.js`
Update `src/populate_queue.js` to:
1. Replace old wards/districts with the new July 1st, 2025 divisions.
2. Use `INSERT OR IGNORE INTO` instead of `INSERT INTO` to safely skip duplicates.

#### Proposed changes to `src/populate_queue.js`:
- In `LOCATIONS` array, replace:
  - `'Phường 1, Vĩnh Long'` and `'Phường 4, Vĩnh Long'` with `'Phường 1, Vĩnh Long'` and `'Thị trấn Long Hồ, Long Hồ, Vĩnh Long'`.
  - `'Phường 1, Cao Lãnh, Đồng Tháp'`, `'Phường 1, Sa Đéc, Đồng Tháp'` with new merged wards for Cao Lãnh and Sa Đéc.
  - Add Lạc Dương district wards/communes under Lâm Đồng.
  - Add new merged wards in Ninh Kiều, Cần Thơ (`Thới Bình, Ninh Kiều, Cần Thơ`, `Tân An, Ninh Kiều, Cần Thơ`).
  - Update merged wards for Long Xuyên, Cà Mau, Tây Ninh, Phan Thiết.
- In `populate()` function:
```javascript
// BEFORE
await run(
  `INSERT INTO scheduler_queue (keyword, location, status, leads_found) 
   VALUES (?, ?, ?, 0)`,
  [keyword, location, 'pending']
);

// AFTER
await run(
  `INSERT OR IGNORE INTO scheduler_queue (keyword, location, status, leads_found) 
   VALUES (?, ?, ?, 0)`,
  [keyword, location, 'pending']
);
```

---

## 4. Verification Method

To verify the changes after implementation:
1. **Pause Check**: Run `SELECT count(*) FROM scheduler_queue WHERE status = 'pending' AND location LIKE '%Hồ Chí Minh'` to ensure it returns 0.
2. **Unique Index Check**: Try inserting a duplicate `(keyword, location)` row; it should fail or ignore.
3. **Queue Generation**: Run `node src/populate_queue.js` and verify that the target province queue is expanded without throwing errors or adding duplicates.
