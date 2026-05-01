# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T14:32:11.024Z
**Commit:** `7149b31`
**Duration:** 12973ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Server starts without crashing | pass | 7703ms | |
| ✅ | GET /api/saves → 200 + JSON array | pass | 4520ms | |
| ✅ | GET /api/schedules → 200 + JSON array | pass | 38ms | |
| ✅ | GET /api/session/check → 200 + { exists: boolean } | pass | 10ms | |
| ✅ | GET /api/site-credentials → 200 + { found: boolean } | pass | 5ms | |
| ✅ | GET / serves HTML frontend | pass | 17ms | |
| ✅ | [chaos] POST /api/scrape with no URL → 400 | pass | 45ms | |
| ✅ | [chaos] GET unknown endpoint → 404 | pass | 9ms | |
| ✅ | [chaos] GET /api/saves/:id with fake ID → 404 | pass | 6ms | |


