# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T14:30:53.372Z
**Commit:** `e0602b7`
**Duration:** 7188ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | GET /api/schedules → 200 + array | pass | 18ms | |
| ✅ | POST /api/schedules with valid data → 200 + { id, message } | pass | 26ms | |
| ✅ | GET /api/schedules after create → contains new schedule | pass | 4ms | |
| ✅ | DELETE /api/schedules/:id for existing → 200 + message | pass | 4ms | |
| ✅ | GET /api/schedules after delete → schedule is gone | pass | 3ms | |
| ✅ | DELETE /api/schedules/:id for unknown → 404 | pass | 3ms | |
| ✅ | [chaos] POST /api/schedules with no cronExpr → 400 | pass | 2ms | |
| ✅ | [chaos] POST /api/schedules with no scrapeOptions → 400 | pass | 3ms | |
| ✅ | [chaos] POST /api/schedules with invalid cron → 400 | pass | 3ms | |


