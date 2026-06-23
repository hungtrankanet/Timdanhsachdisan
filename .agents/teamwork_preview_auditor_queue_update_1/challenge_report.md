# Challenge Report

## Challenge Summary

**Overall risk assessment**: LOW

## Challenges

### [Low] Challenge 1: Single Non-Target Task Remaining in Running State

- **Assumption challenged**: That pausing all non-target tasks would pause everything that was active.
- **Attack scenario**: A non-target task with status `'running'` (ID 50, location `'Phường 5, Quận 3, Hồ Chí Minh'`) remains in the database in `'running'` status because the migration only targeting `status = 'pending'`. If the crawler starts and checks this task, it might resume processing it.
- **Blast radius**: Minimal, since the worker starts new tasks by querying for `status = 'pending'`, and any pre-existing `'running'` task is either considered abandoned or already completed. In our case, the current implementation selects:
  `SELECT * FROM scheduler_queue WHERE status = "pending" ORDER BY id ASC LIMIT 1`
  which ignores any `'running'` task when picking the next job. Thus, it poses no danger of executing new HCMC tasks.
- **Mitigation**: An additional migration could set `'running'` non-target tasks to `'paused'` or `'completed'` if needed, but since it is not `'pending'`, it doesn't violate the specific requirement.

## Stress Test Results

- **Run migration check** → Ensures unique index prevents duplicate keyword-location pairs → Attempting to insert duplicate manually throws UNIQUE constraint error → **PASS**
- **Test pipeline run** → Checks all verifier and scraper routines under test inputs → Runs successfully and validates database queries → **PASS**

## Unchallenged Areas

- **Live Crawler Rate Limits** — We did not perform live crawling of 50 leads to avoid hitting actual Google Maps rate limits or blockages during testing, relying on the test suite's mock-free local operations.
