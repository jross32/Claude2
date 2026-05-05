# Copilot Instructions — Web Scraper App

Project instructions for AI assistants working in this repo.

---

## Permissions

Full access is pre-granted — Justin does not need to approve tool use each session.
All shell commands, Write/Edit/Read are allowed for the entire project folder.
No approval prompts should ever appear.

---

## Autonomy Mode

- When Justin asks for auto mode, continuous improvement, or open-ended iteration, do not stop after a phase boundary to ask whether to continue.
- Choose the best next implementation step yourself, keep coding, keep validating, and continue until Justin explicitly stops or a real blocker is reached.
- Do not pause with messages like "should I start phase X" after a completed step when the standing request is to continue autonomously.
- For long-running work, prefer bounded, observable execution: emit progress regularly, checkpoint state, use timeouts for external commands, and design resumable scripts so work does not appear stuck.
- If a long-running script is needed, add heartbeat output and persisted progress before treating it as the main execution path.

---

## MCP Server Reference

For the full MCP tool catalog, classification details, source-module mapping, and rules for adding new tools, see **[MCP.md](../MCP.md)**. Update that file whenever tools are added or changed.

---

## Adding a New MCP Tool

Every time a new tool is added to `mcp-server.js`, **all 17 locations below must be updated**. Do not skip any. After adding tools, run `node --check mcp-server.js` and `node tests/run.js smoke` to verify.

### Required (every tool)

| # | File | What to do |
|---|------|-----------|
| 1 | `mcp-server.js` | Add tool object to `TOOLS` array: `{ name, description, inputSchema }` |
| 2 | `mcp-server.js` | Add to `READ_ONLY_TOOL_NAMES` (~line 4200) if tool only reads data |
| 3 | `mcp-server.js` | Add to `OPEN_WORLD_TOOL_NAMES` (~line 4267) if tool makes **any** outbound HTTP/network call |
| 4 | `mcp-server.js` | Add `case 'tool_name':` handler inside `handleTool()` |
| 5 | `src/mcp-catalog.js` | Add tool name to the correct category in `TOOL_CATEGORY_GROUPS` |
| 6 | `src/mcp-catalog.js` | Add to `TOOL_MATURITY` if beta/experimental (omit entry if stable) |
| 7 | `src/mcp-catalog.js` | Add to `TOOL_EXAMPLES` with a sample input object (use `{}` if no params) |
| 8 | `src/server.js` | Update hardcoded tool count in landing page `<p>` description (~line 86) |
| 9 | `src/server.js` | Update hardcoded tool count in landing page pill `<strong>` (~line 88) |
| 10 | `MCP.md` | Update total count line (~line 53): `**Total: N tools · M prompts**` |
| 11 | `MCP.md` | Update section header (~line 67): `## All N Tools — Quick Reference` |
| 12 | `MCP.md` | Add tool row to the correct category table: `\| \`tool_name\` \| REST endpoint or — \| AI Use 1–10 \| Notes. RO/OW/D badge if applicable. \|` |
| 13 | `MCP.md` | Update footer (~line 413): version, date, tool count, prompt count |
| 14 | `README.md` | Update tool count in the first bullet (~line 7) |
| 15 | `CLAUDE.md` | Update `mcp-server.js` row in Key File Map (tool + prompt counts) |
| 16 | `.github/copilot-instructions.md` | Update `mcp-server.js` row in Key File Map (tool + prompt counts) |

### Classification rules

- **OPEN_WORLD** — add if the tool makes ANY outbound HTTP/network call (page fetches, DNS, SSL, IP lookups, API calls to external URLs, etc.). Network calls are extremely common in this codebase — when in doubt, add it as OW.
- **READ_ONLY** — add if the tool only reads data and never writes, deletes, or modifies state. A tool CAN be both RO and OW simultaneously (e.g., `lookup_dns` reads via network).
- **DESTRUCTIVE** (`DESTRUCTIVE_TOOL_NAMES`, ~line 4259) — only for tools that permanently delete or halt something. Mutually exclusive with READ_ONLY.
- If a tool is none of the above: it is implicitly write/stateful (e.g., `schedule_scrape`). Do not add it to any set.
- Annotations (`readOnlyHint`, `openWorldHint`, etc.) are applied **automatically** via the `TOOLS.forEach()` loop — do not set them manually on the tool object.

