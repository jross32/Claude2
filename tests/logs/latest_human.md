# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-03T00:06:25.117Z
**Commit:** `d3e88be`
**Duration:** 11648ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1072ms | |
| ✅ | Browser can open a new page | pass | 295ms | |
| ✅ | Browser reports correct version string | pass | 1ms | |
| ✅ | Multiple pages open and close independently | pass | 277ms | |
| ✅ | Browser closes cleanly | pass | 276ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4315ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2037ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 1587ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 1784ms | |


