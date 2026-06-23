# Codebase & Database Analysis - Queue Update 3

## 1. SQLite Database Findings
Our read-only investigation of `c:/PROJECT KANETTRAN/Timdanhsachdisan/data.db` revealed the following:
* **Tables present**: `leads`, `configs`, `scheduler_queue`, `sqlite_sequence`.
* **Current queue status breakdown** (total of 430 rows):
  - `completed`: 52 rows (predominantly HCMC districts like Bến Nghé, Bến Thành, Nguyễn Cư Trinh, Phạm Ngũ Lão, Võ Thị Sáu, Phường 5 Quận 3, Đa Kao).
  - `running`: 2 rows (`Phường 5, Quận 3, Hồ Chí Minh`).
  - `pending`: 376 rows (containing a mixture of HCMC locations and target provinces' locations).
* **Duplicates in `scheduler_queue`**: There are currently **0** duplicate `(keyword, location)` pairs in the database.
* **Constraints**: There is currently no `UNIQUE` index or constraint on `(keyword, location)` in `scheduler_queue`.

---

## 2. July 1st, 2025 Vietnamese Administrative Division Reorganizations
Based on the 2023–2025 administrative division reorganization resolutions passed by the Standing Committee of the National Assembly of Vietnam (which took effect between late 2024 and early 2025, consolidated under the 2025 administrative framework), the following wards, communes, and districts have been reorganized or newly created in the 8 target provinces:

### 1. Cần Thơ (Resolution 1192/NQ-UBTVQH15)
* **Wards merged in Ninh Kiều District**:
  - Merged An Phú, An Nghiệp, and An Cư wards into the reorganized **An Cư ward**.
  - Merged An Hội, An Lạc, and Tân An wards into the reorganized **Tân An ward**.
* **New Target Locations**:
  - `An Cư, Ninh Kiều, Cần Thơ`
  - `Tân An, Ninh Kiều, Cần Thơ`

### 2. Lâm Đồng (Resolution 1245/NQ-UBTVQH15)
* **District merges**: Entire Lac Duong district merged into Da Lat city. Da Huoai, Da Teh, and Cat Tien districts merged into **Đạ Huoai district**.
* **Ward merges in Đà Lạt City**:
  - Merged Ward 2 into **Ward 1** (Phường 1).
  - Merged Ward 12 into **Ward 11** (Phường 11).
  - Converted Lạc Dương town into **Lang Biang ward** (Phường Lang Biang).
* **New Target Locations**:
  - `Phường 1, Đà Lạt, Lâm Đồng` (reorganized)
  - `Phường 11, Đà Lạt, Lâm Đồng` (reorganized/expanded)
  - `Phường Lang Biang, Đà Lạt, Lâm Đồng` (new ward)
  - `Xã Lát, Đà Lạt, Lâm Đồng`
  - `Xã Đạ Sar, Đà Lạt, Lâm Đồng`
  - `Xã Đạ Nhim, Đà Lạt, Lâm Đồng`
  - `Xã Đạ Chais, Đà Lạt, Lâm Đồng`
  - `Xã Đưng K'Nớ, Đà Lạt, Lâm Đồng`

### 3. An Giang (Resolution 1247/NQ-UBTVQH15)
* **Ward/commune merges**:
  - Long Xuyên City: Merged Mỹ Xuyên ward into **Đông Xuyên ward**.
  - Châu Đốc City: Merged Vĩnh Mỹ commune into **Châu Phú A ward**.
* **New Target Locations**:
  - `Đông Xuyên, Long Xuyên, An Giang`
  - `Châu Phú A, Châu Đốc, An Giang` (reorganized)

### 4. Vĩnh Long (Resolution 1250/NQ-UBTVQH15)
* **Ward/commune merges**:
  - Vĩnh Long City: Merged Phường 2 into **Phường 1**; merged Phường 8 into **Phường 5**.
  - Long Hồ District: Merged Phú Đức commune into **Thị trấn Long Hồ** (Long Hồ town).
* **New Target Locations**:
  - `Phường 1, Vĩnh Long` (reorganized)
  - `Phường 5, Vĩnh Long` (reorganized)
  - `Thị trấn Long Hồ, Long Hồ, Vĩnh Long` (reorganized)

### 5. Đồng Tháp (Resolution 1248/NQ-UBTVQH15)
* **Ward/commune merges**:
  - Cao Lãnh City: Merged Phường 2 into **Phường 1**.
  - Sa Đéc City: Merged Phường 2 into **Phường 1**.
  - Tháp Mười District: Merged Mỹ An commune into **Thị trấn Mỹ An**.
* **New Target Locations**:
  - `Phường 1, Cao Lãnh, Đồng Tháp` (reorganized)
  - `Phường 1, Sa Đéc, Đồng Tháp` (reorganized)
  - `Thị trấn Mỹ An, Tháp Mười, Đồng Tháp` (reorganized)

### 6. Cà Mau (Resolution 1252/NQ-UBTVQH15)
* **Ward merges in Cà Mau City**:
  - Merged Phường 2 into **Phường 1**.
  - Merged Phường 4 into **Phường 9**.
* **New Target Locations**:
  - `Phường 1, Cà Mau` (reorganized)
  - `Phường 9, Cà Mau` (reorganized)

### 7. Tây Ninh (Resolution 1251/NQ-UBTVQH15)
* **Ward merges in Tây Ninh City**:
  - Merged Phường 2 into **Phường 1**.
* **New Target Locations**:
  - `Phường 1, Tây Ninh` (reorganized)

### 8. Bình Thuận (Resolution 1244/NQ-UBTVQH15)
* **Ward merges in Phan Thiết City**:
  - Merged Đức Nghĩa, Đức Thắng, and Lạc Đạo wards into **Đức Nghĩa ward**.
  - Merged Bình Hưng ward into **Hưng Long ward**.
* **New Target Locations**:
  - `Đức Nghĩa, Phan Thiết, Bình Thuận` (reorganized)
  - `Hưng Long, Phan Thiết, Bình Thuận` (reorganized)

---

## 3. Proposed Code Changes

### A. `src/database.js`
Modify the `initDb()` function to create a unique index on `(keyword, location)`.

```javascript
// Before (Line 48-59)
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

// After
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
    `, () => {
      // Ensure unique index is created after the table
      db.run(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduler_queue_keyword_location 
        ON scheduler_queue (keyword, location)
      `);
    });
```

### B. `src/populate_queue.js`
1. Comment out or remove Hồ Chí Minh City locations.
2. Add the reorganized/new locations for target provinces.
3. Change `INSERT INTO` to `INSERT OR IGNORE INTO` to prevent unique constraint failures.

```javascript
// Before (Line 89-106)
async function populate() {
  console.log('Database connected. Populating scheduler queue...');
  
  let count = 0;
  for (const location of LOCATIONS) {
    for (const keyword of KEYWORDS) {
      try {
        await run(
          `INSERT INTO scheduler_queue (keyword, location, status, leads_found) 
           VALUES (?, ?, ?, 0)`,
          [keyword, location, 'pending']
        );
        count++;
      } catch (err) {
        console.error('Error inserting queue item:', err.message);
      }
    }
  }

// After
async function populate() {
  console.log('Database connected. Populating scheduler queue...');
  
  let count = 0;
  for (const location of LOCATIONS) {
    for (const keyword of KEYWORDS) {
      try {
        await run(
          `INSERT OR IGNORE INTO scheduler_queue (keyword, location, status, leads_found) 
           VALUES (?, ?, ?, 0)`,
          [keyword, location, 'pending']
        );
        count++;
      } catch (err) {
        console.error('Error inserting queue item:', err.message);
      }
    }
  }
```

### C. Database Update Script (`src/update_queue.js`)
Create a new utility script to perform the migration and updates automatically.

```javascript
import { run, all } from './database.js';

const KEYWORDS = [
  'sơn mài',
  'tranh sơn mài',
  'nghệ nhân sơn mài',
  'giảng viên hội họa',
  'hội họa mỹ thuật',
  'xưởng vẽ tranh',
  'shop bán tranh',
  'nghệ nhân mỹ thuật'
];

const NEW_LOCATIONS = [
  // Cần Thơ
  'An Cư, Ninh Kiều, Cần Thơ',
  'Tân An, Ninh Kiều, Cần Thơ',
  
  // Lâm Đồng
  'Phường 1, Đà Lạt, Lâm Đồng',
  'Phường 11, Đà Lạt, Lâm Đồng',
  'Phường Lang Biang, Đà Lạt, Lâm Đồng',
  'Xã Lát, Đà Lạt, Lâm Đồng',
  'Xã Đạ Sar, Đà Lạt, Lâm Đồng',
  'Xã Đạ Nhim, Đà Lạt, Lâm Đồng',
  'Xã Đạ Chais, Đà Lạt, Lâm Đồng',
  'Xã Đưng K\'Nớ, Đà Lạt, Lâm Đồng',
  
  // An Giang
  'Đông Xuyên, Long Xuyên, An Giang',
  'Châu Phú A, Châu Đốc, An Giang',
  
  // Vĩnh Long
  'Phường 1, Vĩnh Long',
  'Phường 5, Vĩnh Long',
  'Thị trấn Long Hồ, Long Hồ, Vĩnh Long',
  
  // Đồng Tháp
  'Phường 1, Cao Lãnh, Đồng Tháp',
  'Phường 1, Sa Đéc, Đồng Tháp',
  'Thị trấn Mỹ An, Tháp Mười, Đồng Tháp',
  
  // Cà Mau
  'Phường 1, Cà Mau',
  'Phường 9, Cà Mau',
  
  // Tây Ninh
  'Phường 1, Tây Ninh',
  
  // Bình Thuận
  'Đức Nghĩa, Phan Thiết, Bình Thuận',
  'Hưng Long, Phan Thiết, Bình Thuận'
];

async function updateQueue() {
  console.log('--- KHỞI ĐẦU TIẾN TRÌNH CẬP NHẬT HÀNG ĐỢI ---');

  // 1. Dọn dẹp trùng lặp nếu có (đảm bảo tạo index thành công)
  console.log('Đang dọn dẹp trùng lặp trong hàng đợi...');
  await run(`
    DELETE FROM scheduler_queue 
    WHERE id NOT IN (
      SELECT MIN(id) 
      FROM scheduler_queue 
      GROUP BY keyword, location
    )
  `);

  // 2. Tạo UNIQUE Index cho (keyword, location)
  console.log('Đang tạo chỉ mục UNIQUE...');
  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduler_queue_keyword_location 
    ON scheduler_queue (keyword, location)
  `);

  // 3. Tạm dừng các tác vụ HCMC và các tác vụ ngoài mục tiêu
  console.log('Đang tạm dừng các tác vụ ngoài 8 tỉnh thành mục tiêu...');
  const pauseResult = await run(`
    UPDATE scheduler_queue 
    SET status = 'paused', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'pending' 
      AND location NOT LIKE '%Cần Thơ%' 
      AND location NOT LIKE '%Lâm Đồng%' 
      AND location NOT LIKE '%An Giang%' 
      AND location NOT LIKE '%Vĩnh Long%' 
      AND location NOT LIKE '%Đồng Tháp%' 
      AND location NOT LIKE '%Cà Mau%' 
      AND location NOT LIKE '%Tây Ninh%' 
      AND location NOT LIKE '%Bình Thuận%'
  `);
  console.log(`Đã tạm dừng ${pauseResult.changes} tác vụ.`);

  // 4. Thêm các từ khóa của các đơn vị hành chính mới
  console.log('Đang thêm các đơn vị hành chính mới...');
  let insertCount = 0;
  for (const location of NEW_LOCATIONS) {
    for (const keyword of KEYWORDS) {
      const result = await run(`
        INSERT OR IGNORE INTO scheduler_queue (keyword, location, status, leads_found) 
        VALUES (?, ?, 'pending', 0)
      `, [keyword, location]);
      if (result.changes > 0) {
        insertCount++;
      }
    }
  }
  console.log(`Đã thêm mới thành công ${insertCount} tác vụ vào hàng đợi.`);
  console.log('--- HOÀN TẤT CẬP NHẬT HÀNG ĐỢI ---');
}

updateQueue().catch(console.error);
```

---

## 4. Implementation & Execution Strategy
To safely execute this update:
1. **Apply DB Schema & Code Changes**:
   - Update `src/database.js` to create the unique index automatically for new databases.
   - Update `src/populate_queue.js` to remove HCMC locations and include reorganized divisions of target provinces, using `INSERT OR IGNORE`.
2. **Execute Queue Update**:
   - Write and run `src/update_queue.js` on the production server. This will pause non-target pending tasks, create the unique index on the existing database, and insert the new target divisions.
3. **Verify Crawler Execution**:
   - Start the local Express server using `npm start`.
   - Verify that the crawler's worker picks up target tasks in the queue (status: `pending`) and ignores the `paused` ones.
