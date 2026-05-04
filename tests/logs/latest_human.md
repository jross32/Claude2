# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:59:09.156Z
**Commit:** `4bb1d5a`
**Duration:** 13507ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1448ms | |
| ✅ | Browser can open a new page | pass | 260ms | |
| ✅ | Browser reports correct version string | pass | 1ms | |
| ✅ | Multiple pages open and close independently | pass | 288ms | |
| ✅ | Browser closes cleanly | pass | 273ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4774ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1796ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2255ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2406ms | |


