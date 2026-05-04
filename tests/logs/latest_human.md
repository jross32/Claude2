# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T06:00:11.671Z
**Commit:** `b5b7ec4`
**Duration:** 13184ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1517ms | |
| ✅ | Browser can open a new page | pass | 274ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 246ms | |
| ✅ | Browser closes cleanly | pass | 198ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4540ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1906ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2136ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2362ms | |


