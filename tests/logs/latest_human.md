# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-16T11:02:40.431Z
**Commit:** `5654e30`
**Duration:** 7385ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 6 | 6 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | GET /api/saves → 200 + array | pass | 1269ms | |
| ✅ | GET /api/saves items have expected shape | pass | 1303ms | |
| ✅ | GET /api/saves/:id with unknown id → 404 + error | pass | 18ms | |
| ✅ | DELETE /api/saves/:id with unknown id → 200 + { ok: true } | pass | 5ms | |
| ✅ | [chaos] GET /api/saves/:id with empty id segment → 404 | pass | 1329ms | |
| ✅ | [chaos] DELETE /api/saves/:id with special chars in id | pass | 4ms | |


