# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:17:33.097Z
**Commit:** `d402b57`
**Duration:** 12361ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1423ms | |
| ✅ | Browser can open a new page | pass | 190ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 213ms | |
| ✅ | Browser closes cleanly | pass | 224ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4270ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1721ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2156ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2158ms | |


