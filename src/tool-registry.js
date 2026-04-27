// Claude2/src/tool-registry.js
// Central registry for MCP tools, for HTTP API and docs UI

const mcpServer = require('../mcp-server');

function listTools() {
  // Should return array of {name, description, inputSchema}
  if (typeof mcpServer.listTools === 'function') {
    return mcpServer.listTools();
  }
  // Fallback: scan exported tool handlers if needed
  return [];
}

async function callTool(name, input) {
  if (typeof mcpServer.callTool === 'function') {
    return await mcpServer.callTool(name, input);
  }
  throw new Error('Tool not found or not callable');
}

module.exports = { listTools, callTool };
