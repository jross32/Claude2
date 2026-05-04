# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:59:53.640Z
**Commit:** `538ec6a`
**Duration:** 12806ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1480ms | |
| ✅ | Browser can open a new page | pass | 176ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 218ms | |
| ✅ | Browser closes cleanly | pass | 254ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4401ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1863ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2165ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2244ms | |


