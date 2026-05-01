# Test Results — unit

**Status:** ❌ FAILING
**Run:** 2026-05-01T14:30:35.640Z
**Commit:** `2f68c8d`
**Duration:** 154ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 31 | 29 | 2 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ❌ | MCP server exports 55 tools | fail | 1ms | |
| ✅ | MCP tool names are unique | pass | 0ms | |
| ✅ | New MCP tools are present | pass | 1ms | |
| ✅ | All MCP tools include title and annotations | pass | 0ms | |
| ✅ | research_url schema exposes auto/fast/deep modes | pass | 0ms | |
| ✅ | Read-only MCP tools expose readOnlyHint | pass | 0ms | |
| ✅ | map_site_for_goal schema exposes scope and exhaustive controls | pass | 0ms | |
| ✅ | Fixed resources and resource templates are exported | pass | 0ms | |
| ✅ | truncateText limits long strings | pass | 0ms | |
| ✅ | searchSavedPages returns snippets and match counts | pass | 2ms | |
| ✅ | research question router classifies extractive and deep prompts | pass | 4ms | |
| ✅ | buildGoalModel expands deals and price-sensitive goals | pass | 3ms | |
| ✅ | scoreGoalText matches retail deal sections | pass | 3ms | |
| ✅ | buildResearchEvidence respects fast profile budget and ranks matches first | pass | 4ms | |
| ✅ | buildSaveOverview summarizes counts, sections, and highlights | pass | 13ms | |
| ✅ | buildApiSurface groups endpoints and operations | pass | 1ms | |
| ✅ | collectStoreContext detects visible/API mismatches | pass | 2ms | |
| ✅ | extractDealsFromSave finds deal snippets from pages and APIs | pass | 5ms | |
| ✅ | buildOrientationFromSave maps multi-section deal flows | pass | 75ms | |
| ✅ | buildOrientationFromSave infers missing sibling sections when adjacent deal pages are present | pass | 7ms | |
| ✅ | scope selection and stop logic behave as expected | pass | 2ms | |
| ✅ | findSiteIssues flags security and context problems | pass | 3ms | |
| ✅ | analyzeResearchQuestion skips AI backend for extractive auto mode | pass | 7ms | |
| ✅ | analyzeResearchQuestion falls back cleanly when AI backend returns null | pass | 2ms | |
| ✅ | normalizeCompletedScrapeResult converts saved scrapes into result shape | pass | 1ms | |
| ✅ | toResearchPage reads saved-page meta fields | pass | 0ms | |
| ✅ | createToolSuccess includes structuredContent | pass | 0ms | |
| ✅ | createToolFailure includes standardized error shape | pass | 1ms | |
| ✅ | Prompt builder references narrow MCP reads | pass | 2ms | |
| ❌ | New workflow prompts reference the new narrow tools/resources | fail | 0ms | |
| ✅ | Resource URI parser understands templated scrape URIs | pass | 1ms | |

## Errors

### ❌ MCP server exports 55 tools
```
Expected 55 tools, got 68
Error: Expected 55 tools, got 68
    at C:\Users\justi\Claude2\tests\unit\mcp-server.test.js:51:36
    at TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:28)
    at main (C:\Users\justi\Claude2\tests\unit\mcp-server.test.js:49:16)
    at Object.<anonymous> (C:\Users\justi\Claude2\tests\unit\mcp-server.test.js:698:1)
    at Module._compile (node:internal/modules/cjs/loader:1812:14)
    at Object..js (node:internal/modules/cjs/loader:1943:10)
    at Module.load (node:internal/modules/cjs/loader:1533:32)
    at Module._load (node:internal/modules/cjs/loader:1335:12)
    at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
    at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
```

### ❌ New workflow prompts reference the new narrow tools/resources
```
Goal-planning prompt missing expected references
Error: Goal-planning prompt missing expected references
    at C:\Users\justi\Claude2\tests\unit\mcp-server.test.js:675:13
    at TestRunner.run (C:\Users\justi\Claude2\tests\runner.js:40:28)
    at main (C:\Users\justi\Claude2\tests\unit\mcp-server.test.js:659:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
```
## Suggested Next Steps

- Run `/new-test` to dig into failing tests
- Check `tests/logs/raw/` for full history