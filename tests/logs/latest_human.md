# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-05-02T06:40:29.720Z
**Commit:** `f12cc13`
**Duration:** 22062ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 6 | 6 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | GET /api/saves → 200 + array | pass | 4632ms | |
| ✅ | GET /api/saves items have expected shape | pass | 4711ms | |
| ✅ | GET /api/saves/:id with unknown id → 404 + error | pass | 11ms | |
| ✅ | DELETE /api/saves/:id with unknown id → 200 + { ok: true } | pass | 12ms | |
| ✅ | [chaos] GET /api/saves/:id with empty id segment → 404 | pass | 4516ms | |
| ✅ | [chaos] DELETE /api/saves/:id with special chars in id | pass | 5ms | |


