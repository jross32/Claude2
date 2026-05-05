# CLAUDE.md — Web Scraper App

Project instructions for AI assistants working in this repo.

---

## Permissions

Full access is pre-granted — Justin does not need to approve tool use each session.
`Bash(*)` covers all shell commands. Write/Edit/Read are allowed for the entire project folder.
No approval prompts should ever appear. If one does, add it to `.claude/settings.json` → `permissions.allow`.

---

## MCP Server Reference

For the full MCP tool catalog, classification details, source-module mapping, and rules for adding new tools, see **[MCP.md](MCP.md)**. Update that file whenever tools are added or changed.

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
| 15 | `CLAUDE.md` | Update `mcp-server.js` row in Key File Map below (tool + prompt counts) |
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
- New `src/*.js` module — if the tool needs a new source file, also add it to the Key File Map below and to the source module mapping table in `MCP.md`

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
| `src/git-autosave.js` | Auto-commit & push on timer interval (starts with server, currently 6h) | Stable |
| `src/oidc-tester.js` | OIDC/OAuth2 security test suite (8 test types) | Stable |
| `mcp-server.js` | MCP server — 91 tools, 29 prompts, classification sets, handlers | Stable |
| `MCP.md` | Living reference for all MCP tools — update when adding/changing tools | Stable |
| `public/index.html` | Single-page frontend UI (large — edit carefully) | **Fragile** |
| `public/js/app.js` | Frontend logic | **Fragile** |
| `public/css/style.css` | Styling | Stable |
| `autosave.js` | Manual commit & push — `node autosave.js` or `npm run save` | Stable |

**Fragile** = be extra careful, explain risk before touching, test after changes.

---

## Code Style

These are the defaults. Edit the values below if you want to change them.
When editing existing files, always match the style already in that file — these are fallbacks for new files only.

```js
// ── STYLE CONFIG (edit me) ────────────────────────────────────────────────
const STYLE = {
  indentation:   'spaces',   // 'spaces' | 'tabs'
  indentSize:    2,          // 2 | 4
  quotes:        'single',   // 'single' | 'double'
  semicolons:    true,       // true | false
  trailingComma: 'es5',      // 'none' | 'es5' | 'all'
  maxLineLength: 120,        // characters — soft limit
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
// ── FRONTEND BEHAVIOR (edit me) ───────────────────────────────────────────
const FRONTEND = {
  defaultToBackend:        true,   // true = backend first, false = touch both freely
  flagNonTrivialFrontend:  true,   // true = ask before big UI changes
};
```

---

## Git & Commits

- Always commit to the **current branch** — never switch or create branches without being asked.
- Use `node autosave.js "message"` (or `npm run save`) for commits. One command, saves tokens vs raw git.
- **Commit automatically after any meaningful code change** — any edit to a repo file (source, config, docs) should be committed. Do NOT commit when only answering questions or doing read-only planning.
- Commit as `jross32` — git is configured with `user.name = "jross32"` and `user.email = justinwross32@gmail.com`. Never change these.
- Never force push, `reset --hard`, or touch the remote without confirmation.

```js
// ── GIT BEHAVIOR (edit me) ────────────────────────────────────────────────
const GIT = {
  useAutosaveScript:    true,   // true = node autosave.js | false = raw git commands
  alwaysCurrentBranch:  true,   // true = never switch branches automatically
  commitAfterAnyEdit:   true,   // true = commit automatically after any file edits (not just when asked)
  commitAuthor:         'jross32 <justinwross32@gmail.com>',
};
```

### Commit Message Format

Every commit message must include:
1. **Subject line**: `v{version}: {short description}` — or just the short description for non-version commits
2. **Changed files**: bullet list of what was added/changed/fixed
3. **Bugs fixed** (if any): explicit list
4. **Version bump** (if applicable): from → to

Example format:
```
v2.5.0: Tier 3 features — iFrames, resource timings, IP lookup, new prompts, landing page

Changed:
- src/scraper.js: iFrame content extraction (text, links, forms per child frame)
- src/extractor.js: resourceTimings field (transferSize, duration per asset)
- src/ip-lookup.js: new module — IP geolocation via ip-api.com
- mcp-server.js: get_cache_headers + lookup_ip_info tools, 5 new prompts, v2.5.0
- src/server.js: landing page at GET /, WSP moved to /wsp

Bugs fixed:
- research_url description still said "local AI (Ollama)" — updated to "connected AI model"
- get_cache_headers + lookup_ip_info missing from mcp-catalog.js categories
- /api/status dead link in landing page footer
- Stale tool/prompt counts in README.md and MCP.md
```

