# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:42:27.591Z
**Commit:** `2b9f36d`
**Duration:** 12675ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1444ms | |
| ✅ | Browser can open a new page | pass | 209ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 285ms | |
| ✅ | Browser closes cleanly | pass | 300ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4228ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1820ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2172ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2209ms | |


