# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:36:57.767Z
**Commit:** `7e977a0`
**Duration:** 12819ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1445ms | |
| ✅ | Browser can open a new page | pass | 234ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 364ms | |
| ✅ | Browser closes cleanly | pass | 349ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4102ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1859ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2214ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2247ms | |


