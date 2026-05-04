# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:50:49.402Z
**Commit:** `21b3f43`
**Duration:** 12257ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1402ms | |
| ✅ | Browser can open a new page | pass | 191ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 222ms | |
| ✅ | Browser closes cleanly | pass | 259ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4307ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1571ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2107ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2191ms | |


