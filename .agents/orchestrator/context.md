# Project Context

## Target Provinces
The 8 target provinces are:
- Cần Thơ
- Lâm Đồng
- An Giang
- Vĩnh Long
- Đồng Tháp
- Cà Mau
- Tây Ninh
- Bình Thuận

## Environment and Paths
- **Project Root**: `c:/PROJECT KANETTRAN/Timdanhsachdisan`
- **Database File**: `c:/PROJECT KANETTRAN/Timdanhsachdisan/data.db`
- **Node Paths**: `node` directory contains node.exe and other tooling locally.
- **Port**: 3000

## Database Schema Highlights
- `leads` table: Stores crawled and verified leads.
- `scheduler_queue` table:
  - `id` (INTEGER, PK)
  - `keyword` (TEXT)
  - `location` (TEXT)
  - `status` (TEXT, default: 'pending')
  - `leads_found` (INTEGER, default: 0)
- `configs` table: Key-value configuration storage.

## Target Constraints
- No duplicate `(keyword, location)` pairs in `scheduler_queue`.
- All non-target pending tasks (e.g., HCMC) set to `paused` (or `deferred`).
- Local scheduler server picks up target province tasks.
