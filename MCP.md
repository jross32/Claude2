# MCP Server Reference — Web Scraper

> **Living document.** Update this file whenever a tool is added, changed, or removed.
> AI agents working on this repo should read this before building or modifying MCP tools.

---

## Architecture Overview

```
AI Agent (Claude, etc.)
    │
    │  MCP protocol (stdio)
    ▼
mcp-server.js          ← tool definitions, handlers, classification sets
    │
    ├── HTTP (localhost) → src/server.js (Express REST API, port 3000)
    │       │
    │       ├── src/scraper.js         (Playwright browser automation)
    │       ├── src/extractor.js       (DOM extraction — 50+ data types)
    │       ├── src/auth.js            (login, 2FA: TOTP/email/SMS)
    │       ├── src/scheduler.js       (cron job management)
    │       ├── src/diff.js            (compare two scrape results)
    │       ├── src/generators.js      (React, CSS, Markdown, Sitemap codegen)
    │       ├── src/schema-inferrer.js (TypeScript / JSON Schema from GraphQL)
    │       ├── src/entity-extractor.js(email, phone, URL, address patterns)
    │       ├── src/har-exporter.js    (HAR 1.2 format export)
    │       └── src/oidc-tester.js     (OAuth2/OIDC security test suite)
    │
    └── Direct module imports (analysis tools — no HTTP round-trip):
            ├── src/jwt-decoder.js     (JWT decode + security flag analysis)
            ├── src/dns-lookup.js      (full DNS record lookup + tech inference)
            ├── src/ssl-inspector.js   (TLS cert inspection, SANs, expiry flags)
            ├── src/security-scorer.js (security header scoring 0–100, A+–F)
            ├── src/link-graph.js      (link graph, redirect chains, broken links, subdomains)
            ├── src/product-extractor.js (structured e-commerce data)
            ├── src/job-extractor.js   (structured job listing data)
            ├── src/company-extractor.js (company info from About/Contact pages)
            ├── src/review-extractor.js (review and rating extraction)
            ├── src/robots-parser.js   (robots.txt fetch + parse helpers)
            └── src/ip-lookup.js       (IP geolocation, ISP, ASN via ip-api.com)
```

Two patterns for tool implementation:
- **HTTP tools** — call `server.js` via internal `get()` / `post()` / `del()` helpers. All scraping and browser tools use this pattern.
- **Direct import tools** — import source module directly in `mcp-server.js` and call functions in the handler. Used for pure analysis tools that don't need a browser (JWT decode, DNS, SSL, security scoring, link graph, structured extractors, AI analysis tools).
- **Shared metadata** — `src/mcp-catalog.js` is the source of truth for tool categories, maturity, examples, starter workflows, `/docs`, and `/api/mcp-meta`.

---

## Tool Count & Classification

**Total: 74 tools · 27 prompts** (as of last update 2026-05-02)

| Classification | Count |
|----------------|-------|
| readOnly (RO) | 57 |
| destructive (D) | 5 |
| openWorld (OW) | 19 |

All tools are classified. These badge counts overlap; they are not meant to sum to the total tool count.

Classification sets defined in mcp-server.js (search for `READ_ONLY_TOOL_NAMES`).

---

## All 74 Tools — Quick Reference

### Category 1: Core Scraping

| Tool | REST endpoint | AI Use | Notes |
|------|--------------|--------|-------|
| `scrape_url` | POST /api/scrape | 10 | Main workhorse. Playwright + stealth. Returns content, links, API calls, structuredData. Supports: `captureModals`, `captureAccordions`, `captureInfiniteScroll`, `captureSearchSuggestions`, `capturePagination` flags. |
| `batch_scrape` | POST /api/scrape (loop) | 9 | Parallel with semaphore. Per-URL error isolation. |
| `stop_scrape` | POST /api/scrape/:id/stop | 6 | Kills in-flight job. |
| `pause_scrape` | POST /api/scrape/:id/pause | 5 | Signal-based, not atomic. |
| `resume_scrape` | POST /api/scrape/:id/resume | 5 | Symmetric with pause. |
| `take_screenshot` | POST /api/screenshot | 7 | OW. Playwright screenshot → base64 PNG. fullPage option. |
| `list_active_scrapes` | GET /api/scrape/active | 8 | In-flight jobs + status. |
| `get_scrape_status` | GET /api/scrape/:id/status | 8 | Per-job poll with partial results. |

