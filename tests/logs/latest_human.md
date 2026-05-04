# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:40:23.883Z
**Commit:** `ecf2929`
**Duration:** 12574ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1452ms | |
| ✅ | Browser can open a new page | pass | 190ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 208ms | |
| ✅ | Browser closes cleanly | pass | 213ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4291ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1827ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2124ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2262ms | |


