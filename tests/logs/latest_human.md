# Test Results — api

**Status:** ✅ HEALTHY
**Run:** 2026-04-23T22:38:20.454Z
**Commit:** `91a992a`
**Duration:** 14241ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 19 | 19 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/scrape with no body → 400 + error | pass | 32ms | |
| ✅ | POST /api/scrape with valid url → 200 + { sessionId, message } | pass | 4ms | |
| ✅ | GET /api/scrape/active returns active session snapshots | pass | 207ms | |
| ✅ | GET /api/scrape/:id/status returns live session snapshot | pass | 4ms | |
| ✅ | POST /api/scrape/:id/stop for active session → 200 | pass | 15ms | |
| ✅ | GET /api/scrape/:id/status falls back after active session is removed | pass | 1286ms | |
| ✅ | POST /api/scrape with uiVisible=false starts a headless session | pass | 3ms | |
| ✅ | GET /api/scrape/active hides headless sessions by default | pass | 10ms | |
| ✅ | GET /api/saves hides headless MCP saves by default but exposes them with includeHidden | pass | 6887ms | |
| ✅ | POST /api/scrape/:id/stop for unknown session → 404 | pass | 8ms | |
| ✅ | POST /api/scrape/:id/pause for unknown session → 404 | pass | 8ms | |
| ✅ | GET /api/scrape/:id/status for unknown session → 404 | pass | 5ms | |
| ✅ | POST /api/ai/chat with no question → 400 | pass | 5ms | |
| ✅ | POST /api/ai/chat analyzes current scrape data without Ollama for extractive questions | pass | 20ms | |
| ✅ | POST /api/scrape/:id/resume for unknown session → 404 | pass | 5ms | |
| ✅ | POST /api/scrape/:id/verify for unknown session → 404 | pass | 4ms | |
| ✅ | POST /api/scrape/:id/credentials for unknown session → 404 | pass | 3ms | |
| ✅ | [chaos] POST /api/scrape with urls: [] → 400 | pass | 3ms | |
| ✅ | [chaos] POST /api/scrape with malformed maxPages → does not 500 | pass | 3ms | |


