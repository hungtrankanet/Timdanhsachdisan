# BRIEFING — 2026-06-18T13:54:00+07:00

## Mission
Implement unique index on (keyword, location) for scheduler_queue, populate new 34 target locations, update endpoints to INSERT OR IGNORE, and migration script.

## 🔒 My Identity
- Archetype: teamwork_preview_worker
- Roles: implementer, qa, specialist
- Working directory: c:/PROJECT KANETTRAN/Timdanhsachdisan/.agents/teamwork_preview_worker_queue_update
- Original parent: 977f8886-db42-4f9c-86cb-78024f6180bd
- Milestone: Queue Update

## 🔒 Key Constraints
- Code ONLY network mode. No external calls.
- Every source code file must not exceed 500 lines.
- No hardcoded test results or fake implementations.
- Test changes using node test_pipeline.js and node scratch/check_queue.mjs.

## Current Parent
- Conversation ID: 977f8886-db42-4f9c-86cb-78024f6180bd
- Updated: 2026-06-18T13:54:00+07:00

## Task Summary
- **What to build**: Unique index idx_scheduler_queue_keyword_location in initDb(); update populate_queue.js with 34 target locations and INSERT OR IGNORE; update server.js `/api/queue` with INSERT OR IGNORE and changes checking; migration script `src/update_queue.js` that deduplicates, creates index, pauses HCMC/non-target, populates target locations.
- **Success criteria**: All tests pass, queue state updated correctly, migrations run successfully.
- **Interface contracts**: `c:/PROJECT KANETTRAN/Timdanhsachdisan/PROJECT.md`
- **Code layout**: JS files under `src/`

## Key Decisions Made
- Excluded Lát and Đạ Sar communes to align Đà Lạt locations exactly to 6 wards, resulting in exactly 34 target locations for the 8 provinces.
- Updated the pause query in the migration script to target all pending tasks whose locations are NOT in the new 34 target locations list, automatically and cleanly pausing HCMC as well as old/reorganized divisions.

## Artifact Index
- `c:/PROJECT KANETTRAN/Timdanhsachdisan/.agents/teamwork_preview_worker_queue_update/handoff.md` — Detailed handoff report containing verification evidence

## Change Tracker
- **Files modified**:
  - `src/database.js` — Added unique index creation in initDb()
  - `src/populate_queue.js` — Updated LOCATIONS array to 34 locations and INSERT to INSERT OR IGNORE
  - `src/server.js` — Updated app.post('/api/queue') to use INSERT OR IGNORE and handle conflicts
  - `src/update_queue.js` — Created migration script
- **Build status**: PASS
- **Pending issues**: None

## Quality Status
- **Build/test result**: PASS (test_pipeline.js passed successfully)
- **Lint status**: 0 style violations
- **Tests added/modified**: Verified all test cases via test_pipeline.js

## Loaded Skills
- None
