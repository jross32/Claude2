# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T19:15:48.703Z
**Commit:** `6efe7f8`
**Duration:** 7814ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/generate/react → 200 + { jsx: string } | pass | 37ms | |
| ✅ | [chaos] POST /api/generate/react with no pageData → 400 | pass | 6ms | |
| ✅ | POST /api/generate/css → 200 + { css: string } | pass | 3ms | |
| ✅ | [chaos] POST /api/generate/css with no pageData → 400 | pass | 4ms | |
| ✅ | POST /api/generate/markdown → 200 + { markdown: string } | pass | 3ms | |
| ✅ | [chaos] POST /api/generate/markdown with no pageData → 400 | pass | 4ms | |
| ✅ | POST /api/generate/sitemap → 200 + XML string | pass | 4ms | |
| ✅ | [chaos] POST /api/generate/sitemap with no pages → 400 | pass | 3ms | |
| ✅ | [chaos] POST /api/generate/react with empty pageData → does not 500 | pass | 4ms | |


