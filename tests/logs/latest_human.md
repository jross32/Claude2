# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T06:10:37.439Z
**Commit:** `4fb0181`
**Duration:** 12522ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1538ms | |
| ✅ | Browser can open a new page | pass | 195ms | |
| ✅ | Browser reports correct version string | pass | 1ms | |
| ✅ | Multiple pages open and close independently | pass | 201ms | |
| ✅ | Browser closes cleanly | pass | 209ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4326ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1824ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2103ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2120ms | |