### Secret Check (runs before every autosave / commit)

Before staging any commit, scan changed files for hardcoded strings that look like
credentials — passwords, API keys, tokens, secrets. Patterns to flag:
- Strings matching `password`, `passwd`, `secret`, `api_key`, `apikey`, `token`, `bearer` assigned to a variable
- Long random-looking strings (20+ chars) hardcoded as values
- Any `.env`-style `KEY=value` in a non-.env file

If anything is flagged, stop and notify before committing.

---

## Execution Safety (Playwright)

Playwright is resource-heavy and can trigger bot detection. Follow these rules during all test runs and scrape operations.

```js
// ── EXECUTION SAFETY CONFIG (edit me) ────────────────────────────────────
const SAFETY = {
  forceHeadlessDuringTests: true,   // true = always headless in test runs (saves RAM)
  maxRequestsPerSecond:     2,      // max requests/sec during tests — raise carefully
  politeDelayMs:            500,    // min ms between page navigations in tests
};
```

- **Headless during tests** — never open a visible browser window in a test run unless explicitly debugging.
- **Rate limit** — never exceed `maxRequestsPerSecond` during tests. The scraper already has `politeDelay` for live runs; tests must respect the same.
- **Anti-zombie** — `browser.close()` is already called in `finally` blocks in `scraper.js` (lines 1109–1116). This is correct. **Any new code that opens a browser must follow the same pattern** — always `close()` in a `finally`, never assume a happy path.

---

## Testing Protocol

### When Asked to Add a Test

1. If the request is vague → ask clarifying questions before writing anything.
2. Write the test, run it.
3. If it surfaces errors → dig into those with further targeted tests.
4. Suggest branching follow-up tests. Justin says yes / no.
5. Keep drilling until the original test passes cleanly.
6. Place every test in the correct folder below. Create a new subfolder if none fits.

### Folder Structure

```
tests/
├── smoke/             # Fast sanity checks — server starts, endpoints respond, browser launches/closes cleanly
│                      # Run these FIRST. If smoke fails, stop — nothing else is worth running yet.
├── unit/              # Individual functions / modules in isolation
├── integration/       # How modules interact (e.g. auth → scraper → extractor)
├── evaluations/       # End-to-end / full-flow tests (e.g. complete APA login + scrape)
├── regression/        # One test per bug ever found & fixed — grows naturally over time
│                      # e.g. "data-href links not captured", "auth 2FA loop not exiting"
├── performance/       # Baseline speed & resource checks — scrape duration, memory, Chromium process count
├── stress/            # Limit & breaking-point tests — 100 workers, 1000-page crawl, huge DOM trees
├── security/          # Credential handling, session safety, secret scanner validation, gitignore checks
├── compatibility/     # Per-site scrape correctness — catches when a target site changes its HTML structure
│                      # Each site gets its own subfolder: compatibility/poolplayers/, compatibility/[site]/
├── api/               # REST endpoint contract tests — hits server.js endpoints directly, no browser
├── snapshots/         # Point-in-time scrape output captures — diff against future runs to detect data drift
├── schema/            # Validates extracted data shapes — GraphQL captures, TypeScript schema output, extractor fields
├── fixtures/
│   ├── html/          # Static HTML files for testing extractor.js without hitting live URLs
│   └── sessions/      # Saved auth session state (copied from .scraper-sessions/) for tests needing logged-in state
└── logs/
    ├── raw/           # Every test run saved with timestamp — never overwritten
    ├── latest_ai.json # Most recent run — machine-readable (overwritten each run)
    └── latest_human.md# Most recent run — human-readable summary (overwritten each run)
```

### Mocking vs. Live Network Calls

| Suite | Use live network? | Use fixtures? | Notes |
|-------|------------------|---------------|-------|
| `smoke/` | Minimal — server/browser start only | No | Fastest possible, no real scraping |
| `unit/` | No | Fixtures or inline stubs | Fully isolated |
| `integration/` | Only if unavoidable | Yes — `fixtures/html/` for extractor | Keep deterministic |
| `evaluations/` | Yes — full end-to-end | Auth session from `fixtures/sessions/` | Skip login flow |
| `regression/` | Only if original bug required it | Prefer fixtures | Keep fast & deterministic |
| `performance/` | Yes — real browser/network needed | No | Baseline measurements need real conditions |
| `stress/` | Yes — real load needed | No | Push actual limits |
| `security/` | No | No | Static analysis & file checks only |
| `compatibility/` | Yes — must hit real target site | Fixtures as fallback | Per-site subfolders |
| `api/` | Local server only — no external sites | No | Direct HTTP calls to `localhost:12345` |
| `snapshots/` | Yes — captures real output | Saved snapshots as comparison baseline | Detects site drift |
| `schema/` | No | Fixtures + `references/bot/` JSON snapshots | Validates data shapes |

