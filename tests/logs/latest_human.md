# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:39:03.262Z
**Commit:** `54d02cf`
**Duration:** 12625ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1474ms | |
| ✅ | Browser can open a new page | pass | 187ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 206ms | |
| ✅ | Browser closes cleanly | pass | 210ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4228ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1736ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2185ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2393ms | |


