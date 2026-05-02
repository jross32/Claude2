# Scraper Capture Tracker

Track what the scraper can capture. ✅ = implemented · ❌ = not yet · Rating = value of adding it (1–10).
Update this file as features are added — flip ❌ to ✅ and note the date.

---

## Page Content & DOM

| Feature | Have | Rating | Notes |
|---|---|---|---|
| Raw HTML source | ✅ | — | |
| Rendered DOM (after JS executes) | ✅ | — | |
| Page text content (cleaned) | ✅ | — | |
| Markdown conversion | ✅ | — | |
| Links — internal and external | ✅ | — | |
| Images with URLs and metadata | ✅ | — | |
| Forms and their fields | ✅ | — | |
| Tables and list data | ✅ | — | |
| 50+ DOM data types via extractor.js | ✅ | — | headings, buttons, inputs, embeds, data attributes, etc. |
| Shadow DOM content | ✅ | — | extractor.js lines 17–55 |
| iFrame content | ✅ | — | scraper.js iFrame eval — text, links, form presence per child frame (cross-origin skipped) |
| Accessibility tree (ARIA roles, labels) | ✅ | — | extractor.js lines 436–446 |
| CSS computed styles per element | ❌ | **4** | Mostly useful for design tooling |
| Design tokens / CSS variables | ✅ | — | extractor.js lines 349–366 |
| Canvas element screenshot | ❌ | **3** | Niche — charts rendered to canvas |
| SVG content extraction | ❌ | **4** | Icons and charts hidden in SVG |
| Print stylesheet rendering | ❌ | **1** | Almost never useful |
| Full-page PDF render | ❌ | **6** | Useful for archiving and AI doc analysis |
| Heading hierarchy (H1–H6 outline) | ✅ | — | extractor.js headingOutline — ordered flat list in document order with level, text, id |
| Reading order / content flow | ❌ | **5** | |

---

## Network & Requests

| Feature | Have | Rating | Notes |
|---|---|---|---|
| REST API calls (intercepted live) | ✅ | — | |
| GraphQL queries and mutations | ✅ | — | |
| GraphQL schema introspection | ✅ | — | |
| WebSocket messages | ✅ | — | |
| Server-Sent Events (SSE) | ✅ | — | |
| HAR 1.2 export of all network traffic | ✅ | — | |
| Request and response headers | ✅ | — | |
| gRPC calls | ✅ | — | scraper.js gRPC binary framing + protobuf field decoder |
| SOAP / XML requests | ❌ | **3** | Legacy but some big orgs still use it |
| Request timing waterfall | ✅ | — | per-request dns/tcp/ssl/ttfb/transfer via response.timing() |
| DNS lookup time | ✅ | — | captured in per-request timing object |
| TCP / SSL handshake time | ✅ | — | captured in per-request timing object |
| HTTP/2 vs HTTP/1.1 vs HTTP/3 detection | ✅ | — | extractor.js httpVersion via nextHopProtocol |
| Beacon API calls | ✅ | — | scraper.js lines 2511–2522 |
| Prefetch / preload hints | ❌ | **5** | Reveals what the site thinks is important next |
| Redirect chains (full path) | ✅ | — | link-graph.js findRedirectChains |
| Cache headers (ETag, Cache-Control) | ❌ | **6** | |
| CORS policy details | ✅ | — | scraper.js corsPreflights via page.route OPTIONS capture |
| WebRTC connections | ✅ | — | scraper.js WebRTC proxy captures ICE candidates and SDP |
| fetch vs XHR distinction | ❌ | **3** | |

---

## JavaScript & Runtime

