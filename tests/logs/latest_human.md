# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T06:01:14.528Z
**Commit:** `8cb2c7d`
**Duration:** 13412ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1403ms | |
| ✅ | Browser can open a new page | pass | 218ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 291ms | |
| ✅ | Browser closes cleanly | pass | 291ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4197ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2317ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2265ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2423ms | |