### Conditional (only when applicable)

- `CAPTURE_TRACKER.md` — only if the tool captures a new data type not previously tracked
- `package.json` version — only on a named patch/minor release
- New `src/*.js` module — if the tool needs a new source file, also add it to the Key File Map and to the source module mapping table in `MCP.md`

### When adding a new PROMPT (not a tool)

The prompts pill in `src/server.js` is now dynamic — no manual update needed.

### What is already dynamic (no manual update needed)

`server_info` tool, `/docs` page, `/api/mcp-meta` endpoint — all use `TOOLS.length` / `PROMPTS.length` automatically.
Test files do **not** hardcode tool names or counts — nothing to update in `tests/`.

---

## Do Not Implement — Blocked Tools and Prompts

There are currently no permanently blocked tools or prompts. Previously removed items (`get_robots_txt`, `robots_and_seo_audit`, `third_party_privacy_audit`, `review_sentiment_analysis`) have been restored — they are analysis tools, not bot-compliance tools, and are active again as of v2.6.0.

---

## Project Overview

This is a **general-purpose web scraper** (Node.js + Express + Playwright).
It is designed to work on **any website** — keep all core scraper logic generic and site-agnostic.

The owner (Justin) personally uses it to scrape **poolplayers.com (APA)**, but that is a
personal use case layered on top of the app, not the core of it.
APA-specific config lives in `.env` (gitignored) — not in `src/`.

---

## Key File Map

| File | Role | Stability |
|------|------|-----------|
| `src/server.js` | Express server, all REST API endpoints, WebSocket broadcast | Stable |
| `src/scraper.js` | Core browser automation (Playwright) — largest & most complex file | **Fragile** |
| `src/extractor.js` | Deep DOM extraction: 50+ data types | **Fragile** |
| `src/auth.js` | Login form handling, 2FA (TOTP / email / SMS) | **Fragile** |
| `src/scheduler.js` | Cron job management for scheduled scrapes | Stable |
| `src/diff.js` | Compare two scrape results | Stable |
| `src/generators.js` | React component, CSS, Markdown, Sitemap code generators | Stable |
| `src/schema-inferrer.js` | TypeScript / JSON Schema inference from GraphQL | Stable |
| `src/entity-extractor.js` | Email, phone, URL, address pattern extraction | Stable |
| `src/har-exporter.js` | HAR 1.2 format export | Stable |
| `src/git-autosave.js` | Auto-commit & push on 10-min interval (starts with server) | Stable |
| `src/oidc-tester.js` | OIDC/OAuth2 security test suite (8 test types) | Stable |
| `src/tool-logger.js` | Per-call request logs + live usage counters in `logs/` | Stable |
| `mcp-server.js` | MCP server — 91 tools, 29 prompts, classification sets, handlers | Stable |
| `MCP.md` | Living reference for all MCP tools — update when adding/changing tools | Stable |
| `public/index.html` | Single-page frontend UI (large — edit carefully) | **Fragile** |
| `public/js/app.js` | Frontend logic | **Fragile** |
| `public/css/style.css` | Styling | Stable |
| `autosave.js` | Manual commit & push — `node autosave.js` or `npm run save` | Stable |

**Fragile** = be extra careful, explain risk before touching, test after changes.

---

## Code Style

When editing existing files, always match the style already in that file. For new files:

```js
const STYLE = {
  indentation:   'spaces',
  indentSize:    2,
  quotes:        'single',
  semicolons:    true,
  trailingComma: 'es5',
  maxLineLength: 120,
};
```

---

## Touching Code

- Touch **any file** in the project freely.
- **Never break working code.** If a change carries real risk, say so before making it.
- **Don't refactor, clean up, or add comments** to code outside the scope of the task.
- **No APA/poolplayers.com assumptions in `src/`.** Core scraper logic stays generic.

---

## Frontend vs Backend

**Default: backend-first.**

- Implement logic in `src/` first.
- Only edit `public/` when the task explicitly requires it or a backend change needs a matching UI update.
- The frontend (`index.html` + `app.js`) is large and Fragile — easy to break interactions accidentally.
  Flag any non-trivial frontend changes before making them.

