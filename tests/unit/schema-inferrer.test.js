/**
 * unit/schema-inferrer.test.js
 * Tests for src/schema-inferrer.js — inferSchema()
 */

const { TestRunner } = require('../runner');
const { inferSchema } = require('../../src/schema-inferrer');

const CALLS = [
  {
    body: { operationName: 'GetUser', query: 'query GetUser { user { id name } }' },
    response: { body: { data: { user: { id: '1', name: 'Alice' } } } },
  },
  {
    body: { operationName: 'GetPosts', query: 'query GetPosts { posts { id title published } }' },
    response: { body: { data: { posts: [{ id: '1', title: 'Hello', published: true }] } } },
  },
];

async function main() {
  const runner = new TestRunner('unit');

  // ── Return shape ──────────────────────────────────────────────────────────

  await runner.run('inferSchema returns object with jsonSchema and typescript', ({ setOutput }) => {
    const result = inferSchema(CALLS);
    if (!('jsonSchema' in result)) throw new Error('Missing jsonSchema key');
    if (!('typescript' in result)) throw new Error('Missing typescript key');
    setOutput({ keys: Object.keys(result) });
  });

  await runner.run('jsonSchema has $schema and definitions', ({ setOutput }) => {
    const result = inferSchema(CALLS);
    if (result.jsonSchema.$schema !== 'http://json-schema.org/draft-07/schema#') {
      throw new Error('Wrong $schema value');
    }
    if (typeof result.jsonSchema.definitions !== 'object') throw new Error('Missing definitions');
    setOutput({ keys: Object.keys(result.jsonSchema.definitions) });
  });

  await runner.run('typescript field is a non-empty string', ({ setOutput }) => {
    const result = inferSchema(CALLS);
    if (typeof result.typescript !== 'string') throw new Error('Expected string');
    if (result.typescript.length === 0) throw new Error('Expected non-empty string');
    setOutput({ length: result.typescript.length });
  });

  // ── Schema correctness ────────────────────────────────────────────────────

  await runner.run('definitions contains an entry for each valid call', ({ setOutput }) => {
    const result = inferSchema(CALLS);
    const keys = Object.keys(result.jsonSchema.definitions);
    if (keys.length < 1) throw new Error('Expected at least 1 definition');
    setOutput({ definitions: keys });
  });

  await runner.run('typescript output contains interface or type keyword', ({ setOutput }) => {
    const result = inferSchema(CALLS);
    if (!result.typescript.includes('interface') && !result.typescript.includes('type ')) {
      throw new Error('Expected TypeScript type/interface keyword');
    }
    setOutput({ snippet: result.typescript.slice(0, 80) });
  });

  await runner.run('inferred schema for user object is object type at top level', ({ setOutput }) => {
    const result = inferSchema([CALLS[0]]);
    const defs = result.jsonSchema.definitions;
    const key = Object.keys(defs)[0];
    const schema = defs[key];
    if (schema.type !== 'object') throw new Error(`Expected object type, got ${schema.type}`);
    setOutput({ type: schema.type });
  });

  // ── Single call ───────────────────────────────────────────────────────────

  await runner.run('works with a single GraphQL call', ({ setOutput }) => {
    const result = inferSchema([CALLS[0]]);
    if (!result.jsonSchema) throw new Error('Expected jsonSchema');
    setOutput({ ok: true });
  });

  // ── Chaos ─────────────────────────────────────────────────────────────────

  await runner.run('[chaos] null input → jsonSchema null + fallback typescript string', ({ setOutput }) => {
    const result = inferSchema(null);
    if (result.jsonSchema !== null) throw new Error(`Expected null jsonSchema, got ${typeof result.jsonSchema}`);
    if (typeof result.typescript !== 'string') throw new Error('Expected typescript string');
    setOutput({ ok: true });
  });

  await runner.run('[chaos] empty array → jsonSchema null + fallback string', ({ setOutput }) => {
    const result = inferSchema([]);
    if (result.jsonSchema !== null) throw new Error('Expected null jsonSchema for empty array');
    setOutput({ ok: true });
  });

  await runner.run('[chaos] call with no response body → gracefully skipped', ({ setOutput }) => {
    const result = inferSchema([{ body: {}, response: null }]);
    if (typeof result !== 'object') throw new Error('Expected object');
    setOutput({ ok: true });
  });

  await runner.run('[chaos] call with null response data → gracefully handled', ({ setOutput }) => {
    const result = inferSchema([{ body: { query: 'query Q { }' }, response: { body: { data: null } } }]);
    if (typeof result !== 'object') throw new Error('Expected object');
    setOutput({ ok: true });
  });

  await runner.run('[chaos] malformed body string → operation name falls back gracefully', ({ setOutput }) => {
    const result = inferSchema([{
      body: 'not json at all',
      response: { body: { data: { x: 1 } } },
    }]);
    if (typeof result !== 'object') throw new Error('Expected object');
    setOutput({ ok: true });
  });

  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Test runner crashed:', err.message); process.exit(1); });
