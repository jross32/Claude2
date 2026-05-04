# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:24:30.776Z
**Commit:** `8ed5fa4`
**Duration:** 12265ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1262ms | |
| ✅ | Browser can open a new page | pass | 140ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 164ms | |
| ✅ | Browser closes cleanly | pass | 166ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 3649ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2149ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2282ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2446ms | |


