# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T19:27:02.860Z
**Commit:** `b96cdf5`
**Duration:** 7944ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | GET /api/schedules → 200 + array | pass | 36ms | |
| ✅ | POST /api/schedules with valid data → 200 + { id, message } | pass | 49ms | |
| ✅ | GET /api/schedules after create → contains new schedule | pass | 5ms | |
| ✅ | DELETE /api/schedules/:id for existing → 200 + message | pass | 7ms | |
| ✅ | GET /api/schedules after delete → schedule is gone | pass | 3ms | |
| ✅ | DELETE /api/schedules/:id for unknown → 404 | pass | 4ms | |
| ✅ | [chaos] POST /api/schedules with no cronExpr → 400 | pass | 5ms | |
| ✅ | [chaos] POST /api/schedules with no scrapeOptions → 400 | pass | 5ms | |
| ✅ | [chaos] POST /api/schedules with invalid cron → 400 | pass | 4ms | |


