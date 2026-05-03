# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-03T15:13:48.993Z
**Commit:** `f67a9d7`
**Duration:** 13068ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1515ms | |
| ✅ | Browser can open a new page | pass | 216ms | |
| ✅ | Browser reports correct version string | pass | 1ms | |
| ✅ | Multiple pages open and close independently | pass | 229ms | |
| ✅ | Browser closes cleanly | pass | 266ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4242ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2024ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2297ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2223ms | |


