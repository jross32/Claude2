/**
 * unit/mcp-server.test.js
 * Verifies MCP registry metadata, prompt/resource exports, and core helper behavior.
 */

const { TestRunner } = require('../runner');
const {
  TOOLS,
  FIXED_RESOURCES,
  PROMPTS,
  RESOURCE_TEMPLATES,
  __private__,
} = require('../../mcp-server');

const NEW_TOOL_NAMES = [
  'check_saved_session',
  'clear_saved_session',
  'get_known_site_credentials',
  'pause_scrape',
  'resume_scrape',
  'submit_verification_code',
  'submit_scrape_credentials',
  'delete_save',
  'generate_css',
  'generate_sitemap',
  'list_active_scrapes',
  'get_scrape_status',
  'search_scrape_text',
  'list_links',
  'list_forms',
  'list_images',
  'get_tech_stack',
  'find_graphql_endpoints',
  'preflight_url',
  'research_url',
  'http_fetch',
];

async function main() {
  const runner = new TestRunner('unit');

  await runner.run('MCP server exports 40 tools', ({ setOutput }) => {
    if (!Array.isArray(TOOLS)) throw new Error('TOOLS export missing');
    if (TOOLS.length !== 40) throw new Error(`Expected 40 tools, got ${TOOLS.length}`);
    setOutput({ count: TOOLS.length });
  });

  await runner.run('MCP tool names are unique', ({ setOutput }) => {
    const names = TOOLS.map((tool) => tool.name);
    const uniqueNames = new Set(names);
    if (uniqueNames.size !== names.length) throw new Error('Duplicate tool names found');
    setOutput({ uniqueCount: uniqueNames.size });
  });

  await runner.run('New MCP tools are present', ({ setOutput }) => {
    const names = new Set(TOOLS.map((tool) => tool.name));
    const missing = NEW_TOOL_NAMES.filter((name) => !names.has(name));
    if (missing.length) throw new Error(`Missing tools: ${missing.join(', ')}`);
    setOutput({ added: NEW_TOOL_NAMES.length });
  });

  await runner.run('All MCP tools include title and annotations', ({ setOutput }) => {
    const missing = TOOLS
      .filter((tool) => !tool.title || !tool.annotations || typeof tool.annotations.readOnlyHint !== 'boolean')
      .map((tool) => tool.name);
    if (missing.length) throw new Error(`Missing title/annotations: ${missing.join(', ')}`);
    setOutput({ annotatedTools: TOOLS.length });
  });

  await runner.run('research_url schema exposes auto/fast/deep modes', ({ setOutput }) => {
    const researchTool = TOOLS.find((tool) => tool.name === 'research_url');
    const modeEnum = researchTool?.inputSchema?.properties?.mode?.enum || [];
    const includeEvidence = researchTool?.inputSchema?.properties?.includeEvidence;

    if (!modeEnum.includes('auto') || !modeEnum.includes('fast') || !modeEnum.includes('deep')) {
      throw new Error(`Unexpected mode enum: ${JSON.stringify(modeEnum)}`);
    }
    if (!includeEvidence || includeEvidence.type !== 'boolean') {
      throw new Error('includeEvidence flag missing from research_url schema');
    }

    setOutput({ modeEnum, includeEvidenceType: includeEvidence.type });
  });

  await runner.run('Read-only MCP tools expose readOnlyHint', ({ setOutput }) => {
    const searchTool = TOOLS.find((tool) => tool.name === 'search_scrape_text');
    if (!searchTool?.annotations?.readOnlyHint) throw new Error('search_scrape_text should be read-only');
    const scrapeTool = TOOLS.find((tool) => tool.name === 'scrape_url');
    if (scrapeTool?.annotations?.readOnlyHint) throw new Error('scrape_url should not be read-only');
    setOutput({ readOnlyTool: searchTool.name });
  });

  await runner.run('Fixed resources and resource templates are exported', ({ setOutput }) => {
    const fixedUris = new Set(FIXED_RESOURCES.map((resource) => resource.uri));
    const templateUris = new Set(RESOURCE_TEMPLATES.map((resource) => resource.uriTemplate));
    const promptNames = new Set(PROMPTS.map((prompt) => prompt.name));

    const expectedFixed = ['scrape://saves', 'scrape://active'];
    const expectedTemplates = [
      'scrape://save/{sessionId}/summary',
      'scrape://save/{sessionId}/page/{pageIndex}',
      'scrape://save/{sessionId}/api/{kind}',
      'scrape://active/{sessionId}',
    ];
    const expectedPrompts = [
      'reverse_engineer_site_api',
      'extract_contacts_from_scrape',
      'review_scrape_security',
      'compare_scrapes_workflow',
    ];

    const missing = [
      ...expectedFixed.filter((uri) => !fixedUris.has(uri)),
      ...expectedTemplates.filter((uri) => !templateUris.has(uri)),
      ...expectedPrompts.filter((name) => !promptNames.has(name)),
    ];
    if (missing.length) throw new Error(`Missing resource/prompt exports: ${missing.join(', ')}`);
    setOutput({ fixed: expectedFixed.length, templates: expectedTemplates.length, prompts: expectedPrompts.length });
  });

  await runner.run('truncateText limits long strings', ({ setOutput }) => {
    const result = __private__.truncateText('abcdefghijklmnopqrstuvwxyz', 10);
    if (result !== 'abcdefghij…') throw new Error(`Unexpected truncate result: ${result}`);
    setOutput({ result });
  });

  await runner.run('searchSavedPages returns snippets and match counts', ({ setOutput }) => {
    const results = __private__.searchSavedPages([
      {
        meta: { url: 'https://example.com/a', title: 'Example Alpha', description: 'Primary example page' },
        headings: { h1: [{ text: 'Alpha heading' }], h2: [] },
        fullText: 'This example page includes alpha content and another example mention.',
      },
      {
        meta: { url: 'https://example.com/b', title: 'No match here', description: '' },
        headings: { h1: [], h2: [] },
        fullText: 'Completely unrelated content.',
      },
    ], 'example', { limit: 5, snippetChars: 80 });

    if (results.length !== 1) throw new Error(`Expected 1 matching page, got ${results.length}`);
    if (results[0].matchCount < 2) throw new Error(`Expected multiple matches, got ${results[0].matchCount}`);
    if (!results[0].snippets.length) throw new Error('Expected snippets for matching page');
    setOutput({ matches: results[0].matchCount, snippets: results[0].snippets.length });
  });

  await runner.run('research question router classifies extractive and deep prompts', ({ setOutput }) => {
    const extractive = __private__.determineResearchStrategy('When is Black Bolt & White Flare releasing?', 'auto');
    const deep = __private__.determineResearchStrategy('Compare the major upcoming releases and explain the likely trends.', 'auto');
    const forcedFast = __private__.determineResearchStrategy('Summarize the page for me.', 'fast');

    if (extractive.routeUsed !== 'extractive') throw new Error(`Expected extractive route, got ${extractive.routeUsed}`);
    if (deep.routeUsed !== 'reasoning-heavy') throw new Error(`Expected reasoning-heavy route, got ${deep.routeUsed}`);
    if (forcedFast.routeUsed !== 'fast-ollama') throw new Error(`Expected fast override, got ${forcedFast.routeUsed}`);

    setOutput({ extractive: extractive.routeUsed, deep: deep.routeUsed, forcedFast: forcedFast.routeUsed });
  });

  await runner.run('buildResearchEvidence respects fast profile budget and ranks matches first', ({ setOutput }) => {
    const evidence = __private__.buildResearchEvidence([
      {
        url: 'https://example.com/releases',
        title: 'Upcoming Releases',
        fullText: 'Black Bolt releases July 18 2025. Mega Evolution releases September 26 2025.',
        headings: { h1: ['Upcoming Releases'], h2: ['Release Calendar'] },
        links: [{ href: 'https://example.com/releases/black-bolt', text: 'Black Bolt' }],
      },
      {
        url: 'https://example.com/about',
        title: 'About the site',
        fullText: 'General site information and contact details.',
        headings: { h1: ['About'], h2: [] },
        links: [],
      },
    ], 'When does Black Bolt release?', 'fast');

    if (!evidence.promptPages.length) throw new Error('Expected prompt pages');
    if (evidence.publicEvidence[0].url !== 'https://example.com/releases') {
      throw new Error(`Expected release page first, got ${evidence.publicEvidence[0].url}`);
    }
    const totalChars = evidence.promptPages.reduce((sum, page) => sum + page.fullText.length, 0);
    if (totalChars > __private__.getResearchProfile('fast').maxTotalChars) {
      throw new Error(`Fast evidence exceeded budget: ${totalChars}`);
    }

    setOutput({ rankedUrl: evidence.publicEvidence[0].url, totalChars });
  });

  await runner.run('analyzeResearchQuestion skips Ollama for extractive auto mode', async ({ setOutput }) => {
    let called = false;
    const result = await __private__.analyzeResearchQuestion([
      {
        url: 'https://example.com/releases',
        title: 'Upcoming Releases',
        fullText: 'Black Bolt releases July 18 2025.',
        headings: { h1: ['Upcoming Releases'], h2: [] },
        links: [{ href: 'https://example.com/releases/black-bolt', text: 'Black Bolt' }],
      },
    ], 'When does Black Bolt release?', {
      mode: 'auto',
      analyzeWithOllamaImpl: async () => {
        called = true;
        return null;
      },
    });

    if (called) throw new Error('Expected extractive auto mode to skip Ollama');
    if (result.routeUsed !== 'extractive') throw new Error(`Unexpected routeUsed: ${result.routeUsed}`);
    setOutput({ routeUsed: result.routeUsed, analysisMethod: result.analysisMethod });
  });

  await runner.run('analyzeResearchQuestion falls back cleanly when Ollama returns null', async ({ setOutput }) => {
    const result = await __private__.analyzeResearchQuestion([
      {
        url: 'https://example.com/releases',
        title: 'Upcoming Releases',
        fullText: 'Black Bolt releases July 18 2025. Mega Evolution releases September 26 2025.',
        headings: { h1: ['Upcoming Releases'], h2: ['Release Calendar'] },
        links: [],
      },
    ], 'Summarize the release page and explain the key themes.', {
      mode: 'deep',
      includeEvidence: true,
      analyzeWithOllamaImpl: async () => null,
    });

    if (result.routeUsed !== 'deep-ollama') throw new Error(`Expected deep override route, got ${result.routeUsed}`);
    if (result.analysisMethod !== 'keyword-extraction') throw new Error(`Expected keyword fallback, got ${result.analysisMethod}`);
    if (!Array.isArray(result.evidence) || !result.evidence.length) throw new Error('Expected evidence in response');
    setOutput({ routeUsed: result.routeUsed, evidenceCount: result.evidence.length });
  });

  await runner.run('normalizeCompletedScrapeResult converts saved scrapes into result shape', ({ setOutput }) => {
    const normalized = __private__.normalizeCompletedScrapeResult({
      sessionId: 'save-123',
      startUrl: 'https://example.com/docs',
      startedAt: '2026-04-15T00:00:00.000Z',
      lastSavedAt: '2026-04-15T00:00:05.000Z',
      pages: [{
        meta: { url: 'https://example.com/docs', title: 'Docs Home' },
        headings: { h1: [{ text: 'Docs' }], h2: [] },
        fullText: 'Documentation landing page',
        images: [{ src: 'https://example.com/logo.png' }],
      }],
      apiCalls: {
        graphql: [{ url: 'https://example.com/graphql' }],
        rest: [{ url: 'https://example.com/api/items' }],
      },
      assets: [{ url: 'https://example.com/app.js' }],
      cookies: [{ name: 'crumb', domain: 'example.com' }],
      securityHeaders: { server: 'Example' },
      failedPages: [],
    });

    if (normalized.meta.targetUrl !== 'https://example.com/docs') throw new Error('Expected targetUrl from save');
    if (normalized.meta.totalPages !== 1) throw new Error(`Expected totalPages 1, got ${normalized.meta.totalPages}`);
    if (normalized.siteInfo.title !== 'Docs Home') throw new Error('Expected siteInfo title from first page');
    if (normalized.pages.length !== 1) throw new Error('Expected pages to be preserved');
    setOutput({ totalPages: normalized.meta.totalPages, title: normalized.siteInfo.title });
  });

  await runner.run('toResearchPage reads saved-page meta fields', ({ setOutput }) => {
    const page = __private__.toResearchPage({
      meta: { url: 'https://example.com/about', title: 'About Example' },
      fullText: 'About page body',
      headings: { h1: [{ text: 'About' }], h2: [] },
    });

    if (page.url !== 'https://example.com/about') throw new Error('Expected URL from page.meta.url');
    if (page.title !== 'About Example') throw new Error('Expected title from page.meta.title');
    if (page.fullText !== 'About page body') throw new Error('Expected full text to be preserved');
    setOutput({ url: page.url, title: page.title });
  });

  await runner.run('createToolSuccess includes structuredContent', ({ setOutput }) => {
    const result = __private__.createToolSuccess('search_scrape_text', { ok: true });
    if (!result.structuredContent?.data?.ok) throw new Error('structuredContent missing success payload');
    setOutput({ structured: true });
  });

  await runner.run('createToolFailure includes standardized error shape', ({ setOutput }) => {
    const result = __private__.createToolFailure('search_scrape_text', new Error('Session not found'));
    const error = result.structuredContent?.error;
    if (!result.isError) throw new Error('Expected isError = true');
    if (!error?.code || typeof error.retryable !== 'boolean' || !error.suggestedNextStep) {
      throw new Error('Structured error missing required fields');
    }
    setOutput({ code: error.code, retryable: error.retryable });
  });

  await runner.run('Prompt builder references narrow MCP reads', ({ setOutput }) => {
    const text = __private__.buildPromptText('reverse_engineer_site_api', { sessionId: 'abc123' });
    if (!text.includes('get_scrape_status') || !text.includes('scrape://save/abc123/summary')) {
      throw new Error('Prompt text is missing expected MCP references');
    }
    setOutput({ preview: text.slice(0, 80) });
  });

  await runner.run('Resource URI parser understands templated scrape URIs', ({ setOutput }) => {
    const summary = __private__.parseResourceUri('scrape://save/demo-session/page/2');
    const active = __private__.parseResourceUri('scrape://active/demo-session');
    if (summary.kind !== 'savePage' || summary.pageIndex !== 2) throw new Error('Failed to parse save page URI');
    if (active.kind !== 'activeSession' || active.sessionId !== 'demo-session') throw new Error('Failed to parse active URI');
    setOutput({ summaryKind: summary.kind, activeKind: active.kind });
  });

  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test runner crashed:', err.message);
  process.exit(1);
});