```js
const FRONTEND = {
  defaultToBackend:        true,
  flagNonTrivialFrontend:  true,
};
```

---

## Git & Commits

- Always commit to the **current branch** — never switch or create branches without being asked.
- Use `node autosave.js "message"` (or `npm run save`) for commits.
- **Commit automatically after any meaningful code change** — any edit to a repo file (source, config, docs) should be committed. Do NOT commit when only answering questions or doing read-only planning.
- Commit as `jross32` — git is configured with `user.name = "jross32"` and `user.email = justinwross32@gmail.com`. Never change these.
- Never force push, `reset --hard`, or touch the remote without confirmation.

```js
const GIT = {
  useAutosaveScript:   true,
  alwaysCurrentBranch: true,
  commitAfterAnyEdit:  true,   // commit after any file edit, not just when asked
  commitAuthor:        'jross32 <justinwross32@gmail.com>',
};
```

### Commit Message Format

Every commit message must include:
1. **Subject**: `v{version}: {short description}` or just a short description for minor fixes
2. **Changed files**: bullet list of what was added/changed/fixed
3. **Bugs fixed** (if any): explicit list
4. **Version bump** (if applicable): from → to

Example:
```
v2.5.0: add iFrame extraction, resource timings, IP lookup, 5 new prompts

Changed:
- src/scraper.js: iFrame content extraction
- src/extractor.js: resourceTimings field
- mcp-server.js: 2 new tools, 5 new prompts, v2.5.0
- src/server.js: landing page at GET /, WSP moved to /wsp

Bugs fixed:
- research_url description said "local AI (Ollama)" — fixed to "connected AI model"
- Stale tool counts in README.md and MCP.md
```

### Secret Check (before every commit)

Before staging any commit, scan changed files for hardcoded credentials:
- `password`, `passwd`, `secret`, `api_key`, `apikey`, `token`, `bearer` assigned to a variable
- Long random-looking strings (20+ chars) hardcoded as values
- Any `.env`-style `KEY=value` in a non-.env file

If anything is flagged, stop and notify before committing.

---

## Execution Safety (Playwright)

```js
const SAFETY = {
  forceHeadlessDuringTests: true,
  maxRequestsPerSecond:     2,
  politeDelayMs:            500,
};
```

- **Headless during tests** — never open a visible browser window in a test run unless explicitly debugging.
- **Rate limit** — never exceed `maxRequestsPerSecond` during tests.
- **Anti-zombie** — any new code that opens a browser must `close()` in a `finally`, never assume a happy path.

---

## Testing Protocol

### When Asked to Add a Test

1. If the request is vague → ask clarifying questions before writing anything.
2. Write the test, run it.
3. If it surfaces errors → dig into those with further targeted tests.
4. Suggest branching follow-up tests.
5. Keep drilling until the original test passes cleanly.

### Folder Structure

```
tests/
├── smoke/             # Fast sanity checks — run FIRST
├── unit/              # Individual functions / modules in isolation
├── integration/       # How modules interact
├── evaluations/       # End-to-end / full-flow tests
├── regression/        # One test per bug ever found & fixed
├── performance/       # Baseline speed & resource checks
├── stress/            # Limit & breaking-point tests
├── security/          # Credential handling, session safety
├── compatibility/     # Per-site scrape correctness
├── api/               # REST endpoint contract tests
├── snapshots/         # Point-in-time scrape output captures
├── schema/            # Validates extracted data shapes
├── fixtures/
│   ├── html/          # Static HTML for extractor.js tests
│   └── sessions/      # Saved auth session state
└── logs/
    ├── raw/
    ├── latest_ai.json
    └── latest_human.md
```

### Output Format

Every test run produces **both** output files — `latest_ai.json` and `latest_human.md`.

### Before Starting Any Task
If `tests/logs/latest_ai.json` exists, check it — know the current health of the system.

### After Major Changes
Note what changed, call out any tests that could be affected, and offer to re-run them.

```js
const TESTING = {
  askIfVague:              true,
  drillOnFailure:          true,
  suggestBranching:        true,
  dualOutput:              true,
  checkHealthOnStart:      true,
  screenshotOnFailure:     true,
  accuracyScoreEvals:      true,
};
```

