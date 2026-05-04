# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:53:57.043Z
**Commit:** `ab3b8a8`
**Duration:** 12293ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1428ms | |
| ✅ | Browser can open a new page | pass | 193ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 199ms | |
| ✅ | Browser closes cleanly | pass | 256ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4128ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1803ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2144ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2135ms | |


