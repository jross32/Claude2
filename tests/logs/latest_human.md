# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T06:07:29.619Z
**Commit:** `642742d`
**Duration:** 12713ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1627ms | |
| ✅ | Browser can open a new page | pass | 196ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 224ms | |
| ✅ | Browser closes cleanly | pass | 236ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4333ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1804ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2081ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2207ms | |


