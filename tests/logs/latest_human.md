# Test Results — smoke

**Status:** ❌ FAILING
**Run:** 2026-04-16T10:31:56.388Z
**Commit:** `a4633c3`
**Duration:** 4787ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 9 | 4 | 5 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | Server starts without crashing | pass | 1821ms | |
| ❌ | GET /api/saves → 200 + JSON array | fail | 350ms | |
| ❌ | GET /api/schedules → 200 + JSON array | fail | 195ms | |
| ❌ | GET /api/session/check → 200 + { exists: boolean } | fail | 524ms | |
| ❌ | GET /api/site-credentials → 200 + { found: boolean } | fail | 166ms | |
| ✅ | GET / serves HTML frontend | pass | 344ms | |
| ❌ | [chaos] POST /api/scrape with no URL → 400 | fail | 314ms | |
| ✅ | [chaos] GET unknown endpoint → 404 | pass | 234ms | |
| ✅ | [chaos] GET /api/saves/:id with fake ID → 404 | pass | 193ms | |

## Errors

### ❌ GET /api/saves → 200 + JSON array
```
Expected 200, got 404
Error: Expected 200, got 404
    at C:\Users\justi\Claude2\tests\smoke\server-startup.test.js:92:35
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\smoke\server-startup.test.js:90:3)
```

### ❌ GET /api/schedules → 200 + JSON array
```
Expected 200, got 404
Error: Expected 200, got 404
    at C:\Users\justi\Claude2\tests\smoke\server-startup.test.js:100:35
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\smoke\server-startup.test.js:98:3)
```

### ❌ GET /api/session/check → 200 + { exists: boolean }
```
Expected 200, got 404
Error: Expected 200, got 404
    at C:\Users\justi\Claude2\tests\smoke\server-startup.test.js:108:35
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\smoke\server-startup.test.js:106:3)
```

### ❌ GET /api/site-credentials → 200 + { found: boolean }
```
Expected 200, got 404
Error: Expected 200, got 404
    at C:\Users\justi\Claude2\tests\smoke\server-startup.test.js:116:35
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\smoke\server-startup.test.js:114:3)
```

### ❌ [chaos] POST /api/scrape with no URL → 400
```
Expected 400, got 404
Error: Expected 400, got 404
    at C:\Users\justi\Claude2\tests\smoke\server-startup.test.js:133:35
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\smoke\server-startup.test.js:131:3)
```
## Suggested Next Steps

- Run `/new-test` to dig into failing tests
- Check `tests/logs/raw/` for full history