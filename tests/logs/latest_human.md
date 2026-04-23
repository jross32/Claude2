# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-23T22:37:55.710Z
**Commit:** `40eb37a`
**Duration:** 13548ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 6 | 6 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | GET /api/saves → 200 + array | pass | 3358ms | |
| ✅ | GET /api/saves items have expected shape | pass | 1869ms | |
| ✅ | GET /api/saves/:id with unknown id → 404 + error | pass | 13ms | |
| ✅ | DELETE /api/saves/:id with unknown id → 200 + { ok: true } | pass | 3ms | |
| ✅ | [chaos] GET /api/saves/:id with empty id segment → 404 | pass | 1390ms | |
| ✅ | [chaos] DELETE /api/saves/:id with special chars in id | pass | 2ms | |


