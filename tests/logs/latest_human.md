# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-05T05:16:21.864Z
**Commit:** `3050a8a`
**Duration:** 17219ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Server starts without crashing | pass | 10700ms | |
| ✅ | GET /api/saves → 200 + JSON array | pass | 5831ms | |
| ✅ | GET /api/schedules → 200 + JSON array | pass | 13ms | |
| ✅ | GET /api/session/check → 200 + { exists: boolean } | pass | 5ms | |
| ✅ | GET /api/site-credentials → 200 + { found: boolean } | pass | 4ms | |
| ✅ | GET / serves HTML frontend | pass | 5ms | |
| ✅ | [chaos] POST /api/scrape with no URL → 400 | pass | 38ms | |
| ✅ | [chaos] GET unknown endpoint → 404 | pass | 7ms | |
| ✅ | [chaos] GET /api/saves/:id with fake ID → 404 | pass | 3ms | |


