'use strict';
// MCP Agent Mode — autonomous multi-step AI agent powered by MCP sampling.
// No API key needed: uses whatever AI is connected via the MCP protocol
// (Claude Code, GitHub Copilot, Codex, etc.)

const { v4: uuidv4 } = require('uuid');

const DEFAULT_MAX_STEPS = 30;

// ── Tool definitions the agent can call ──────────────────────────────────────
const AGENT_TOOLS = [
  {
    name: 'scrape_url',
    description: 'Fully scrape a URL using a headless browser. Captures page text, links, images, API calls.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to scrape' },
        depth: { type: 'number', description: 'Link depth (0=single page)' },
        waitMs: { type: 'number', description: 'Extra ms to wait for JS' },
      },
      required: ['url'],
    },
  },
  {
    name: 'http_fetch',
    description: 'Make a plain HTTP/HTTPS request without a browser. Good for APIs and JSON endpoints.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
        headers: { type: 'object', description: 'Request headers' },
        body: { type: 'string', description: 'Request body for POST/PUT' },
      },
      required: ['url'],
    },
  },
  {
    name: 'research_url',
    description: 'Scrape a URL and use AI to answer a specific research question about it.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to research' },
        question: { type: 'string', description: 'Question to answer about the page' },
        mode: { type: 'string', enum: ['quick', 'deep'] },
      },
      required: ['url', 'question'],
    },
  },
  {
    name: 'list_saves',
    description: 'List recent saved scrape sessions.',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max results (default 20)' } },
    },
  },
  {
    name: 'get_save_overview',
    description: 'Get a compact summary of a saved scrape — page count, text sample, links, API calls.',
    input_schema: {
      type: 'object',
      properties: { sessionId: { type: 'string', description: 'Session ID' } },
      required: ['sessionId'],
    },
  },
  {
    name: 'get_page_text',
    description: 'Get extracted plain text from a saved scrape session.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID' },
        maxChars: { type: 'number', description: 'Max chars to return (default 20000)' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'detect_site',
    description: 'Quickly detect the tech stack, CMS, and framework used by a URL.',
    input_schema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'URL to detect' } },
      required: ['url'],
    },
  },
  {
    name: 'list_links',
    description: 'Get all links found during a saved scrape session.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID' },
        filter: { type: 'string', description: 'internal, external, or all (default all)' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'extract_structured_data',
    description: 'Extract JSON-LD, microdata, Open Graph, meta tags, and tables from a saved scrape.',
    input_schema: {
      type: 'object',
      properties: { sessionId: { type: 'string', description: 'Session ID' } },
      required: ['sessionId'],
    },
  },
  {
    name: 'get_api_calls',
    description: 'Get REST/XHR/GraphQL/SSE calls captured during a scrape.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID' },
        filter: { type: 'string', description: 'rest, graphql, sse, or all' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'find_patterns',
    description: 'Find repeated patterns (prices, emails, phones, links) in a saved scrape.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID' },
        pattern: { type: 'string', description: 'prices, contacts, emails, links, or a regex' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'search_scrape_text',
    description: 'Search for text within a saved scrape session.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID' },
        query: { type: 'string', description: 'Text to search for' },
      },
      required: ['sessionId', 'query'],
    },
  },
  {
    name: 'preflight_url',
    description: 'Check if a URL is reachable, get its status code, redirects, and headers.',
    input_schema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'URL to check' } },
      required: ['url'],
    },
  },
  {
    name: 'crawl_sitemap',
    description: 'Discover pages via sitemap.xml or robots.txt.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Root URL to crawl' },
        limit: { type: 'number', description: 'Max URLs to return (default 100)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'batch_scrape',
    description: 'Scrape multiple URLs in parallel.',
    input_schema: {
      type: 'object',
      properties: {
        urls: { type: 'array', items: { type: 'string' }, description: 'URLs to scrape' },
        depth: { type: 'number', description: 'Link depth per URL' },
      },
      required: ['urls'],
    },
  },
];

