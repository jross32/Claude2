# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:15:27.468Z
**Commit:** `5a88844`
**Duration:** 12401ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1412ms | |
| ✅ | Browser can open a new page | pass | 186ms | |
| ✅ | Browser reports correct version string | pass | 1ms | |
| ✅ | Multiple pages open and close independently | pass | 198ms | |
| ✅ | Browser closes cleanly | pass | 219ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4416ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1616ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2131ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2216ms | |


