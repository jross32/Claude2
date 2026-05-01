# Test Results — api

**Status:** ❌ FAILING
**Run:** 2026-05-01T15:08:51.448Z
**Commit:** `aaf3fd8`
**Duration:** 13872ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 19 | 10 | 9 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ❌ | POST /api/scrape with no body → 400 + error | fail | 403ms | |
| ❌ | POST /api/scrape with valid url → 200 + { sessionId, message } | fail | 10ms | |
| ❌ | GET /api/scrape/active returns active session snapshots | fail | 0ms | |
| ❌ | GET /api/scrape/:id/status returns live session snapshot | fail | 0ms | |
| ✅ | POST /api/scrape/:id/stop for active session → 200 | pass | 0ms | |
| ❌ | GET /api/scrape/:id/status falls back after active session is removed | fail | 0ms | |
| ❌ | POST /api/scrape with uiVisible=false starts a headless session | fail | 5ms | |
| ❌ | GET /api/scrape/active hides headless sessions by default | fail | 0ms | |
| ❌ | GET /api/saves hides headless MCP saves by default but exposes them with includeHidden | fail | 0ms | |
| ✅ | POST /api/scrape/:id/stop for unknown session → 404 | pass | 39ms | |
| ✅ | POST /api/scrape/:id/pause for unknown session → 404 | pass | 10ms | |
| ✅ | GET /api/scrape/:id/status for unknown session → 404 | pass | 67ms | |
| ✅ | POST /api/ai/chat with no question → 400 | pass | 42ms | |
| ✅ | POST /api/ai/chat analyzes current scrape data without Ollama for extractive questions | pass | 20ms | |
| ✅ | POST /api/scrape/:id/resume for unknown session → 404 | pass | 3ms | |
| ✅ | POST /api/scrape/:id/verify for unknown session → 404 | pass | 2ms | |
| ✅ | POST /api/scrape/:id/credentials for unknown session → 404 | pass | 3ms | |
| ❌ | [chaos] POST /api/scrape with urls: [] → 400 | fail | 3ms | |
| ✅ | [chaos] POST /api/scrape with malformed maxPages → does not 500 | pass | 2ms | |

## Errors

### ❌ POST /api/scrape with no body → 400 + error
```
Expected 400, got 429
Error: Expected 400, got 429
    at C:\Users\justi\Claude2\tests\api\scrape.test.js:31:35
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\api\scrape.test.js:29:3)
```

### ❌ POST /api/scrape with valid url → 200 + { sessionId, message }
```
Expected 200, got 429
Error: Expected 200, got 429
    at C:\Users\justi\Claude2\tests\api\scrape.test.js:39:35
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\api\scrape.test.js:37:3)
```

### ❌ GET /api/scrape/active returns active session snapshots
```
Expected live session from previous test
Error: Expected live session from previous test
    at C:\Users\justi\Claude2\tests\api\scrape.test.js:48:31
    at TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:28)
    at main (C:\Users\justi\Claude2\tests\api\scrape.test.js:47:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
```

### ❌ GET /api/scrape/:id/status returns live session snapshot
```
Expected live session from previous test
Error: Expected live session from previous test
    at C:\Users\justi\Claude2\tests\api\scrape.test.js:62:31
    at TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:28)
    at main (C:\Users\justi\Claude2\tests\api\scrape.test.js:61:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
```

### ❌ GET /api/scrape/:id/status falls back after active session is removed
```
Expected live session from previous test
Error: Expected live session from previous test
    at C:\Users\justi\Claude2\tests\api\scrape.test.js:84:31
    at TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:28)
    at main (C:\Users\justi\Claude2\tests\api\scrape.test.js:83:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
```

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