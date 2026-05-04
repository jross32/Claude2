# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:37:17.070Z
**Commit:** `01b105c`
**Duration:** 12814ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1496ms | |
| ✅ | Browser can open a new page | pass | 189ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 199ms | |
| ✅ | Browser closes cleanly | pass | 208ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4276ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1843ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2168ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2428ms | |


