# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-15T21:00:29.934Z
**Commit:** `8429d34`
**Duration:** 5006ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 7 | 7 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/diff with two valid results → 200 + diff object | pass | 51ms | |
| ✅ | Diff result shows added page in resultB | pass | 6ms | |
| ✅ | Diff result shows added text in resultB | pass | 5ms | |
| ✅ | POST /api/diff identical results → pages added/removed are empty | pass | 5ms | |
| ✅ | [chaos] POST /api/diff with no body → 400 | pass | 4ms | |
| ✅ | [chaos] POST /api/diff with empty results → does not 500 | pass | 4ms | |
| ✅ | [chaos] POST /api/diff missing resultB → 400 | pass | 4ms | |


