# ChatGPT Agent Mode — Protocol Research

**Captured:** 2026-05-03  
**Method:** Playwright JS-level WebSocket interception + SSE capture  
**Model observed:** `gpt-5-5-thinking` with `thinking_effort: extended`

---

## Streaming Architecture

ChatGPT uses a **three-layer streaming system**:

```
Browser → POST /backend-api/f/conversation
       ← SSE response: JWT handoff token + topic_id (973 bytes, DONE immediately)
       ↕ wss://ws.chatgpt.com/p3/ws/user/{userId}?verify={hmac}
         subscribe("conversation-turn-{UUID}")
       ← WS frames: JSON delta patches for the response stream
```

The SSE response from `/f/conversation` is **not the content** — it's just a handoff that:
1. Returns a JWT (`resume_conversation_token`) for the conduit server
2. Returns a `stream_handoff` event with a `topic_id` and two options:
   - `resume_sse_endpoint` (reconnect via SSE with topic_id)
   - `subscribe_ws_topic` (subscribe via existing WS — what ChatGPT actually uses)

---

## WebSocket Details

**URL:** `wss://ws.chatgpt.com/p3/ws/user/{userId}?verify={timestamp}-{hmac}`

**Connection:** Opened on page load (not per-conversation). Persistent for the session.

**Protocol:** Array of command/message objects per frame (batched).

### Client → Server commands

```json
// Initial connect + subscribe to page-level topics
[
  {"id":1,"command":{"type":"connect","presence":{"type":"presence","state":"foreground"}}},
  {"id":2,"command":{"type":"subscribe","topic_id":"calpico-chatgpt"}},
  {"id":3,"command":{"type":"subscribe","topic_id":"conversations"}},
  {"id":4,"command":{"type":"subscribe","topic_id":"app_notifications"}}
]

// Subscribe to a specific conversation turn (sent after SSE handoff)
[{"id":5,"command":{"type":"subscribe","topic_id":"conversation-turn-{UUID}","offset":"0"}}]
```

### Server → Client messages

```json
// Subscribe ACK (with optional catchup frames for in-progress turns)
[{"id":5,"type":"reply","reply":{
  "type":"subscribe",
  "topic_id":"conversation-turn-{UUID}",
  "last_offset":"...",
  "recovered":true,
  "catchups":[...]
}}]

// Streaming message
[{"type":"message","topic_id":"conversation-turn-{UUID}","payload":{
  "type":"conversation-turn-stream",
  "payload":{
    "type":"stream-item",
    "conversation_id":"...",
    "turn_id":"...",
    "encoded_item":"event: delta\ndata: {...}\n\n",
    "stream_item_id":"...",
    "parent_stream_item_id":"...",   // linked list for ordering
    "server_timestamp_ms":...
  }
}}]
```

---

## Delta Event Format (encoded_item)

Each WS frame wraps SSE-formatted content in `encoded_item`:

```
event: delta_encoding
data: "v1"

event: delta
data: {"p": "", "o": "add", "v": {<full message object>}, "c": 0}

event: delta
data: {"v": {<partial update>}, "c": 1}
```

- `p` = JSON path (empty = root)
- `o` = operation: `"add"` (new message), `"replace"` (update)
- `v` = value (full message object or partial update)
- `c` = sequence counter (monotonic per turn)

---

## Message Object Structure

```json
{
  "message": {
    "id": "UUID",
    "author": {"role": "assistant|user|system|tool", "name": null, "metadata": {}},
    "create_time": 1777797530.9,
    "content": {
      "content_type": "text|thinking|tool_use|tool_result|model_editable_context",
      "parts": ["text content..."]
    },
    "status": "in_progress|finished_successfully",
    "metadata": {
      "model_slug": "gpt-5-5-thinking",
      "thinking_effort": "extended",
      "turn_exchange_id": "UUID",
      "stream_topic_id": "conversation-turn-UUID",
      "async_source": "saserver-centralus-prod.fck9d:conversation-turn-UUID:US",
      "request_id": "wfr_019decfd..."
    }
  },
  "conversation_id": "UUID",
  "error": null
}
```

---

## Special Event Types (in encoded_item)

| Event type | What it means |
|---|---|
| `title_generation` | AI-generated title for the conversation |
| `resume_conversation_token` | JWT for reconnecting to the conduit |
| `stream_handoff` | Redirect to WS or SSE for real content |
| `input_message` | Echoes back the user message with full metadata |
| `delta` | Incremental content update (main content type) |

---

## Infrastructure (Internal)

From metadata fields in the WS frames:

- **Orchestration:** Temporal workflows — `saserver-centralus-prod.fck9d` cluster
  - Each conversation turn is a Temporal workflow: `conversation-turn-{UUID}`
  - Internal debug URL: `https://temporal-ui.gateway.unified-1.internal.api.openai.org/namespaces/saserver-centralus-prod.fck9d/workflows/...`
