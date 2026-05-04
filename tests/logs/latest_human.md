# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:44:18.097Z
**Commit:** `e7bc9ad`
**Duration:** 13041ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1647ms | |
| ✅ | Browser can open a new page | pass | 197ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 206ms | |
| ✅ | Browser closes cleanly | pass | 254ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4283ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1814ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2192ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2441ms | |


