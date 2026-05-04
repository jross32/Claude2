# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:32:06.272Z
**Commit:** `1d9cda0`
**Duration:** 12781ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1311ms | |
| ✅ | Browser can open a new page | pass | 201ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 207ms | |
| ✅ | Browser closes cleanly | pass | 248ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4272ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1819ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2291ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2426ms | |


