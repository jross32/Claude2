# Test Results — api

**Status:** ❌ FAILING
**Run:** 2026-05-02T06:39:33.099Z
**Commit:** `d9f0ffe`
**Duration:** 13451ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 3 | 0 | 3 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ❌ | POST /api/browser/sessions opens a live browser automation session | fail | 6012ms | |
| ❌ | Browser session actions can type, click, wait, and refresh state | fail | 1ms | |
| ❌ | Browser session save, screenshot, and scraper handoff work end-to-end | fail | 1ms | |

## Errors

### ❌ POST /api/browser/sessions opens a live browser automation session
```
timeout
Error: timeout
    at ClientRequest.<anonymous> (C:\Users\justi\Claude2\tests\api\_server.js:87:53)
    at ClientRequest.emit (node:events:508:28)
    at Socket.emitRequestTimeout (node:_http_client:927:9)
    at Object.onceWrapper (node:events:622:28)
    at Socket.emit (node:events:520:35)
    at Socket._onTimeout (node:net:604:8)
    at listOnTimeout (node:internal/timers:605:17)
    at process.processTimers (node:internal/timers:541:7)
```

### ❌ Browser session actions can type, click, wait, and refresh state
```
browserSessionId not set
Error: browserSessionId not set
    at C:\Users\justi\Claude2\tests\api\browser.test.js:56:36
    at TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:28)
    at main (C:\Users\justi\Claude2\tests\api\browser.test.js:55:18)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
```

### ❌ Browser session save, screenshot, and scraper handoff work end-to-end
```
browserSessionId not set
Error: browserSessionId not set
    at C:\Users\justi\Claude2\tests\api\browser.test.js:97:36
    at TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:28)
    at main (C:\Users\justi\Claude2\tests\api\browser.test.js:96:18)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
```
## Suggested Next Steps

- Run `/new-test` to dig into failing tests
- Check `tests/logs/raw/` for full history