# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:19:12.125Z
**Commit:** `3cc1ef1`
**Duration:** 11303ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Server starts without crashing | pass | 5909ms | |
| ✅ | GET /api/saves → 200 + JSON array | pass | 4639ms | |
| ✅ | GET /api/schedules → 200 + JSON array | pass | 21ms | |
| ✅ | GET /api/session/check → 200 + { exists: boolean } | pass | 10ms | |
| ✅ | GET /api/site-credentials → 200 + { found: boolean } | pass | 4ms | |
| ✅ | GET / serves HTML frontend | pass | 7ms | |
| ✅ | [chaos] POST /api/scrape with no URL → 400 | pass | 45ms | |
| ✅ | [chaos] GET unknown endpoint → 404 | pass | 11ms | |
| ✅ | [chaos] GET /api/saves/:id with fake ID → 404 | pass | 5ms | |