---

## Frontend Conventions

### Breakpoint System (6 tiers — never collapse to fewer)

| Name | Range |
|------|-------|
| `xs` | `< 480px` |
| `sm` | `480–767px` |
| `md` | `768–1023px` |
| `lg` | `1024–1279px` |
| `xl` | `1280–1535px` |
| `2xl` | `≥ 1536px` |
| `4K` | `≥ 2560px` |

### CSS Rules for New UI

- **Colors:** Always use CSS variables (`--bg`, `--surface`, `--accent`, `--text`, `--border`). Never hardcode hex/rgb.
- **Checkbox groups:** Wrap in `<div class="checkboxes">`.
- **Form sections:** Use `.form-card` > `.form-section` pattern.
- **Buttons:** Use `.btn-primary`, `.btn-secondary`, `.btn-danger`.
- **Typography:** Use `clamp()` at `2xl`+ breakpoints. Never fixed `px` font sizes that won't scale.

### Verification Rule

After any non-trivial frontend change, verify at **two widths minimum**: `375px` and `1280px`.

```js
const FRONTEND_CONVENTIONS = {
  breakpointTiers:        6,
  alwaysUseCSSVars:       true,
  verifyAtWidths:         [375, 1280],
  newPanelPattern:        'data-panel + matching section.panel',
  mobileTopbarIsGlobal:   true,
};
```

---

## Tool Logging

`src/tool-logger.js` logs every MCP tool call. It writes:
- `logs/tool-usage.json` — live per-tool call counters
- `logs/tool-usage.txt` — human-readable version
- `logs/requests/YYYY-MM-DD/<ts>_<tool>_<uuid>.json` — per-request detail

Args are logged **as-is** — no automatic redaction of passwords, tokens, or other sensitive fields.

---

## references/ Folder

Read-only reference material. **Leave it completely alone unless explicitly asked.**
Never modify or import from it.

---

## APA / poolplayers.com

- Credentials are in `.env` — gitignored, **never commit**.
- **Never hardcode poolplayers.com assumptions into generic scraper logic in `src/`.**

---

## Auto-Save Behavior

`src/git-autosave.js` auto-commits + pushes on a timer when the server is running (currently every 6 hours).
Change `INTERVAL_MS` in that file to adjust frequency.

---

## UI/UX Refinement Agent Workflow

**Purpose:** Structured, repeatable methodology for iteratively fixing frontend bugs, improving UX, and ensuring UI consistency across panels.

### Phase 1: Exploration & Baseline (Always Start Here)

1. **Check System Health:**
  - Run `tests/logs/latest_ai.json` check (if exists) to see test status before making changes
  - Check git status: `git status` — review uncommitted changes and identify hotspots
  - Note any test failures, lint errors, or console warnings from previous runs

2. **Map Current State:**
  - Open all relevant frontend files (`public/index.html`, `public/js/app.js`, `public/css/style.css`)
  - Use grep searches to find related code patterns (e.g., form inputs, event listeners, API calls)
  - Document relationships between UI elements, state handlers, and backend endpoints
  - Create a summary of existing behavior vs. desired behavior

3. **Identify Problem Areas:**
  - Inconsistent label naming (e.g., "Politeness delay" vs. "Polite Delay (ms)")
  - Conflicting form behavior (e.g., toggle + input field with contradictory state)
  - Missing visual feedback (e.g., disabled state not clearly shown)
  - API field mismatch (e.g., frontend expects `nextRun`, backend returns `nextRunAt`)
  - Lost state on save/restore workflows (e.g., click sequences not persisted with presets)

4. **Document Findings:**
  - Write session memory file (`/memories/session/refinement-pass.md`) noting:
    - Issues found (with line numbers)
    - Estimated scope per issue
    - Expected validation points

### Phase 2: Implementation

1. **Batch Code Changes:**
  - Group independent edits into single patch operations (use `apply_patch` for multiple small changes)
  - Preserve existing code style, indentation, and naming conventions
  - Never refactor or add comments outside the scope of the fix