### Category 2: Session & Auth

| Tool | REST endpoint | AI Use | Notes |
|------|--------------|--------|-------|
| `detect_site` | GET /api/detect | 9 | Infers site type, auth type, bot-detection level. Returns `recommendedScrapeOptions`. Best first call. |
| `check_saved_session` | GET /api/session/check | 7 | Is session file present & not expired? |
| `clear_saved_session` | DELETE /api/session | 5 | D — deletes session state. |
| `get_known_site_credentials` | GET /api/site-credentials | 6 | Credential hints from .env for pre-configured sites. |
| `submit_verification_code` | POST /api/scrape/:id/verify | 7 | Inject 2FA code into stalled auth flow. |
| `submit_scrape_credentials` | POST /api/scrape/:id/credentials | 7 | Provide user/pass to stalled login. |
| `fill_form` | POST /api/fill-form | 8 | OW. Fill and submit arbitrary forms via Playwright. CSS selector targeting. |

### Category 3: Content Extraction

All read from saved scrape data (disk), except `extract_entities` and `crawl_sitemap` which make live network calls.

| Tool | AI Use | Notes |
|------|--------|-------|
| `get_page_text` | 9 | Clean visible text. LLM-ready. |
| `to_markdown` | 8 | HTML → structured Markdown. Heading hierarchy preserved. |
| `extract_entities` | 9 | OW. Emails, phones, addresses, URLs. E.164 normalization, international phones. |
| `extract_deals` | 8 | Price/discount/offer patterns. E-commerce focused. |
| `extract_structured_data` | 9 | JSON-LD (schema.org), Open Graph, Twitter Card from saved page. |
| `crawl_sitemap` | 7 | OW. Uses robots.txt sitemap hints first, then falls back to `/sitemap.xml`. Handles sitemap index files. |
| `list_links` | 7 | All hrefs with anchor text, internal/external classification. Paginated. |
| `list_forms` | 7 | Form fields, types, action URLs. |
| `list_images` | 5 | src, alt, dimensions. |
| `list_internal_pages` | 8 | Deduped internal URL list. |
| `find_site_issues` | 7 | Broken links, missing alts, console errors, mixed content. |

### Category 4: API & Network Analysis

| Tool | AI Use | Notes |
|------|--------|-------|
| `get_api_calls` | 10 | All XHR/fetch from a scrape: method, URL, headers, body, timing (dns/tcp/ssl/ttfb/transfer per call). |
| `get_api_surface` | 9 | Aggregated unique endpoints from a save. |
| `probe_endpoints` | 9 | OW. Hits endpoint list → status, headers, timing. |
| `http_fetch` | 10 | OW. Direct HTTP GET/POST, custom headers, cookie jar from session. |
| `preflight_url` | 7 | OW. HEAD + redirect chain before full scrape. |
| `find_graphql_endpoints` | 8 | OW. Heuristic scan for /graphql, /api/graphql, etc. |
| `introspect_graphql` | 9 | OW. Full schema introspection. Returns type/field map. |

### Category 5: Data Management

| Tool | REST endpoint | AI Use | Notes |
|------|--------------|--------|-------|
| `list_saves` | GET /api/saves | 8 | All saved sessions with metadata. |
| `get_save_overview` | (reads save file) | 9 | Page count, links, API calls, top endpoints, size. |
| `compare_scrapes` | POST /api/diff | 8 | Added/removed links, new endpoints, content changes, Jaccard similarity, price changes. |
| `search_scrape_text` | (reads save files) | 9 | Full-text search across all pages in a save. |
| `export_har` | (uses har-exporter.js) | 6 | HAR 1.2 export with real timings. |
| `delete_save` | DELETE /api/saves/:id | 4 | D — removes saved scrape. |

