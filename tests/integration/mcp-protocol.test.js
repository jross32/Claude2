const fs = require('fs');
const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const {
  ResourceListChangedNotificationSchema,
  ResourceUpdatedNotificationSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const { TestRunner } = require('../runner');
const { start: startApi, stop: stopApi, getPort } = require('../api/_server');

const ROOT = path.join(__dirname, '../..');
const SAVES_DIR = path.join(ROOT, 'scrape-saves');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs = 15000, intervalMs = 250) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await wait(intervalMs);
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

function createSaveFixture(sessionId, overrides = {}) {
  const now = new Date().toISOString();
  return {
    sessionId,
    startUrl: 'https://example.com/docs',
    startedAt: now,
    lastSavedAt: now,
    status: 'complete',
    uiVisible: true,
    initiatedBy: 'integration-test',
    options: {
      url: 'https://example.com/docs',
      maxPages: 1,
      captureGraphQL: true,
      captureREST: true,
      captureAssets: true,
      captureAllRequests: false,
    },
    visitedUrls: ['https://example.com/docs'],
    pages: [{
      meta: {
        url: 'https://example.com/docs',
        title: 'Example Docs',
        description: 'Example docs home page',
      },
      headings: {
        h1: [{ text: 'Example Docs' }],
        h2: [{ text: 'Getting Started' }],
      },
      links: [
        { href: 'https://example.com/pricing', text: 'Pricing' },
        { href: 'https://example.com/contact', text: 'Contact' },
      ],
      images: [
        { src: 'https://example.com/logo.png', alt: 'Example logo', width: 200, height: 80 },
      ],
      forms: [
        {
          action: 'https://example.com/signup',
          method: 'post',
          fields: [{ name: 'email', type: 'email', selector: '#email' }],
        },
      ],
      tech: {
        frontend: ['Next.js'],
        analytics: ['Google Analytics'],
      },
      fullText: 'Example Docs helps teams get started quickly. Contact support@example.com for help.',
    }],
    apiCalls: {
      graphql: [{
        endpoint: 'https://example.com/graphql',
        operationName: 'DocsPageQuery',
        method: 'POST',
        query: 'query DocsPageQuery { viewer { id } }',
      }],
      rest: [{
        url: 'https://example.com/api/docs',
        method: 'GET',
        status: 200,
      }],
    },
    assets: [{ url: 'https://example.com/app.js', type: 'script' }],
    downloadedImages: [],
    cookies: [{ name: 'session', domain: 'example.com', path: '/', secure: true, httpOnly: true }],
    securityHeaders: {
      'content-security-policy': "default-src 'self'",
      'x-frame-options': 'DENY',
    },
    consoleLogs: [],
    errors: [],
    websockets: [],
    failedPages: [],
    ...overrides,
  };
}

function writeSaveFixture(sessionId, overrides) {
  fs.mkdirSync(SAVES_DIR, { recursive: true });
  const file = path.join(SAVES_DIR, `${sessionId}.json`);
  fs.writeFileSync(file, JSON.stringify(createSaveFixture(sessionId, overrides), null, 2));
  return file;
}

async function startMcpClient() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['mcp-server.js'],
    cwd: ROOT,
    env: {
      ...process.env,
      SCRAPER_URL: `http://localhost:${getPort()}`,
    },
    stderr: 'pipe',
  });

  let stderr = '';
  transport.stderr?.on('data', (chunk) => {
    stderr += String(chunk);
  });

  const client = new Client({
    name: 'mcp-protocol-integration-test',
    version: '1.0.0',
  }, {
    capabilities: {},
  });

  await client.connect(transport);
  return { client, transport, getStderr: () => stderr };
}

function getTextBlockText(blocks = []) {
  const textBlock = blocks.find((block) => block.type === 'text');
  return textBlock?.text || '';
}

function parseToolData(result) {
  const fromStructured = result?.structuredContent?.data;
  if (fromStructured && typeof fromStructured === 'object') return fromStructured;
  return JSON.parse(getTextBlockText(result?.content || []));
}

function parseResourceJson(resourceResult) {
  const text = resourceResult?.contents?.[0]?.text;
  if (!text) throw new Error('Expected resource text content');
  return JSON.parse(text);
}

