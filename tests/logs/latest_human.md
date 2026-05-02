# Test Results — integration

**Status:** ❌ FAILING
**Run:** 2026-05-02T06:44:06.820Z
**Commit:** `36cba13`
**Duration:** 33176ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 7 | 3 | 4 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | MCP tools/list returns the live exposed toolset | pass | 28ms | |
| ✅ | MCP tools/call can invoke server_info end-to-end | pass | 8308ms | |
| ✅ | MCP prompts/list and prompts/get return the current prompt catalog | pass | 16ms | |
| ❌ | MCP browser automation tools can drive a live session end-to-end | fail | 1132ms | |
| ❌ | MCP resources/list, resources/templates/list, and resources/read expose saved scrape context | fail | 17ms | |
| ❌ | MCP completion/complete suggests saved session IDs | fail | 22ms | |
| ❌ | MCP resource subscriptions emit update notifications when saves change | fail | 15136ms | |

## Errors

### ❌ MCP browser automation tools can drive a live session end-to-end
```
Unexpected token 'E', "Error (ups"... is not valid JSON
SyntaxError: Unexpected token 'E', "Error (ups"... is not valid JSON
    at JSON.parse (<anonymous>)
    at parseToolData (C:\Users\justi\Claude2\tests\integration\mcp-protocol.test.js:167:15)
    at C:\Users\justi\Claude2\tests\integration\mcp-protocol.test.js:249:24
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\integration\mcp-protocol.test.js:240:5)
```

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
Expected completion results to include mcp-integration-1777704218827
Error: Expected completion results to include mcp-integration-1777704218827
    at C:\Users\justi\Claude2\tests\integration\mcp-protocol.test.js:344:15
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\integration\mcp-protocol.test.js:336:5)
```

### ❌ MCP resource subscriptions emit update notifications when saves change
```
Condition not met within 15000ms
Error: Condition not met within 15000ms
    at waitFor (C:\Users\justi\Claude2\tests\integration\mcp-protocol.test.js:27:9)
    at async C:\Users\justi\Claude2\tests\integration\mcp-protocol.test.js:367:7
    at async TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:22)
    at async main (C:\Users\justi\Claude2\tests\integration\mcp-protocol.test.js:350:5)
```
## Suggested Next Steps

- Run `/new-test` to dig into failing tests
- Check `tests/logs/raw/` for full history