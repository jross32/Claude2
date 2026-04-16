# Test Results — unit

**Status:** ✅ HEALTHY
**Run:** 2026-04-16T05:19:47.533Z
**Commit:** `9d9159a`
**Duration:** 24ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 13 | 13 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | returns pages, apiCalls, assets, summary | pass | 3ms | |
| ✅ | detects added page in B | pass | 0ms | |
| ✅ | detects removed page from A | pass | 2ms | |
| ✅ | identical results → pages added/removed are empty | pass | 0ms | |
| ✅ | detects added text block | pass | 0ms | |
| ✅ | detects added link | pass | 1ms | |
| ✅ | detects added image | pass | 0ms | |
| ✅ | detects title change | pass | 0ms | |
| ✅ | summary.pages counts match actual arrays | pass | 1ms | |
| ✅ | [chaos] empty pages arrays → no crash, empty diffs | pass | 1ms | |
| ✅ | [chaos] missing pages key → no crash | pass | 0ms | |
| ✅ | [chaos] page with no meta → no crash | pass | 1ms | |
| ✅ | [chaos] apiCalls missing in inputs → no crash | pass | 0ms | |


