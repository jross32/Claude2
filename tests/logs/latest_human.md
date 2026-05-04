# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T06:02:16.807Z
**Commit:** `7d7f136`
**Duration:** 12700ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1476ms | |
| ✅ | Browser can open a new page | pass | 191ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 198ms | |
| ✅ | Browser closes cleanly | pass | 210ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4350ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1814ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2208ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2245ms | |