**Extractor rule:** When testing `extractor.js`, use static HTML saved in `tests/fixtures/html/`
rather than hitting a live URL. This keeps tests fast and deterministic.

**Auth fixture rule:** If a test requires a logged-in state, copy the relevant session file
from `.scraper-sessions/` into `tests/fixtures/sessions/` and load from there.
Never run a full login flow just to set up a test.

**References rule:** JSON snapshots in `references/bot/` (e.g. `APA_data_01-25-2026.json`,
`apa_api_snapshot.json`) can be used as read-only fixture data for `schema/` and `unit/` tests.
Never modify anything in `references/`.

### Output Format

Every test run produces **both** output files.

**`latest_ai.json`** — for AI / programmatic use:
```json
{
  "timestamp": "ISO string",
  "git_commit": "short hash",
  "suite": "suite name",
  "tests": [
    {
      "name": "descriptive test name",
      "status": "pass | fail | skip",
      "duration_ms": 0,
      "error": null,
      "input": {},
      "output": {},
      "stack_trace": null,
      "screenshot": null
    }
  ],
  "summary": {
    "total": 0, "passed": 0, "failed": 0, "skipped": 0,
    "duration_ms": 0, "avg_duration_ms": 0
  }
}
```

**`latest_human.md`** — for human review, must include:
- Summary table (pass/fail/skip counts, total duration)
- Per-test result with emoji (✅ pass · ❌ fail · ⏭️ skip)
- Error details in fenced code blocks
- **Accuracy score** (`evaluations/`, `compatibility/`, `snapshots/` only — e.g. "Extracted 48/50 expected fields")
- **Visual evidence** — path to any failure screenshot (e.g. `tests/logs/failure_2026-03-30T14-22-05.png`)
- **Performance note** if duration is >20% slower than previous run average (`performance/`, `stress/` always include this)
- Suggested next steps if any failures found

### Screenshot on Failure

For any test in `integration/`, `evaluations/`, `compatibility/`, `stress/`, or `snapshots/`
that fails while a browser page is open: capture a screenshot and save to
`tests/logs/failure_[ISO-timestamp].png`. Include the path in both the test's
`screenshot` field in `latest_ai.json` and in `latest_human.md`.

### Telemetry to Capture Per Test
- Execution duration (ms)
- Input / output snapshots
- Stack trace on failure
- State before/after (filesystem, in-memory) when relevant
- For scraper tests: pages found, links captured, API calls intercepted
- For `performance/` and `stress/`: Chromium process count before & after, peak memory usage (MB)

### Edge Case Requirements (Chaos Tests)

| Suite | Chaos requirement |
|-------|------------------|
| `smoke/` | None — it IS the chaos detector for startup |
| `unit/` | AI judges per function — ask: could this realistically receive empty input, a network error, or broken data? |
| `integration/` | All 3 required — empty state, network failure, malformed DOM |
| `evaluations/` | All 3 required — empty state, network failure, malformed DOM |
| `regression/` | Include the original failure case as the chaos test |
| `performance/` | None — chaos would skew baseline measurements |
| `stress/` | Built-in — the whole suite is chaos by design |
| `security/` | None — it's static analysis |
| `compatibility/` | All 3 required — site returns 0 results, site is down, site changed its DOM |
| `api/` | Malformed request body + empty response required for each endpoint |
| `snapshots/` | None — drift detection is the goal, not failure handling |
| `schema/` | Malformed/empty data required — that's the primary test condition |

### Before Starting Any Task
If `tests/logs/latest_ai.json` exists, check it — know the current health of the system before making changes.

### After Major Changes
Note what changed, call out any tests that could be affected, and offer to re-run them.

```js
// ── TESTING BEHAVIOR (edit me) ────────────────────────────────────────────
const TESTING = {
  askIfVague:              true,   // true = clarify before writing tests for vague requests
  drillOnFailure:          true,   // true = dig deeper when tests surface errors
  suggestBranching:        true,   // true = suggest follow-up test branches
  dualOutput:              true,   // true = always produce both .json and .md logs
  checkHealthOnStart:      true,   // true = read latest_ai.json before starting a task
  screenshotOnFailure:     true,   // true = capture screenshot on browser-open failures (integration/evaluations/compatibility/stress/snapshots)
  accuracyScoreEvals:      true,   // true = include accuracy score in evaluations/compatibility/snapshots output
};
```

