# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:12:21.745Z
**Commit:** `6ff0a6e`
**Duration:** 12731ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1415ms | |
| ✅ | Browser can open a new page | pass | 234ms | |
| ✅ | Browser reports correct version string | pass | 0ms | |
| ✅ | Multiple pages open and close independently | pass | 202ms | |
| ✅ | Browser closes cleanly | pass | 229ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4478ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1823ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2167ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2179ms | |


