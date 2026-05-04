# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:28:58.127Z
**Commit:** `8b7509b`
**Duration:** 12763ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1452ms | |
| ✅ | Browser can open a new page | pass | 200ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 214ms | |
| ✅ | Browser closes cleanly | pass | 249ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4375ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1806ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2274ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2188ms | |


