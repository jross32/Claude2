# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-05T22:34:18.736Z
**Commit:** `3ff850d`
**Duration:** 13083ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 2059ms | |
| ✅ | Browser can open a new page | pass | 634ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 256ms | |
| ✅ | Browser closes cleanly | pass | 249ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4007ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1817ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 1858ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2194ms | |


