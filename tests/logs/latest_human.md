# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:41:25.568Z
**Commit:** `581d4a9`
**Duration:** 12508ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1414ms | |
| ✅ | Browser can open a new page | pass | 269ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 253ms | |
| ✅ | Browser closes cleanly | pass | 228ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4301ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1759ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2064ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2213ms | |


