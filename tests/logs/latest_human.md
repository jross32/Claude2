# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T14:31:57.609Z
**Commit:** `3acdf8a`
**Duration:** 9195ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 860ms | |
| ✅ | Browser can open a new page | pass | 223ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 163ms | |
| ✅ | Browser closes cleanly | pass | 171ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 3310ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1097ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 1277ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2090ms | |


