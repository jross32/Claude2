# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:30:00.827Z
**Commit:** `7220fd3`
**Duration:** 12422ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1463ms | |
| ✅ | Browser can open a new page | pass | 198ms | |
| ✅ | Browser reports correct version string | pass | 1ms | |
| ✅ | Multiple pages open and close independently | pass | 233ms | |
| ✅ | Browser closes cleanly | pass | 262ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4415ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1640ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2081ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2124ms | |


