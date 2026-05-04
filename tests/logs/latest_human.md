# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:38:00.794Z
**Commit:** `83b3366`
**Duration:** 13345ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1512ms | |
| ✅ | Browser can open a new page | pass | 204ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 257ms | |
| ✅ | Browser closes cleanly | pass | 363ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4743ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1774ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2105ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2380ms | |


