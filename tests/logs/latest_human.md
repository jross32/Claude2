# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:28:02.118Z
**Commit:** `779a915`
**Duration:** 12061ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 851ms | |
| ✅ | Browser can open a new page | pass | 116ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 136ms | |
| ✅ | Browser closes cleanly | pass | 177ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 3687ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1702ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2463ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2925ms | |


