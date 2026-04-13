# Test Results — api

**Status:** ❌ FAILING
**Run:** 2026-04-13T22:23:28.549Z
**Commit:** `90fe59c`
**Duration:** 1063ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 8 | 2 | 6 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ❌ | GET /api/session/check with valid url → 200 + { exists: boolean } | fail | 116ms | |
| ❌ | GET /api/session/check for poolplayers.com → exists field present | fail | 102ms | |
| ❌ | DELETE /api/session with url → 200 + { cleared: boolean } | fail | 104ms | |
| ❌ | GET /api/site-credentials for unknown site → { found: false } | fail | 106ms | |
| ❌ | GET /api/site-credentials for poolplayers.com → { found: true, username: string } | fail | 103ms | |
| ❌ | [chaos] GET /api/session/check with no url → { exists: false } | fail | 85ms | |
| ✅ | [chaos] DELETE /api/session with no url → does not 500 | pass | 112ms | |
| ✅ | [chaos] GET /api/site-credentials with no url → does not 500 | pass | 111ms | |

## Errors

### ❌ GET /api/session/check with valid url → 200 + { exists: boolean }
```
Expected 200, got 404
Error: Expected 200, got 404
    at C:\Users\justi\Claude2\tests\api\session.test.js:17:35
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\api\session.test.js:15:3)
```

### ❌ GET /api/session/check for poolplayers.com → exists field present
```
Expected 200, got 404
Error: Expected 200, got 404
    at C:\Users\justi\Claude2\tests\api\session.test.js:25:35
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\api\session.test.js:23:3)
```

### ❌ DELETE /api/session with url → 200 + { cleared: boolean }
```
Expected 200, got 404
Error: Expected 200, got 404
    at C:\Users\justi\Claude2\tests\api\session.test.js:35:35
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\api\session.test.js:33:3)
```

### ❌ GET /api/site-credentials for unknown site → { found: false }
```
Expected 200, got 404
Error: Expected 200, got 404
    at C:\Users\justi\Claude2\tests\api\session.test.js:45:35
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\api\session.test.js:43:3)
```

### ❌ GET /api/site-credentials for poolplayers.com → { found: true, username: string }
```
Expected 200, got 404
Error: Expected 200, got 404
    at C:\Users\justi\Claude2\tests\api\session.test.js:54:35
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\api\session.test.js:52:3)
```

### ❌ [chaos] GET /api/session/check with no url → { exists: false }
```
Unexpected token '<', "<!DOCTYPE "... is not valid JSON
SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
    at JSON.parse (<anonymous>)
    at json (C:\Users\justi\Claude2\tests\api\_server.js:84:34)
    at C:\Users\justi\Claude2\tests\api\session.test.js:69:18
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\api\session.test.js:66:3)
```
## Suggested Next Steps

- Run `/new-test` to dig into failing tests
- Check `tests/logs/raw/` for full history