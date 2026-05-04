# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:09:16.367Z
**Commit:** `b31d0b8`
**Duration:** 12536ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1416ms | |
| ✅ | Browser can open a new page | pass | 198ms | |
| ✅ | Browser reports correct version string | pass | 1ms | |
| ✅ | Multiple pages open and close independently | pass | 213ms | |
| ✅ | Browser closes cleanly | pass | 214ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4353ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1885ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2068ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2183ms | |


