# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-15T21:00:47.236Z
**Commit:** `0edc6bf`
**Duration:** 10762ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 6 | 6 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | GET /api/saves → 200 + array | pass | 1833ms | |
| ✅ | GET /api/saves items have expected shape | pass | 1903ms | |
| ✅ | GET /api/saves/:id with unknown id → 404 + error | pass | 21ms | |
| ✅ | DELETE /api/saves/:id with unknown id → 200 + { ok: true } | pass | 4ms | |
| ✅ | [chaos] GET /api/saves/:id with empty id segment → 404 | pass | 1941ms | |
| ✅ | [chaos] DELETE /api/saves/:id with special chars in id | pass | 4ms | |


