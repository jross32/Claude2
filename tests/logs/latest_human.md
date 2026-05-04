# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:42:12.978Z
**Commit:** `ac7c288`
**Duration:** 13371ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1501ms | |
| ✅ | Browser can open a new page | pass | 212ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 212ms | |
| ✅ | Browser closes cleanly | pass | 260ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4375ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1914ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2387ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2504ms | |


