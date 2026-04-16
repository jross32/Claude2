# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-16T05:20:59.907Z
**Commit:** `f8e7b73`
**Duration:** 12556ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 6 | 6 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | GET /api/saves → 200 + array | pass | 2079ms | |
| ✅ | GET /api/saves items have expected shape | pass | 2264ms | |
| ✅ | GET /api/saves/:id with unknown id → 404 + error | pass | 7ms | |
| ✅ | DELETE /api/saves/:id with unknown id → 200 + { ok: true } | pass | 7ms | |
| ✅ | [chaos] GET /api/saves/:id with empty id segment → 404 | pass | 1953ms | |
| ✅ | [chaos] DELETE /api/saves/:id with special chars in id | pass | 5ms | |


