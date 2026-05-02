# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-05-02T04:11:58.731Z
**Commit:** `c45b905`
**Duration:** 25483ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 19 | 19 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/scrape with no body → 400 + error | pass | 65ms | |
| ✅ | POST /api/scrape with valid url → 200 + { sessionId, message } | pass | 7ms | |
| ✅ | GET /api/scrape/active returns active session snapshots | pass | 311ms | |
| ✅ | GET /api/scrape/:id/status returns live session snapshot | pass | 17ms | |
| ✅ | POST /api/scrape/:id/stop for active session → 200 | pass | 19ms | |
| ✅ | GET /api/scrape/:id/status falls back after active session is removed | pass | 2221ms | |
| ✅ | POST /api/scrape with uiVisible=false starts a headless session | pass | 4ms | |
| ✅ | GET /api/scrape/active hides headless sessions by default | pass | 56ms | |
| ✅ | GET /api/saves hides headless MCP saves by default but exposes them with includeHidden | pass | 13763ms | |
| ✅ | POST /api/scrape/:id/stop for unknown session → 404 | pass | 5ms | |
| ✅ | POST /api/scrape/:id/pause for unknown session → 404 | pass | 5ms | |
| ✅ | GET /api/scrape/:id/status for unknown session → 404 | pass | 4ms | |
| ✅ | POST /api/ai/chat with no question → 400 | pass | 6ms | |
| ✅ | POST /api/ai/chat analyzes current scrape data without Ollama for extractive questions | pass | 19ms | |
| ✅ | POST /api/scrape/:id/resume for unknown session → 404 | pass | 4ms | |
| ✅ | POST /api/scrape/:id/verify for unknown session → 404 | pass | 3ms | |
| ✅ | POST /api/scrape/:id/credentials for unknown session → 404 | pass | 4ms | |
| ✅ | [chaos] POST /api/scrape with urls: [] → 400 | pass | 3ms | |
| ✅ | [chaos] POST /api/scrape with malformed maxPages → does not 500 | pass | 5ms | |


