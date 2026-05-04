# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:20:39.293Z
**Commit:** `4a00458`
**Duration:** 12416ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1425ms | |
| ✅ | Browser can open a new page | pass | 194ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 210ms | |
| ✅ | Browser closes cleanly | pass | 228ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4283ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1717ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2121ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2235ms | |


