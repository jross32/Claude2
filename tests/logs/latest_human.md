# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:22:43.499Z
**Commit:** `ef69eb5`
**Duration:** 13232ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1395ms | |
| ✅ | Browser can open a new page | pass | 193ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 253ms | |
| ✅ | Browser closes cleanly | pass | 259ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4319ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2013ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2519ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2273ms | |


