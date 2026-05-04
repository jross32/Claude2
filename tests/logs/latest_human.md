# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:41:08.485Z
**Commit:** `bc459c7`
**Duration:** 13316ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1589ms | |
| ✅ | Browser can open a new page | pass | 195ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 197ms | |
| ✅ | Browser closes cleanly | pass | 223ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4404ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1953ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2275ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2474ms | |