| Feature | Have | Rating | Notes |
|---|---|---|---|
| JavaScript files loaded | ✅ | — | |
| Third-party script inventory | ✅ | — | extractor.js thirdPartyScripts — domain, category (analytics/advertising/cdn/support/etc.), async/defer per script |
| JS console errors | ✅ | — | scraper.js page.on('pageerror') lines 2705–2708 |
| JS console warnings | ❌ | **6** | |
| Global variables exposed (window.*) | ✅ | — | extractor.js lines 594–651 jsGlobalState |
| Web Workers detected | ❌ | **5** | |
| Service Worker interception | ✅ | — | scraper.js enhanced SW: strategies, Workbox, precache count |
| IndexedDB contents | ✅ | — | extractor.js lines 691–740 |
| sessionStorage | ✅ | — | extractor.js lines 483–488 |
| Code coverage (which JS lines ran) | ❌ | **5** | Know what code paths actually fire |
| Memory usage snapshot | ❌ | **4** | |
| Long tasks (>50ms blocking) | ❌ | **6** | Performance analysis |
| JavaScript error count | ✅ | — | via page.on('pageerror') count in scraper.js |
| Feature flags / config objects | ✅ | — | extractor.js jsGlobalState lines 594–651 |
| Source map extraction | ✅ | — | extractor.js sourceMaps — scans scripts for sourceMappingURL |
| WebAssembly modules detected | ❌ | **3** | |

---

## Performance & Core Web Vitals

| Feature | Have | Rating | Notes |
|---|---|---|---|
| Page load time | ✅ | — | extractor.js lines 779–815 |
| Time to First Byte (TTFB) | ✅ | — | extractor.js lines 779–815 |
| First Contentful Paint (FCP) | ✅ | — | extractor.js lines 779–815 |
| Largest Contentful Paint (LCP) | ✅ | — | extractor.js lines 779–815 |
| Cumulative Layout Shift (CLS) | ✅ | — | extractor.js lines 779–815 |
| Total Blocking Time | ✅ | — | extractor.js lines 779–815 |
| Resource size per asset | ✅ | — | extractor.js resourceTimings — transferSize + encodedBodySize per asset, capped at 100 |
| Number of requests per page | ✅ | — | extractor.js resourceTimings.length |
| Unused CSS/JS ratio | ❌ | **5** | |

---

## Security & Privacy

| Feature | Have | Rating | Notes |
|---|---|---|---|
| TLS fingerprinting | ✅ | — | |
| OIDC security testing (8 test types) | ✅ | — | |
| Security headers (HSTS, CSP, X-Frame, etc.) | ✅ | — | security-scorer.js — 0–100 score, A+–F grade, recommendations |
| PII scanning | ✅ | — | |
| Cookie attributes (httpOnly, secure, SameSite) | ✅ | — | scraper.js cookies map lines 1676–1686 |
| JWT token structure decode | ✅ | — | jwt-decoder.js — header/payload decode, security flags, expiry |
| CSRF token patterns | ✅ | — | extractor.js csrfTokens — hidden inputs + meta tags matching 10 CSRF name patterns |
| Tracking pixel inventory | ✅ | — | extractor.js trackingPixels — detects 1×1 images + 10 known pixel URL patterns + noscript fallback |
| Fingerprinting script detection | ❌ | **7** | Canvas fingerprinting, AudioContext fingerprinting, etc. |
| What the site sees about your browser | ❌ | **7** | User agent, IP, headers the server receives — reverse fingerprint |
| GDPR / cookie consent analysis | ✅ | — | extractor.js cookieConsent — 10 vendors, opt-in/opt-out model |
| Third-party data sharing map | ❌ | **7** | What external domains receive user data |
| Geolocation / camera / mic permission requests | ✅ | — | scraper.js deviceApiCalls proxy captures all permission requests |
| Subresource Integrity (SRI) checks | ❌ | **5** | |

---

## SEO & Structured Data

