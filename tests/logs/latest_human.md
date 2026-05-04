# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:34:53.564Z
**Commit:** `f4b4074`
**Duration:** 12425ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1483ms | |
| ✅ | Browser can open a new page | pass | 230ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 248ms | |
| ✅ | Browser closes cleanly | pass | 258ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4205ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1739ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2063ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2194ms | |


