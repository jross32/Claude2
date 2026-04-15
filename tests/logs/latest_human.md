# Test Results — unit

**Status:** ✅ HEALTHY
**Run:** 2026-04-15T20:59:17.518Z
**Commit:** `b0585e5`
**Duration:** 52ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 19 | 19 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | MCP server exports 40 tools | pass | 0ms | |
| ✅ | MCP tool names are unique | pass | 0ms | |
| ✅ | New MCP tools are present | pass | 0ms | |
| ✅ | All MCP tools include title and annotations | pass | 0ms | |
| ✅ | research_url schema exposes auto/fast/deep modes | pass | 1ms | |
| ✅ | Read-only MCP tools expose readOnlyHint | pass | 1ms | |
| ✅ | Fixed resources and resource templates are exported | pass | 1ms | |
| ✅ | truncateText limits long strings | pass | 1ms | |
| ✅ | searchSavedPages returns snippets and match counts | pass | 3ms | |
| ✅ | research question router classifies extractive and deep prompts | pass | 4ms | |
| ✅ | buildResearchEvidence respects fast profile budget and ranks matches first | pass | 7ms | |
| ✅ | analyzeResearchQuestion skips Ollama for extractive auto mode | pass | 5ms | |
| ✅ | analyzeResearchQuestion falls back cleanly when Ollama returns null | pass | 3ms | |
| ✅ | normalizeCompletedScrapeResult converts saved scrapes into result shape | pass | 1ms | |
| ✅ | toResearchPage reads saved-page meta fields | pass | 0ms | |
| ✅ | createToolSuccess includes structuredContent | pass | 0ms | |
| ✅ | createToolFailure includes standardized error shape | pass | 1ms | |
| ✅ | Prompt builder references narrow MCP reads | pass | 1ms | |
| ✅ | Resource URI parser understands templated scrape URIs | pass | 2ms | |


