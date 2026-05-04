# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:22:24.544Z
**Commit:** `a09f2a8`
**Duration:** 12379ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1685ms | |
| ✅ | Browser can open a new page | pass | 107ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 119ms | |
| ✅ | Browser closes cleanly | pass | 139ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4413ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2383ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 1445ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2084ms | |