- **Conduit server:** `10.128.62.151:8303` (internal IP, cluster `unified-148`)
- **Async source format:** `{namespace}:{workflow-id}:{region}`

---

## Key API Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /backend-api/f/conversation` | Start a turn → returns SSE handoff |
| `POST /backend-api/f/conversation/prepare` | Pre-flight (fires multiple times) |
| `GET /backend-api/conversation/{id}/stream_status` | Poll stream completion |
| `GET /backend-api/conversation/{id}/textdocs` | Fetch saved text documents |
| `POST /backend-api/sentinel/chat-requirements/prepare` | Bot detection token prep |
| `POST /backend-api/sentinel/chat-requirements/finalize` | Bot detection finalize |
| `POST /backend-api/sentinel/ping` | Keepalive |
| `POST /backend-api/sentinel/req` | Sentinel request verification |
| `POST /backend-api/gizmos/snorlax/upsert` | Create/update project (gizmo) |
| `GET /backend-api/gizmos/g-p-{id}` | Get project details |
| `GET /backend-api/projects/{id}/saves` | Get project saves/files |

---

## Complete Content Type Taxonomy

| `content_type` | `role` | What it is |
|---|---|---|
| `text` | `assistant` | Streaming response text — arrives via `o: "append"` patches |
| `text` | `assistant`, `channel: "commentary"` | Thinking preamble text (hidden from user) — `is_thinking_preamble_message: true` |
| `thoughts` | `assistant` | Internal reasoning bubbles — array of `{summary, content, chunks[], finished}` |
| `code` (json) | `assistant`, `recipient: "web.run"` | Tool call request (the model's JSON tool input) |
| `text` | `tool` (name: `web.run`) | Tool result containing search_result_groups in metadata |
| `model_editable_context` | `assistant` | Memory/context the model manages |
| `user_editable_context` | `user` | User profile/preferences injected as system message |
| `developer_content` | `developer` | System instructions (genui prefetch, etc.) |

## Delta Patch Operations

| `o` (operation) | Where used |
|---|---|
| `"add"` | New message (first occurrence of a message object) |
| `"append"` | Text streaming: `{"p": "/message/content/parts/0", "o": "append", "v": "text chunk"}` |
| `"append"` | Thoughts streaming: `{"p": "/message/content/thoughts", "o": "append", "v": [{thought}]}` |
| `"replace"` | Status updates, end_turn flag, metadata fields |
| `"patch"` | Batch multiple ops: `{"o": "patch", "v": [{op1}, {op2}, ...]}` |

## Thoughts Object Structure

```json
{
  "summary": "Evaluating agent frameworks and platforms",
  "content": "Full reasoning text...",
  "chunks": ["Chunk 1.", "Chunk 2."],
  "finished": true
}
```

Multiple thought objects accumulate per turn via `o: "append"` on `/message/content/thoughts`.

## Message Lifecycle Markers

| Marker | Event | Meaning |
|---|---|---|
| `user_visible_token` | `first` | First visible output token — latency measurement point |
| `cot_token` | `first` | Chain-of-thought started |
| `final_channel_token` | `first` | Last visible output channel started |
| `last_token` | `last` | Absolute last token in the turn |

## Turn Completion Events

```json
{"type": "message_stream_complete", "conversation_id": "..."}
{"type": "conversation-turn-complete", "payload": {"conversation_id": "..."}}
```

## Heartbeat

The server sends periodic heartbeats inside the conversation-turn topic (not just at the WS level):
```json
{"type": "heartbeat", "turn_id": "...", "conversation_id": "...", "server_timestamp_ms": ...}
```

---

## Implications for MCP Agent Mode

ChatGPT's approach is complex because it needs to scale to millions of concurrent users. For our MCP server (single-user, local), we can use a much simpler design:

### Recommended Architecture

```
MCP Client → POST /api/agent/start        → creates agentId, starts async worker
          ← SSE  GET /api/agent/:id/stream → all events for this run

User browser shows live agent panel:
  - Thinking bubble (animated) — from "thinking" events
  - Tool call cards (before + after) — from "tool_call" + "tool_result" events
  - Streaming response text — from "delta" events
  - Live browser screenshots — from "screenshot" events
  - HANDOFF button — appears on "handoff_request" event

Handoff flow:
  Agent → emits: {"type": "handoff_request", "reason": "Need confirmation before deleting file"}
        → Agent PAUSES, waits on a promise
  User  → clicks "Take over" or types in chat box
        → POST /api/agent/:id/handoff  {"action": "resume"|"redirect", "message": "..."}
        → Agent resumes with user input injected
```

### REST API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/agent/start` | Start a run, returns `{agentId}` |
| `GET` | `/api/agent/:id/stream` | SSE stream of all events |
| `POST` | `/api/agent/:id/pause` | Pause agent between tool calls |
| `POST` | `/api/agent/:id/resume` | Resume from pause |
| `POST` | `/api/agent/:id/handoff` | Send user message during handoff_request |
| `POST` | `/api/agent/:id/stop` | Hard stop |
| `GET` | `/api/agent/:id/status` | Current state |
| `GET` | `/api/agent/list` | All active/recent runs |

### SSE Event Schema

```json
// Thinking bubble (internal reasoning, shown as animated overlay)
{"type": "thinking", "summary": "Checking if page has login form", "text": "Full reasoning...", "ts": 1234}

// Tool about to be called
{"type": "tool_call", "id": "c1", "tool": "scrape_url", "input": {"url": "..."}, "ts": 1234}

// Tool finished
{"type": "tool_result", "id": "c1", "tool": "scrape_url", "ok": true, "output": {...}, "duration_ms": 2300, "ts": 1234}

// Streaming response text token
{"type": "delta", "text": "Based on the scrape...", "ts": 1234}

// Live browser screenshot
{"type": "screenshot", "data": "data:image/png;base64,...", "label": "After clicking login", "ts": 1234}

// Agent status change
{"type": "status", "status": "running|paused|waiting_for_handoff|done|error", "ts": 1234}

// Agent requests user handoff (pauses, waits for user)
{"type": "handoff_request", "reason": "I need your decision before proceeding", "options": ["Continue", "Skip", "Abort"], "ts": 1234}

// Agent is done
{"type": "done", "result": "Completed scrape of 5 pages", "steps": 8, "tool_calls": 5, "duration_ms": 45000, "ts": 1234}

// Error
{"type": "error", "message": "scrape_url failed: timeout", "recoverable": true, "ts": 1234}
```

### Agent Worker Design (Node.js)

```js
// The agent runs as an async generator — yields events as it goes
async function* runAgent(goal, tools, options) {
  yield {type: 'status', status: 'running'};
  
  const messages = [{role: 'user', content: goal}];
  
  for (let step = 0; step < options.maxSteps; step++) {
    // Call Claude/AI
    const response = await callAI(messages, tools);
    
    // Stream thinking chunks
    for (const thought of response.thinking) {
      yield {type: 'thinking', summary: thought.summary, text: thought.content};
    }
    
    // If AI wants to use a tool
    if (response.tool_calls) {
      for (const call of response.tool_calls) {
        yield {type: 'tool_call', id: call.id, tool: call.name, input: call.input};
        
        // Check if pause requested
        if (agentState.paused) await agentState.resumePromise;
        
        // Check if handoff triggered for this tool
        if (options.handoffBefore?.includes(call.name)) {
          yield {type: 'handoff_request', reason: `About to call ${call.name}`, options: ['Proceed', 'Skip', 'Abort']};
          const userDecision = await agentState.handoffPromise;
          if (userDecision.action === 'abort') { yield {type: 'done', result: 'Aborted by user'}; return; }
        }
        
        const t0 = Date.now();
        const result = await runTool(call.name, call.input);
        yield {type: 'tool_result', id: call.id, tool: call.name, ok: !result.error, output: result, duration_ms: Date.now()-t0};
        
        messages.push({role: 'tool', content: JSON.stringify(result), tool_call_id: call.id});
      }
    }
    
    // Stream final text
    for (const chunk of response.textChunks) {
      yield {type: 'delta', text: chunk};
    }
    
    if (response.stopReason === 'end_turn') break;
    messages.push({role: 'assistant', content: response.text});
  }
  
  yield {type: 'done', result: messages.at(-1)?.content};
}
```

### UI Design (Live Agent Panel)

The agent panel lives at `/agent` or as a slide-in panel in the existing UI.

Key UI components:
1. **Goal input** — where user types what they want the agent to do
2. **Steps timeline** — vertical timeline of thinking → tool_call → tool_result → delta events
3. **Thinking bubble** — animated spinner + summary text, collapses when done
4. **Tool call card** — shows tool name + input BEFORE result, then result fills in below
5. **Browser screenshot strip** — thumbnails of browser state at each Playwright step
6. **Handoff panel** — slides up with reason + buttons when `handoff_request` fires
7. **Control bar** — Pause / Resume / Stop / Handoff Now buttons always visible

Handoff UX:
- "Handoff Now" button always present (user can grab control any time between tool calls)
- On `handoff_request` event: panel expands with reason + predefined options + free-text input
- Agent shows "⏸ Waiting for you..." while paused
- On resume: agent continues with user message injected into context