### Category 6: Code Generation

| Tool | REST endpoint | AI Use | Notes |
|------|--------------|--------|-------|
| `generate_react` | POST /api/generate/react | 7 | React component from scraped data. Template-based. |
| `generate_css` | POST /api/generate/css | 5 | Color palette → CSS variables. |
| `to_markdown` | POST /api/generate/markdown | 8 | (also in Content Extraction above) |
| `generate_sitemap` | POST /api/generate/sitemap | 7 | XML sitemap from internal pages. Standards-compliant. |
| `infer_schema` | POST /api/schema | 8 | TypeScript / JSON Schema from GraphQL data. |

### Category 7: Site Intelligence

Compound tools — implemented in mcp-server.js handlers, reading save files directly.

| Tool | AI Use | Notes |
|------|--------|-------|
| `get_tech_stack` | 8 | Frameworks, CDNs, analytics, CMS from headers + DOM. Scrape result also includes `thirdPartyScripts` (categorized by domain) and `trackingPixels` (1×1 images + known pixel patterns). |
| `get_store_context` | 7 | E-commerce platform, currency, product taxonomy. |
| `map_site_for_goal` | 9 | OW. Goal-directed crawl ("find pricing page"). Most agentic tool. |
| `research_url` | 9 | OW. All-in-one: tech stack, auth, API surface, data exposure. |
| `scan_pii` | 8 | PII detection with risk ranking CRITICAL/HIGH/MEDIUM/LOW. |

### Category 8: Scheduling & Monitoring

| Tool | REST endpoint | AI Use | Notes |
|------|--------------|--------|-------|
| `schedule_scrape` | POST /api/schedules | 6 | OW. Cron job creation. Persisted to `data/schedules.json`. |
| `list_schedules` | GET /api/schedules | 6 | Active cron jobs with `nextRunAt`. |
| `delete_schedule` | DELETE /api/schedules/:id | 5 | D — cancels cron job. |
| `monitor_page` | (in-process) | 10 | OW. Watch URL for changes. First call creates baseline; subsequent calls diff. Persisted to `data/monitors.json`. |
| `delete_monitor` | (in-process) | 4 | D — removes monitor and its baseline. |

### Category 9: Security Testing

| Tool | AI Use | Notes |
|------|--------|-------|
| `test_oidc_security` | 9 | 8 test types: redirect_uri, state entropy, JWT alg:none, PKCE, token rotation/replay, BOLA/IDOR, scope escalation, header injection. Risk score output. |
| `test_tls_fingerprint` | 7 | TLS cipher suite comparison vs Chrome-115 / Firefox-117 profiles. JA3 approximation. |

### Category 10: Security Analysis (New)

Direct module imports — no browser, instant results from any URL or saved session.

| Tool | Input | AI Use | Notes |
|------|-------|--------|-------|
| `decode_jwt_tokens` | `sessionId` | 9 | Extracts JWTs from anywhere in a scrape result (headers, cookies, localStorage, response bodies). Flags: `ALG_NONE`, `EXPIRED`, `EXPIRING_SOON`, `MISSING_AUD/SUB/ISS`, `SENSITIVE_CLAIMS`. |
| `inspect_ssl` | `url`, optional `port` | 8 | TLS cert: subject, issuer, SANs (subdomain discovery!), chain, cipher, key size, daysRemaining. Flags: `SELF_SIGNED`, `EXPIRED`, `EXPIRING_SOON`, `WEAK_KEY`, `WEAK_SIG_ALG`. |
| `score_security_headers` | `sessionId` or `headers` | 9 | Grades security headers 0–100 / A+–F. Per-header analysis: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. Returns `recommendations[]` with priority. |
| `lookup_dns` | `url` | 8 | OW. Full DNS: A/AAAA/MX/TXT/NS/CNAME/SOA + PTR reverse. Infers email provider (Google Workspace, M365, etc.), SPF/DKIM/DMARC status, service verifications (Stripe, Atlassian, Slack, etc.) from TXT records. Email security score 0–100. |

