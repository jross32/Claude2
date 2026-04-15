# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-15T08:14:59.777Z
**Commit:** `2ea13e9`
**Duration:** 14982ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 6 | 6 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | GET /api/saves → 200 + array | pass | 2410ms | |
| ✅ | GET /api/saves items have expected shape | pass | 2802ms | |
| ✅ | GET /api/saves/:id with unknown id → 404 + error | pass | 7ms | |
| ✅ | DELETE /api/saves/:id with unknown id → 200 + { ok: true } | pass | 5ms | |
| ✅ | [chaos] GET /api/saves/:id with empty id segment → 404 | pass | 2631ms | |
| ✅ | [chaos] DELETE /api/saves/:id with special chars in id | pass | 10ms | |


