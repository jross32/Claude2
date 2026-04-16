# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-16T11:02:45.892Z
**Commit:** `060c823`
**Duration:** 5022ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | GET /api/schedules → 200 + array | pass | 46ms | |
| ✅ | POST /api/schedules with valid data → 200 + { id, message } | pass | 89ms | |
| ✅ | GET /api/schedules after create → contains new schedule | pass | 4ms | |
| ✅ | DELETE /api/schedules/:id for existing → 200 + message | pass | 6ms | |
| ✅ | GET /api/schedules after delete → schedule is gone | pass | 4ms | |
| ✅ | DELETE /api/schedules/:id for unknown → 404 | pass | 4ms | |
| ✅ | [chaos] POST /api/schedules with no cronExpr → 400 | pass | 5ms | |
| ✅ | [chaos] POST /api/schedules with no scrapeOptions → 400 | pass | 5ms | |
| ✅ | [chaos] POST /api/schedules with invalid cron → 400 | pass | 6ms | |


