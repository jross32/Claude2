'use strict';

/**
 * Shared MCP catalog metadata.
 *
 * This file is the single source of truth for human-facing tool catalog details
 * that are not encoded directly in JSON Schema: categories, maturity labels,
 * example calls, and starter workflows. The protocol tool definitions stay in
 * mcp-server.js, while docs/UI surfaces derive their presentation from here.
 */

const TOOL_CATEGORY_GROUPS = [
  {
    name: 'Core Scraping',
    tools: [
      'detect_site',
      'preflight_url',
      'scrape_url',
      'batch_scrape',
      'take_screenshot',
      'fill_form',
      'map_site_for_goal',
      'research_url',
    ],
  },
  {
    name: 'Session & Auth',
    tools: [
      'check_saved_session',
      'clear_saved_session',
      'get_known_site_credentials',
      'list_active_scrapes',
      'get_scrape_status',
      'stop_scrape',
      'pause_scrape',
      'resume_scrape',
      'submit_verification_code',
      'submit_scrape_credentials',
    ],
  },
  {
    name: 'Content & Saves',
    tools: [
      'list_saves',
      'get_save_overview',
      'compare_scrapes',
      'search_scrape_text',
      'delete_save',
      'get_page_text',
      'to_markdown',
      'list_links',
      'list_forms',
      'list_images',
      'list_internal_pages',
    ],
  },
  {
    name: 'API & Schema',
    tools: [
      'get_api_calls',
      'get_api_surface',
      'probe_endpoints',
      'http_fetch',
      'find_graphql_endpoints',
      'introspect_graphql',
      'infer_schema',
      'export_har',
    ],
  },
  {
    name: 'Structured Extraction',
    tools: [
      'extract_entities',
      'extract_structured_data',
      'extract_deals',
      'extract_product_data',
      'extract_job_listings',
      'extract_company_info',
      'extract_business_intel',
      'extract_reviews',
      'get_store_context',
    ],
  },
  {
    name: 'Site Analysis',
    tools: [
      'find_site_issues',
      'get_tech_stack',
      'get_link_graph',
      'check_broken_links',
      'classify_pages',
      'flag_anomalies',
      'find_patterns',
      'crawl_sitemap',
      'get_robots_txt',
      'get_cache_headers',
    ],
  },
  {
    name: 'Security',
    tools: [
      'scan_pii',
      'test_oidc_security',
      'test_tls_fingerprint',
      'decode_jwt_tokens',
      'inspect_ssl',
      'score_security_headers',
      'lookup_dns',
      'lookup_ip_info',
    ],
  },
  {
    name: 'Automation & Scheduling',
    tools: [
      'schedule_scrape',
      'list_schedules',
      'delete_schedule',
      'monitor_page',
      'delete_monitor',
    ],
  },
  {
    name: 'Code Generation',
    tools: [
      'generate_react',
      'generate_css',
      'generate_sitemap',
    ],
  },
  {
    name: 'Diagnostics',
    tools: [
      'server_info',
    ],
  },
];

const TOOL_MATURITY = {
  batch_scrape: 'beta',
  take_screenshot: 'beta',
  fill_form: 'beta',
  map_site_for_goal: 'experimental',
  research_url: 'experimental',
  monitor_page: 'beta',
  test_tls_fingerprint: 'beta',
  classify_pages: 'beta',
  flag_anomalies: 'beta',
  find_patterns: 'beta',
  extract_business_intel: 'beta',
  extract_reviews: 'beta',
  get_robots_txt: 'beta',
  get_cache_headers: 'beta',
  lookup_ip_info: 'beta',
  server_info: 'beta',
};