### Category 11: Structured Data Extractors (New)

Run on saved scrape pages — no browser needed.

| Tool | Input | AI Use | Notes |
|------|-------|--------|-------|
| `extract_product_data` | `sessionId`, optional `pageIndex` | 9 | Structured e-commerce: name, price, currency, SKU, GTIN, MPN, brand, availability, rating, images[], variants[]. JSON-LD first, DOM heuristics fallback. Without `pageIndex` returns all detected product pages. |
| `extract_job_listings` | `sessionId`, optional `pageIndex` | 8 | Structured job data: title, department, location, remote (bool), employmentType, salaryMin/Max, skills[] (60+ tech keywords), applyUrl. JSON-LD JobPosting + DOM fallback. |
| `extract_company_info` | `sessionId`, optional `pageIndex` | 8 | Company profile: name, legalName, founded, employeeRange, address, registration (UK/US/EU), industry (20 categories), mission, socialProfiles (LinkedIn/Twitter/GitHub/etc.), techStack. Merges across all pages when no `pageIndex` given. |

### Category 12: Site-Level Analysis (New)

Algorithmic tools returning structured data for AI reasoning — no external API calls.

| Tool | Input | AI Use | Notes |
|------|-------|--------|-------|
| `get_link_graph` | `sessionId` | 9 | Directed link graph: hub pages (high out-degree), authority pages (high in-degree), orphan pages (0 in-degree), dead ends (0 out-degree). Also returns redirect chains and subdomain discovery. |
| `check_broken_links` | `sessionId`, optional `internalOnly`, `maxLinks` | 8 | OW. Concurrent HEAD requests (max 10 parallel, 5 req/s rate limit). Returns broken[], redirected[], ok count. |
| `classify_pages` | `sessionId` | 9 | Labels every page: product / checkout / pricing / blog / about / contact / login / signup / dashboard / careers / landing / documentation / search-results / error. URL patterns + text signals. |
| `flag_anomalies` | `sessionId` | 8 | Statistical anomaly detection: page size z-score ≥ 2.5, near-empty pages, excessive external domains (>20), high JS error count (>5), missing critical security headers. |
| `find_patterns` | `sessionId` | 9 | Cross-page pattern recognition: URL structure groups (`:id`/`:uuid` normalization), H1 word frequency, shared nav items, API path patterns. |
| `extract_business_intel` | `sessionId` | 9 | Business intelligence from all pages: pricing tiers (regex patterns), business metrics (users/revenue/customers), contact info aggregation, tech stack, company profiles. |
| `extract_reviews` | `sessionId`, optional `pageIndex` | 8 | Review and rating data: aggregate rating, star score, review count, individual reviews. Sources: JSON-LD Review/AggregateRating, Open Graph product tags, text patterns. |
| `get_robots_txt` | `url` | 8 | OW. Fetch and parse robots.txt from the site origin. Returns per-agent disallow/allow lists, crawl-delay, sitemap references, and `isFullyBlocked` flag. |
| `get_cache_headers` | `sessionId` | 7 | Extract Cache-Control, ETag, Last-Modified, Expires, and Vary from the document + all REST/GraphQL API calls in a session. |
| `lookup_ip_info` | `hostname` | 7 | OW. Resolve a hostname or URL to IP, country, city, ISP, ASN, and hosting provider via ip-api.com. |
| `get_page_word_count` | `sessionId` | 6 | RO. Count words, sentences, and paragraphs in a saved page's extracted text. Returns wordCount, sentenceCount, paragraphCount, avgWordsPerSentence, characterCount. |

