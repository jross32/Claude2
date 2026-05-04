# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:44:33.595Z
**Commit:** `5157864`
**Duration:** 13082ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1717ms | |
| ✅ | Browser can open a new page | pass | 206ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 263ms | |
| ✅ | Browser closes cleanly | pass | 253ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4574ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1622ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2045ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2395ms | |


