# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-02T06:04:56.077Z
**Commit:** `ec0b368`
**Duration:** 14520ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Server starts without crashing | pass | 8756ms | |
| ✅ | GET /api/saves → 200 + JSON array | pass | 4978ms | |
| ✅ | GET /api/schedules → 200 + JSON array | pass | 30ms | |
| ✅ | GET /api/session/check → 200 + { exists: boolean } | pass | 62ms | |
| ✅ | GET /api/site-credentials → 200 + { found: boolean } | pass | 7ms | |
| ✅ | GET / serves HTML frontend | pass | 6ms | |
| ✅ | [chaos] POST /api/scrape with no URL → 400 | pass | 51ms | |
| ✅ | [chaos] GET unknown endpoint → 404 | pass | 13ms | |
| ✅ | [chaos] GET /api/saves/:id with fake ID → 404 | pass | 6ms | |


