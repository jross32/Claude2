# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:21:25.444Z
**Commit:** `4c2c8ed`
**Duration:** 12573ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1383ms | |
| ✅ | Browser can open a new page | pass | 107ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 107ms | |
| ✅ | Browser closes cleanly | pass | 113ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4051ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1997ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2297ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2511ms | |


