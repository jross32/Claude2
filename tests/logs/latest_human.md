# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:31:03.056Z
**Commit:** `8b85774`
**Duration:** 12373ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1549ms | |
| ✅ | Browser can open a new page | pass | 215ms | |
| ✅ | Browser reports correct version string | pass | 1ms | |
| ✅ | Multiple pages open and close independently | pass | 212ms | |
| ✅ | Browser closes cleanly | pass | 249ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4213ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1614ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2137ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2176ms | |