---

## Frontend Conventions

These rules keep the UI consistent when new tabs, panels, or features are added.
**Follow them any time `public/` is touched.**

### Breakpoint System (6 tiers — never collapse to fewer)

| Name | Range | Key behaviors |
|------|-------|---------------|
| `xs` | `< 480px` | Sidebar drawer (position:fixed, slides in), 1-col checkboxes, 44px tap targets |
| `sm` | `480–767px` | Sidebar drawer, 2-col checkboxes |
| `md` | `768–1023px` | 64px icon-only sidebar, 2-col checkboxes |
| `lg` | `1024–1279px` | 200px sidebar visible, 3-col checkboxes, `clamp()` padding |
| `xl` | `1280–1535px` | 220px sidebar, flex-wrap checkboxes |
| `2xl` | `≥ 1536px` | 240px sidebar, fluid `clamp()` sizing, auto-fill checkboxes |
| `4K` | `≥ 2560px` | Font `clamp(16px, 0.75vw, 22px)`, `max-width: 1400px` container |

### Adding a New Nav Tab / Panel

1. Add a `<button class="nav-item" data-panel="your-panel-id">` inside `.sidebar` in `index.html`.
2. Add a matching `<section class="panel" id="panel-your-panel-id">` inside `.main` in `index.html`.
3. The existing nav-item click handler in `app.js` activates panels automatically — no JS changes needed unless the panel has interactive logic.
4. The mobile topbar is global — new panels do **not** get their own mobile header.

### CSS Rules for New UI

- **Colors:** Always use CSS variables (`--bg`, `--surface`, `--accent`, `--text`, `--border`, etc.). Never hardcode hex/rgb values in new rules.
- **Checkbox groups:** Wrap in `<div class="checkboxes">` — the responsive grid is handled automatically.
- **Form sections:** Use `.form-card` > `.form-section` pattern.
- **Buttons:** Use `.btn-primary`, `.btn-secondary`, `.btn-danger` etc. Touch targets (min 44×44px) are handled by the class.
- **Typography:** Use `clamp()` at `2xl`+ breakpoints for fluid sizing. Never use fixed `px` font sizes that won't scale.
- **New layout regions:** Must include responsive rules for at least `xs` (mobile) and `xl` (desktop) breakpoints.

### Verification Rule

After any non-trivial frontend change, verify at **two widths minimum**:
- `375px` (iPhone SE — smallest common phone)
- `1280px` (standard laptop)

If using the preview tool: `preview_resize` to each width and take a screenshot. Flag any overflow, clipped content, or broken layout before committing.

### Smoke Test (Responsive)

`tests/smoke/` includes a responsive layout check at 375px and 1280px using Playwright.
Run it after significant `public/` changes to catch regressions automatically.

```js
// ── FRONTEND CONVENTIONS (edit me) ────────────────────────────────────────
const FRONTEND_CONVENTIONS = {
  breakpointTiers:        6,       // never collapse — always xs/sm/md/lg/xl/2xl (+ 4K)
  alwaysUseCSSVars:       true,    // no hardcoded colors ever
  verifyAtWidths:         [375, 1280],  // px — minimum check after frontend changes
  newPanelPattern:        'data-panel + matching section.panel',
  mobileTopbarIsGlobal:   true,    // one topbar for all panels — don't add per-panel headers
};
```

---

## references/ Folder

This folder contains repos and reference material Justin will point to when needed.
It is **not part of the web scraper app** — nothing in it is used by the app directly.
It exists purely as inspiration or reference to help build parts of the scraper.

**Leave it completely alone unless explicitly asked to look at something in it.**
When asked, treat everything inside as read-only — never modify it, never import from it.

---

## APA / poolplayers.com

- Credentials are in `.env` — gitignored, **never commit**.
- The APA panel in the UI is personal tooling — fine to reference and work on when asked.
- **Never hardcode poolplayers.com assumptions into generic scraper logic in `src/`.**

---

## Auto-Save Behavior

`src/git-autosave.js` runs automatically when the server starts and commits + pushes
on a timer. Change the interval in the file if needed:

```js
// In src/git-autosave.js — edit INTERVAL_MS to change frequency
// Examples:
//   5 * 60 * 1000    →  every 5 minutes
//  30 * 60 * 1000    →  every 30 minutes
//   6 * 60 * 60 * 1000  →  every 6 hours (current default)
const INTERVAL_MS = 6 * 60 * 60 * 1000;
```