// ── System prompt for the agent ───────────────────────────────────────────────
function buildSystemPrompt(tools) {
  const toolList = tools.map((t) => {
    const args = Object.entries(t.input_schema?.properties || {})
      .map(([k, v]) => `${k}${(t.input_schema?.required || []).includes(k) ? '*' : ''}: ${v.description || v.type}`)
      .join(', ');
    return `  ${t.name}(${args}) — ${t.description}`;
  }).join('\n');

  return `You are an autonomous web research and scraping agent. You have access to these tools:

${toolList}

STRICT RESPONSE FORMAT — you must respond with ONLY valid JSON, no other text:

To call a tool:
{"action":"tool","tool":"TOOL_NAME","args":{"key":"value"},"thinking":"your reasoning here"}

To finish with a final answer:
{"action":"done","result":"your complete answer here"}

Rules:
- Think through each step in the "thinking" field
- Use tools systematically: detect/preflight first, then scrape, then analyze
- For multi-page sites, use crawl_sitemap or batch_scrape
- Always summarize findings with specific data, not vague descriptions
- If a tool call fails, try an alternative approach
- Never repeat the same tool call with the same args`;
}

// ── AgentRun class ────────────────────────────────────────────────────────────
class AgentRun {
  constructor(id, goal, options, { broadcast, callTool, sampleFn }) {
    this.id = id;
    this.goal = goal;
    this.options = {
      maxSteps: options.maxSteps || DEFAULT_MAX_STEPS,
      tools: options.tools || AGENT_TOOLS,
    };
    this.broadcast = broadcast;
    this.callTool = callTool;
    this.sampleFn = sampleFn; // sampleFromClient from mcp-server.js
    this.status = 'running';
    this.steps = 0;
    this.toolCallCount = 0;
    this.startTime = Date.now();
    this.history = []; // [{role, content}] — conversation context
    this.events = [];
    this._pauseResolve = null;
    this._handoffResolve = null;
    this._stopped = false;
    this.result = null;
    this.error = null;
  }

  emit(type, data = {}) {
    const event = { type: `agent_${type}`, agentId: this.id, ts: Date.now(), ...data };
    this.events.push(event);
    this.broadcast(this.id, event);
  }

  async checkPause() {
    if (this._stopped) throw new Error('Agent stopped by user');
    if (this.status === 'paused') {
      await new Promise((resolve) => { this._pauseResolve = resolve; });
    }
    if (this._stopped) throw new Error('Agent stopped by user');
  }

  pause() {
    if (this.status !== 'running') return false;
    this.status = 'paused';
    this.emit('status', { status: 'paused' });
    return true;
  }

  resume(userMessage) {
    if (this.status !== 'paused' && this.status !== 'waiting_handoff') return false;
    const prevStatus = this.status;
    this.status = 'running';
    this.emit('status', { status: 'running' });
    if (prevStatus === 'paused' && this._pauseResolve) {
      this._pauseResolve(userMessage);
      this._pauseResolve = null;
    }
    if (prevStatus === 'waiting_handoff' && this._handoffResolve) {
      this._handoffResolve({ action: 'resume', message: userMessage });
      this._handoffResolve = null;
    }
    return true;
  }

  async requestHandoff(reason, options = ['Continue', 'Stop']) {
    this.status = 'waiting_handoff';
    this.emit('handoff_request', { reason, options });
    return new Promise((resolve) => { this._handoffResolve = resolve; });
  }

  stop() {
    this._stopped = true;
    this.status = 'stopped';
    if (this._pauseResolve) { this._pauseResolve(null); this._pauseResolve = null; }
    if (this._handoffResolve) { this._handoffResolve({ action: 'stop' }); this._handoffResolve = null; }
    this.emit('status', { status: 'stopped' });
  }
}

// ── Tool execution ────────────────────────────────────────────────────────────
async function executeTool(run, toolName, toolArgs) {
  try {
    const result = await run.callTool(toolName, toolArgs || {});
    if (result && result.content) {
      if (Array.isArray(result.content)) {
        return result.content.map((c) => (c.type === 'text' ? c.text : JSON.stringify(c))).join('\n');
      }
    }
    if (typeof result === 'string') return result;
    return JSON.stringify(result, null, 2);
  } catch (err) {
    return `Error: ${err.message}`;
  }
}

// ── Parse sampling response into action ──────────────────────────────────────
function parseResponse(text) {
  if (!text || typeof text !== 'string') return { action: 'unknown' };
  const trimmed = text.trim();

  // Try to extract JSON from the response (may have surrounding text)
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.action === 'tool' && parsed.tool) return parsed;
      if (parsed.action === 'done') return parsed;
    } catch {}
  }

  // If JSON parse fails, treat the whole thing as a final result
  return { action: 'done', result: trimmed };
}

