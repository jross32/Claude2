# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:45:36.123Z
**Commit:** `285ec62`
**Duration:** 13030ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1541ms | |
| ✅ | Browser can open a new page | pass | 217ms | |
| ✅ | Browser reports correct version string | pass | 1ms | |
| ✅ | Multiple pages open and close independently | pass | 216ms | |
| ✅ | Browser closes cleanly | pass | 235ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4278ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1870ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2496ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2165ms | |


