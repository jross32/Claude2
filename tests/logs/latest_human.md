# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T06:06:27.457Z
**Commit:** `5b2e5ca`
**Duration:** 12809ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1363ms | |
| ✅ | Browser can open a new page | pass | 270ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 323ms | |
| ✅ | Browser closes cleanly | pass | 225ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4226ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1918ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2223ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2255ms | |


