# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-16T11:03:05.907Z
**Commit:** `11e6aca`
**Duration:** 14845ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 19 | 19 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/scrape with no body → 400 + error | pass | 86ms | |
| ✅ | POST /api/scrape with valid url → 200 + { sessionId, message } | pass | 8ms | |
| ✅ | GET /api/scrape/active returns active session snapshots | pass | 447ms | |
| ✅ | GET /api/scrape/:id/status returns live session snapshot | pass | 7ms | |
| ✅ | POST /api/scrape/:id/stop for active session → 200 | pass | 5ms | |
| ✅ | GET /api/scrape/:id/status falls back after active session is removed | pass | 2792ms | |
| ✅ | POST /api/scrape with uiVisible=false starts a headless session | pass | 4ms | |
| ✅ | GET /api/scrape/active hides headless sessions by default | pass | 17ms | |
| ✅ | GET /api/saves hides headless MCP saves by default but exposes them with includeHidden | pass | 5665ms | |
| ✅ | POST /api/scrape/:id/stop for unknown session → 404 | pass | 5ms | |
| ✅ | POST /api/scrape/:id/pause for unknown session → 404 | pass | 4ms | |
| ✅ | GET /api/scrape/:id/status for unknown session → 404 | pass | 4ms | |
| ✅ | POST /api/ai/chat with no question → 400 | pass | 5ms | |
| ✅ | POST /api/ai/chat analyzes current scrape data without Ollama for extractive questions | pass | 18ms | |
| ✅ | POST /api/scrape/:id/resume for unknown session → 404 | pass | 4ms | |
| ✅ | POST /api/scrape/:id/verify for unknown session → 404 | pass | 3ms | |
| ✅ | POST /api/scrape/:id/credentials for unknown session → 404 | pass | 3ms | |
| ✅ | [chaos] POST /api/scrape with urls: [] → 400 | pass | 3ms | |
| ✅ | [chaos] POST /api/scrape with malformed maxPages → does not 500 | pass | 3ms | |


