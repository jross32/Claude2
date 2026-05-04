# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T06:10:50.278Z
**Commit:** `b82df8e`
**Duration:** 12490ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Server starts without crashing | pass | 7590ms | |
| ✅ | GET /api/saves → 200 + JSON array | pass | 4195ms | |
| ✅ | GET /api/schedules → 200 + JSON array | pass | 20ms | |
| ✅ | GET /api/session/check → 200 + { exists: boolean } | pass | 10ms | |
| ✅ | GET /api/site-credentials → 200 + { found: boolean } | pass | 5ms | |
| ✅ | GET / serves HTML frontend | pass | 6ms | |
| ✅ | [chaos] POST /api/scrape with no URL → 400 | pass | 39ms | |
| ✅ | [chaos] GET unknown endpoint → 404 | pass | 9ms | |
| ✅ | [chaos] GET /api/saves/:id with fake ID → 404 | pass | 5ms | |


