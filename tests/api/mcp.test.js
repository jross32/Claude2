const { TestRunner } = require('../runner');
const { start, stop, get, post, json } = require('./_server');

async function main() {
  const runner = new TestRunner('api');
  await start();

  await runner.run('GET /api/mcp/tools exposes the live MCP tool catalog', async ({ setOutput }) => {
    const res = await get('/api/mcp/tools');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = json(res);
    if (!Array.isArray(body.tools)) throw new Error('Expected tools array');
    if (!body.tools.length) throw new Error('Expected at least one MCP tool');

    const serverInfo = body.tools.find((tool) => tool.name === 'server_info');
    if (!serverInfo) throw new Error('Expected server_info in MCP HTTP tool list');

    setOutput({ toolCount: body.tools.length, sample: serverInfo.name });
  });

  await runner.run('POST /api/mcp/tool/server_info invokes MCP tools through the HTTP bridge', async ({ setOutput }) => {
    const res = await post('/api/mcp/tool/server_info', {});
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = json(res);
    const result = body.result;
    if (!result || typeof result !== 'object') throw new Error('Expected result object');
    if (!result.server || !result.counts || !result.capabilities) {
      throw new Error(`Unexpected server_info payload: ${JSON.stringify(result)}`);
    }

    setOutput({
      version: result.server.version,
      tools: result.counts.toolsExposed,
      prompts: result.counts.prompts,
    });
  });

  await runner.run('GET /api/mcp-meta returns enriched live metadata', async ({ setOutput }) => {
    const res = await get('/api/mcp-meta');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = json(res);
    if (!body.server || !body.counts) throw new Error('Expected top-level server metadata');
    if (!Array.isArray(body.tools) || !Array.isArray(body.prompts)) throw new Error('Expected tools/prompts arrays');
    if (!Array.isArray(body.workflows) || !body.workflows.length) throw new Error('Expected starter workflows');
    if (body.counts.tools !== body.tools.length) throw new Error('Tool count drift detected in /api/mcp-meta');
    if (body.counts.prompts !== body.prompts.length) throw new Error('Prompt count drift detected in /api/mcp-meta');

    setOutput({
      toolCount: body.counts.tools,
      promptCount: body.counts.prompts,
      workflowCount: body.workflows.length,
    });
  });

  stop();
  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  stop();
  console.error('Test runner crashed:', err.message);
  process.exit(1);
});
