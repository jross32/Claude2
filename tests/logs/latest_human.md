# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-16T05:21:28.417Z
**Commit:** `9bff02b`
**Duration:** 13297ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 16 | 16 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/scrape with no body → 400 + error | pass | 94ms | |
| ✅ | POST /api/scrape with valid url → 200 + { sessionId, message } | pass | 8ms | |
| ✅ | GET /api/scrape/active returns active session snapshots | pass | 438ms | |
| ✅ | GET /api/scrape/:id/status returns live session snapshot | pass | 25ms | |
| ✅ | POST /api/scrape/:id/stop for active session → 200 | pass | 20ms | |
| ✅ | GET /api/scrape/:id/status falls back after active session is removed | pass | 5759ms | |
| ✅ | POST /api/scrape/:id/stop for unknown session → 404 | pass | 4ms | |
| ✅ | POST /api/scrape/:id/pause for unknown session → 404 | pass | 4ms | |
| ✅ | GET /api/scrape/:id/status for unknown session → 404 | pass | 5ms | |
| ✅ | POST /api/ai/chat with no question → 400 | pass | 5ms | |
| ✅ | POST /api/ai/chat analyzes current scrape data without Ollama for extractive questions | pass | 15ms | |
| ✅ | POST /api/scrape/:id/resume for unknown session → 404 | pass | 4ms | |
| ✅ | POST /api/scrape/:id/verify for unknown session → 404 | pass | 5ms | |
| ✅ | POST /api/scrape/:id/credentials for unknown session → 404 | pass | 3ms | |
| ✅ | [chaos] POST /api/scrape with urls: [] → 400 | pass | 3ms | |
| ✅ | [chaos] POST /api/scrape with malformed maxPages → does not 500 | pass | 3ms | |


