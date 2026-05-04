# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:52:54.974Z
**Commit:** `c9c3c25`
**Duration:** 12822ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1393ms | |
| ✅ | Browser can open a new page | pass | 280ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 323ms | |
| ✅ | Browser closes cleanly | pass | 275ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4180ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1981ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2133ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2251ms | |


