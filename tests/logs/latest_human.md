# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:36:14.848Z
**Commit:** `5ff2b7d`
**Duration:** 12575ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1526ms | |
| ✅ | Browser can open a new page | pass | 192ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 203ms | |
| ✅ | Browser closes cleanly | pass | 213ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4236ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1736ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2078ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2382ms | |


