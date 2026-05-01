# Test Results — integration

**Status:** ❌ FAILING
**Run:** 2026-05-01T15:29:41.416Z
**Commit:** `75cf381`
**Duration:** 36580ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 6 | 5 | 1 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | MCP tools/list returns the live exposed toolset | pass | 10ms | |
| ✅ | MCP tools/call can invoke server_info end-to-end | pass | 2449ms | |
| ✅ | MCP prompts/list and prompts/get return the current prompt catalog | pass | 7ms | |
| ❌ | MCP resources/list, resources/templates/list, and resources/read expose saved scrape context | fail | 3572ms | |
| ✅ | MCP completion/complete suggests saved session IDs | pass | 4525ms | |
| ✅ | MCP resource subscriptions emit update notifications when saves change | pass | 14405ms | |

## Errors

### ❌ MCP resources/list, resources/templates/list, and resources/read expose saved scrape context
```
Expected quickstart docs content
Error: Expected quickstart docs content
    at C:\Users\justi\Claude2\tests\integration\mcp-protocol.test.js:234:62
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\integration\mcp-protocol.test.js:218:5)
```
## Suggested Next Steps

- Run `/new-test` to dig into failing tests
- Check `tests/logs/raw/` for full history