# Project: Lacquer Art Heritage Discovery Crawler Updates

## Architecture
This project is a Node.js-based crawler using SQLite for queue and leads storage.
- `src/database.js`: SQLite connection and promisified wrapper functions.
- `src/populate_queue.js`: Fills `scheduler_queue` with search targets.
- `src/scheduler.js`: Background task loop fetching the next pending job from `scheduler_queue`, scraping Google Maps, verifying results, and sending Zalo invitations.
- `src/server.js`: Express server providing APIs and hosting the dashboard.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Investigation | Analyze existing database, queue entries, and determine the July 1st, 2025 ward/commune divisions. | None | DONE |
| 2 | DB Schema & Pause | Pause HCMC tasks, add UNIQUE index to `scheduler_queue`(keyword, location), and handle existing duplicates. | M1 | DONE |
| 3 | Queue Expansion | Add new post-July-2025 divisions to `src/populate_queue.js` and populate database safely. | M2 | DONE |
| 4 | E2E & Server Check | Run the server and check that crawler picks up tasks in priority order without errors. | M3 | DONE |

## Interface Contracts
### `src/database.js` ↔ `scheduler_queue`
- Tables: `scheduler_queue` should have a unique constraint on `(keyword, location)`.
- Existing columns: `id`, `keyword`, `location`, `status`, `leads_found`, `created_at`, `updated_at`.
