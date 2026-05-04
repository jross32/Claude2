# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T05:19:37.196Z
**Commit:** `03c22cd`
**Duration:** 12687ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Chromium launches in headless mode | pass | 1460ms | |
| ✅ | Browser can open a new page | pass | 262ms | |
| ✅ | Browser reports correct version string | pass | 1ms | |
| ✅ | Multiple pages open and close independently | pass | 238ms | |
| ✅ | Browser closes cleanly | pass | 224ms | |
| ✅ | [chaos] Navigation to invalid URL throws and browser stays alive | pass | 4227ms | |
| ✅ | [chaos] browser.close() in finally block prevents zombie (double-close safe) | pass | 1755ms | |
| ✅ | [chaos] Empty page has no JS errors on about:blank | pass | 2192ms | |
| ✅ | playwright-extra can launch with stealth plugin enabled | pass | 2325ms | |


