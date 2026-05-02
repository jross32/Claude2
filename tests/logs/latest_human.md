# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-02T06:04:41.177Z
**Commit:** `6dad736`
**Duration:** 12285ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1428ms | |
| ✅ | Browser can open a new page | pass | 232ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 262ms | |
| ✅ | Browser closes cleanly | pass | 267ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4427ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1519ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 1910ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2231ms | |


