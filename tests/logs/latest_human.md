# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-03T15:05:26.789Z
**Commit:** `da91c32`
**Duration:** 11829ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 870ms | |
| ✅ | Browser can open a new page | pass | 116ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 131ms | |
| ✅ | Browser closes cleanly | pass | 132ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4099ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1956ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2219ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2297ms | |


