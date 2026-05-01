# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T15:33:38.790Z
**Commit:** `657361a`
**Duration:** 12363ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1587ms | |
| ✅ | Browser can open a new page | pass | 252ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 323ms | |
| ✅ | Browser closes cleanly | pass | 276ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4222ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1788ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 1827ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2078ms | |


