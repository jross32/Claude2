# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-02T05:03:01.753Z
**Commit:** `a67bf5c`
**Duration:** 13497ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1750ms | |
| ✅ | Browser can open a new page | pass | 408ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 255ms | |
| ✅ | Browser closes cleanly | pass | 239ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4257ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2154ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2007ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2420ms | |


