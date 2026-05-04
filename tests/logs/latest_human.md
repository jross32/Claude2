# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T06:08:32.727Z
**Commit:** `37fbb5b`
**Duration:** 13262ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1421ms | |
| ✅ | Browser can open a new page | pass | 191ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 214ms | |
| ✅ | Browser closes cleanly | pass | 190ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4360ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1830ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2298ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2751ms | |


