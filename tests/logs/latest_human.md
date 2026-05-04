# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:01:58.592Z
**Commit:** `fe235ca`
**Duration:** 12795ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1554ms | |
| ✅ | Browser can open a new page | pass | 207ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 313ms | |
| ✅ | Browser closes cleanly | pass | 267ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4404ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1774ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2084ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2186ms | |