| Feature | Have | Rating | Notes |
|---|---|---|---|
| JSON-LD structured data | ✅ | — | |
| Meta tags (description, keywords, robots) | ✅ | — | |
| Open Graph tags | ✅ | — | |
| Twitter Card tags | ✅ | — | |
| Canonical URL | ✅ | — | extractor.js line 70 meta.canonical |
| hreflang (internationalization tags) | ✅ | — | extractor.js meta.hreflang array |
| Robots.txt parsing | ❌ | **7** | Intentionally excluded — scraper does not fetch robots.txt |
| Broken link detection | ✅ | — | link-graph.js checkBrokenLinks — concurrent HEAD checks, rate-limited |
| Redirect chain map | ✅ | — | link-graph.js findRedirectChains |
| Internal link graph | ✅ | — | link-graph.js buildLinkGraph — hubs, authorities, orphans, dead-ends |
| Duplicate content detection | ❌ | **6** | |
| Image alt text completeness audit | ❌ | **6** | |
| Structured data validation | ❌ | **7** | Is the JSON-LD actually valid schema.org? |

---

## Media & Assets

| Feature | Have | Rating | Notes |
|---|---|---|---|
| Images (URLs, metadata) | ✅ | — | |
| CSS files | ✅ | — | |
| JavaScript bundles | ✅ | — | |
| Fonts detected | ✅ partial | — | |
| Video URLs | ✅ | — | extractor.js lines 219–230 media |
| Audio URLs | ✅ | — | extractor.js lines 219–230 media |
| PDF detection and download | ✅ | — | extractor.js pdfLinks — href pattern + content-type detection |
| Font inventory (loaded vs declared in CSS) | ❌ | **4** | |
| OG / social preview images | ❌ | **5** | |
| Favicon all sizes | ❌ | **3** | |
| Lazy-loaded image URLs (data-src before load) | ✅ | — | extractor.js lines 179–206 |

---

## Dynamic & Interactive Content

| Feature | Have | Rating | Notes |
|---|---|---|---|
| Modal / dialog content | ✅ | — | scraper.js _captureModals — triggers and captures dialog content |
| Infinite scroll capture | ✅ | — | scraper.js _captureInfiniteScroll — N scroll steps, DOM diff |
| Dropdown menu content | ✅ | — | scraper.js _captureDropdowns — hover-triggered nav capture |
| Accordion / tab content (all states) | ✅ | — | scraper.js _captureAccordions — click each trigger, capture revealed content |
| Auto-complete / search suggestions | ✅ | — | scraper.js _captureSearchSuggestions — types queries, captures suggestions |
| Hover state content (tooltips) | ❌ | **5** | |
| Dynamic form validation messages | ❌ | **5** | |
| Pagination — structured traversal (page 1/2/3) | ✅ | — | scraper.js _traversePagination — follows rel=next up to maxPaginationPages |

---

## AI-Specific (MCP Server Use Cases)

| Feature | Have | Rating | Notes |
|---|---|---|---|
| Per-page AI summary | ✅ | — | via research_url tool |
| Entity extraction (people, orgs, places) | ✅ | — | |
| Automatic data schema detection | ✅ | — | |
| Per-page content classification | ✅ | — | classify_pages MCP tool — URL + text heuristics, 14 page types |
| Cross-page pattern recognition | ✅ | — | find_patterns MCP tool — URL groups, H1 frequency, nav patterns |
| Business intelligence extraction | ✅ | — | extract_business_intel MCP tool — pricing, metrics, contacts, tech |
| Content change significance scoring | ✅ | — | score_diff_significance MCP tool — weighted scoring of diff elements |
| Anomaly flagging | ✅ | — | flag_anomalies MCP tool — z-score page size, JS errors, external domains |
| Intent detection | ✅ | — | detect_intent MCP tool — conversion elements, trust signals, urgency |
| Sentiment analysis | ✅ | — | analyze_sentiment MCP tool — positive/negative keyword scoring |
| Language detection per page | ✅ | — | extractor.js meta.language + hreflang detection |
| Auto-generated test cases from scraped UI | ❌ | **7** | AI writes Playwright tests based on what it scraped |
| Data normalization across sites | ✅ | — | normalize_across_sites MCP tool — unified field mapping across sessions |

---

## Infrastructure & Identity