// ── Build context string for sampling ────────────────────────────────────────
function buildContext(run) {
  const lines = [`Goal: ${run.goal}`, ''];
  for (const entry of run.history) {
    if (entry.role === 'assistant') {
      lines.push(`Assistant: ${entry.content}`);
    } else if (entry.role === 'tool_result') {
      lines.push(`Tool result for ${entry.tool}:\n${entry.content}`);
    } else if (entry.role === 'user_message') {
      lines.push(`User: ${entry.content}`);
    }
    lines.push('');
  }
  lines.push('What is your next action? Respond with ONLY the JSON format specified.');
  return lines.join('\n');
}

// ── Main agent loop ───────────────────────────────────────────────────────────
async function runAgent(run) {
  run.emit('status', { status: 'running' });

  const systemPrompt = buildSystemPrompt(run.options.tools);

  try {
    for (let step = 0; step < run.options.maxSteps; step++) {
      if (run._stopped) break;

      run.steps = step + 1;
      run.emit('step', { step: run.steps });

      // Show thinking spinner
      run.emit('thinking_delta', { text: 'Deciding next action…' });

      // Call the AI via MCP sampling
      const context = buildContext(run);
      const rawResponse = await run.sampleFn(systemPrompt, context, { maxTokens: 2048 });

      if (run._stopped) break;

      if (!rawResponse) {
        run.emit('thinking_done', { text: '' });
        throw new Error('No AI client connected or sampling not supported. Connect an AI client (Claude Code, Copilot, Codex) via the MCP protocol to use agent mode.');
      }

      // Finalize the thinking bubble with the raw response
      run.emit('thinking_done', { text: rawResponse });

      // Parse the response
      const action = parseResponse(rawResponse);

      if (action.action === 'tool') {
        // Store in history
        run.history.push({ role: 'assistant', content: rawResponse });

        run.toolCallCount++;
        run.emit('tool_call', {
          callId: `call-${run.toolCallCount}`,
          tool: action.tool,
          input: action.args || {},
          callIndex: run.toolCallCount,
          reason: action.reason,
        });

        await run.checkPause();

        const t0 = Date.now();
        const output = await executeTool(run, action.tool, action.args || {});
        const durationMs = Date.now() - t0;

        const outputPreview = typeof output === 'string' ? output.slice(0, 4000) : JSON.stringify(output).slice(0, 4000);

        run.emit('tool_result', {
          callId: `call-${run.toolCallCount}`,
          tool: action.tool,
          output: outputPreview,
          durationMs,
          callIndex: run.toolCallCount,
          ok: !String(output).startsWith('Error:'),
        });

        run.history.push({
          role: 'tool_result',
          tool: action.tool,
          content: outputPreview,
        });

        continue;
      }

      if (action.action === 'done') {
        const result = action.result || rawResponse;
        run.result = result;
        run.status = 'done';
        run.emit('delta', { text: result });
        run.emit('done', {
          result,
          steps: run.steps,
          toolCalls: run.toolCallCount,
          durationMs: Date.now() - run.startTime,
        });
        return;
      }

      // Fallback: treat as final answer
      run.result = rawResponse;
      run.status = 'done';
      run.emit('delta', { text: rawResponse });
      run.emit('done', {
        result: rawResponse,
        steps: run.steps,
        toolCalls: run.toolCallCount,
        durationMs: Date.now() - run.startTime,
      });
      return;
    }

    if (!run._stopped) {
      run.result = 'Reached maximum steps.';
      run.status = 'done';
      run.emit('done', {
        result: run.result,
        steps: run.steps,
        toolCalls: run.toolCallCount,
        durationMs: Date.now() - run.startTime,
        warning: 'max_steps_reached',
      });
    }
  } catch (err) {
    if (run._stopped) return;
    run.status = 'error';
    run.error = err.message;
    run.emit('error', { message: err.message });
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
function createAgentRun(goal, options, deps) {
  const id = `agent-${uuidv4().slice(0, 8)}`;
  return new AgentRun(id, goal, options || {}, deps);
}

module.exports = { createAgentRun, runAgent, AGENT_TOOLS };
