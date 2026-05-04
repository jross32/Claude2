# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:27:30.421Z
**Commit:** `5629026`
**Duration:** 12260ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 752ms | |
| ✅ | Browser can open a new page | pass | 161ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 199ms | |
| ✅ | Browser closes cleanly | pass | 199ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 3871ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2263ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2345ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2468ms | |


