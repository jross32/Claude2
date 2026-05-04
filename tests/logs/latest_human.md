# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:10:17.985Z
**Commit:** `ff076e3`
**Duration:** 12713ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1408ms | |
| ✅ | Browser can open a new page | pass | 188ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 280ms | |
| ✅ | Browser closes cleanly | pass | 265ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4232ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1860ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2174ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2301ms | |


