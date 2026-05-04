# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:29:40.856Z
**Commit:** `7b9873b`
**Duration:** 13644ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1712ms | |
| ✅ | Browser can open a new page | pass | 255ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 520ms | |
| ✅ | Browser closes cleanly | pass | 134ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 3569ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2346ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2279ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2822ms | |


