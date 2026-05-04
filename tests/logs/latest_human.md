# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T06:09:34.742Z
**Commit:** `1f0bb57`
**Duration:** 12632ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1538ms | |
| ✅ | Browser can open a new page | pass | 190ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 193ms | |
| ✅ | Browser closes cleanly | pass | 212ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4287ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1902ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2003ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2298ms | |


