'use strict';
// MCP Agent Mode — autonomous multi-step AI agent with live UI, pause/resume, and handoffs.

const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_MODEL = process.env.AGENT_MODEL || 'claude-opus-4-7';
const DEFAULT_MAX_STEPS = 30;
const DEFAULT_THINKING_BUDGET = 8000;

// ── Tool definitions Claude can call ─────────────────────────────────────────
// Subset of MCP tools most useful for general agent tasks
const AGENT_TOOLS = [
  {
    name: 'scrape_url',
    description: 'Fully scrape a URL using a headless browser. Captures page text, links, images, API calls, and more. Use for any website that needs deep extraction.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to scrape' },
        depth: { type: 'number', description: 'Link depth (0=single page, 1=follow links, etc.)' },
        waitMs: { type: 'number', description: 'Extra ms to wait for JS to settle (default 1000)' },
        captureApiCalls: { type: 'boolean', description: 'Capture REST/GraphQL API calls (default true)' },
        captureSSE: { type: 'boolean', description: 'Capture SSE streams' },
      },
      required: ['url'],
    },
  },
  {
    name: 'http_fetch',
    description: 'Make a plain HTTP/HTTPS request without a browser. Good for APIs, JSON endpoints, and simple pages.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], description: 'HTTP method (default GET)' },
        headers: { type: 'object', description: 'Request headers' },
        body: { type: 'string', description: 'Request body (for POST/PUT)' },
        json: { type: 'boolean', description: 'Parse response as JSON' },
      },
      required: ['url'],
    },
  },
  {
    name: 'research_url',
    description: 'Scrape a URL and use AI to answer a specific research question about it. Best for extracting insights, summarizing content, or answering questions about a page.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to research' },
        question: { type: 'string', description: 'Specific question to answer about the page' },
        mode: { type: 'string', enum: ['quick', 'deep'], description: 'Research depth' },
      },
      required: ['url', 'question'],
    },
  },
  {
    name: 'list_saves',
    description: 'List recent saved scrape sessions.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max number of saves to return (default 20)' },
      },
    },
  },
  {
    name: 'get_save_overview',
    description: 'Get a compact overview of a saved scrape session — page count, text sample, API calls, links, etc.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID from a completed scrape' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'get_page_text',
    description: 'Get the extracted plain text from a saved scrape session.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID of a completed scrape' },
        maxChars: { type: 'number', description: 'Maximum characters to return (default 20000)' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'detect_site',
    description: 'Quickly detect technology stack, CMS, framework, and basic info about a URL without a full scrape.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to detect' },
      },
      required: ['url'],
    },
  },
  {
    name: 'list_links',
    description: 'Get all links from a saved scrape session.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID of a completed scrape' },
        filter: { type: 'string', description: 'Filter links by type: internal, external, or all (default all)' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'extract_structured_data',
    description: 'Extract structured data (JSON-LD, microdata, Open Graph, meta tags, tables) from a saved scrape.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID of a completed scrape' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'get_api_calls',
    description: 'Get all API/XHR/fetch calls captured during a scrape session.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID of a completed scrape' },
        filter: { type: 'string', description: 'Filter by type: rest, graphql, sse, or all (default all)' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'find_patterns',
    description: 'Find patterns, repeated structures, or data clusters in a saved scrape (prices, names, emails, phones, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID of a completed scrape' },
        pattern: { type: 'string', description: 'Type of pattern: prices, contacts, emails, links, or a custom regex' },
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
        sessionId: { type: 'string', description: 'Session ID of a completed scrape' },
        query: { type: 'string', description: 'Text to search for' },
      },
      required: ['sessionId', 'query'],
    },
  },
  {
    name: 'preflight_url',
    description: 'Quickly check if a URL is reachable, get its status code, redirect chain, and response headers — without scraping.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to check' },
      },
      required: ['url'],
    },
  },
  {
    name: 'crawl_sitemap',
    description: 'Discover pages via sitemap.xml or robots.txt — returns a list of URLs.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Root URL to crawl sitemap for' },
        limit: { type: 'number', description: 'Max URLs to return (default 100)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'batch_scrape',
    description: 'Scrape multiple URLs in parallel. Returns session IDs when complete.',
    input_schema: {
      type: 'object',
      properties: {
        urls: { type: 'array', items: { type: 'string' }, description: 'List of URLs to scrape' },
        depth: { type: 'number', description: 'Link depth per URL' },
      },
      required: ['urls'],
    },
  },
];

const SYSTEM_PROMPT = `You are an autonomous web research and scraping agent. You have tools to scrape websites, fetch URLs, extract data, and research content.

Guidelines:
- Think through your approach before acting
- Use tools in logical order (detect site → scrape → analyze)
- For multi-page tasks, use batch_scrape or crawl_sitemap first
- Summarize findings clearly with specific data, not vague descriptions
- If you encounter an error, try an alternative approach before giving up
- Be thorough — don't stop after one scrape if deeper analysis is needed
- Always report what you found, even partial results`;

