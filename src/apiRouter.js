// Claude2/src/apiRouter.js
// HTTP API for MCP tool discovery and invocation

const express = require('express');
const router = express.Router();


// Use the tool registry abstraction
const toolRegistry = require('./tool-registry');

// List all tools

router.get('/tools', (req, res) => {
  try {
    const tools = toolRegistry.listTools();
    res.json({ tools });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Invoke a tool by name

router.post('/tool/:name', async (req, res) => {
  const { name } = req.params;
  const input = req.body;
  try {
    const result = await toolRegistry.callTool(name, input);
    res.json({ result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
