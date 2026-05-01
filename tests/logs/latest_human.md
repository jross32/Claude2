# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T19:25:51.533Z
**Commit:** `e7d8be4`
**Duration:** 11567ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1392ms | |
| ✅ | Browser can open a new page | pass | 205ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 213ms | |
| ✅ | Browser closes cleanly | pass | 262ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4045ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1528ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 1904ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2010ms | |


