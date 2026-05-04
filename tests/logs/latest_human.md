# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:26:09.961Z
**Commit:** `7420834`
**Duration:** 13508ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1530ms | |
| ✅ | Browser can open a new page | pass | 227ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 257ms | |
| ✅ | Browser closes cleanly | pass | 345ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4449ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1848ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2361ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2482ms | |


