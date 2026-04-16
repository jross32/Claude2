# Test Results — unit

**Status:** ✅ HEALTHY
**Run:** 2026-04-16T10:52:46.745Z
**Commit:** `60930a3`
**Duration:** 134ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 31 | 31 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | MCP server exports 47 tools | pass | 1ms | |
| ✅ | MCP tool names are unique | pass | 0ms | |
| ✅ | New MCP tools are present | pass | 0ms | |
| ✅ | All MCP tools include title and annotations | pass | 0ms | |
| ✅ | research_url schema exposes auto/fast/deep modes | pass | 1ms | |
| ✅ | Read-only MCP tools expose readOnlyHint | pass | 0ms | |
| ✅ | map_site_for_goal schema exposes scope and exhaustive controls | pass | 0ms | |
| ✅ | Fixed resources and resource templates are exported | pass | 0ms | |
| ✅ | truncateText limits long strings | pass | 0ms | |
| ✅ | searchSavedPages returns snippets and match counts | pass | 3ms | |
| ✅ | research question router classifies extractive and deep prompts | pass | 2ms | |
| ✅ | buildGoalModel expands deals and price-sensitive goals | pass | 2ms | |
| ✅ | scoreGoalText matches retail deal sections | pass | 3ms | |
| ✅ | buildResearchEvidence respects fast profile budget and ranks matches first | pass | 3ms | |
| ✅ | buildSaveOverview summarizes counts, sections, and highlights | pass | 14ms | |
| ✅ | buildApiSurface groups endpoints and operations | pass | 1ms | |
| ✅ | collectStoreContext detects visible/API mismatches | pass | 2ms | |
| ✅ | extractDealsFromSave finds deal snippets from pages and APIs | pass | 5ms | |
| ✅ | buildOrientationFromSave maps multi-section deal flows | pass | 69ms | |
| ✅ | buildOrientationFromSave infers missing sibling sections when adjacent deal pages are present | pass | 3ms | |
| ✅ | scope selection and stop logic behave as expected | pass | 1ms | |
| ✅ | findSiteIssues flags security and context problems | pass | 3ms | |
| ✅ | analyzeResearchQuestion skips Ollama for extractive auto mode | pass | 3ms | |
| ✅ | analyzeResearchQuestion falls back cleanly when Ollama returns null | pass | 2ms | |
| ✅ | normalizeCompletedScrapeResult converts saved scrapes into result shape | pass | 1ms | |
| ✅ | toResearchPage reads saved-page meta fields | pass | 1ms | |
| ✅ | createToolSuccess includes structuredContent | pass | 0ms | |
| ✅ | createToolFailure includes standardized error shape | pass | 1ms | |
| ✅ | Prompt builder references narrow MCP reads | pass | 1ms | |
| ✅ | New workflow prompts reference the new narrow tools/resources | pass | 0ms | |
| ✅ | Resource URI parser understands templated scrape URIs | pass | 1ms | |


