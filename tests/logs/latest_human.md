# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:11:19.840Z
**Commit:** `b39063e`
**Duration:** 12619ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1551ms | |
| ✅ | Browser can open a new page | pass | 193ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 248ms | |
| ✅ | Browser closes cleanly | pass | 327ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4221ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1812ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2044ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2216ms | |


