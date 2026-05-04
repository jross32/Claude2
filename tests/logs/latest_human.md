# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:35:13.125Z
**Commit:** `e44ed6a`
**Duration:** 13007ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1393ms | |
| ✅ | Browser can open a new page | pass | 209ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 198ms | |
| ✅ | Browser closes cleanly | pass | 227ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4302ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1925ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2240ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2505ms | |


