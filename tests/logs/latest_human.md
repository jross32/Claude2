# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:26:23.942Z
**Commit:** `658e131`
**Duration:** 13612ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Server starts without crashing | pass | 8126ms | |
| ✅ | GET /api/saves → 200 + JSON array | pass | 4760ms | |
| ✅ | GET /api/schedules → 200 + JSON array | pass | 24ms | |
| ✅ | GET /api/session/check → 200 + { exists: boolean } | pass | 12ms | |
| ✅ | GET /api/site-credentials → 200 + { found: boolean } | pass | 6ms | |
| ✅ | GET / serves HTML frontend | pass | 8ms | |
| ✅ | [chaos] POST /api/scrape with no URL → 400 | pass | 46ms | |
| ✅ | [chaos] GET unknown endpoint → 404 | pass | 12ms | |
| ✅ | [chaos] GET /api/saves/:id with fake ID → 404 | pass | 5ms | |


