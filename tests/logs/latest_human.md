# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:26:53.931Z
**Commit:** `7c1636a`
**Duration:** 13280ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1694ms | |
| ✅ | Browser can open a new page | pass | 232ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 299ms | |
| ✅ | Browser closes cleanly | pass | 189ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4664ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1815ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2235ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2146ms | |


