# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:43:15.676Z
**Commit:** `b5c92c0`
**Duration:** 12704ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1469ms | |
| ✅ | Browser can open a new page | pass | 196ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 191ms | |
| ✅ | Browser closes cleanly | pass | 217ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4428ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1853ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2091ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2252ms | |


