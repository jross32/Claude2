# Test Results — unit

**Status:** ✅ HEALTHY
**Run:** 2026-04-23T22:40:51.005Z
**Commit:** `7889de2`
**Duration:** 117ms

## Summary

| Total | ✅ Pass | ❌ Fail | ⏭️ Skip |
|-------|---------|---------|---------|
| 31 | 31 | 0 | 0 |

## Results

| | Test | Status | Duration | |
|--|------|--------|----------|--|
| ✅ | MCP server exports 55 tools | pass | 0ms | |
| ✅ | MCP tool names are unique | pass | 0ms | |
| ✅ | New MCP tools are present | pass | 0ms | |
| ✅ | All MCP tools include title and annotations | pass | 0ms | |
| ✅ | research_url schema exposes auto/fast/deep modes | pass | 0ms | |
| ✅ | Read-only MCP tools expose readOnlyHint | pass | 0ms | |
| ✅ | map_site_for_goal schema exposes scope and exhaustive controls | pass | 0ms | |
| ✅ | Fixed resources and resource templates are exported | pass | 0ms | |
| ✅ | truncateText limits long strings | pass | 0ms | |
| ✅ | searchSavedPages returns snippets and match counts | pass | 2ms | |
| ✅ | research question router classifies extractive and deep prompts | pass | 2ms | |
| ✅ | buildGoalModel expands deals and price-sensitive goals | pass | 1ms | |
| ✅ | scoreGoalText matches retail deal sections | pass | 1ms | |
| ✅ | buildResearchEvidence respects fast profile budget and ranks matches first | pass | 3ms | |
| ✅ | buildSaveOverview summarizes counts, sections, and highlights | pass | 16ms | |
| ✅ | buildApiSurface groups endpoints and operations | pass | 1ms | |
| ✅ | collectStoreContext detects visible/API mismatches | pass | 2ms | |
| ✅ | extractDealsFromSave finds deal snippets from pages and APIs | pass | 4ms | |
| ✅ | buildOrientationFromSave maps multi-section deal flows | pass | 54ms | |
| ✅ | buildOrientationFromSave infers missing sibling sections when adjacent deal pages are present | pass | 6ms | |
| ✅ | scope selection and stop logic behave as expected | pass | 0ms | |
| ✅ | findSiteIssues flags security and context problems | pass | 2ms | |
| ✅ | analyzeResearchQuestion skips AI backend for extractive auto mode | pass | 3ms | |
| ✅ | analyzeResearchQuestion falls back cleanly when AI backend returns null | pass | 1ms | |
| ✅ | normalizeCompletedScrapeResult converts saved scrapes into result shape | pass | 1ms | |
| ✅ | toResearchPage reads saved-page meta fields | pass | 1ms | |
| ✅ | createToolSuccess includes structuredContent | pass | 1ms | |
| ✅ | createToolFailure includes standardized error shape | pass | 1ms | |
| ✅ | Prompt builder references narrow MCP reads | pass | 1ms | |
| ✅ | New workflow prompts reference the new narrow tools/resources | pass | 0ms | |
| ✅ | Resource URI parser understands templated scrape URIs | pass | 1ms | |


