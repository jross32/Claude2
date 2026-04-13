# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-13T22:27:58.300Z
**Commit:** `e3987aa`
**Duration:** 3520ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 6 | 6 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | GET /api/saves → 200 + array | pass | 383ms | |
| ✅ | GET /api/saves items have expected shape | pass | 333ms | |
| ✅ | GET /api/saves/:id with unknown id → 404 + error | pass | 5ms | |
| ✅ | DELETE /api/saves/:id with unknown id → 200 + { ok: true } | pass | 5ms | |
| ✅ | [chaos] GET /api/saves/:id with empty id segment → 404 | pass | 306ms | |
| ✅ | [chaos] DELETE /api/saves/:id with special chars in id | pass | 2ms | |


