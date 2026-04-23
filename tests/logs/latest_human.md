# Test Results — api

**Status:** ❌ FAILING
**Run:** 2026-04-23T22:35:18.234Z
**Commit:** `9fc173a`
**Duration:** 20809ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 19 | 18 | 1 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/scrape with no body → 400 + error | pass | 34ms | |
| ✅ | POST /api/scrape with valid url → 200 + { sessionId, message } | pass | 5ms | |
| ✅ | GET /api/scrape/active returns active session snapshots | pass | 251ms | |
| ✅ | GET /api/scrape/:id/status returns live session snapshot | pass | 5ms | |
| ✅ | POST /api/scrape/:id/stop for active session → 200 | pass | 10ms | |
| ✅ | GET /api/scrape/:id/status falls back after active session is removed | pass | 1563ms | |
| ✅ | POST /api/scrape with uiVisible=false starts a headless session | pass | 5ms | |
| ✅ | GET /api/scrape/active hides headless sessions by default | pass | 15ms | |
| ❌ | GET /api/saves hides headless MCP saves by default but exposes them with includeHidden | fail | 12132ms | |
| ✅ | POST /api/scrape/:id/stop for unknown session → 404 | pass | 5ms | |
| ✅ | POST /api/scrape/:id/pause for unknown session → 404 | pass | 3ms | |
| ✅ | GET /api/scrape/:id/status for unknown session → 404 | pass | 3ms | |
| ✅ | POST /api/ai/chat with no question → 400 | pass | 6ms | |
| ✅ | POST /api/ai/chat analyzes current scrape data without Ollama for extractive questions | pass | 21ms | |
| ✅ | POST /api/scrape/:id/resume for unknown session → 404 | pass | 3ms | |
| ✅ | POST /api/scrape/:id/verify for unknown session → 404 | pass | 4ms | |
| ✅ | POST /api/scrape/:id/credentials for unknown session → 404 | pass | 4ms | |
| ✅ | [chaos] POST /api/scrape with urls: [] → 400 | pass | 4ms | |
| ✅ | [chaos] POST /api/scrape with malformed maxPages → does not 500 | pass | 4ms | |

## Errors

### ❌ GET /api/saves hides headless MCP saves by default but exposes them with includeHidden
```
Condition not met within 12000ms
Error: Condition not met within 12000ms
    at waitFor (C:\Users\justi\Claude2\tests\api\scrape.test.js:17:9)
    at async C:\Users\justi\Claude2\tests\api\scrape.test.js:145:5
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\api\scrape.test.js:142:3)
```
## Suggested Next Steps

- Run `/new-test` to dig into failing tests
- Check `tests/logs/raw/` for full history