# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:39:21.596Z
**Commit:** `12181d0`
**Duration:** 12949ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1355ms | |
| ✅ | Browser can open a new page | pass | 201ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 197ms | |
| ✅ | Browser closes cleanly | pass | 224ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4540ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1864ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2072ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2490ms | |


