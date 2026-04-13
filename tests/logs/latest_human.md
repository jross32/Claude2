# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-13T21:57:51.295Z
**Commit:** `e01037e`
**Duration:** 4142ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 6 | 6 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | GET /api/saves → 200 + array | pass | 375ms | |
| ✅ | GET /api/saves items have expected shape | pass | 420ms | |
| ✅ | GET /api/saves/:id with unknown id → 404 + error | pass | 6ms | |
| ✅ | DELETE /api/saves/:id with unknown id → 200 + { ok: true } | pass | 5ms | |
| ✅ | [chaos] GET /api/saves/:id with empty id segment → 404 | pass | 405ms | |
| ✅ | [chaos] DELETE /api/saves/:id with special chars in id | pass | 19ms | |


