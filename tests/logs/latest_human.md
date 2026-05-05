# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-05T05:16:04.275Z
**Commit:** `225e721`
**Duration:** 14019ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1383ms | |
| ✅ | Browser can open a new page | pass | 311ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 430ms | |
| ✅ | Browser closes cleanly | pass | 341ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4080ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2107ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2721ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2638ms | |


