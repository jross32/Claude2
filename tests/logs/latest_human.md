# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:54:59.755Z
**Commit:** `2343a74`
**Duration:** 12916ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1427ms | |
| ✅ | Browser can open a new page | pass | 189ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 269ms | |
| ✅ | Browser closes cleanly | pass | 278ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4143ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2215ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2119ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2268ms | |


