# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:28:15.133Z
**Commit:** `54ef62f`
**Duration:** 12725ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Server starts without crashing | pass | 7384ms | |
| ✅ | GET /api/saves → 200 + JSON array | pass | 4611ms | |
| ✅ | GET /api/schedules → 200 + JSON array | pass | 22ms | |
| ✅ | GET /api/session/check → 200 + { exists: boolean } | pass | 11ms | |
| ✅ | GET /api/site-credentials → 200 + { found: boolean } | pass | 9ms | |
| ✅ | GET / serves HTML frontend | pass | 8ms | |
| ✅ | [chaos] POST /api/scrape with no URL → 400 | pass | 49ms | |
| ✅ | [chaos] GET unknown endpoint → 404 | pass | 10ms | |
| ✅ | [chaos] GET /api/saves/:id with fake ID → 404 | pass | 6ms | |


