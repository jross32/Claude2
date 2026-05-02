# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T19:31:40.297Z
**Commit:** `c1f71c5`
**Duration:** 12741ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Server starts without crashing | pass | 7814ms | |
| ✅ | GET /api/saves → 200 + JSON array | pass | 4178ms | |
| ✅ | GET /api/schedules → 200 + JSON array | pass | 42ms | |
| ✅ | GET /api/session/check → 200 + { exists: boolean } | pass | 10ms | |
| ✅ | GET /api/site-credentials → 200 + { found: boolean } | pass | 6ms | |
| ✅ | GET / serves HTML frontend | pass | 4ms | |
| ✅ | [chaos] POST /api/scrape with no URL → 400 | pass | 48ms | |
| ✅ | [chaos] GET unknown endpoint → 404 | pass | 11ms | |
| ✅ | [chaos] GET /api/saves/:id with fake ID → 404 | pass | 6ms | |


