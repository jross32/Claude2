# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:14:33.699Z
**Commit:** `19691db`
**Duration:** 12151ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 930ms | |
| ✅ | Browser can open a new page | pass | 214ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 194ms | |
| ✅ | Browser closes cleanly | pass | 205ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 3688ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1884ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2317ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2714ms | |


