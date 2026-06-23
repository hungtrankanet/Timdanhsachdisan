# Project Plan: prioritize target provinces and expand ward/commune coverage to 2025 divisions

This plan details the steps required to implement the requirements outlined in ORIGINAL_REQUEST.md.

## Steps

### Step 1: Code and Database Investigation
- **Objective**: Identify where and how locations are stored, the exact schema of `scheduler_queue`, and whether there are any existing database constraints or scripts for administrative divisions.
- **Verification Method**: Run SQL queries on `data.db` to inspect the `scheduler_queue` schema, existing location values, and any duplicates.
- **Assigned to**: `teamwork_preview_explorer`

### Step 2: Formulate July 1st, 2025 Administrative Divisions
- **Objective**: Find or verify the new ward/commune divisions for the 8 target provinces (Cần Thơ, Lâm Đồng, An Giang, Vĩnh Long, Đồng Tháp, Cà Mau, Tây Ninh, Bình Thuận) implemented on July 1st, 2025.
- **Verification Method**: Inspect the list of new wards/communes and cross-reference with known official 2025 administrative division documents or lookups.
- **Assigned to**: `teamwork_preview_explorer`

### Step 3: Implement Database Queue Logic and Schema Updates
- **Objective**:
  1. Add a unique index/constraint to `scheduler_queue` on `(keyword, location)` to prevent duplicates.
  2. Implement a database migration or update script to pause existing HCMC and other non-target pending tasks (set status to 'paused').
  3. Ensure only tasks matching the 8 target provinces are set to `pending`.
- **Verification Method**: Run the update script and check that all non-target pending tasks in `scheduler_queue` are updated to 'paused', and that the unique constraint prevents duplicate `(keyword, location)` insertions.
- **Assigned to**: `teamwork_preview_worker`

### Step 4: Expand Ward/Commune Coverage in Queue Generator
- **Objective**: Update `src/populate_queue.js` to include the post-July-2025 wards/communes for the 8 target provinces and use duplicate-preventing inserts (e.g., `INSERT OR IGNORE` or checking for existing rows).
- **Verification Method**: Run the queue generator script and verify that the database table `scheduler_queue` is populated with the new locations and keywords, without duplicates.
- **Assigned to**: `teamwork_preview_worker`

### Step 5: Verify Scheduler Execution
- **Objective**: Ensure the local scheduler server is running and picks up target province tasks in priority order.
- **Verification Method**: Run the server and check the logs to confirm the scheduler processes tasks for target provinces in the correct status and priority order.
- **Assigned to**: `teamwork_preview_reviewer` and `teamwork_preview_challenger`
