# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:50:32.216Z
**Commit:** `5fe8280`
**Duration:** 12550ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1543ms | |
| ✅ | Browser can open a new page | pass | 201ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 226ms | |
| ✅ | Browser closes cleanly | pass | 232ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4281ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1774ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2074ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2213ms | |


