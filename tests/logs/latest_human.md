# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-15T08:14:23.901Z
**Commit:** `5c407e7`
**Duration:** 15829ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 14 | 14 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/scrape with no body → 400 + error | pass | 71ms | |
| ✅ | POST /api/scrape with valid url → 200 + { sessionId, message } | pass | 6ms | |
| ✅ | GET /api/scrape/active returns active session snapshots | pass | 28ms | |
| ✅ | GET /api/scrape/:id/status returns live session snapshot | pass | 12ms | |
| ✅ | POST /api/scrape/:id/stop for active session → 200 | pass | 112ms | |
| ✅ | GET /api/scrape/:id/status falls back after active session is removed | pass | 7231ms | |
| ✅ | POST /api/scrape/:id/stop for unknown session → 404 | pass | 5ms | |
| ✅ | POST /api/scrape/:id/pause for unknown session → 404 | pass | 4ms | |
| ✅ | GET /api/scrape/:id/status for unknown session → 404 | pass | 5ms | |
| ✅ | POST /api/scrape/:id/resume for unknown session → 404 | pass | 5ms | |
| ✅ | POST /api/scrape/:id/verify for unknown session → 404 | pass | 3ms | |
| ✅ | POST /api/scrape/:id/credentials for unknown session → 404 | pass | 4ms | |
| ✅ | [chaos] POST /api/scrape with urls: [] → 400 | pass | 3ms | |
| ✅ | [chaos] POST /api/scrape with malformed maxPages → does not 500 | pass | 5ms | |


