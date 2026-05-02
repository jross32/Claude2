# Test Results — unit

**Status:** ✅ HEALTHY
**Run:** 2026-05-02T06:39:20.319Z
**Commit:** `302c776`
**Duration:** 16ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 13 | 13 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | returns pages, apiCalls, assets, summary | pass | 4ms | |
| ✅ | detects added page in B | pass | 0ms | |
| ✅ | detects removed page from A | pass | 0ms | |
| ✅ | identical results → pages added/removed are empty | pass | 1ms | |
| ✅ | detects added text block | pass | 0ms | |
| ✅ | detects added link | pass | 0ms | |
| ✅ | detects added image | pass | 1ms | |
| ✅ | detects title change | pass | 1ms | |
| ✅ | summary.pages counts match actual arrays | pass | 2ms | |
| ✅ | [chaos] empty pages arrays → no crash, empty diffs | pass | 0ms | |
| ✅ | [chaos] missing pages key → no crash | pass | 0ms | |
| ✅ | [chaos] page with no meta → no crash | pass | 1ms | |
| ✅ | [chaos] apiCalls missing in inputs → no crash | pass | 1ms | |


