# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:19:00.167Z
**Commit:** `3a4a349`
**Duration:** 13491ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1520ms | |
| ✅ | Browser can open a new page | pass | 267ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 242ms | |
| ✅ | Browser closes cleanly | pass | 272ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4351ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2117ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2189ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2527ms | |


