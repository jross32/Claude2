# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:14:26.243Z
**Commit:** `3ec37a6`
**Duration:** 12886ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1700ms | |
| ✅ | Browser can open a new page | pass | 213ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 236ms | |
| ✅ | Browser closes cleanly | pass | 245ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4258ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1732ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2215ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2280ms | |


