# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T19:26:04.551Z
**Commit:** `73b9c0b`
**Duration:** 12649ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Server starts without crashing | pass | 7468ms | |
| ✅ | GET /api/saves → 200 + JSON array | pass | 4434ms | |
| ✅ | GET /api/schedules → 200 + JSON array | pass | 35ms | |
| ✅ | GET /api/session/check → 200 + { exists: boolean } | pass | 10ms | |
| ✅ | GET /api/site-credentials → 200 + { found: boolean } | pass | 5ms | |
| ✅ | GET / serves HTML frontend | pass | 4ms | |
| ✅ | [chaos] POST /api/scrape with no URL → 400 | pass | 52ms | |
| ✅ | [chaos] GET unknown endpoint → 404 | pass | 11ms | |
| ✅ | [chaos] GET /api/saves/:id with fake ID → 404 | pass | 5ms | |


