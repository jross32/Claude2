# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:30:43.872Z
**Commit:** `4c2eb31`
**Duration:** 13381ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1617ms | |
| ✅ | Browser can open a new page | pass | 254ms | |
| ✅ | Browser reports correct version string | pass | 1ms | |
| ✅ | Multiple pages open and close independently | pass | 356ms | |
| ✅ | Browser closes cleanly | pass | 362ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4423ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1662ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2370ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2332ms | |


