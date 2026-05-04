# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:56:02.343Z
**Commit:** `e57fee0`
**Duration:** 13087ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1667ms | |
| ✅ | Browser can open a new page | pass | 212ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 202ms | |
| ✅ | Browser closes cleanly | pass | 259ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4542ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1896ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2096ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2208ms | |


