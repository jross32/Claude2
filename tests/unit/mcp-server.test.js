/**
 * unit/mcp-server.test.js
 * Verifies the MCP tool registry and a few core helper behaviors.
 */

const { TestRunner } = require('../runner');
const { TOOLS, __private__ } = require('../../mcp-server');

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
];

async function main() {
  const runner = new TestRunner('unit');

  await runner.run('MCP server exports 29 tools', ({ setOutput }) => {
    if (!Array.isArray(TOOLS)) throw new Error('TOOLS export missing');
    if (TOOLS.length !== 29) throw new Error(`Expected 29 tools, got ${TOOLS.length}`);
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

  await runner.run('truncateText limits long strings', ({ setOutput }) => {
    const result = __private__.truncateText('abcdefghijklmnopqrstuvwxyz', 10);
    if (result !== 'abcdefghij…') throw new Error(`Unexpected truncate result: ${result}`);
    setOutput({ result });
  });

  await runner.run('summariseResult trims preview payloads', ({ setOutput }) => {
    const summary = __private__.summariseResult({
      meta: {
        sessionId: 'abc123',
        targetUrl: 'https://example.com',
        scrapedAt: '2026-04-15T00:00:00.000Z',
        totalPages: 1,
        totalGraphQLCalls: 1,
        totalRESTCalls: 0,
      },
      pages: [{
        meta: { url: 'https://example.com', title: 'Example' },
        fullText: 'hello world',
        headings: { h1: [{ text: 'Heading' }], h2: [] },
        links: [],
        entities: {},
        tech: {},
        forms: [],
      }],
      apiCalls: {
        graphql: [{
          url: 'https://example.com/graphql',
          method: 'POST',
          body: { query: 'x'.repeat(1200) },
          response: { status: 200, body: { data: 'y'.repeat(1200) } },
        }],
        rest: [],
      },
      cookies: [],
      securityHeaders: {},
    });

    if (summary.graphqlCalls.length !== 1) throw new Error('Expected one graphql call summary');
    if (!summary.graphqlCalls[0].body.endsWith('…')) throw new Error('GraphQL body preview was not trimmed');
    if (!summary.graphqlCalls[0].responsePreview.endsWith('…')) throw new Error('Response preview was not trimmed');
    setOutput({ graphqlCalls: summary.graphqlCalls.length });
  });

  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test runner crashed:', err.message);
  process.exit(1);
});