### Category 13: Diagnostics

Server-level introspection and trust surfaces.

| Tool | Input | AI Use | Notes |
|------|-------|--------|-------|
| `server_info` | none | 8 | Read-only diagnostic snapshot. Reports version, active toolset, capabilities, environment hints, directory writability, REST reachability, and starter workflows. |

---

## Source Module → MCP Tool Mapping

| Source module | Exported functions | Covered by MCP tool |
|---------------|-------------------|---------------------|
| `src/scraper.js` | `ScraperSession`, `clearSession` | `scrape_url`, `batch_scrape` / `clear_saved_session` |
| `src/extractor.js` | `extractPageData` | Internal (called during scrape; results exposed via content tools) |
| `src/auth.js` | `handleAuth` | Internal (called by scraper during login); agent interacts via `submit_verification_code`, `submit_scrape_credentials` |
| `src/scheduler.js` | `createSchedule`, `deleteSchedule`, `listSchedules` | `schedule_scrape`, `delete_schedule`, `list_schedules` |
| `src/diff.js` | `diffScrapes` | `compare_scrapes` |
| `src/generators.js` | `generateReact`, `extractCSS`, `generateMarkdown`, `generateSitemap` | `generate_react`, `generate_css`, `to_markdown`, `generate_sitemap` |
| `src/schema-inferrer.js` | `inferSchema` | `infer_schema` |
| `src/entity-extractor.js` | `extractEntities` | `extract_entities` |
| `src/har-exporter.js` | `exportHAR` | `export_har` |
| `src/oidc-tester.js` | `performOidcSecurityTests`, `testTlsFingerprint` | `test_oidc_security`, `test_tls_fingerprint` |
| `src/jwt-decoder.js` | `decodeJWT`, `extractJWTs` | `decode_jwt_tokens` |
| `src/dns-lookup.js` | `lookupDNS` | `lookup_dns` |
| `src/ssl-inspector.js` | `inspectSSL` | `inspect_ssl` |
| `src/security-scorer.js` | `scoreSecurityHeaders` | `score_security_headers` |
| `src/link-graph.js` | `buildLinkGraph`, `findRedirectChains`, `discoverSubdomains`, `checkBrokenLinks` | `get_link_graph`, `check_broken_links` |
| `src/product-extractor.js` | `extractProductData` | `extract_product_data` |
| `src/job-extractor.js` | `extractJobData` | `extract_job_listings` |
| `src/company-extractor.js` | `extractCompanyInfo` | `extract_company_info` |
| `src/review-extractor.js` | `extractReviews` | `extract_reviews` |
| `src/robots-parser.js` | `fetchAndParseRobots` | `get_robots_txt` |
| `src/ip-lookup.js` | `lookupIpInfo` | `lookup_ip_info` |

**Coverage: 100%** — all exported source functions are reachable via MCP.

**Inline tools (no source module — implemented directly in mcp-server.js handlers):**
- `extract_structured_data` — reads `page.meta.jsonLD/ogTags/twitterTags` from save files
- `crawl_sitemap` — HTTP fetch + XML `<loc>` parsing, seeded by robots.txt sitemap hints when available
- `take_screenshot` — POST /api/screenshot (Playwright headless)
- `fill_form` — POST /api/fill-form (Playwright headless)
- `monitor_page` / `delete_monitor` — state in `data/monitors.json`, diff via `src/diff.js`
- `classify_pages` — URL + text heuristics, 14 page types
- `flag_anomalies` — z-score statistical analysis
- `find_patterns` — URL normalization, frequency analysis
- `extract_business_intel` — regex-based pricing/metrics extraction + company-extractor.js
- `server_info` — runtime introspection assembled from live MCP metadata and local scraper health checks

---

## REST Endpoints Not Exposed via MCP

