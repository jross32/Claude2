/**
 * graphql-introspector.js
 * Fires GraphQL introspection queries against a discovered endpoint.
 * Extracts schema types, fields, mutations, and query roots.
 * Sourced from references/spammer Mode 11 patterns.
 */

const https = require('https');
const http  = require('http');
const { URL } = require('url');

const INTROSPECTION_QUERY = `
query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      kind name description
      fields(includeDeprecated: true) {
        name description isDeprecated deprecationReason
        args { name description type { kind name ofType { kind name ofType { kind name } } } defaultValue }
        type { kind name ofType { kind name ofType { kind name } } }
      }
      inputFields {
        name description
        type { kind name ofType { kind name ofType { kind name } } }
        defaultValue
      }
      interfaces { kind name }
      enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason }
      possibleTypes { kind name }
    }
    directives {
      name description locations
      args { name description type { kind name ofType { kind name ofType { kind name } } } defaultValue }
    }
  }
}`;

const TYPENAME_QUERY = `{ __typename }`;

const QUERY_FIELDS_QUERY = `{ __schema { queryType { fields { name description } } } }`;

const MUTATION_FIELDS_QUERY = `{ __schema { mutationType { fields { name description } } } }`;

/**
 * Send a raw GraphQL POST request.
 */
function gqlRequest(endpoint, query, authHeaders = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(endpoint); } catch { return reject(new Error('Bad endpoint URL')); }

    const body = JSON.stringify({ query });
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Accept':         'application/json',
        'User-Agent':     'Mozilla/5.0 (compatible; gql-probe/1.0)',
        ...authHeaders,
      },
      timeout: timeoutMs,
      rejectUnauthorized: false,
    };

    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; if (data.length > 2 * 1024 * 1024) res.destroy(); });
      res.on('close', () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body: json || data, rawBody: data.substring(0, 5000) });
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Run full introspection against a GraphQL endpoint.
 * @param {string} endpoint - GraphQL endpoint URL
 * @param {object} opts
 * @param {object}   opts.headers - extra HTTP headers (e.g. Authorization)
 * @param {number}   opts.timeoutMs
 * @returns {Promise<{ endpoint, accessible, schema, queryFields, mutationFields, summary, error? }>}
 */
async function introspect(endpoint, opts = {}) {
  const { headers = {}, timeoutMs = 15000 } = opts;
  const result = { endpoint, accessible: false, schema: null, queryFields: [], mutationFields: [], summary: {} };

  // 1. Connectivity check
  try {
    const ping = await gqlRequest(endpoint, TYPENAME_QUERY, headers, timeoutMs);
    result.accessible = ping.status >= 200 && ping.status < 300;
    result.pingStatus = ping.status;
    if (!result.accessible) {
      result.error = `Endpoint returned HTTP ${ping.status}`;
      return result;
    }
  } catch (err) {
    result.error = err.message;
    return result;
  }

  // 2. Full introspection
  try {
    const intro = await gqlRequest(endpoint, INTROSPECTION_QUERY, headers, timeoutMs);
    if (intro.body?.data?.__schema) {
      result.schema = intro.body.data.__schema;
    } else if (intro.body?.errors) {
      result.introspectionError = intro.body.errors.map(e => e.message).join('; ');
    }
  } catch (err) {
    result.introspectionError = err.message;
  }

  // 3. Query root fields (simpler fallback if introspection blocked)
  try {
    const qf = await gqlRequest(endpoint, QUERY_FIELDS_QUERY, headers, timeoutMs);
    const fields = qf.body?.data?.__schema?.queryType?.fields;
    if (Array.isArray(fields)) result.queryFields = fields;
  } catch {}

  // 4. Mutation root fields
  try {
    const mf = await gqlRequest(endpoint, MUTATION_FIELDS_QUERY, headers, timeoutMs);
    const fields = mf.body?.data?.__schema?.mutationType?.fields;
    if (Array.isArray(fields)) result.mutationFields = fields;
  } catch {}

  // 5. Summarize schema
  if (result.schema) {
    const types = result.schema.types || [];
    const userTypes = types.filter(t => t.kind !== 'SCALAR' && t.kind !== 'INTROSPECTION_TYPE' && !t.name.startsWith('__'));
    result.summary = {
      totalTypes:    userTypes.length,
      objects:       userTypes.filter(t => t.kind === 'OBJECT').length,
      inputs:        userTypes.filter(t => t.kind === 'INPUT_OBJECT').length,
      enums:         userTypes.filter(t => t.kind === 'ENUM').length,
      interfaces:    userTypes.filter(t => t.kind === 'INTERFACE').length,
      unions:        userTypes.filter(t => t.kind === 'UNION').length,
      queryType:     result.schema.queryType?.name,
      mutationType:  result.schema.mutationType?.name,
      subscriptionType: result.schema.subscriptionType?.name,
      queryFields:   result.queryFields.length,
      mutationFields: result.mutationFields.length,
      typeNames:     userTypes.map(t => t.name),
    };
  }

  return result;
}

/**
 * Auto-discover GraphQL endpoints from a captured scrape result's API calls.
 * Returns deduplicated list of likely GraphQL endpoints.
 */
function discoverEndpoints(scrapeResult) {
  const seen = new Set();
  const endpoints = [];

  const checkUrl = (url) => {
    if (!url || typeof url !== 'string') return;
    if (!/graphql|gql|query/i.test(url)) return;
    try {
      const clean = new URL(url).href.split('?')[0];
      if (!seen.has(clean)) { seen.add(clean); endpoints.push(clean); }
    } catch {}
  };

  for (const call of (scrapeResult?.graphqlCalls || [])) checkUrl(call.url);
  for (const call of (scrapeResult?.restCalls || [])) checkUrl(call.url);

  return endpoints;
}

module.exports = { introspect, discoverEndpoints, gqlRequest, INTROSPECTION_QUERY };
