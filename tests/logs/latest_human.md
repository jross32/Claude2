# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-03T14:58:49.951Z
**Commit:** `8c8635a`
**Duration:** 12384ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Server starts without crashing | pass | 8669ms | |
| ✅ | GET /api/saves → 200 + JSON array | pass | 3050ms | |
| ✅ | GET /api/schedules → 200 + JSON array | pass | 6ms | |
| ✅ | GET /api/session/check → 200 + { exists: boolean } | pass | 6ms | |
| ✅ | GET /api/site-credentials → 200 + { found: boolean } | pass | 3ms | |
| ✅ | GET / serves HTML frontend | pass | 5ms | |
| ✅ | [chaos] POST /api/scrape with no URL → 400 | pass | 23ms | |
| ✅ | [chaos] GET unknown endpoint → 404 | pass | 6ms | |
| ✅ | [chaos] GET /api/saves/:id with fake ID → 404 | pass | 5ms | |


