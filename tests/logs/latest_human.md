# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T06:04:22.792Z
**Commit:** `6692e17`
**Duration:** 12987ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1366ms | |
| ✅ | Browser can open a new page | pass | 205ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 205ms | |
| ✅ | Browser closes cleanly | pass | 286ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4243ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1948ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2274ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2454ms | |


