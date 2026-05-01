# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T14:30:17.746Z
**Commit:** `de1e367`
**Duration:** 6682ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 7 | 7 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/diff with two valid results → 200 + diff object | pass | 64ms | |
| ✅ | Diff result shows added page in resultB | pass | 7ms | |
| ✅ | Diff result shows added text in resultB | pass | 5ms | |
| ✅ | POST /api/diff identical results → pages added/removed are empty | pass | 6ms | |
| ✅ | [chaos] POST /api/diff with no body → 400 | pass | 5ms | |
| ✅ | [chaos] POST /api/diff with empty results → does not 500 | pass | 5ms | |
| ✅ | [chaos] POST /api/diff missing resultB → 400 | pass | 5ms | |


