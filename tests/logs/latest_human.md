# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-13T21:57:43.853Z
**Commit:** `5b3dac7`
**Duration:** 2611ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 7 | 7 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/diff with two valid results → 200 + diff object | pass | 43ms | |
| ✅ | Diff result shows added page in resultB | pass | 5ms | |
| ✅ | Diff result shows added text in resultB | pass | 4ms | |
| ✅ | POST /api/diff identical results → pages added/removed are empty | pass | 3ms | |
| ✅ | [chaos] POST /api/diff with no body → 400 | pass | 5ms | |
| ✅ | [chaos] POST /api/diff with empty results → does not 500 | pass | 5ms | |
| ✅ | [chaos] POST /api/diff missing resultB → 400 | pass | 4ms | |


