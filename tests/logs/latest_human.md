# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:33:51.678Z
**Commit:** `f382b68`
**Duration:** 12837ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1741ms | |
| ✅ | Browser can open a new page | pass | 185ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 203ms | |
| ✅ | Browser closes cleanly | pass | 275ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4372ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1718ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2179ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2156ms | |


