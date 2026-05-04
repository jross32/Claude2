# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:46:39.008Z
**Commit:** `6b411a1`
**Duration:** 13092ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1632ms | |
| ✅ | Browser can open a new page | pass | 275ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 298ms | |
| ✅ | Browser closes cleanly | pass | 307ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4130ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1818ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2219ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2408ms | |


