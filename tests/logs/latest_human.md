# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:52:38.523Z
**Commit:** `6f75df8`
**Duration:** 12896ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1397ms | |
| ✅ | Browser can open a new page | pass | 226ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 203ms | |
| ✅ | Browser closes cleanly | pass | 255ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4391ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1972ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2154ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2292ms | |


