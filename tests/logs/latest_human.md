# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-23T22:37:41.556Z
**Commit:** `e6b364a`
**Duration:** 6108ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/generate/react → 200 + { jsx: string } | pass | 58ms | |
| ✅ | [chaos] POST /api/generate/react with no pageData → 400 | pass | 9ms | |
| ✅ | POST /api/generate/css → 200 + { css: string } | pass | 6ms | |
| ✅ | [chaos] POST /api/generate/css with no pageData → 400 | pass | 5ms | |
| ✅ | POST /api/generate/markdown → 200 + { markdown: string } | pass | 7ms | |
| ✅ | [chaos] POST /api/generate/markdown with no pageData → 400 | pass | 5ms | |
| ✅ | POST /api/generate/sitemap → 200 + XML string | pass | 6ms | |
| ✅ | [chaos] POST /api/generate/sitemap with no pages → 400 | pass | 6ms | |
| ✅ | [chaos] POST /api/generate/react with empty pageData → does not 500 | pass | 6ms | |


