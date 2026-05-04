# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:13:24.074Z
**Commit:** `8573149`
**Duration:** 13253ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1491ms | |
| ✅ | Browser can open a new page | pass | 202ms | |
| ✅ | Browser reports correct version string | pass | 1ms | |
| ✅ | Multiple pages open and close independently | pass | 204ms | |
| ✅ | Browser closes cleanly | pass | 246ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4355ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2073ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2281ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2395ms | |


