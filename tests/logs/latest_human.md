# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:08:13.793Z
**Commit:** `eef2e4c`
**Duration:** 13130ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1370ms | |
| ✅ | Browser can open a new page | pass | 220ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 235ms | |
| ✅ | Browser closes cleanly | pass | 471ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4397ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 2134ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2131ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2165ms | |


