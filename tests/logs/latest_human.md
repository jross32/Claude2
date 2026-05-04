# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:03:01.190Z
**Commit:** `861d75b`
**Duration:** 12943ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1343ms | |
| ✅ | Browser can open a new page | pass | 186ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 197ms | |
| ✅ | Browser closes cleanly | pass | 213ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4273ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1916ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2291ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2518ms | |


