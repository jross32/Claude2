# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:51:35.270Z
**Commit:** `f966372`
**Duration:** 13595ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1591ms | |
| ✅ | Browser can open a new page | pass | 199ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 217ms | |
| ✅ | Browser closes cleanly | pass | 213ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4387ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2152ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2412ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2416ms | |


