# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-02T04:10:27.326Z
**Commit:** `290cf66`
**Duration:** 13961ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Server starts without crashing | pass | 8359ms | |
| ✅ | GET /api/saves → 200 + JSON array | pass | 4904ms | |
| ✅ | GET /api/schedules → 200 + JSON array | pass | 19ms | |
| ✅ | GET /api/session/check → 200 + { exists: boolean } | pass | 8ms | |
| ✅ | GET /api/site-credentials → 200 + { found: boolean } | pass | 5ms | |
| ✅ | GET / serves HTML frontend | pass | 4ms | |
| ✅ | [chaos] POST /api/scrape with no URL → 400 | pass | 34ms | |
| ✅ | [chaos] GET unknown endpoint → 404 | pass | 8ms | |
| ✅ | [chaos] GET /api/saves/:id with fake ID → 404 | pass | 5ms | |


