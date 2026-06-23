# Codebase and SQLite Database Analysis

This report documents the findings from the read-only investigation of the SQLite database (`data.db`), the scheduler queue, the codebase structure, and the administrative reorganizations in Vietnam as of July 1st, 2025. It proposes a concrete implementation strategy to transition the search queue to prioritize the 8 target provinces.

---

## 1. Existing Database & Codebase Investigation

### 1.1 Database Schema
The database contains three main tables defined in `src/database.js`:
- `leads`: Stores crawled and verified leads.
- `configs`: Stores system configuration key-value pairs.
- `scheduler_queue`: Stores search queries.

Upon inspecting the schema of `scheduler_queue` using `PRAGMA table_info`:
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
*Observation*: There is **no UNIQUE index** or constraint on `(keyword, location)` in the existing schema. This allows duplicate tasks to be inserted if `populate_queue.js` is run multiple times.

### 1.2 Current Queue Status Statistics
A database query was run to aggregate task status counts:
- **`completed`**: 52 tasks
- **`pending`**: 376 tasks
- **`running`**: 2 tasks
- **Total tasks in DB**: 430 tasks

Of the 376 `pending` tasks:
- **152 tasks** belong to non-target provinces (specifically Hồ Chí Minh City / HCMC).
- **224 tasks** belong to the 8 target provinces.

### 1.3 Duplication Check
A query grouping by `keyword` and `location` having count > 1 returned **zero duplicate entries** in the current database. This means the uniqueness constraint can be added safely without needing to resolve pre-existing duplicate conflicts first.

---

## 2. July 1st, 2025 Administrative Division Reorganizations

Based on the National Assembly Standing Committee resolutions regarding district/commune administrative arrangements for the 2023-2025 period (taking effect by July 1st, 2025), the following changes affect the 8 target provinces:

| Province | Old / Merged Divisions | New / Reorganized Divisions | Notes |
| :--- | :--- | :--- | :--- |
| **Cần Thơ** | Phường An Phú, Phường An Nghiệp, Phường An Cư (Ninh Kiều)<br>Phường An Hội, Phường An Lạc, Phường Tân An (Ninh Kiều) | **Phường Thới Bình** (Ninh Kiều)<br>**Phường Tân An** (Ninh Kiều) | Ninh Kiều district is reduced from 15 to 11 wards. |
| **Lâm Đồng** | Phường 1 & Phường 2 (Đà Lạt)<br>Phường 11 & Phường 12 (Đà Lạt)<br>Huyện Lạc Dương (merged into Đà Lạt city) | **Phường 1** (Đà Lạt)<br>**Phường 11** (Đà Lạt)<br>**Phường Lạc Dương** (Đà Lạt)<br>Communes: **Lát**, **Đạ Sar**, **Đa Nhim**, **Đạ Chais**, **Đưng K'Nớ** (Đà Lạt) | Đà Lạt city is expanded by absorbing Lạc Dương district. Huyện Đạ Huoai, Đạ Tẻh, and Cát Tiên merged into a new Huyện Đạ Huoai. |
| **An Giang** | Phường Mỹ Xuyên & Phường Đông Xuyên (Long Xuyên) | **Phường Đông Xuyên** (Long Xuyên) | Mỹ Xuyên ward is merged into Đông Xuyên ward. |
| **Vĩnh Long** | Phường 1 & Phường 2 (Vĩnh Long)<br>Xã Phú Đức (Long Hồ) | **Phường 1** (Vĩnh Long)<br>**Thị trấn Long Hồ** (Long Hồ) | Phường 2 merged into Phường 1. Xã Phú Đức merged into Thị trấn Long Hồ. |
| **Đồng Tháp** | Phường 1 & Phường 2 (Sa Đéc)<br>Xã Mỹ An (Tháp Mười) | **Phường 1** (Sa Đéc)<br>**Thị trấn Mỹ An** (Tháp Mười) | Phường 2 merged into Phường 1. Xã Mỹ An merged into Thị trấn Mỹ An. |
| **Cà Mau** | Phường 7 & Phường 8 (Cà Mau) | **Phường 8** (Cà Mau) | Phường 7 merged into Phường 8. |
| **Tây Ninh** | No changes | No changes | Tây Ninh did not merge any district/commune units in this period. |
| **Bình Thuận** | Phường Lạc Đạo, Đức Thắng, Đức Nghĩa (Phan Thiết)<br>Phường Bình Hưng & Hưng Long (Phan Thiết) | **Phường Đức Nghĩa** (Phan Thiết)<br>**Phường Hưng Long** (Phan Thiết) | Lạc Đạo and Đức Thắng merged into Đức Nghĩa. Bình Hưng merged into Hưng Long. |

---

## 3. Proposed Queue Locations for Target Provinces

To update `src/populate_queue.js` while incorporating the reorganizations and excluding Hồ Chí Minh City, the new list of search locations is structured as follows:

