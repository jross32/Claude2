# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T19:03:35.989Z
**Commit:** `9bb205d`
**Duration:** 13355ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 2006ms | |
| ✅ | Browser can open a new page | pass | 623ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 277ms | |
| ✅ | Browser closes cleanly | pass | 226ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4356ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1594ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 1948ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2317ms | |


