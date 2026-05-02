# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-05-02T04:11:17.506Z
**Commit:** `14e17ed`
**Duration:** 20264ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 6 | 6 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | GET /api/saves → 200 + array | pass | 4279ms | |
| ✅ | GET /api/saves items have expected shape | pass | 4734ms | |
| ✅ | GET /api/saves/:id with unknown id → 404 + error | pass | 39ms | |
| ✅ | DELETE /api/saves/:id with unknown id → 200 + { ok: true } | pass | 10ms | |
| ✅ | [chaos] GET /api/saves/:id with empty id segment → 404 | pass | 4046ms | |
| ✅ | [chaos] DELETE /api/saves/:id with special chars in id | pass | 6ms | |


