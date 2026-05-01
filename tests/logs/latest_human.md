# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T19:13:53.433Z
**Commit:** `fe78ee7`
**Duration:** 11284ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1365ms | |
| ✅ | Browser can open a new page | pass | 187ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 225ms | |
| ✅ | Browser closes cleanly | pass | 249ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4249ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1722ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 1711ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 1571ms | |


