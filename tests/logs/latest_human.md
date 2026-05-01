# Test Results — unit

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T19:17:42.688Z
**Commit:** `8e4ec8d`
**Duration:** 171ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 32 | 32 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | MCP server exports a non-empty tool catalog | pass | 1ms | |
| ✅ | MCP tool names are unique | pass | 1ms | |
| ✅ | New MCP tools are present | pass | 1ms | |
| ✅ | All MCP tools include title and annotations | pass | 1ms | |
| ✅ | MCP metadata summary stays aligned with exported tools and prompts | pass | 3ms | |
| ✅ | research_url schema exposes auto/fast/deep modes | pass | 0ms | |
| ✅ | Read-only MCP tools expose readOnlyHint | pass | 0ms | |
| ✅ | map_site_for_goal schema exposes scope and exhaustive controls | pass | 0ms | |
| ✅ | Fixed resources and resource templates are exported | pass | 1ms | |
| ✅ | truncateText limits long strings | pass | 1ms | |
| ✅ | searchSavedPages returns snippets and match counts | pass | 4ms | |
| ✅ | research question router classifies extractive and deep prompts | pass | 3ms | |
| ✅ | buildGoalModel expands deals and price-sensitive goals | pass | 3ms | |
| ✅ | scoreGoalText matches retail deal sections | pass | 3ms | |
| ✅ | buildResearchEvidence respects fast profile budget and ranks matches first | pass | 5ms | |
| ✅ | buildSaveOverview summarizes counts, sections, and highlights | pass | 16ms | |
| ✅ | buildApiSurface groups endpoints and operations | pass | 1ms | |
| ✅ | collectStoreContext detects visible/API mismatches | pass | 3ms | |
| ✅ | extractDealsFromSave finds deal snippets from pages and APIs | pass | 5ms | |
| ✅ | buildOrientationFromSave maps multi-section deal flows | pass | 77ms | |
| ✅ | buildOrientationFromSave infers missing sibling sections when adjacent deal pages are present | pass | 7ms | |
| ✅ | scope selection and stop logic behave as expected | pass | 1ms | |
| ✅ | findSiteIssues flags security and context problems | pass | 4ms | |
| ✅ | analyzeResearchQuestion skips AI backend for extractive auto mode | pass | 4ms | |
| ✅ | analyzeResearchQuestion falls back cleanly when AI backend returns null | pass | 5ms | |
| ✅ | normalizeCompletedScrapeResult converts saved scrapes into result shape | pass | 1ms | |
| ✅ | toResearchPage reads saved-page meta fields | pass | 1ms | |
| ✅ | createToolSuccess includes structuredContent | pass | 0ms | |
| ✅ | createToolFailure includes standardized error shape | pass | 1ms | |
| ✅ | Prompt builder references narrow MCP reads | pass | 2ms | |
| ✅ | New workflow prompts reference the new narrow tools/resources | pass | 0ms | |
| ✅ | Resource URI parser understands templated scrape URIs | pass | 1ms | |


