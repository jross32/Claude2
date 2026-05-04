# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:47:42.283Z
**Commit:** `868e342`
**Duration:** 12482ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1466ms | |
| ✅ | Browser can open a new page | pass | 186ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 204ms | |
| ✅ | Browser closes cleanly | pass | 216ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4230ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1608ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2170ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2396ms | |


