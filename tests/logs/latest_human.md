# Test Results — unit

**Status:** ✅ HEALTHY
**Run:** 2026-04-16T10:16:09.035Z
**Commit:** `ef14bd5`
**Duration:** 112ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 30 | 30 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | MCP server exports 47 tools | pass | 0ms | |
| ✅ | MCP tool names are unique | pass | 0ms | |
| ✅ | New MCP tools are present | pass | 0ms | |
| ✅ | All MCP tools include title and annotations | pass | 0ms | |
| ✅ | research_url schema exposes auto/fast/deep modes | pass | 1ms | |
| ✅ | Read-only MCP tools expose readOnlyHint | pass | 0ms | |
| ✅ | map_site_for_goal schema exposes scope and exhaustive controls | pass | 0ms | |
| ✅ | Fixed resources and resource templates are exported | pass | 0ms | |
| ✅ | truncateText limits long strings | pass | 1ms | |
| ✅ | searchSavedPages returns snippets and match counts | pass | 2ms | |
| ✅ | research question router classifies extractive and deep prompts | pass | 1ms | |
| ✅ | buildGoalModel expands deals and price-sensitive goals | pass | 2ms | |
| ✅ | scoreGoalText matches retail deal sections | pass | 3ms | |
| ✅ | buildResearchEvidence respects fast profile budget and ranks matches first | pass | 3ms | |
| ✅ | buildSaveOverview summarizes counts, sections, and highlights | pass | 17ms | |
| ✅ | buildApiSurface groups endpoints and operations | pass | 1ms | |
| ✅ | collectStoreContext detects visible/API mismatches | pass | 3ms | |
| ✅ | extractDealsFromSave finds deal snippets from pages and APIs | pass | 4ms | |
| ✅ | buildOrientationFromSave maps multi-section deal flows | pass | 44ms | |
| ✅ | scope selection and stop logic behave as expected | pass | 1ms | |
| ✅ | findSiteIssues flags security and context problems | pass | 3ms | |
| ✅ | analyzeResearchQuestion skips Ollama for extractive auto mode | pass | 3ms | |
| ✅ | analyzeResearchQuestion falls back cleanly when Ollama returns null | pass | 4ms | |
| ✅ | normalizeCompletedScrapeResult converts saved scrapes into result shape | pass | 0ms | |
| ✅ | toResearchPage reads saved-page meta fields | pass | 1ms | |
| ✅ | createToolSuccess includes structuredContent | pass | 0ms | |
| ✅ | createToolFailure includes standardized error shape | pass | 0ms | |
| ✅ | Prompt builder references narrow MCP reads | pass | 0ms | |
| ✅ | New workflow prompts reference the new narrow tools/resources | pass | 0ms | |
| ✅ | Resource URI parser understands templated scrape URIs | pass | 1ms | |


