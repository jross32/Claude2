# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:43:30.018Z
**Commit:** `8c51eb7`
**Duration:** 12746ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1462ms | |
| ✅ | Browser can open a new page | pass | 196ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 312ms | |
| ✅ | Browser closes cleanly | pass | 231ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4541ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1713ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2080ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2205ms | |


