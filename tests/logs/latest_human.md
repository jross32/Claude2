# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-04-23T22:40:14.724Z
**Commit:** `8ab8e6c`
**Duration:** 10001ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 615ms | |
| ✅ | Browser can open a new page | pass | 129ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 136ms | |
| ✅ | Browser closes cleanly | pass | 245ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4226ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 979ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2311ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 1357ms | |


