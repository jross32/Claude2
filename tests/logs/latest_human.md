# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:21:54.401Z
**Commit:** `64a7ddc`
**Duration:** 9042ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 828ms | |
| ✅ | Browser can open a new page | pass | 121ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 131ms | |
| ✅ | Browser closes cleanly | pass | 240ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 3620ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1041ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 1589ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 1468ms | |


