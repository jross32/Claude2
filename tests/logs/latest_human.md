# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:24:49.079Z
**Commit:** `9762a5e`
**Duration:** 13091ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1638ms | |
| ✅ | Browser can open a new page | pass | 229ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 220ms | |
| ✅ | Browser closes cleanly | pass | 222ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4509ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1825ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2121ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2322ms | |


