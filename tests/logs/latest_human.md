# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-23T22:41:31.728Z
**Commit:** `41a73d3`
**Duration:** 11166ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 6 | 6 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | GET /api/saves → 200 + array | pass | 1952ms | |
| ✅ | GET /api/saves items have expected shape | pass | 2215ms | |
| ✅ | GET /api/saves/:id with unknown id → 404 + error | pass | 5ms | |
| ✅ | DELETE /api/saves/:id with unknown id → 200 + { ok: true } | pass | 4ms | |
| ✅ | [chaos] GET /api/saves/:id with empty id segment → 404 | pass | 2121ms | |
| ✅ | [chaos] DELETE /api/saves/:id with special chars in id | pass | 3ms | |


