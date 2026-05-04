# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:46:22.693Z
**Commit:** `a909f21`
**Duration:** 12875ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1412ms | |
| ✅ | Browser can open a new page | pass | 218ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 235ms | |
| ✅ | Browser closes cleanly | pass | 215ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4334ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1863ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2385ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2205ms | |