```javascript
const LOCATIONS = [
  // 1. Cần Thơ (Incorporating reorganized wards in Ninh Kiều)
  'An Khánh, Ninh Kiều, Cần Thơ',
  'Xuân Khánh, Ninh Kiều, Cần Thơ',
  'Thới Bình, Ninh Kiều, Cần Thơ', // NEW (merged An Phú, An Nghiệp, An Cư)
  'Tân An, Ninh Kiều, Cần Thơ',   // NEW (merged An Hội, An Lạc, Tân An)
  'Hưng Phú, Cái Răng, Cần Thơ',
  'An Thới, Bình Thủy, Cần Thơ',
  
  // 2. Lâm Đồng (Incorporating Đà Lạt expansion and ward mergers)
  'Phường 1, Đà Lạt, Lâm Đồng',   // Updated (merged Phường 1 & 2)
  'Phường 9, Đà Lạt, Lâm Đồng',
  'Phường 11, Đà Lạt, Lâm Đồng',  // NEW (merged Phường 11 & 12)
  'Phường Lạc Dương, Đà Lạt, Lâm Đồng', // NEW (from Lạc Dương district merger)
  'Lát, Đà Lạt, Lâm Đồng',        // NEW (commune added to Đà Lạt)
  'Đạ Sar, Đà Lạt, Lâm Đồng',      // NEW (commune added to Đà Lạt)
  'Liên Nghĩa, Đức Trọng, Lâm Đồng',
  'Phường 1, Bảo Lộc, Lâm Đồng',
  
  // 3. An Giang (Incorporating Long Xuyên ward merger)
  'Mỹ Bình, Long Xuyên, An Giang',
  'Mỹ Long, Long Xuyên, An Giang',
  'Đông Xuyên, Long Xuyên, An Giang', // NEW (merged Đông Xuyên & Mỹ Xuyên)
  'Châu Phú A, Châu Đốc, An Giang',
  'Thị trấn Núi Sập, Thoại Sơn, An Giang',
  
  // 4. Vĩnh Long (Incorporating ward merger and expansion)
  'Phường 1, Vĩnh Long',          // Updated (merged Phường 1 & 2)
  'Phường 4, Vĩnh Long',
  'Thị trấn Long Hồ, Long Hồ, Vĩnh Long', // Updated (merged with Phú Đức)
  
  // 5. Đồng Tháp (Incorporating Sa Đéc ward merger and Tháp Mười renaming)
  'Phường 1, Cao Lãnh, Đồng Tháp',
  'Phường 1, Sa Đéc, Đồng Tháp',  // Updated (merged Phường 1 & 2)
  'Thị trấn Mỹ An, Tháp Mười, Đồng Tháp', // Updated (from Xã Mỹ An merger)
  
  // 6. Cà Mau (Incorporating Cà Mau city ward merger)
  'Phường 5, Cà Mau',
  'Phường 9, Cà Mau',
  'Phường 8, Cà Mau',             // NEW (merged Phường 7 & 8)
  'Sông Đốc, Trần Văn Thời, Cà Mau',
  
  // 7. Tây Ninh (No administrative changes)
  'Phường 1, Tây Ninh',
  'Phường 3, Tây Ninh',
  'Trảng Bàng, Trảng Bàng, Tây Ninh',
  
  // 8. Bình Thuận (Incorporating Phan Thiết ward mergers)
  'Mũi Né, Phan Thiết, Bình Thuận',
  'Phú Thủy, Phan Thiết, Bình Thuận',
  'Phường Đức Nghĩa, Phan Thiết, Bình Thuận', // NEW (merged Lạc Đạo, Đức Thắng, Đức Nghĩa)
  'Phường Hưng Long, Phan Thiết, Bình Thuận', // NEW (merged Bình Hưng, Hưng Long)
  'La Gi, La Gi, Bình Thuận'
];
```

---

## 4. Concrete Implementation Strategy

### Phase 1: Database Migration Script
To enforce uniqueness, a migration script should run the following commands:
1. Ensure the UNIQUE index is created on `scheduler_queue (keyword, location)`.
2. Update existing pending tasks to 'paused' if their location doesn't match the 8 target provinces.

**Proposed Script (`src/migrations/update_schema_and_pause.js`):**
```javascript
import { run } from '../database.js';

async function migrate() {
  console.log('Starting migration: unique index & pause non-target tasks...');
  
  // 1. Create unique index
  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduler_queue_keyword_location 
    ON scheduler_queue (keyword, location)
  `);
  console.log('Unique index on (keyword, location) verified/created.');

  // 2. Pause non-target pending tasks
  const targetProvinces = [
    'Cần Thơ', 'Lâm Đồng', 'An Giang', 'Vĩnh Long', 
    'Đồng Tháp', 'Cà Mau', 'Tây Ninh', 'Bình Thuận'
  ];
  const conditions = targetProvinces.map(p => `location NOT LIKE '%${p}%'`).join(' AND ');
  
  const result = await run(`
    UPDATE scheduler_queue 
    SET status = 'paused', updated_at = CURRENT_TIMESTAMP 
    WHERE status = 'pending' AND (${conditions})
  `);
  
  console.log(`Paused ${result.changes} non-target pending tasks (e.g. HCMC).`);
}

migrate().catch(console.error);
```

### Phase 2: Updating the Queue Generator Script
Modify `src/populate_queue.js`:
1. Replace `LOCATIONS` with the updated list of 34 target locations (excluding HCMC).
2. Change the SQL statement from `INSERT INTO` to `INSERT OR IGNORE INTO` to prevent crashes when attempting to insert duplicate keys.

**Proposed Change in `src/populate_queue.js` (lines 96-100):**
```javascript
        await run(
          `INSERT OR IGNORE INTO scheduler_queue (keyword, location, status, leads_found) 
           VALUES (?, ?, ?, 0)`,
          [keyword, location, 'pending']
        );
```

### Phase 3: Update `src/database.js` Initialization
Add the unique index creation to `initDb()` to ensure that fresh database environments are automatically set up with the constraint.

**Proposed Change in `src/database.js` (inside `initDb`):**
```javascript
    db.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduler_queue_keyword_location 
      ON scheduler_queue (keyword, location)
    `);
```

### Phase 4: API Safety Update
Update the API endpoint `/api/queue` in `src/server.js` to catch errors gracefully if the unique constraint is violated.

**Proposed Change in `src/server.js` (inside `app.post('/api/queue')`):**
```javascript
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
```
