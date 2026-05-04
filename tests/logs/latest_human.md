# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:57:48.536Z
**Commit:** `8ae2fbc`
**Duration:** 12515ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1478ms | |
| ✅ | Browser can open a new page | pass | 197ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 199ms | |
| ✅ | Browser closes cleanly | pass | 221ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4385ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1721ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2111ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2196ms | |


