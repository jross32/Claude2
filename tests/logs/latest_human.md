# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-03T14:50:57.671Z
**Commit:** `07d4cc4`
**Duration:** 15953ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Server starts without crashing | pass | 9973ms | |
| ✅ | GET /api/saves → 200 + JSON array | pass | 5269ms | |
| ✅ | GET /api/schedules → 200 + JSON array | pass | 15ms | |
| ✅ | GET /api/session/check → 200 + { exists: boolean } | pass | 8ms | |
| ✅ | GET /api/site-credentials → 200 + { found: boolean } | pass | 4ms | |
| ✅ | GET / serves HTML frontend | pass | 6ms | |
| ✅ | [chaos] POST /api/scrape with no URL → 400 | pass | 43ms | |
| ✅ | [chaos] GET unknown endpoint → 404 | pass | 10ms | |
| ✅ | [chaos] GET /api/saves/:id with fake ID → 404 | pass | 5ms | |


