# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:56:47.051Z
**Commit:** `2b3e583`
**Duration:** 13411ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1782ms | |
| ✅ | Browser can open a new page | pass | 203ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 196ms | |
| ✅ | Browser closes cleanly | pass | 284ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4385ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1948ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2146ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2460ms | |


