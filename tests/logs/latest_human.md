# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:48:45.572Z
**Commit:** `573746d`
**Duration:** 13595ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1632ms | |
| ✅ | Browser can open a new page | pass | 190ms | |
| ✅ | Browser reports correct version string | pass | 1ms | |
| ✅ | Multiple pages open and close independently | pass | 353ms | |
| ✅ | Browser closes cleanly | pass | 367ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4772ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1814ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2254ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2207ms | |