| Endpoint | Reason |
|----------|--------|
| `GET /api/favicon` | UI-only utility |
| `POST /api/ai/chat` | Frontend wrapper around `research_url` MCP tool — no new capability |

---

## New Capture Capabilities (scraper.js additions)

These are flags on `scrape_url` / the scraper session — not separate tools, but new data available in scrape results:

| Flag | What it captures |
|------|-----------------|
| `captureModals: true` | Clicks modal triggers, captures dialog innerHTML |
| `captureAccordions: true` | Clicks accordion/tab triggers, captures revealed content |
| `captureInfiniteScroll: true` | Scrolls N times (`infiniteScrollSteps`), diffs DOM after each |
| `captureSearchSuggestions: true` | Types into search inputs, captures autocomplete results |
| `capturePagination: true` | Follows `rel=next` up to `maxPaginationPages` pages |

**Always-on new captures in scrape results:**
- `captures.corsPreflights[]` — OPTIONS requests with all CORS headers
- `captures.cspViolations[]` — Content Security Policy violation events
- `captures.webrtcConnections[]` — ICE candidates, SDP signaling URLs
- `captures.deviceApiCalls[]` — geolocation/camera/mic/notification permission requests
- `result.httpVersion` — HTTP/1.1 vs HTTP/2 vs HTTP/3 per page
- Per-request `timing: { dns, tcp, ssl, ttfb, transfer }` on all REST/GraphQL calls
- `page.sourceMaps[]` — source map URLs from minified scripts
- `page.feeds[]` — RSS/Atom/JSON Feed links
- `page.pdfLinks[]` — PDF file links
- `page.apiSpecLinks[]` — OpenAPI/Swagger spec links
- `page.cookieConsent` — GDPR consent vendor + model (10 vendors detected)
- `page.meta.language` + `page.meta.hreflang[]` — language detection
- gRPC binary frame decoding (content-type: application/grpc)
- Service worker strategy analysis (cache-first, network-first, Workbox, precache count)
- `page.headingOutline[]` — ordered flat list of H1–H6 in document order: `[{level, text, id}]` — AI-readable page structure outline
- `page.thirdPartyScripts[]` — all external scripts with domain, category (analytics/advertising/cdn/error-monitoring/ab-testing/support/marketing/payment/social/unknown), async/defer flags
- `page.trackingPixels[]` — 1×1 pixel images + 10 known tracking pixel URL patterns (Facebook, Google, Bing, LinkedIn, TikTok, Snap, etc.) + noscript fallback detection

---

## Rules for Adding New Tools

1. **Define in TOOLS array** (mcp-server.js, near line 2885). Include `name`, `description`, `inputSchema`.
2. **Classify** — add to one of: `READ_ONLY_TOOL_NAMES`, `DESTRUCTIVE_TOOL_NAMES`, `OPEN_WORLD_TOOL_NAMES` (can be in multiple). Never leave unclassified.
3. **Add handler** in `handleTool()` switch. Follow existing pattern: validate inputs with `ensureNonEmptyString()`, call via `expectOk(await post(...))` for HTTP tools, or call imported function directly for analysis tools.
4. **Add REST endpoint** in `src/server.js` if the tool needs new backend logic (browser, file I/O). Import the source module at the top of both server.js and mcp-server.js.
5. **Update this file** — add the tool to its category table, update tool count, source mapping if new module.

### Classification guide

| Flag | When to use |
|------|-------------|
| `READ_ONLY_TOOL_NAMES` | Tool reads data only, never mutates state. Safe for AI to call freely. |
| `DESTRUCTIVE_TOOL_NAMES` | Tool deletes or irreversibly changes state. Prompt user before calling. |
| `OPEN_WORLD_TOOL_NAMES` | Tool makes outbound network calls to external URLs. Tells AI to be careful about scope. |

A tool can be in multiple sets (e.g., `check_broken_links` is both RO and OW).

---

## Known Issues & Planned Improvements

