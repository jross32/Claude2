# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:57:04.656Z
**Commit:** `91d0073`
**Duration:** 12795ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1612ms | |
| ✅ | Browser can open a new page | pass | 207ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 245ms | |
| ✅ | Browser closes cleanly | pass | 394ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4308ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1788ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2064ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2169ms | |