async function main() {
  const runner = new TestRunner('integration');
  const fixtureIds = [];
  let client = null;
  let transport = null;
  let getStderr = () => '';

  try {
    await startApi();

    const fixtureId = `mcp-integration-${Date.now()}`;
    fixtureIds.push(fixtureId);
    writeSaveFixture(fixtureId);

    ({ client, transport, getStderr } = await startMcpClient());

    await runner.run('MCP tools/list returns the live exposed toolset', async ({ setOutput }) => {
      const result = await client.listTools();
      if (!Array.isArray(result.tools) || !result.tools.length) throw new Error('Expected non-empty tool list');
      if (!result.tools.some((tool) => tool.name === 'server_info')) throw new Error('Expected server_info in MCP tool list');
      if (!result.tools.some((tool) => tool.name === 'get_robots_txt')) throw new Error('Expected get_robots_txt in MCP tool list');

      setOutput({ toolCount: result.tools.length });
    });

    await runner.run('MCP tools/call can invoke server_info end-to-end', async ({ setOutput }) => {
      const result = await client.callTool({ name: 'server_info', arguments: {} });
      const data = parseToolData(result);
      if (!data.server || !data.counts || !data.capabilities) {
        throw new Error(`Unexpected server_info payload: ${JSON.stringify(data)}`);
      }

      setOutput({
        version: data.server.version,
        tools: data.counts.tools,
        prompts: data.counts.prompts,
      });
    });

    await runner.run('MCP prompts/list and prompts/get return the current prompt catalog', async ({ setOutput }) => {
      const prompts = await client.listPrompts();
      if (!Array.isArray(prompts.prompts) || !prompts.prompts.length) throw new Error('Expected prompt catalog');
      if (!prompts.prompts.some((prompt) => prompt.name === 'plan_site_extraction_for_goal')) {
        throw new Error('Expected plan_site_extraction_for_goal prompt');
      }

      const prompt = await client.getPrompt({
        name: 'plan_site_extraction_for_goal',
        arguments: {
          sessionId: fixtureId,
          goal: 'find the pricing section',
        },
      });
      const promptText = getTextBlockText(prompt.messages?.[0]?.content ? [prompt.messages[0].content] : []);
      if (!/Playwright MCP/i.test(promptText)) throw new Error('Expected prompt guidance to mention Playwright MCP');
      if (!/pricing section/i.test(promptText)) throw new Error('Expected prompt to interpolate the requested goal');

      setOutput({ promptCount: prompts.prompts.length });
    });

    await runner.run('MCP resources/list, resources/templates/list, and resources/read expose saved scrape context', async ({ setOutput }) => {
      const resources = await client.listResources();
      const templates = await client.listResourceTemplates();

      if (!resources.resources.some((resource) => resource.uri === 'scrape://docs/quickstart')) {
        throw new Error('Expected quickstart resource');
      }
      if (!resources.resources.some((resource) => resource.uri === `scrape://save/${fixtureId}/overview`)) {
        throw new Error('Expected dynamic save overview resource');
      }
      if (!templates.resourceTemplates.some((template) => template.uriTemplate === 'scrape://save/{sessionId}/overview')) {
        throw new Error('Expected save overview resource template');
      }

      const quickstart = await client.readResource({ uri: 'scrape://docs/quickstart' });
      const quickstartText = quickstart.contents?.[0]?.text || '';
      if (!/10-step onboarding/i.test(quickstartText)) throw new Error('Expected quickstart docs content');

      const overview = await client.readResource({ uri: `scrape://save/${fixtureId}/overview` });
      const overviewJson = parseResourceJson(overview);
      if (overviewJson.sessionId !== fixtureId) throw new Error(`Expected overview for ${fixtureId}`);
      if (!overviewJson.counts || overviewJson.counts.pages < 1) throw new Error('Expected saved page counts in overview resource');

      setOutput({
        resourceCount: resources.resources.length,
        templateCount: templates.resourceTemplates.length,
      });
    });

    await runner.run('MCP completion/complete suggests saved session IDs', async ({ setOutput }) => {
      const prefix = fixtureId.slice(0, fixtureId.lastIndexOf('-') + 1);
      const result = await client.complete({
        ref: { type: 'ref/prompt', name: 'reverse_engineer_site_api' },
        argument: { name: 'sessionId', value: prefix },
      });

      if (!Array.isArray(result.completion?.values) || !result.completion.values.includes(fixtureId)) {
        throw new Error(`Expected completion results to include ${fixtureId}`);
      }

      setOutput({ suggestions: result.completion.values.slice(0, 5) });
    });

    await runner.run('MCP resource subscriptions emit update notifications when saves change', async ({ setOutput }) => {
      const updatedUris = [];
      let listChangedCount = 0;

      client.setNotificationHandler(ResourceUpdatedNotificationSchema, (notification) => {
        updatedUris.push(notification.params.uri);
      });
      client.setNotificationHandler(ResourceListChangedNotificationSchema, () => {
        listChangedCount += 1;
      });

      await client.subscribeResource({ uri: 'scrape://saves' });

      const notifyId = `mcp-integration-notify-${Date.now()}`;
      fixtureIds.push(notifyId);
      writeSaveFixture(notifyId, { initiatedBy: 'subscription-test' });

      await waitFor(() => updatedUris.includes('scrape://saves') && listChangedCount > 0, 15000, 250);
      await client.unsubscribeResource({ uri: 'scrape://saves' });

      setOutput({
        updatedUris,
        listChangedCount,
      });
    });
  } catch (err) {
    if (runner.tests.length === 0) {
      runner.run('MCP protocol integration bootstraps successfully', async () => {
        throw new Error(`${err.message}${getStderr() ? `\n${getStderr()}` : ''}`);
      });
    } else {
      console.error('Integration suite crashed:', err.message);
    }
  } finally {
    for (const sessionId of fixtureIds) {
      const file = path.join(SAVES_DIR, `${sessionId}.json`);
      try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {}
    }
    try { await client?.close?.(); } catch {}
    try { await transport?.close?.(); } catch {}
    stopApi();
  }

  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test runner crashed:', err.message);
  process.exit(1);
});