| Feature | Have | Rating | Notes |
|---|---|---|---|
| Tech stack detection | ✅ | — | |
| CDN detection | ✅ | — | |
| Server software detection | ✅ | — | |
| Analytics tools detected (GA, Mixpanel, etc.) | ✅ | — | extractor.js lines 517–529 tech.analytics |
| A/B testing tools detected | ✅ | — | extractor.js tech section |
| Error tracking tools detected | ✅ | — | extractor.js tech section |
| Payment processors detected | ✅ | — | extractor.js tech section |
| Chat / support tools detected | ✅ | — | extractor.js tech section |
| IP address / hosting provider | ✅ | — | src/ip-lookup.js — lookup_ip_info tool via ip-api.com: IP, country, ISP, ASN, hosting flag |
| DNS records (A, MX, TXT, NS) | ✅ | — | dns-lookup.js — A/AAAA/MX/TXT/NS/CNAME/SOA + tech inference |
| SSL certificate details | ✅ | — | ssl-inspector.js — chain, SANs, cipher, expiry flags |
| WHOIS / domain registration info | ❌ | **4** | |
| Subdomain enumeration | ✅ | — | link-graph.js discoverSubdomains — from links, API calls, assets |

---

## Specialized / Niche

| Feature | Have | Rating | Notes |
|---|---|---|---|
| Sitemap crawling | ✅ | — | |
| Sitemap generation | ✅ | — | |
| Diff between two scrapes | ✅ | — | |
| Scheduled scrapes (cron) | ✅ | — | |
| Page monitoring / change alerts | ✅ | — | |
| Tor routing | ✅ | — | |
| Redis dedup across sessions | ✅ | — | |
| RSS / Atom feed detection | ✅ | — | extractor.js feeds — RSS/Atom/JSON Feed link detection |
| PWA manifest parsing | ❌ | **5** | |
| Push notification setup detected | ❌ | **4** | |
| OpenAPI / Swagger spec detection | ✅ | — | extractor.js apiSpecLinks — common spec paths and link detection |
| robots.txt disallowed paths | ❌ | **5** | Not exposed as an MCP tool (intentionally removed) |
| App store links detected | ❌ | **4** | |
| QR codes detected in images | ❌ | **3** | |
| Email newsletter signup detection | ❌ | **4** | |
| Job board / career page detection | ✅ | — | job-extractor.js — URL + JSON-LD + keyword signals |

---

## Auth & Sessions

| Feature | Have | Rating | Notes |
|---|---|---|---|
| Login form detection | ✅ | — | |
| 2FA handling (TOTP, email, SMS) | ✅ | — | |
| Cookie capture | ✅ | — | |
| localStorage capture | ✅ | — | |
| OAuth / OIDC flow detection | ✅ | — | |
| Saved session re-use | ✅ | — | |
| sessionStorage capture | ✅ | — | extractor.js lines 483–488 |
| Auth token auto-refresh | ✅ | — | via apa-gql.js pattern |

---

## Data Extraction

| Feature | Have | Rating | Notes |
|---|---|---|---|
| Email addresses | ✅ | — | |
| Phone numbers | ✅ | — | |
| Physical addresses | ✅ | — | |
| URLs / external links | ✅ | — | |
| Schema inference → TypeScript / JSON Schema | ✅ | — | |
| React component generation from scraped page | ✅ | — | |
| CSS generation from scraped page | ✅ | — | |
| Markdown generation | ✅ | — | |
| Product data (name, price, SKU, description) | ✅ | — | product-extractor.js — JSON-LD + DOM heuristics, variants |
| Review / rating data | ✅ | — | extract_reviews tool + review-extractor.js — JSON-LD Review/AggregateRating, Open Graph, text patterns |
| Event data (dates, locations, tickets) | ❌ | **6** | |
| Job listing data | ✅ | — | job-extractor.js — title, dept, salary, skills, applyUrl |
| Real estate listing data | ❌ | **5** | |
| Social media handles and profile links | ✅ | — | company-extractor.js socialProfiles |
| Company / org information | ✅ | — | company-extractor.js — JSON-LD + text patterns, industry, registration |
