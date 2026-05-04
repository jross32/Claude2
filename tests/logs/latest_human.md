# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:34:09.998Z
**Commit:** `1d57bd5`
**Duration:** 12368ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1495ms | |
| ✅ | Browser can open a new page | pass | 186ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 204ms | |
| ✅ | Browser closes cleanly | pass | 253ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4246ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1771ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2002ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2205ms | |


