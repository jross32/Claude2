/**
 * Infer TypeScript types and JSON Schema from GraphQL responses.
 */

function inferType(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'any[]';
    const itemType = inferType(value[0]);
    return `${itemType}[]`;
  }
  if (typeof value === 'object') return 'object';
  return typeof value;
}

function buildJsonSchema(obj, title) {
  if (obj === null || obj === undefined) return { type: 'null' };
  if (Array.isArray(obj)) {
    return {
      type: 'array',
      items: obj.length > 0 ? buildJsonSchema(obj[0]) : {},
    };
  }
  if (typeof obj === 'object') {
    const properties = {};
    const required = [];
    for (const [key, value] of Object.entries(obj)) {
      properties[key] = buildJsonSchema(value);
      if (value !== null && value !== undefined) required.push(key);
    }
    const schema = { type: 'object', properties };
    if (required.length > 0) schema.required = required;
    if (title) schema.title = title;
    return schema;
  }
  if (typeof obj === 'string') return { type: 'string' };
  if (typeof obj === 'number') return { type: Number.isInteger(obj) ? 'integer' : 'number' };
  if (typeof obj === 'boolean') return { type: 'boolean' };
  return {};
}

function buildTypeScriptInterface(obj, name) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return `type ${name} = ${inferType(obj)};`;
  }
  const lines = [`interface ${name} {`];
  for (const [key, value] of Object.entries(obj)) {
    const tsType = valueToTSType(value, key);
    const optional = value === null || value === undefined ? '?' : '';
    lines.push(`  ${key}${optional}: ${tsType};`);
  }
  lines.push('}');
  return lines.join('\n');
}

function valueToTSType(value, key) {
  if (value === null || value === undefined) return 'null | undefined';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'any[]';
    const itemType = valueToTSType(value[0], key + 'Item');
    return `${itemType}[]`;
  }
  if (typeof value === 'object') {
    // Inline small objects, reference large ones
    const keys = Object.keys(value);
    if (keys.length <= 5) {
      const fields = keys.map((k) => `${k}: ${valueToTSType(value[k], k)}`).join('; ');
      return `{ ${fields} }`;
    }
    return 'Record<string, unknown>';
  }
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'unknown';
}

function inferSchema(graphqlCalls) {
  if (!graphqlCalls || graphqlCalls.length === 0) {
    return { jsonSchema: null, typescript: '// No GraphQL calls to infer schema from.' };
  }

  const schemas = [];
  const typescriptInterfaces = [];

  graphqlCalls.forEach((call, idx) => {
    const responseData = call.response?.body?.data || call.response?.body;
    if (!responseData || typeof responseData !== 'object') return;

    const opName = (() => {
      try {
        const body = typeof call.body === 'object' ? call.body : JSON.parse(call.body || '{}');
        const match = (body.query || body.operationName || '').match(/(?:query|mutation|subscription)\s+(\w+)/);
        return match ? match[1] : `Operation${idx + 1}`;
      } catch {
        return `Operation${idx + 1}`;
      }
    })();

    const schema = buildJsonSchema(responseData, opName);
    schemas.push({ operationName: opName, schema });
    typescriptInterfaces.push(buildTypeScriptInterface(responseData, opName));
  });

  const combinedSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'GraphQL Response Schemas',
    definitions: schemas.reduce((acc, { operationName, schema }) => {
      acc[operationName] = schema;
      return acc;
    }, {}),
  };

  const typescript = typescriptInterfaces.join('\n\n') || '// No parseable GraphQL responses found.';

  return { jsonSchema: combinedSchema, typescript };
}

module.exports = { inferSchema };
