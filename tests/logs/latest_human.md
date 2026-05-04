# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:27:56.125Z
**Commit:** `627c768`
**Duration:** 13008ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1650ms | |
| ✅ | Browser can open a new page | pass | 203ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 260ms | |
| ✅ | Browser closes cleanly | pass | 304ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4153ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2034ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2057ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2340ms | |


