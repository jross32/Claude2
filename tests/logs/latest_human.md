# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:38:18.590Z
**Commit:** `a6814ff`
**Duration:** 12614ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1417ms | |
| ✅ | Browser can open a new page | pass | 222ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 297ms | |
| ✅ | Browser closes cleanly | pass | 253ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4393ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1715ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2142ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2169ms | |


