# Test Results — api

**Status:** ❌ FAILING
**Run:** 2026-05-01T15:21:26.012Z
**Commit:** `1e86d70`
**Duration:** 17165ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 19 | 15 | 4 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | POST /api/scrape with no body → 400 + error | pass | 4709ms | |
| ✅ | POST /api/scrape with valid url → 200 + { sessionId, message } | pass | 533ms | |
| ✅ | GET /api/scrape/active returns active session snapshots | pass | 47ms | |
| ✅ | GET /api/scrape/:id/status returns live session snapshot | pass | 13ms | |
| ✅ | POST /api/scrape/:id/stop for active session → 200 | pass | 9ms | |
| ✅ | GET /api/scrape/:id/status falls back after active session is removed | pass | 2269ms | |
| ❌ | POST /api/scrape with uiVisible=false starts a headless session | fail | 3ms | |
| ❌ | GET /api/scrape/active hides headless sessions by default | fail | 0ms | |
| ❌ | GET /api/saves hides headless MCP saves by default but exposes them with includeHidden | fail | 0ms | |
| ✅ | POST /api/scrape/:id/stop for unknown session → 404 | pass | 3ms | |
| ✅ | POST /api/scrape/:id/pause for unknown session → 404 | pass | 2ms | |
| ✅ | GET /api/scrape/:id/status for unknown session → 404 | pass | 3ms | |
| ✅ | POST /api/ai/chat with no question → 400 | pass | 3ms | |
| ✅ | POST /api/ai/chat analyzes current scrape data without Ollama for extractive questions | pass | 12ms | |
| ✅ | POST /api/scrape/:id/resume for unknown session → 404 | pass | 3ms | |
| ✅ | POST /api/scrape/:id/verify for unknown session → 404 | pass | 3ms | |
| ✅ | POST /api/scrape/:id/credentials for unknown session → 404 | pass | 4ms | |
| ❌ | [chaos] POST /api/scrape with urls: [] → 400 | fail | 3ms | |
| ✅ | [chaos] POST /api/scrape with malformed maxPages → does not 500 | pass | 2ms | |

## Errors

### ❌ POST /api/scrape with uiVisible=false starts a headless session
```
Expected 200, got 429
Error: Expected 200, got 429
    at C:\Users\justi\Claude2\tests\api\scrape.test.js:113:35
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\api\scrape.test.js:106:3)
```

### ❌ GET /api/scrape/active hides headless sessions by default
```
Expected hidden session from previous test
Error: Expected hidden session from previous test
    at C:\Users\justi\Claude2\tests\api\scrape.test.js:121:33
    at TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:28)
    at main (C:\Users\justi\Claude2\tests\api\scrape.test.js:120:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
```

### ❌ GET /api/saves hides headless MCP saves by default but exposes them with includeHidden
```
Expected hidden session from previous test
Error: Expected hidden session from previous test
    at C:\Users\justi\Claude2\tests\api\scrape.test.js:143:33
    at TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:28)
    at main (C:\Users\justi\Claude2\tests\api\scrape.test.js:142:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
```

### ❌ [chaos] POST /api/scrape with urls: [] → 400
```
Expected 400, got 429
Error: Expected 400, got 429
    at C:\Users\justi\Claude2\tests\api\scrape.test.js:258:35
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\api\scrape.test.js:256:3)
```
## Suggested Next Steps

- Run `/new-test` to dig into failing tests
- Check `tests/logs/raw/` for full history