# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-05T22:48:07.059Z
**Commit:** `8e7bcef`
**Duration:** 13320ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1474ms | |
| ✅ | Browser can open a new page | pass | 273ms | |
| ✅ | Browser reports correct version string | pass | 2ms | |
| ✅ | Multiple pages open and close independently | pass | 293ms | |
| ✅ | Browser closes cleanly | pass | 268ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4483ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1712ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2248ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2556ms | |


