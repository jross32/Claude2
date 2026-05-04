# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:51:52.130Z
**Commit:** `6b3b7d3`
**Duration:** 13091ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1507ms | |
| ✅ | Browser can open a new page | pass | 198ms | |
| ✅ | Browser reports correct version string | pass | 1ms | |
| ✅ | Multiple pages open and close independently | pass | 233ms | |
| ✅ | Browser closes cleanly | pass | 281ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4520ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1754ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2247ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2344ms | |


