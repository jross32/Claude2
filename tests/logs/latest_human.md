# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:07:10.206Z
**Commit:** `32e9890`
**Duration:** 13265ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1595ms | |
| ✅ | Browser can open a new page | pass | 190ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 215ms | |
| ✅ | Browser closes cleanly | pass | 245ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4535ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1835ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2337ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2307ms | |