All 13 issues from the initial audit were fixed on 2026-04-18. Round 2 improvements (3 fixes + 5 new tools) added same day. Round 3 (13 new tools + 8 new modules) added 2026-04-30.

| Status | Fix | Details |
|--------|-----|---------|
| ✅ | Classification flags | `pause_scrape`, `resume_scrape`, `submit_verification_code`, `submit_scrape_credentials` now have rich descriptions |
| ✅ | openWorld flags | `find_graphql_endpoints`, `find_site_issues` added to OPEN_WORLD_TOOL_NAMES |
| ✅ | Schedule persistence | `src/scheduler.js` saves to `data/schedules.json`, restores on startup |
| ✅ | `http_fetch` cookie jar | Supports `method`, `body`, `sessionId` (reuses cookies from saved scrape session) |
| ✅ | `export_har` real timings | `src/scraper.js` captures `requestMs`/`duration` on all API calls |
| ✅ | `extract_entities` E.164 | International phone patterns; E.164 normalization; social platform handles |
| ✅ | `batch_scrape` isolation | Each URL runs independently with concurrency cap; per-URL success/fail results |
| ✅ | `get_api_calls` filters | Added `method`, `domain`, `statusMin`, `statusMax`, `urlContains` filter params |
| ✅ | `map_site_for_goal` cap | Added `maxRounds` param — hard cap on follow-up crawl rounds |
| ✅ | `compare_scrapes` semantic | Jaccard similarity, price change detection, changed-page list |
| ✅ | `get_save_overview` top endpoints | `topActiveEndpoints` field — top-5 REST endpoints by call frequency |
| ✅ | `test_oidc_security` replay | `auth_code_replay` test added |
| ✅ | Round 3: 13 new tools | Categories 10–12 above (security analysis, structured extractors, site-level analysis) |
| ✅ | Round 3: network capture | CORS preflights, CSP violations, WebRTC, device API, gRPC, per-request timing, HTTP version |
| ✅ | Round 3: interaction modes | Modals, accordions, infinite scroll, search suggestions, pagination, dropdowns |
| ✅ | Round 3: extractor additions | Language/hreflang, feeds, PDF links, OpenAPI specs, cookie consent, source maps |
| ✅ | Round 3: SW strategy analysis | Cache-first/network-first/stale-while-revalidate detection, Workbox, precache count |
| ✅ | Round 4: MCP Protocol upgrade | Sampling (AI via connected model), logging, progress notifications, resource subscriptions, argument completions, server instructions, toolset profiles, 14 new prompts (22 total), 4 docs resources, /docs HTML page, roots |
| ✅ | Round 4: extractor additions | `headingOutline` (H1–H6 in doc order), `thirdPartyScripts` (categorized 3rd-party JS), `trackingPixels` (1×1 + known pixel patterns), `csrfTokens` (hidden input + meta CSRF patterns) |
| ✅ | Round 4: check_broken_links progress | `onProgress` callback added to `checkBrokenLinks` in link-graph.js; wired to MCP progress notifications |
| ✅ | Round 4: new tools | `extract_reviews` (JSON-LD + OG + text patterns), `get_robots_txt` (full parse: groups, sitemaps, crawl-delay) |
| ✅ | Round 4: /docs prompts tab | Tools/Prompts tab switcher; 22 prompts with arguments, usage examples, live search |
| ✅ | Round 5 (v2.5.0): iFrame content | scraper.js captures same-origin iFrame text, links, forms per child frame |
| ✅ | Round 5 (v2.5.0): resource timings | extractor.js `resourceTimings` — name, type, duration, transferSize, encodedBodySize per asset (100 max) |
| ✅ | Round 5 (v2.5.0): new tools | `get_cache_headers` (Cache-Control/ETag/Vary from doc + API calls), `lookup_ip_info` (IP, ISP, ASN, hosting via ip-api.com) |
| ✅ | Round 5 (v2.5.0): map_site_for_goal progress | `_onProgress` callback added; emits MCP progress notifications per exploration round |
| ✅ | Round 5 (v2.5.0): 5 new prompts (27 total) | `robots_and_seo_audit`, `review_sentiment_analysis`, `third_party_privacy_audit`, `infrastructure_fingerprint`, `iframe_content_map` |
| ✅ | Round 5 (v2.5.0): landing page | GET / now serves dark-themed landing page; WSP moved to /wsp |
| ✅ | Round 5 (v2.5.0): research_url docs fix | Removed stale Ollama references; description now references connected AI model |
| ✅ | Round 6 (v2.5.1): new tool addition workflow | 17-step checklist added to CLAUDE.md + .github/copilot-instructions.md; all AIs now have explicit guidance |
| ✅ | Round 6 (v2.5.1): get_page_word_count | New RO tool — word/sentence/paragraph/character counts from saved page text |
| ✅ | Round 6 (v2.5.1): bug fixes | MCP.md line 67 count was stale (71→74); plan_site_extraction_for_goal prompt still referenced non-existent "Playwright MCP" |