// ── AgentRun class ────────────────────────────────────────────────────────────
class AgentRun {
  constructor(id, goal, options, { broadcast, callTool }) {
    this.id = id;
    this.goal = goal;
    this.options = {
      model: options.model || DEFAULT_MODEL,
      maxSteps: options.maxSteps || DEFAULT_MAX_STEPS,
      enableThinking: options.enableThinking !== false,
      thinkingBudget: options.thinkingBudget || DEFAULT_THINKING_BUDGET,
      tools: options.tools || AGENT_TOOLS,
    };
    this.broadcast = broadcast;
    this.callTool = callTool;
    this.status = 'running';
    this.steps = 0;
    this.toolCallCount = 0;
    this.startTime = Date.now();
    this.messages = [];
    this.events = []; // full event log for replay
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

  // Pause execution between tool calls
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

  // Agent requests user intervention — pauses until user responds
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
async function executeTool(run, toolName, toolInput) {
  try {
    const result = await run.callTool(toolName, toolInput);
    // Extract text content from MCP result
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

// ── Main agent loop ───────────────────────────────────────────────────────────
async function runAgent(run) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  run.emit('status', { status: 'running' });
  run.messages = [{ role: 'user', content: run.goal }];

  try {
    for (let step = 0; step < run.options.maxSteps; step++) {
      if (run._stopped) break;

      run.steps = step + 1;
      run.emit('step', { step: run.steps });

      // Build API call params
      const params = {
        model: run.options.model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        tools: run.options.tools,
        messages: run.messages,
      };

      // Enable extended thinking if supported and requested
      if (run.options.enableThinking) {
        params.thinking = { type: 'enabled', budget_tokens: run.options.thinkingBudget };
        // Extended thinking requires max_tokens > budget_tokens
        params.max_tokens = Math.max(params.max_tokens, run.options.thinkingBudget + 8000);
      }

      // Stream the response
      let currentThinking = '';
      let currentText = '';
      let thinkingBlockOpen = false;

      let finalMessage;
      try {
        const stream = await client.messages.create({ ...params, stream: true });

        for await (const event of stream) {
          if (run._stopped) break;

          if (event.type === 'content_block_start') {
            if (event.content_block.type === 'thinking') {
              currentThinking = '';
              thinkingBlockOpen = true;
            } else if (event.content_block.type === 'text') {
              thinkingBlockOpen = false;
            }
          } else if (event.type === 'content_block_delta') {
            if (event.delta.type === 'thinking_delta') {
              currentThinking += event.delta.thinking;
              run.emit('thinking_delta', { text: event.delta.thinking });
            } else if (event.delta.type === 'text_delta') {
              currentText += event.delta.text;
              run.emit('delta', { text: event.delta.text });
            }
          } else if (event.type === 'content_block_stop') {
            if (thinkingBlockOpen && currentThinking) {
              run.emit('thinking_done', { text: currentThinking });
              currentThinking = '';
              thinkingBlockOpen = false;
            }
          } else if (event.type === 'message_delta') {
            // stop_reason available here during streaming
          } else if (event.type === 'message_stop') {
            // Stream finished
          }
        }

        // Get the final accumulated message
        finalMessage = await stream.finalMessage();
      } catch (apiErr) {
        // If thinking is not supported, retry without it
        if (apiErr.message?.includes('thinking') || apiErr.message?.includes('beta')) {
          run.options.enableThinking = false;
          delete params.thinking;
          params.max_tokens = 16000;
          const stream2 = await client.messages.create({ ...params, stream: true });
          currentText = '';
          for await (const event of stream2) {
            if (run._stopped) break;
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              currentText += event.delta.text;
              run.emit('delta', { text: event.delta.text });
            }
          }
          finalMessage = await stream2.finalMessage();
        } else {
          throw apiErr;
        }
      }

      if (run._stopped) break;

      // Add assistant message to history (must include thinking blocks for context)
      run.messages.push({ role: 'assistant', content: finalMessage.content });

      // If model called tools
      if (finalMessage.stop_reason === 'tool_use') {
        const toolUseBlocks = finalMessage.content.filter((b) => b.type === 'tool_use');
        const toolResults = [];

        for (const toolCall of toolUseBlocks) {
          run.toolCallCount++;
          run.emit('tool_call', {
            callId: toolCall.id,
            tool: toolCall.name,
            input: toolCall.input,
            callIndex: run.toolCallCount,
          });

          // Check pause/stop before executing tool
          await run.checkPause();

          const t0 = Date.now();
          const output = await executeTool(run, toolCall.name, toolCall.input);
          const durationMs = Date.now() - t0;

          run.emit('tool_result', {
            callId: toolCall.id,
            tool: toolCall.name,
            output: typeof output === 'string' ? output.slice(0, 4000) : JSON.stringify(output).slice(0, 4000),
            durationMs,
            callIndex: run.toolCallCount,
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: typeof output === 'string' ? output : JSON.stringify(output),
          });
        }

        // Add tool results and continue
        run.messages.push({ role: 'user', content: toolResults });
        continue;
      }

      // Model finished (end_turn) — we're done
      const finalText = finalMessage.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');

      run.result = finalText;
      run.status = 'done';
      run.emit('done', {
        result: finalText,
        steps: run.steps,
        toolCalls: run.toolCallCount,
        durationMs: Date.now() - run.startTime,
      });
      return;
    }

    // Max steps reached
    if (!run._stopped) {
      run.result = 'Reached maximum steps limit.';
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
