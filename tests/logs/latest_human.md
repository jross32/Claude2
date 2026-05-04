# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:40:05.659Z
**Commit:** `9c6f347`
**Duration:** 12598ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1445ms | |
| ✅ | Browser can open a new page | pass | 190ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 195ms | |
| ✅ | Browser closes cleanly | pass | 243ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4301ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1903ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2012ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2302ms | |


