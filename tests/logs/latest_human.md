# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-16T10:08:46.175Z
**Commit:** `25609ef`
**Duration:** 4771ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 6 | 6 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | GET /api/saves → 200 + array | pass | 477ms | |
| ✅ | GET /api/saves items have expected shape | pass | 435ms | |
| ✅ | GET /api/saves/:id with unknown id → 404 + error | pass | 6ms | |
| ✅ | DELETE /api/saves/:id with unknown id → 200 + { ok: true } | pass | 5ms | |
| ✅ | [chaos] GET /api/saves/:id with empty id segment → 404 | pass | 415ms | |
| ✅ | [chaos] DELETE /api/saves/:id with special chars in id | pass | 4ms | |


