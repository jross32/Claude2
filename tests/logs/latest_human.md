# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:53:40.864Z
**Commit:** `87b7876`
**Duration:** 13102ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1428ms | |
| ✅ | Browser can open a new page | pass | 226ms | |
| ✅ | Browser reports correct version string | pass | 1ms | |
| ✅ | Multiple pages open and close independently | pass | 231ms | |
| ✅ | Browser closes cleanly | pass | 255ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4478ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1867ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2177ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2433ms | |


