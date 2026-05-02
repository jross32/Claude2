# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-02T05:03:16.090Z
**Commit:** `cee22df`
**Duration:** 14041ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Server starts without crashing | pass | 9312ms | |
| ✅ | GET /api/saves → 200 + JSON array | pass | 4050ms | |
| ✅ | GET /api/schedules → 200 + JSON array | pass | 20ms | |
| ✅ | GET /api/session/check → 200 + { exists: boolean } | pass | 6ms | |
| ✅ | GET /api/site-credentials → 200 + { found: boolean } | pass | 4ms | |
| ✅ | GET / serves HTML frontend | pass | 2ms | |
| ✅ | [chaos] POST /api/scrape with no URL → 400 | pass | 30ms | |
| ✅ | [chaos] GET unknown endpoint → 404 | pass | 6ms | |
| ✅ | [chaos] GET /api/saves/:id with fake ID → 404 | pass | 3ms | |


