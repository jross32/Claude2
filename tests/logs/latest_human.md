# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:54:42.760Z
**Commit:** `46a0d65`
**Duration:** 12811ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1327ms | |
| ✅ | Browser can open a new page | pass | 210ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 202ms | |
| ✅ | Browser closes cleanly | pass | 242ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4477ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2059ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2103ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2185ms | |


