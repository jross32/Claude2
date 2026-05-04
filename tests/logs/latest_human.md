# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:04:03.764Z
**Commit:** `0a7e86d`
**Duration:** 12791ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1519ms | |
| ✅ | Browser can open a new page | pass | 221ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 251ms | |
| ✅ | Browser closes cleanly | pass | 228ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4507ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1742ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2176ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2139ms | |


