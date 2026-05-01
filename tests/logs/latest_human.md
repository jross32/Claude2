# Test Results — unit

**Status:** ✅ HEALTHY
**Run:** 2026-05-01T19:14:36.535Z
**Commit:** `d4eb64a`
**Duration:** 131ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 32 | 32 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | MCP server exports a non-empty tool catalog | pass | 0ms | |
| ✅ | MCP tool names are unique | pass | 0ms | |
| ✅ | New MCP tools are present | pass | 0ms | |
| ✅ | All MCP tools include title and annotations | pass | 0ms | |
| ✅ | MCP metadata summary stays aligned with exported tools and prompts | pass | 2ms | |
| ✅ | research_url schema exposes auto/fast/deep modes | pass | 1ms | |
| ✅ | Read-only MCP tools expose readOnlyHint | pass | 0ms | |
| ✅ | map_site_for_goal schema exposes scope and exhaustive controls | pass | 0ms | |
| ✅ | Fixed resources and resource templates are exported | pass | 0ms | |
| ✅ | truncateText limits long strings | pass | 1ms | |
| ✅ | searchSavedPages returns snippets and match counts | pass | 1ms | |
| ✅ | research question router classifies extractive and deep prompts | pass | 2ms | |
| ✅ | buildGoalModel expands deals and price-sensitive goals | pass | 3ms | |
| ✅ | scoreGoalText matches retail deal sections | pass | 3ms | |
| ✅ | buildResearchEvidence respects fast profile budget and ranks matches first | pass | 4ms | |
| ✅ | buildSaveOverview summarizes counts, sections, and highlights | pass | 18ms | |
| ✅ | buildApiSurface groups endpoints and operations | pass | 0ms | |
| ✅ | collectStoreContext detects visible/API mismatches | pass | 1ms | |
| ✅ | extractDealsFromSave finds deal snippets from pages and APIs | pass | 4ms | |
| ✅ | buildOrientationFromSave maps multi-section deal flows | pass | 56ms | |
| ✅ | buildOrientationFromSave infers missing sibling sections when adjacent deal pages are present | pass | 4ms | |
| ✅ | scope selection and stop logic behave as expected | pass | 1ms | |
| ✅ | findSiteIssues flags security and context problems | pass | 2ms | |
| ✅ | analyzeResearchQuestion skips AI backend for extractive auto mode | pass | 3ms | |
| ✅ | analyzeResearchQuestion falls back cleanly when AI backend returns null | pass | 3ms | |
| ✅ | normalizeCompletedScrapeResult converts saved scrapes into result shape | pass | 0ms | |
| ✅ | toResearchPage reads saved-page meta fields | pass | 1ms | |
| ✅ | createToolSuccess includes structuredContent | pass | 0ms | |
| ✅ | createToolFailure includes standardized error shape | pass | 1ms | |
| ✅ | Prompt builder references narrow MCP reads | pass | 1ms | |
| ✅ | New workflow prompts reference the new narrow tools/resources | pass | 1ms | |
| ✅ | Resource URI parser understands templated scrape URIs | pass | 1ms | |


