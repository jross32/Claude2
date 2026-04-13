# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-13T22:27:51.566Z
**Commit:** `7414386`
**Duration:** 2145ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 7 | 7 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/diff with two valid results → 200 + diff object | pass | 61ms | |
| ✅ | Diff result shows added page in resultB | pass | 7ms | |
| ✅ | Diff result shows added text in resultB | pass | 6ms | |
| ✅ | POST /api/diff identical results → pages added/removed are empty | pass | 4ms | |
| ✅ | [chaos] POST /api/diff with no body → 400 | pass | 5ms | |
| ✅ | [chaos] POST /api/diff with empty results → does not 500 | pass | 4ms | |
| ✅ | [chaos] POST /api/diff missing resultB → 400 | pass | 3ms | |


