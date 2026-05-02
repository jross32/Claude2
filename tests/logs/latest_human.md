# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-02T04:10:12.975Z
**Commit:** `9acaadc`
**Duration:** 13612ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1560ms | |
| ✅ | Browser can open a new page | pass | 337ms | |
| ✅ | Browser reports correct version string | pass | 1ms | |
| ✅ | Multiple pages open and close independently | pass | 222ms | |
| ✅ | Browser closes cleanly | pass | 271ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4402ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1811ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2191ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2810ms | |


