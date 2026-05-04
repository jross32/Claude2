# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:05:05.126Z
**Commit:** `eaa823a`
**Duration:** 12308ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1627ms | |
| ✅ | Browser can open a new page | pass | 233ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 219ms | |
| ✅ | Browser closes cleanly | pass | 230ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 3788ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1797ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2096ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2312ms | |


