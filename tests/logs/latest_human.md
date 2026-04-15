# Test Results — api

**Status:** ❌ FAILING
**Run:** 2026-04-15T08:13:06.142Z
**Commit:** `a950dd9`
**Duration:** 16108ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 14 | 7 | 7 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ❌ | POST /api/scrape with no body → 400 + error | fail | 129ms | |
| ❌ | POST /api/scrape with valid url → 200 + { sessionId, message } | fail | 117ms | |
| ❌ | GET /api/scrape/active returns active session snapshots | fail | 0ms | |
| ❌ | GET /api/scrape/:id/status returns live session snapshot | fail | 1ms | |
| ✅ | POST /api/scrape/:id/stop for active session → 200 | pass | 0ms | |
| ❌ | GET /api/scrape/:id/status falls back after active session is removed | fail | 0ms | |
| ❌ | POST /api/scrape/:id/stop for unknown session → 404 | fail | 134ms | |
| ✅ | POST /api/scrape/:id/pause for unknown session → 404 | pass | 131ms | |
| ✅ | GET /api/scrape/:id/status for unknown session → 404 | pass | 110ms | |
| ✅ | POST /api/scrape/:id/resume for unknown session → 404 | pass | 106ms | |
| ✅ | POST /api/scrape/:id/verify for unknown session → 404 | pass | 146ms | |
| ✅ | POST /api/scrape/:id/credentials for unknown session → 404 | pass | 226ms | |
| ❌ | [chaos] POST /api/scrape with urls: [] → 400 | fail | 101ms | |
| ✅ | [chaos] POST /api/scrape with malformed maxPages → does not 500 | pass | 109ms | |

## Errors

### ❌ POST /api/scrape with no body → 400 + error
```
Expected 400, got 404
Error: Expected 400, got 404
    at C:\Users\justi\Claude2\tests\api\scrape.test.js:30:35
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\api\scrape.test.js:28:3)
```

### ❌ POST /api/scrape with valid url → 200 + { sessionId, message }
```
Expected 200, got 404
Error: Expected 200, got 404
    at C:\Users\justi\Claude2\tests\api\scrape.test.js:38:35
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\api\scrape.test.js:36:3)
```

### ❌ GET /api/scrape/active returns active session snapshots
```
Expected live session from previous test
Error: Expected live session from previous test
    at C:\Users\justi\Claude2\tests\api\scrape.test.js:47:31
    at TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:28)
    at main (C:\Users\justi\Claude2\tests\api\scrape.test.js:46:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
```

### ❌ GET /api/scrape/:id/status returns live session snapshot
```
Expected live session from previous test
Error: Expected live session from previous test
    at C:\Users\justi\Claude2\tests\api\scrape.test.js:61:31
    at TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:28)
    at main (C:\Users\justi\Claude2\tests\api\scrape.test.js:60:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
```

### ❌ GET /api/scrape/:id/status falls back after active session is removed
```
Expected live session from previous test
Error: Expected live session from previous test
    at C:\Users\justi\Claude2\tests\api\scrape.test.js:83:31
    at TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:28)
    at main (C:\Users\justi\Claude2\tests\api\scrape.test.js:82:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
```

### ❌ POST /api/scrape/:id/stop for unknown session → 404
```
Unexpected token '<', "<!DOCTYPE "... is not valid JSON
SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
    at JSON.parse (<anonymous>)
    at json (C:\Users\justi\Claude2\tests\api\_server.js:84:34)
    at C:\Users\justi\Claude2\tests\api\scrape.test.js:108:18
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\api\scrape.test.js:105:3)
```

### ❌ [chaos] POST /api/scrape with urls: [] → 400
```
Expected 400, got 404
Error: Expected 400, got 404
    at C:\Users\justi\Claude2\tests\api\scrape.test.js:147:35
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\api\scrape.test.js:145:3)
```
## Suggested Next Steps

- Run `/new-test` to dig into failing tests
- Check `tests/logs/raw/` for full history