# Test Results — unit

**Status:** ✅ HEALTHY
**Run:** 2026-04-16T03:46:33.200Z
**Commit:** `42710b8`
**Duration:** 48ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 19 | 19 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | MCP server exports 40 tools | pass | 1ms | |
| ✅ | MCP tool names are unique | pass | 0ms | |
| ✅ | New MCP tools are present | pass | 1ms | |
| ✅ | All MCP tools include title and annotations | pass | 0ms | |
| ✅ | research_url schema exposes auto/fast/deep modes | pass | 0ms | |
| ✅ | Read-only MCP tools expose readOnlyHint | pass | 0ms | |
| ✅ | Fixed resources and resource templates are exported | pass | 0ms | |
| ✅ | truncateText limits long strings | pass | 0ms | |
| ✅ | searchSavedPages returns snippets and match counts | pass | 2ms | |
| ✅ | research question router classifies extractive and deep prompts | pass | 2ms | |
| ✅ | buildResearchEvidence respects fast profile budget and ranks matches first | pass | 4ms | |
| ✅ | analyzeResearchQuestion skips Ollama for extractive auto mode | pass | 3ms | |
| ✅ | analyzeResearchQuestion falls back cleanly when Ollama returns null | pass | 2ms | |
| ✅ | normalizeCompletedScrapeResult converts saved scrapes into result shape | pass | 1ms | |
| ✅ | toResearchPage reads saved-page meta fields | pass | 0ms | |
| ✅ | createToolSuccess includes structuredContent | pass | 1ms | |
| ✅ | createToolFailure includes standardized error shape | pass | 1ms | |
| ✅ | Prompt builder references narrow MCP reads | pass | 0ms | |
| ✅ | Resource URI parser understands templated scrape URIs | pass | 2ms | |


