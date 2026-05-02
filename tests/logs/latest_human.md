# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-02T22:56:33.015Z
**Commit:** `49e667f`
**Duration:** 13413ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1693ms | |
| ✅ | Browser can open a new page | pass | 607ms | |
| ✅ | Browser reports correct version string | pass | 1ms | |
| ✅ | Multiple pages open and close independently | pass | 223ms | |
| ✅ | Browser closes cleanly | pass | 309ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4181ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1643ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2104ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2646ms | |


