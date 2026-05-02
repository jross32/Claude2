# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-05-02T06:39:38.872Z
**Commit:** `7246006`
**Duration:** 5444ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 7 | 7 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/diff with two valid results → 200 + diff object | pass | 52ms | |
| ✅ | Diff result shows added page in resultB | pass | 3ms | |
| ✅ | Diff result shows added text in resultB | pass | 3ms | |
| ✅ | POST /api/diff identical results → pages added/removed are empty | pass | 4ms | |
| ✅ | [chaos] POST /api/diff with no body → 400 | pass | 3ms | |
| ✅ | [chaos] POST /api/diff with empty results → does not 500 | pass | 5ms | |
| ✅ | [chaos] POST /api/diff missing resultB → 400 | pass | 3ms | |