---

## MCP Protocol Capabilities

As of Round 4 (`mcp-server.js` v2.1.0), the server declares the following MCP protocol capabilities:

| Capability | Status | Notes |
|-----------|--------|-------|
| `tools` | ✅ | 74 tools |
| `prompts` | ✅ | 27 prompts — workflow guides for AI |
| `resources` | ✅ | `subscribe: true, listChanged: true` — subscribe to `scrape://saves` for live updates |
| `logging` | ✅ | `SetLevelRequestSchema` handler; `sendLog()` wraps every tool call |
| `completions` | ✅ | `sessionId`, `url`, `apiKind`, `pageIndex` arguments auto-complete |
| `sampling` | Client-side | Server calls `sampling/createMessage` at runtime — no capability declaration needed. `analyzeWithAI()` tries connected model first, falls back to HTTP. |

**Toolset profiles** (`MCP_TOOLSET` env var):
- `research` — 11 tools for browsing and analysis
- `security` — 9 tools for security testing
- `ecommerce` — 7 tools for product/deal extraction
- `seo` — 4 tools for link and sitemap work
- `ops` — 12 tools for managing jobs and sessions
- `full` (default) — all 68 tools

**Prompts** (`prompts/` in MCP protocol): 22 total. Use in Claude Code with `get_prompt <name> [args]`. Highlights:
- `security_full_audit url="..."` — full security posture in one command
- `competitive_intel sessionId="..."` — pricing, differentiators, tech stack
- `site_health_check sessionId="..."` — broken links, JS errors, perf, SSL, security headers
- `privacy_gdpr_audit sessionId="..."` — cookie consent, tracking pixels, third-party sharing
- `tech_stack_fingerprint sessionId="..."` — CDN, frameworks, analytics, payments, monitoring

**Docs resources** (`scrape://docs/*`):
- `scrape://docs/quickstart` — 10-step onboarding
- `scrape://docs/workflow-recipes` — copy-paste multi-tool sequences
- `scrape://docs/tool-selection-guide` — decision tree for tool selection
- `scrape://docs/troubleshooting` — common errors and fixes

---

## Test Files

| File | What it covers |
|------|---------------|
| `tests/security/oidc_lab.test.js` | All 8 OIDC test types against generic mock IdP |
| `tests/security/mock_idp.js` | Generic mock OIDC/OAuth2 server |
| `tests/security/pingfed_lab.test.js` | PingFederate-realistic scenario tests |
| `tests/security/mock_pingfederate.js` | PingFed mock with PA_-prefixed clients, PingAccess headers |

Run tests: `node tests/security/oidc_lab.test.js` or `node tests/security/pingfed_lab.test.js`

---

*Last updated: 2026-05-02. Tool count: 74. Prompt count: 27. Version: 2.5.1.*
