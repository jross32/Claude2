# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:47:26.083Z
**Commit:** `c2b63b7`
**Duration:** 13096ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1509ms | |
| ✅ | Browser can open a new page | pass | 209ms | |
| ✅ | Browser reports correct version string | pass | 1ms | |
| ✅ | Multiple pages open and close independently | pass | 222ms | |
| ✅ | Browser closes cleanly | pass | 328ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4501ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1871ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2222ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2225ms | |


