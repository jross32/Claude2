# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-02T05:34:27.656Z
**Commit:** `1029ae4`
**Duration:** 13529ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Server starts without crashing | pass | 8080ms | |
| ✅ | GET /api/saves → 200 + JSON array | pass | 4733ms | |
| ✅ | GET /api/schedules → 200 + JSON array | pass | 22ms | |
| ✅ | GET /api/session/check → 200 + { exists: boolean } | pass | 8ms | |
| ✅ | GET /api/site-credentials → 200 + { found: boolean } | pass | 4ms | |
| ✅ | GET / serves HTML frontend | pass | 4ms | |
| ✅ | [chaos] POST /api/scrape with no URL → 400 | pass | 43ms | |
| ✅ | [chaos] GET unknown endpoint → 404 | pass | 8ms | |
| ✅ | [chaos] GET /api/saves/:id with fake ID → 404 | pass | 4ms | |