const TOOL_EXAMPLES = {
  detect_site: { url: 'https://example.com' },
  scrape_url: {
    url: 'https://example.com',
    maxPages: 3,
    captureGraphQL: true,
    captureREST: true,
  },
  get_save_overview: { sessionId: 'save-123' },
  get_api_calls: { sessionId: 'save-123', kind: 'all' },
  extract_product_data: { sessionId: 'save-123' },
  extract_company_info: { sessionId: 'save-123' },
  score_security_headers: { sessionId: 'save-123' },
  inspect_ssl: { url: 'https://example.com' },
  lookup_dns: { url: 'https://example.com' },
  get_link_graph: { sessionId: 'save-123' },
  crawl_sitemap: { url: 'https://example.com', maxUrls: 200 },
  get_robots_txt: { url: 'https://example.com/docs' },
  get_cache_headers: { sessionId: 'save-123' },
  lookup_ip_info: { hostname: 'example.com' },
  server_info: {},
};

const STARTER_WORKFLOWS = [
  {
    title: 'Site Orientation',
    summary: 'Understand rendering mode, auth, and crawl shape before scraping deeply.',
    tools: ['detect_site', 'preflight_url', 'scrape_url', 'get_save_overview'],
  },
  {
    title: 'API Discovery',
    summary: 'Capture REST and GraphQL traffic, then summarize endpoints and schemas.',
    tools: ['scrape_url', 'get_api_surface', 'get_api_calls', 'infer_schema'],
  },
  {
    title: 'Security Review',
    summary: 'Combine saved traffic with TLS, DNS, JWT, and header analysis.',
    tools: ['scrape_url', 'score_security_headers', 'inspect_ssl', 'decode_jwt_tokens', 'lookup_dns'],
  },
  {
    title: 'Storefront Extraction',
    summary: 'Pull products, deals, reviews, and company context from commerce sites.',
    tools: ['scrape_url', 'extract_product_data', 'extract_deals', 'extract_reviews', 'get_store_context'],
  },
  {
    title: 'Change Monitoring',
    summary: 'Track fragile pages over time and keep scheduled crawls visible.',
    tools: ['monitor_page', 'schedule_scrape', 'list_schedules', 'compare_scrapes'],
  },
];

function getToolCategory(name) {
  for (const group of TOOL_CATEGORY_GROUPS) {
    if (group.tools.includes(name)) return group.name;
  }
  return 'Other';
}

function getToolMaturity(name) {
  return TOOL_MATURITY[name] || 'stable';
}

function getToolExample(name) {
  return TOOL_EXAMPLES[name] || null;
}

function formatExampleCall(name, example) {
  if (!example || typeof example !== 'object') return `${name}`;
  const parts = Object.entries(example).map(([key, value]) => {
    if (typeof value === 'string') return `${key}="${value}"`;
    return `${key}=${JSON.stringify(value)}`;
  });
  return parts.length ? `${name} ${parts.join(' ')}` : `${name}`;
}

function buildToolCatalog(tools, classifications) {
  const readOnlyNames = classifications?.readOnlyNames || new Set();
  const openWorldNames = classifications?.openWorldNames || new Set();
  const destructiveNames = classifications?.destructiveNames || new Set();

  return tools.map((tool) => {
    const exampleInput = getToolExample(tool.name);
    const badges = [];
    if (readOnlyNames.has(tool.name)) badges.push('RO');
    if (openWorldNames.has(tool.name)) badges.push('OW');
    if (destructiveNames.has(tool.name)) badges.push('D');
    return {
      ...tool,
      category: getToolCategory(tool.name),
      maturity: getToolMaturity(tool.name),
      exampleInput,
      exampleCall: formatExampleCall(tool.name, exampleInput),
      badges,
    };
  });
}

function buildPromptCatalog(prompts) {
  return prompts.map((prompt) => ({
    ...prompt,
    usage: `get_prompt ${prompt.name}${(prompt.arguments || [])
      .map((arg) => ` ${arg.name}="${arg.required ? '<value>' : '[optional]'}"`)
      .join('')}`,
  }));
}

module.exports = {
  STARTER_WORKFLOWS,
  TOOL_CATEGORY_GROUPS,
  buildPromptCatalog,
  buildToolCatalog,
  formatExampleCall,
  getToolCategory,
  getToolExample,
  getToolMaturity,
};
