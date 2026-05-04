# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:33:08.060Z
**Commit:** `3208700`
**Duration:** 12929ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1557ms | |
| ✅ | Browser can open a new page | pass | 209ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 240ms | |
| ✅ | Browser closes cleanly | pass | 230ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4332ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1871ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2180ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2305ms | |


