# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-23T22:41:15.945Z
**Commit:** `8855dc1`
**Duration:** 4797ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 7 | 7 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/diff with two valid results → 200 + diff object | pass | 28ms | |
| ✅ | Diff result shows added page in resultB | pass | 4ms | |
| ✅ | Diff result shows added text in resultB | pass | 4ms | |
| ✅ | POST /api/diff identical results → pages added/removed are empty | pass | 3ms | |
| ✅ | [chaos] POST /api/diff with no body → 400 | pass | 3ms | |
| ✅ | [chaos] POST /api/diff with empty results → does not 500 | pass | 3ms | |
| ✅ | [chaos] POST /api/diff missing resultB → 400 | pass | 3ms | |


