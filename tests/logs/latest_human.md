# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-04-13T21:56:07.573Z
**Commit:** `42170e6`
**Duration:** 17146ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 8 | 8 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 3223ms | |
| ✅ | Browser can open a new page | pass | 663ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 559ms | |
| ✅ | Browser closes cleanly | pass | 538ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 5973ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2684ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 3464ms | |


