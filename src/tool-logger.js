'use strict';

// ── tool-logger.js ────────────────────────────────────────────────────────────
// Logs every MCP tool call and maintains live per-tool usage counters.
//
//  logs/
//  ├── tool-usage.json     ← machine-readable counters (live updated on every call)
//  ├── tool-usage.txt      ← human-readable counters  (live updated on every call)
//  └── requests/
//      └── YYYY-MM-DD/
//          └── <ts>_<tool>_<uuid>.json  ← one file per call

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const LOGS_DIR   = path.join(__dirname, '..', 'logs');
const REQ_DIR    = path.join(LOGS_DIR, 'requests');
const USAGE_JSON = path.join(LOGS_DIR, 'tool-usage.json');
const USAGE_TXT  = path.join(LOGS_DIR, 'tool-usage.txt');

// All MCP tools — counter starts at 0 for each
const ALL_TOOLS = [
  'batch_scrape',
  'check_saved_session',
  'clear_saved_session',
  'compare_scrapes',
  'crawl_sitemap',
  'delete_monitor',
  'delete_save',
  'delete_schedule',
  'detect_site',
  'export_har',
  'extract_deals',
  'extract_entities',
  'extract_structured_data',
  'fill_form',
  'find_graphql_endpoints',
  'find_site_issues',
  'generate_css',
  'generate_react',
  'generate_sitemap',
  'get_api_calls',
  'get_api_surface',
  'get_known_site_credentials',
  'get_page_text',
  'get_save_overview',
  'get_scrape_status',
  'get_store_context',
  'get_tech_stack',
  'http_fetch',
  'infer_schema',
  'introspect_graphql',
  'list_active_scrapes',
  'list_forms',
  'list_images',
  'list_internal_pages',
  'list_links',
  'list_saves',
  'list_schedules',
  'map_site_for_goal',
  'monitor_page',
  'pause_scrape',
  'preflight_url',
  'probe_endpoints',
  'research_url',
  'resume_scrape',
  'scan_pii',
  'schedule_scrape',
  'scrape_url',
  'search_scrape_text',
  'submit_scrape_credentials',
  'submit_verification_code',
  'take_screenshot',
  'test_oidc_security',
  'test_tls_fingerprint',
  'to_markdown',
];

// ── internal helpers ──────────────────────────────────────────────────────────

function ensureDirs() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
  if (!fs.existsSync(REQ_DIR))  fs.mkdirSync(REQ_DIR,  { recursive: true });
}

function loadUsage() {
  try {
    if (fs.existsSync(USAGE_JSON)) return JSON.parse(fs.readFileSync(USAGE_JSON, 'utf8'));
  } catch {}
  return null;
}

function buildDefaultUsage() {
  const tools = {};
  for (const name of ALL_TOOLS) tools[name] = 0;
  return { lastUpdated: new Date().toISOString(), totalCalls: 0, tools };
}

function writeTxt(usage) {
  const maxLen = Math.max(...Object.keys(usage.tools).map(k => k.length));
  const lines = [
    'MCP Tool Usage Counter',
    '======================',
    `Last updated : ${usage.lastUpdated}`,
    `Total calls  : ${usage.totalCalls}`,
    '',
    'Tool'.padEnd(maxLen + 2) + 'Calls',
    '-'.repeat(maxLen + 2) + '-----',
  ];
  for (const [name, count] of Object.entries(usage.tools)) {
    lines.push(name.padEnd(maxLen + 2) + count);
  }
  fs.writeFileSync(USAGE_TXT, lines.join('\n') + '\n', 'utf8');
}

function saveUsage(usage) {
  fs.writeFileSync(USAGE_JSON, JSON.stringify(usage, null, 2), 'utf8');
  writeTxt(usage);
}

const SENSITIVE_KEYS = new Set([
  'password', 'passwd', 'secret', 'api_key', 'apikey', 'token',
  'bearer', 'authorization', 'auth', 'credential', 'credentials',
]);

function sanitizeArgs(args) {
  if (!args || typeof args !== 'object') return args;
  const out = {};
  for (const [k, v] of Object.entries(args)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      out[k] = sanitizeArgs(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function truncateResult(result, maxChars = 4000) {
  if (result === null || result === undefined) return result;
  const str = JSON.stringify(result);
  if (str.length <= maxChars) return result;
  return { _truncated: true, preview: str.slice(0, maxChars) };
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Call once at server startup — creates dirs + initializes counter files.
 */
function init() {
  try {
    ensureDirs();
    const existing = loadUsage();
    if (!existing) {
      saveUsage(buildDefaultUsage());
    } else {
      // Add any new tools not yet in the file (zero them out)
      let changed = false;
      for (const name of ALL_TOOLS) {
        if (!(name in existing.tools)) { existing.tools[name] = 0; changed = true; }
      }
      if (changed) saveUsage(existing);
      else writeTxt(existing); // ensure .txt is always present
    }
  } catch (err) {
    console.error('[tool-logger] init error:', err.message);
  }
}

/**
 * Record one completed tool call. Called after every CallToolRequestSchema dispatch.
 *
 * @param {string}     toolName
 * @param {object}     args        raw input args
 * @param {*}          result      tool return value (null on error)
 * @param {number}     durationMs
 * @param {Error|null} error
 */
function record(toolName, args, result, durationMs, error) {
  try {
    ensureDirs();

    // 1. Atomically update counters — load, increment, write both files immediately
    const usage = loadUsage() || buildDefaultUsage();
    if (!(toolName in usage.tools)) usage.tools[toolName] = 0;
    usage.tools[toolName] += 1;
    usage.totalCalls = (usage.totalCalls || 0) + 1;
    usage.lastUpdated = new Date().toISOString();
    saveUsage(usage); // writes .json + .txt in one shot

    // 2. Per-request log file
    const now     = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const dayDir  = path.join(REQ_DIR, dateStr);
    if (!fs.existsSync(dayDir)) fs.mkdirSync(dayDir, { recursive: true });

    const ts       = now.toISOString().replace(/[:.]/g, '-');
    const uuid     = crypto.randomUUID().slice(0, 8);
    const filename = `${ts}_${toolName}_${uuid}.json`;

    const entry = {
      id:         uuid,
      timestamp:  now.toISOString(),
      tool:       toolName,
      durationMs,
      success:    !error,
      error:      error ? error.message : null,
      args:       sanitizeArgs(args),
      result:     error ? null : truncateResult(result),
    };

    fs.writeFileSync(path.join(dayDir, filename), JSON.stringify(entry, null, 2), 'utf8');
  } catch (logErr) {
    console.error('[tool-logger] record error:', logErr.message);
  }
}

module.exports = { init, record, ALL_TOOLS };
