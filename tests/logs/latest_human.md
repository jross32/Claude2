# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:20:52.511Z
**Commit:** `d822576`
**Duration:** 12463ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1325ms | |
| ✅ | Browser can open a new page | pass | 200ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 298ms | |
| ✅ | Browser closes cleanly | pass | 223ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 3585ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2087ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2259ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2479ms | |


