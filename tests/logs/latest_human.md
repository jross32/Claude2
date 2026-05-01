# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T15:34:42.305Z
**Commit:** `e69c682`
**Duration:** 20952ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 6 | 6 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | GET /api/saves → 200 + array | pass | 5026ms | |
| ✅ | GET /api/saves items have expected shape | pass | 3709ms | |
| ✅ | GET /api/saves/:id with unknown id → 404 + error | pass | 12ms | |
| ✅ | DELETE /api/saves/:id with unknown id → 200 + { ok: true } | pass | 15ms | |
| ✅ | [chaos] GET /api/saves/:id with empty id segment → 404 | pass | 4477ms | |
| ✅ | [chaos] DELETE /api/saves/:id with special chars in id | pass | 4ms | |


