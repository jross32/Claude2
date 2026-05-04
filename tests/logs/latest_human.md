# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:32:49.365Z
**Commit:** `ca00497`
**Duration:** 13025ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1469ms | |
| ✅ | Browser can open a new page | pass | 207ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 206ms | |
| ✅ | Browser closes cleanly | pass | 242ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4571ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1753ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2070ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2500ms | |


