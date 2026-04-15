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
];

async function main() {
  const runner = new TestRunner('unit');

  await runner.run('MCP server exports 38 tools', ({ setOutput }) => {
    if (!Array.isArray(TOOLS)) throw new Error('TOOLS export missing');
    if (TOOLS.length !== 38) throw new Error(`Expected 38 tools, got ${TOOLS.length}`);
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
