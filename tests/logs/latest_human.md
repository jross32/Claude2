# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-03T00:06:40.076Z
**Commit:** `ce616ab`
**Duration:** 14685ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Server starts without crashing | pass | 9060ms | |
| ✅ | GET /api/saves → 200 + JSON array | pass | 4934ms | |
| ✅ | GET /api/schedules → 200 + JSON array | pass | 6ms | |
| ✅ | GET /api/session/check → 200 + { exists: boolean } | pass | 8ms | |
| ✅ | GET /api/site-credentials → 200 + { found: boolean } | pass | 5ms | |
| ✅ | GET / serves HTML frontend | pass | 5ms | |
| ✅ | [chaos] POST /api/scrape with no URL → 400 | pass | 31ms | |
| ✅ | [chaos] GET unknown endpoint → 404 | pass | 7ms | |
| ✅ | [chaos] GET /api/saves/:id with fake ID → 404 | pass | 4ms | |


