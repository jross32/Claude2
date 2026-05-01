# Test Results — integration

**Status:** ❌ FAILING
**Run:** 2026-05-01T15:26:18.272Z
**Commit:** `1c0cf59`
**Duration:** 36235ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 6 | 3 | 3 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | MCP tools/list returns the live exposed toolset | pass | 23ms | |
| ✅ | MCP tools/call can invoke server_info end-to-end | pass | 6981ms | |
| ✅ | MCP prompts/list and prompts/get return the current prompt catalog | pass | 9ms | |
| ❌ | MCP resources/list, resources/templates/list, and resources/read expose saved scrape context | fail | 11ms | |
| ❌ | MCP completion/complete suggests saved session IDs | fail | 9ms | |
| ❌ | MCP resource subscriptions emit update notifications when saves change | fail | 15165ms | |

## Errors

### ❌ MCP resources/list, resources/templates/list, and resources/read expose saved scrape context
```
MCP error -32603: 
McpError: MCP error -32603: 
    at McpError.fromError (C:\Users\justi\Claude2\node_modules\@modelcontextprotocol\sdk\dist\cjs\types.js:2086:16)
    at Client._onresponse (C:\Users\justi\Claude2\node_modules\@modelcontextprotocol\sdk\dist\cjs\shared\protocol.js:494:47)
    at _transport.onmessage (C:\Users\justi\Claude2\node_modules\@modelcontextprotocol\sdk\dist\cjs\shared\protocol.js:238:22)
    at StdioClientTransport.processReadBuffer (C:\Users\justi\Claude2\node_modules\@modelcontextprotocol\sdk\dist\cjs\client\stdio.js:137:33)
    at Socket.<anonymous> (C:\Users\justi\Claude2\node_modules\@modelcontextprotocol\sdk\dist\cjs\client\stdio.js:99:22)
    at Socket.emit (node:events:508:28)
    at addChunk (node:internal/streams/readable:563:12)
    at readableAddChunkPushByteMode (node:internal/streams/readable:514:3)
    at Readable.push (node:internal/streams/readable:394:5)
    at Pipe.onStreamRead (node:internal/stream_base_commons:189:23)
```

### ❌ MCP completion/complete suggests saved session IDs
```
Expected completion results to include mcp-integration-1777649152409
Error: Expected completion results to include mcp-integration-1777649152409
    at C:\Users\justi\Claude2\tests\integration\mcp-protocol.test.js:255:15
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\integration\mcp-protocol.test.js:247:5)
```

### ❌ MCP resource subscriptions emit update notifications when saves change
```
Condition not met within 15000ms
Error: Condition not met within 15000ms
    at waitFor (C:\Users\justi\Claude2\tests\integration\mcp-protocol.test.js:26:9)
    at async C:\Users\justi\Claude2\tests\integration\mcp-protocol.test.js:278:7
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\integration\mcp-protocol.test.js:261:5)
```
## Suggested Next Steps

- Run `/new-test` to dig into failing tests
- Check `tests/logs/raw/` for full history