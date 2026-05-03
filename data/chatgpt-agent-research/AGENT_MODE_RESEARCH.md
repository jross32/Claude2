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

## Implications for MCP Agent Mode

ChatGPT's approach is complex because it needs to scale to millions of concurrent users. For our MCP server (single-user, local), we can use a much simpler design:

### Recommended Architecture

```
MCP Client → POST /mcp/agent/start  →  Express  →  Agent worker (Node.js child_process or async generator)
          ← SSE /mcp/agent/{id}/stream
               event: thinking   data: {"text": "..."}
               event: tool_call  data: {"tool": "scrape_url", "input": {...}}
               event: tool_result data: {"tool": "scrape_url", "output": {...}}
               event: delta      data: {"text": "more response text"}
               event: done       data: {"summary": "..."}
```

### Key Design Decisions

1. **Single SSE stream per agent run** — no handoff needed (we control both ends)
2. **Visible steps** — emit `thinking`, `tool_call`, `tool_result` events explicitly (not just final text)
3. **Pause/resume** — store agent state in memory, expose `POST /mcp/agent/{id}/pause` and `/resume`
4. **Intervene** — expose `POST /mcp/agent/{id}/inject` to add a message mid-run
5. **Browser control** — wrap Playwright actions as agent tools, emit screenshot events for UI visibility
6. **Real-time UI** — `/agent-live` page shows SSE stream with animated thinking bubbles, tool call cards, live browser screenshots

### Event Schema

```json
// thinking event
{"type": "thinking", "text": "I need to first check the current page structure...", "ts": 1234}

// tool_call event  
{"type": "tool_call", "id": "call_1", "tool": "scrape_url", "input": {"url": "https://..."}, "ts": 1234}

// tool_result event
{"type": "tool_result", "id": "call_1", "tool": "scrape_url", "output": {...}, "duration_ms": 2300, "ts": 1234}

// delta event (streaming response text)
{"type": "delta", "text": "Based on the scrape results...", "ts": 1234}

// screenshot event (live browser view)
{"type": "screenshot", "data": "base64...", "label": "After clicking login button", "ts": 1234}

// status event
{"type": "status", "status": "running|paused|waiting_for_input|done|error", "ts": 1234}

// done event
{"type": "done", "result": "...", "steps": 5, "tool_calls": 3, "duration_ms": 45000, "ts": 1234}
```
