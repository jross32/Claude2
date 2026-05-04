# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:49:47.996Z
**Commit:** `5b2fa9c`
**Duration:** 12875ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1400ms | |
| ✅ | Browser can open a new page | pass | 201ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 196ms | |
| ✅ | Browser closes cleanly | pass | 223ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4385ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2136ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2134ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2195ms | |


