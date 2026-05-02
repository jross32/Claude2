# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-05-02T04:11:25.982Z
**Commit:** `afa3cc3`
**Duration:** 8073ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | GET /api/schedules → 200 + array | pass | 32ms | |
| ✅ | POST /api/schedules with valid data → 200 + { id, message } | pass | 48ms | |
| ✅ | GET /api/schedules after create → contains new schedule | pass | 6ms | |
| ✅ | DELETE /api/schedules/:id for existing → 200 + message | pass | 10ms | |
| ✅ | GET /api/schedules after delete → schedule is gone | pass | 4ms | |
| ✅ | DELETE /api/schedules/:id for unknown → 404 | pass | 4ms | |
| ✅ | [chaos] POST /api/schedules with no cronExpr → 400 | pass | 5ms | |
| ✅ | [chaos] POST /api/schedules with no scrapeOptions → 400 | pass | 5ms | |
| ✅ | [chaos] POST /api/schedules with invalid cron → 400 | pass | 6ms | |


