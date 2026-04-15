# Test Results — unit

**Status:** ✅ HEALTHY
**Run:** 2026-04-15T20:59:50.532Z
**Commit:** `8e4b98b`
**Duration:** 26ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 13 | 13 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | returns pages, apiCalls, assets, summary | pass | 3ms | |
| ✅ | detects added page in B | pass | 0ms | |
| ✅ | detects removed page from A | pass | 0ms | |
| ✅ | identical results → pages added/removed are empty | pass | 0ms | |
| ✅ | detects added text block | pass | 1ms | |
| ✅ | detects added link | pass | 0ms | |
| ✅ | detects added image | pass | 1ms | |
| ✅ | detects title change | pass | 1ms | |
| ✅ | summary.pages counts match actual arrays | pass | 0ms | |
| ✅ | [chaos] empty pages arrays → no crash, empty diffs | pass | 0ms | |
| ✅ | [chaos] missing pages key → no crash | pass | 1ms | |
| ✅ | [chaos] page with no meta → no crash | pass | 1ms | |
| ✅ | [chaos] apiCalls missing in inputs → no crash | pass | 0ms | |


