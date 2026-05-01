# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T15:22:02.383Z
**Commit:** `0f0181b`
**Duration:** 21061ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 19 | 19 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/scrape with no body → 400 + error | pass | 73ms | |
| ✅ | POST /api/scrape with valid url → 200 + { sessionId, message } | pass | 8ms | |
| ✅ | GET /api/scrape/active returns active session snapshots | pass | 371ms | |
| ✅ | GET /api/scrape/:id/status returns live session snapshot | pass | 7ms | |
| ✅ | POST /api/scrape/:id/stop for active session → 200 | pass | 24ms | |
| ✅ | GET /api/scrape/:id/status falls back after active session is removed | pass | 1280ms | |
| ✅ | POST /api/scrape with uiVisible=false starts a headless session | pass | 3ms | |
| ✅ | GET /api/scrape/active hides headless sessions by default | pass | 9ms | |
| ✅ | GET /api/saves hides headless MCP saves by default but exposes them with includeHidden | pass | 11137ms | |
| ✅ | POST /api/scrape/:id/stop for unknown session → 404 | pass | 6ms | |
| ✅ | POST /api/scrape/:id/pause for unknown session → 404 | pass | 9ms | |
| ✅ | GET /api/scrape/:id/status for unknown session → 404 | pass | 7ms | |
| ✅ | POST /api/ai/chat with no question → 400 | pass | 12ms | |
| ✅ | POST /api/ai/chat analyzes current scrape data without Ollama for extractive questions | pass | 27ms | |
| ✅ | POST /api/scrape/:id/resume for unknown session → 404 | pass | 5ms | |
| ✅ | POST /api/scrape/:id/verify for unknown session → 404 | pass | 5ms | |
| ✅ | POST /api/scrape/:id/credentials for unknown session → 404 | pass | 5ms | |
| ✅ | [chaos] POST /api/scrape with urls: [] → 400 | pass | 3ms | |
| ✅ | [chaos] POST /api/scrape with malformed maxPages → does not 500 | pass | 3ms | |


