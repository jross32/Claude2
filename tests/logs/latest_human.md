# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:25:51.561Z
**Commit:** `fb42363`
**Duration:** 12956ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1404ms | |
| ✅ | Browser can open a new page | pass | 217ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 236ms | |
| ✅ | Browser closes cleanly | pass | 271ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4613ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1790ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2118ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2302ms | |


