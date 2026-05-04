# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:48:27.849Z
**Commit:** `e93403a`
**Duration:** 12596ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1382ms | |
| ✅ | Browser can open a new page | pass | 203ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 205ms | |
| ✅ | Browser closes cleanly | pass | 246ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4328ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1808ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2083ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2335ms | |


