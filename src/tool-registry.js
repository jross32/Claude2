// Claude2/src/tool-registry.js
// Central registry for MCP tools, for HTTP API and docs UI

const mcpServer = require('../mcp-server');

function listTools() {
  if (typeof mcpServer.listTools === 'function') {
    return mcpServer.listTools();
  }
  if (Array.isArray(mcpServer.TOOLS)) {
    return mcpServer.TOOLS;
  }
  return [];
}

async function callTool(name, input) {
  if (typeof mcpServer.callTool === 'function') {
    return await mcpServer.callTool(name, input);
  }
  if (typeof mcpServer.handleTool === 'function') {
    return await mcpServer.handleTool(name, input || {});
  }
  throw new Error('Tool not found or not callable');
}

module.exports = { listTools, callTool };
