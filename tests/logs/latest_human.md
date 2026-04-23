# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-23T22:38:01.794Z
**Commit:** `40eb37a`
**Duration:** 5873ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | GET /api/schedules → 200 + array | pass | 11ms | |
| ✅ | POST /api/schedules with valid data → 200 + { id, message } | pass | 31ms | |
| ✅ | GET /api/schedules after create → contains new schedule | pass | 5ms | |
| ✅ | DELETE /api/schedules/:id for existing → 200 + message | pass | 5ms | |
| ✅ | GET /api/schedules after delete → schedule is gone | pass | 3ms | |
| ✅ | DELETE /api/schedules/:id for unknown → 404 | pass | 4ms | |
| ✅ | [chaos] POST /api/schedules with no cronExpr → 400 | pass | 3ms | |
| ✅ | [chaos] POST /api/schedules with no scrapeOptions → 400 | pass | 4ms | |
| ✅ | [chaos] POST /api/schedules with invalid cron → 400 | pass | 3ms | |


