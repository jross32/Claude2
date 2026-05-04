# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T06:05:24.678Z
**Commit:** `c4daf6d`
**Duration:** 12613ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1385ms | |
| ✅ | Browser can open a new page | pass | 347ms | |
| ✅ | Browser reports correct version string | pass | 1ms | |
| ✅ | Multiple pages open and close independently | pass | 230ms | |
| ✅ | Browser closes cleanly | pass | 252ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4419ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1564ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2224ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2186ms | |