2. **Common Patterns to Fix:**
  - **Toggle + Input Conflict:** Use a shared helper function (e.g., `_setUnlimitedMaxPages()`) to disable/restore input when toggle changes
  - **Label Standardization:** Use find/replace across HTML to update inconsistent terminology
  - **State Persistence:** Add explicit capture in save handlers; reapply in load handlers (don't assume automatic behavior)
  - **Field Naming Mismatch:** Verify backend field names in API responses; update frontend rendering to match exactly
  - **Visual Polish:** Apply CSS rules for consistent spacing, grouping (`.form-card` pattern), and responsive sizing (`clamp()`)

3. **Test-Driven Changes:**
  - Write one small targeted change at a time
  - Run syntax check immediately after: `node --check public/js/app.js`
  - Don't batch untested changes (even if independent)

### Phase 3: Validation (All 3 Required)

1. **Code-Level Validation:**
  - Run JS syntax check: `node --check public/js/app.js`
  - Run CSS validator (linter) if available
  - Check for hardcoded colors in CSS (should use CSS variables only)
  - Verify no console errors: Start server and check `mcp_playwright_browser_console_messages`

2. **Automated Testing:**
  - Run existing test suite: `npm test` (if applicable)
  - If tests fail, drill into failures with targeted tests (don't skip)
  - Note any test regressions before proceeding

3. **Manual Browser Verification:**
  - Start/verify server running: `node src/server.js`
  - Open browser to `http://localhost:12345`
  - Navigate to all affected UI sections (e.g., Batch panel, Schedule panel, Preset modal)
  - Test toggle behavior (click, observe state change, verify input field responds)
  - Test form submission (fill fields, click save/submit, check network payload in DevTools)
  - Check for visual glitches (layout shift, text overflow, misaligned elements)
  - Verify console is clean (no errors, only expected warnings like favicon 404)

### Phase 4: Browser Verification & Testing

1. **Interactive Testing:**
  - Use `run_playwright_code` to test toggle behavior, input state changes, and form submission
  - Test at both **mobile** (375px) and **desktop** (1280px) widths
  - Verify responsive layout doesn't break at either breakpoint

2. **API Integration Testing:**
  - Use `run_playwright_code` to fetch from endpoints affected by the change
  - Verify payload structure matches backend expectations
  - Check response fields are used correctly in frontend rendering
  - Create/list/delete test cycle for any data persistence (e.g., schedule creation)

3. **Screenshot Capture:**
  - After successful testing, capture screenshots of affected UI sections
  - Save at desktop width (1280px) as proof of visual correctness
  - Include screenshot paths in final summary

### Phase 5: Verification & Documentation

1. **Code Review Verification:**
  - Use grep to search for all occurrences of changed patterns
  - Example: `grep -n "batchMaxPages\|schedMaxPages" public/js/app.js` (verify all instances updated)
  - Confirm no orphaned or inconsistent implementations

2. **Update Session Memory:**
  - Document what was fixed and how
  - Note any residual issues or backend limitations discovered
  - Recommend follow-up improvements if relevant

3. **Mark Progress:**
  - Update `manage_todo_list` with completed tasks
  - Keep track of total iterations completed
  - Note velocity (how many issues per iteration)

### Iteration Template

Each refinement pass should follow this template:

```
## Iteration [N]: [Issue Summary]

### Problem
- [Specific behavior that is broken]
- [User-facing consequence]
- [Backend/frontend root cause]

### Solution
- [Code change 1: file + line + what changes]
- [Code change 2: ...]

### Validation Results
- Syntax: ✅ No errors
- Tests: ✅ All passing
- Browser: ✅ Toggle works at 375px and 1280px
- API: ✅ Payload matches schema
- Visual: ✅ Screenshot confirms layout correct

### Residual Issues (if any)
- [Issue found but out of scope]
- [Backend limitation]
```

### When to Stop (Completeness Checklist)

- ✅ All identified issues fixed
- ✅ Code syntax validated
- ✅ Tests passing (no regressions)
- ✅ Browser verification at 2+ widths completed
- ✅ Screenshots captured and documented
- ✅ Grep verification confirms all changes applied
- ✅ Session memory updated with findings
- ✅ Todo list marked complete

@@Auto-Save Behavior
