# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:21:42.539Z
**Commit:** `a10f666`
**Duration:** 13529ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1998ms | |
| ✅ | Browser can open a new page | pass | 202ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 218ms | |
| ✅ | Browser closes cleanly | pass | 199ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4178ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1850ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2172ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2706ms | |


