# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-03T15:05:39.783Z
**Commit:** `fefe070`
**Duration:** 12560ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Server starts without crashing | pass | 7959ms | |
| ✅ | GET /api/saves → 200 + JSON array | pass | 3933ms | |
| ✅ | GET /api/schedules → 200 + JSON array | pass | 10ms | |
| ✅ | GET /api/session/check → 200 + { exists: boolean } | pass | 6ms | |
| ✅ | GET /api/site-credentials → 200 + { found: boolean } | pass | 3ms | |
| ✅ | GET / serves HTML frontend | pass | 5ms | |
| ✅ | [chaos] POST /api/scrape with no URL → 400 | pass | 25ms | |
| ✅ | [chaos] GET unknown endpoint → 404 | pass | 7ms | |
| ✅ | [chaos] GET /api/saves/:id with fake ID → 404 | pass | 4ms | |


