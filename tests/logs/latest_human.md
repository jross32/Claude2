# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:58:51.080Z
**Commit:** `579a063`
**Duration:** 12883ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1434ms | |
| ✅ | Browser can open a new page | pass | 206ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 472ms | |
| ✅ | Browser closes cleanly | pass | 245ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4436ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1788ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2098ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2197ms | |


