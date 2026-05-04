# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:58:06.822Z
**Commit:** `89f117d`
**Duration:** 12048ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1233ms | |
| ✅ | Browser can open a new page | pass | 135ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 156ms | |
| ✅ | Browser closes cleanly | pass | 216ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4306ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1657ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2134ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2204ms | |


