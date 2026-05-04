# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:22:57.832Z
**Commit:** `ced3650`
**Duration:** 12840ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1569ms | |
| ✅ | Browser can open a new page | pass | 279ms | |
| ✅ | Browser reports correct version string | pass | 1ms | |
| ✅ | Multiple pages open and close independently | pass | 273ms | |
| ✅ | Browser closes cleanly | pass | 276ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4705ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2159ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2232ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 1341ms | |


