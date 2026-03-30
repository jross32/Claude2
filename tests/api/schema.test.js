/**
 * api/schema.test.js
 * Contract tests for POST /api/schema (GraphQL schema inference).
 */

const { TestRunner } = require('../runner');
const { start, stop, post, json } = require('./_server');

const GRAPHQL_CALLS = [
  {
    operationName: 'GetUser',
    query: 'query GetUser { user { id name email } }',
    response: { data: { user: { id: '123', name: 'John Doe', email: 'john@example.com' } } },
  },
  {
    operationName: 'GetPosts',
    query: 'query GetPosts { posts { id title published } }',
    response: { data: { posts: [{ id: '1', title: 'Hello', published: true }] } },
  },
];

async function main() {
  const runner = new TestRunner('api');
  await start();

  await runner.run('POST /api/schema with graphqlCalls → 200 + schema object', async ({ setOutput }) => {
    const res = await post('/api/schema', { graphqlCalls: GRAPHQL_CALLS });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = json(res);
    if (typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected object response');
    setOutput({ status: res.status, keys: Object.keys(body) });
  });

  await runner.run('Schema response includes typescript or jsonSchema fields', async ({ setOutput }) => {
    const res = await post('/api/schema', { graphqlCalls: GRAPHQL_CALLS });
    const body = json(res);
    const hasTs   = 'typescript' in body || 'types' in body || 'typeScript' in body;
    const hasJson = 'jsonSchema' in body || 'schema' in body || 'schemas' in body;
    if (!hasTs && !hasJson) {
      throw new Error(`Expected typescript or jsonSchema field, got keys: ${Object.keys(body).join(', ')}`);
    }
    setOutput({ keys: Object.keys(body) });
  });

  // ── Chaos ──────────────────────────────────────────────────────────────────

  await runner.run('[chaos] POST /api/schema with no graphqlCalls → 400', async ({ setOutput }) => {
    const res = await post('/api/schema', {});
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    setOutput({ status: res.status });
  });

  await runner.run('[chaos] POST /api/schema with empty array → does not 500', async ({ setOutput }) => {
    const res = await post('/api/schema', { graphqlCalls: [] });
    if (res.status === 500) throw new Error('Server crashed on empty graphqlCalls');
    setOutput({ status: res.status });
  });

  await runner.run('[chaos] POST /api/schema with malformed call → does not 500', async ({ setOutput }) => {
    const res = await post('/api/schema', { graphqlCalls: [{ notAValidCall: true }] });
    if (res.status === 500) throw new Error('Server crashed on malformed call');
    setOutput({ status: res.status });
  });

  stop();
  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Test runner crashed:', err.message); process.exit(1); });
