# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T06:03:20.638Z
**Commit:** `f9f0c98`
**Duration:** 13009ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1457ms | |
| ✅ | Browser can open a new page | pass | 220ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 207ms | |
| ✅ | Browser closes cleanly | pass | 238ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4272ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1853ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2425ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2331ms | |


