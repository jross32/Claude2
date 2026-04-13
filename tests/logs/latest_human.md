# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-04-13T22:27:12.487Z
**Commit:** `211b77c`
**Duration:** 15071ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 8 | 8 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1965ms | |
| ✅ | Browser can open a new page | pass | 389ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 217ms | |
| ✅ | Browser closes cleanly | pass | 287ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 5387ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2328ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 4480ms | |


