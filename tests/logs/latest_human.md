# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:35:55.813Z
**Commit:** `5d06f5e`
**Duration:** 12829ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1673ms | |
| ✅ | Browser can open a new page | pass | 278ms | |
| ✅ | Browser reports correct version string | pass | 1ms | |
| ✅ | Multiple pages open and close independently | pass | 243ms | |
| ✅ | Browser closes cleanly | pass | 220ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4323ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1723ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2135ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2229ms | |


