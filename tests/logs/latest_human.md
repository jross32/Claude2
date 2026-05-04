# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:31:47.379Z
**Commit:** `4a9e919`
**Duration:** 13750ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1871ms | |
| ✅ | Browser can open a new page | pass | 196ms | |
| ✅ | Browser reports correct version string | pass | 1ms | |
| ✅ | Multiple pages open and close independently | pass | 194ms | |
| ✅ | Browser closes cleanly | pass | 234ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4622ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1946ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2299ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2382ms | |


