# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-03T15:14:03.307Z
**Commit:** `5369f5d`
**Duration:** 13943ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Server starts without crashing | pass | 8389ms | |
| ✅ | GET /api/saves → 200 + JSON array | pass | 4834ms | |
| ✅ | GET /api/schedules → 200 + JSON array | pass | 18ms | |
| ✅ | GET /api/session/check → 200 + { exists: boolean } | pass | 10ms | |
| ✅ | GET /api/site-credentials → 200 + { found: boolean } | pass | 6ms | |
| ✅ | GET / serves HTML frontend | pass | 9ms | |
| ✅ | [chaos] POST /api/scrape with no URL → 400 | pass | 39ms | |
| ✅ | [chaos] GET unknown endpoint → 404 | pass | 13ms | |
| ✅ | [chaos] GET /api/saves/:id with fake ID → 404 | pass | 5ms | |


