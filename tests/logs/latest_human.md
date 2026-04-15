# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-04-15T11:07:56.824Z
**Commit:** `ba855ca`
**Duration:** 28064ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 2524ms | |
| ✅ | Browser can open a new page | pass | 757ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 652ms | |
| ✅ | Browser closes cleanly | pass | 793ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 5757ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2461ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 3043ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 12067ms | |


