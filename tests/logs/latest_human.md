# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-16T10:16:14.878Z
**Commit:** `8ea63db`
**Duration:** 2969ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/generate/react → 200 + { jsx: string } | pass | 47ms | |
| ✅ | [chaos] POST /api/generate/react with no pageData → 400 | pass | 7ms | |
| ✅ | POST /api/generate/css → 200 + { css: string } | pass | 5ms | |
| ✅ | [chaos] POST /api/generate/css with no pageData → 400 | pass | 3ms | |
| ✅ | POST /api/generate/markdown → 200 + { markdown: string } | pass | 4ms | |
| ✅ | [chaos] POST /api/generate/markdown with no pageData → 400 | pass | 3ms | |
| ✅ | POST /api/generate/sitemap → 200 + XML string | pass | 4ms | |
| ✅ | [chaos] POST /api/generate/sitemap with no pages → 400 | pass | 3ms | |
| ✅ | [chaos] POST /api/generate/react with empty pageData → does not 500 | pass | 4ms | |


