# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-02T22:56:46.748Z
**Commit:** `9c4902f`
**Duration:** 13403ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Server starts without crashing | pass | 8106ms | |
| ✅ | GET /api/saves → 200 + JSON array | pass | 4545ms | |
| ✅ | GET /api/schedules → 200 + JSON array | pass | 40ms | |
| ✅ | GET /api/session/check → 200 + { exists: boolean } | pass | 11ms | |
| ✅ | GET /api/site-credentials → 200 + { found: boolean } | pass | 6ms | |
| ✅ | GET / serves HTML frontend | pass | 7ms | |
| ✅ | [chaos] POST /api/scrape with no URL → 400 | pass | 54ms | |
| ✅ | [chaos] GET unknown endpoint → 404 | pass | 11ms | |
| ✅ | [chaos] GET /api/saves/:id with fake ID → 404 | pass | 6ms | |


