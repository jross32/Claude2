# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:23:58.991Z
**Commit:** `ccb0bf5`
**Duration:** 13922ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1539ms | |
| ✅ | Browser can open a new page | pass | 280ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 228ms | |
| ✅ | Browser closes cleanly | pass | 237ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4549ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2158ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2410ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2515ms | |


