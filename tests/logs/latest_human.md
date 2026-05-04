# Test Results — smoke

**Status:** ✅ HEALTHY
**Run:** 2026-05-04T04:14:50.224Z
**Commit:** `9232231`
**Duration:** 16132ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 9 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Server starts without crashing | pass | 10403ms | |
| ✅ | GET /api/saves → 200 + JSON array | pass | 4907ms | |
| ✅ | GET /api/schedules → 200 + JSON array | pass | 21ms | |
| ✅ | GET /api/session/check → 200 + { exists: boolean } | pass | 22ms | |
| ✅ | GET /api/site-credentials → 200 + { found: boolean } | pass | 5ms | |
| ✅ | GET / serves HTML frontend | pass | 7ms | |
| ✅ | [chaos] POST /api/scrape with no URL → 400 | pass | 84ms | |
| ✅ | [chaos] GET unknown endpoint → 404 | pass | 66ms | |
| ✅ | [chaos] GET /api/saves/:id with fake ID → 404 | pass | 6ms | |


