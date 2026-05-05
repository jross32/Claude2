/**
 * mcp-server.js
 * MCP server that wraps the web scraper app's REST API and core modules.
 *
 * Prerequisites: the scraper app must be running (npm start).
 * This server communicates with it over localhost:12345.
 *
 * Registered via .mcp.json in the project root.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  CompleteRequestSchema,
  CreateMessageResultSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListRootsResultSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  SetLevelRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const WebSocket = require('ws');
const { version: PACKAGE_VERSION } = require('./package.json');

// Direct module imports (tools that don't need the REST API)
const toolLogger = require('./src/tool-logger');
const { probeEndpoints } = require('./src/endpoint-prober');
const { scanScrapeResult } = require('./src/pii-scanner');
const { introspect, discoverEndpoints } = require('./src/graphql-introspector');
const { decodeJWT, extractJWTs } = require('./src/jwt-decoder');
const { lookupDNS } = require('./src/dns-lookup');
const { inspectSSL } = require('./src/ssl-inspector');
const { scoreSecurityHeaders } = require('./src/security-scorer');
const { buildLinkGraph, findRedirectChains, discoverSubdomains, checkBrokenLinks } = require('./src/link-graph');
const { extractProductData } = require('./src/product-extractor');
const { extractJobData } = require('./src/job-extractor');
const { extractCompanyInfo } = require('./src/company-extractor');
const { extractReviews } = require('./src/review-extractor');
const { fetchAndParseRobots } = require('./src/robots-parser');
const { lookupIpInfo } = require('./src/ip-lookup');
const {
  STARTER_WORKFLOWS,
  buildPromptCatalog,
  buildToolCatalog,
} = require('./src/mcp-catalog');

const BASE_URL = process.env.SCRAPER_URL || 'http://localhost:12345';
const WS_URL = BASE_URL.replace(/^http/, 'ws');
const SERVER_VERSION = PACKAGE_VERSION || '0.0.0';
const REQUEST_TIMEOUT_MS = 30 * 1000;
const SCRAPE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const SAVE_POLL_INTERVAL_MS = 1500;
const SAVE_CACHE_TTL_MS = 5000;
const MAX_TEXT_CHARS = 4000; // per page in scrape_url / extract_entities results
const MAX_PREVIEW_CHARS = 500;
const MAX_API_RESPONSE_CHARS = 2000;
const COMPLETE_SAVE_STATUSES = new Set(['complete', 'completed']);
const FAILED_SAVE_STATUSES = new Set(['error', 'failed']);
const TERMINAL_SAVE_STATUSES = new Set([
  ...COMPLETE_SAVE_STATUSES,
  ...FAILED_SAVE_STATUSES,
  'stopped',
]);

const RESEARCH_FAST_MAX_PAGES = Number(process.env.RESEARCH_FAST_MAX_PAGES) || 2;
const RESEARCH_DEEP_MAX_PAGES = Number(process.env.RESEARCH_DEEP_MAX_PAGES) || 4;
const RESEARCH_FAST_MAX_SNIPPETS = Number(process.env.RESEARCH_FAST_MAX_SNIPPETS) || 4;
const RESEARCH_DEEP_MAX_SNIPPETS = Number(process.env.RESEARCH_DEEP_MAX_SNIPPETS) || 8;
const RESEARCH_FAST_SNIPPET_CHARS = Number(process.env.RESEARCH_FAST_SNIPPET_CHARS) || 180;
const RESEARCH_DEEP_SNIPPET_CHARS = Number(process.env.RESEARCH_DEEP_SNIPPET_CHARS) || 260;
const RESEARCH_FAST_MAX_TOTAL_CHARS = Number(process.env.RESEARCH_FAST_MAX_TOTAL_CHARS) || 7000;
const RESEARCH_DEEP_MAX_TOTAL_CHARS = Number(process.env.RESEARCH_DEEP_MAX_TOTAL_CHARS) || 18000;
const RESEARCH_FAST_MAX_HEADINGS = Number(process.env.RESEARCH_FAST_MAX_HEADINGS) || 8;
const RESEARCH_DEEP_MAX_HEADINGS = Number(process.env.RESEARCH_DEEP_MAX_HEADINGS) || 14;
const RESEARCH_TOOL_MODES = new Set(['auto', 'fast', 'deep']);
const SAVES_DIR = path.join(__dirname, 'scrape-saves');
const DATA_DIR = path.join(__dirname, 'data');
const LOGS_DIR = path.join(__dirname, 'logs');
const BROWSER_SESSION_DIR = path.join(__dirname, '.browser-sessions');
const BROWSER_SESSION_SAVES_DIR = path.join(BROWSER_SESSION_DIR, 'saves');
const ORIENTATION_SCOPE_LEVELS = new Set([1, 2, 3]);
const ORIENTATION_SEED_PAGE_COUNT = Number(process.env.ORIENTATION_SEED_PAGE_COUNT) || 1;
const ORIENTATION_FOLLOWUP_BATCH_SIZE = Number(process.env.ORIENTATION_FOLLOWUP_BATCH_SIZE) || 6;
const ORIENTATION_FOLLOWUP_EXHAUSTIVE_BATCH_SIZE = Number(process.env.ORIENTATION_FOLLOWUP_EXHAUSTIVE_BATCH_SIZE) || 12;
const ORIENTATION_MAX_ROUNDS = Number(process.env.ORIENTATION_MAX_ROUNDS) || 4;
const ORIENTATION_MAX_EXHAUSTIVE_ROUNDS = Number(process.env.ORIENTATION_MAX_EXHAUSTIVE_ROUNDS) || 8;
const ORIENTATION_RELATED_ORIGIN_LIMIT = Number(process.env.ORIENTATION_RELATED_ORIGIN_LIMIT) || 20;
const ORIENTATION_RELEVANT_SECTION_LIMIT = Number(process.env.ORIENTATION_RELEVANT_SECTION_LIMIT) || 40;
const ORIENTATION_RECOMMENDED_SCRAPE_LIMIT = Number(process.env.ORIENTATION_RECOMMENDED_SCRAPE_LIMIT) || 30;
const ORIENTATION_INTERACTION_LIMIT = Number(process.env.ORIENTATION_INTERACTION_LIMIT) || 20;

// ── Generic AI analysis backend (configurable, OpenAI-compatible) ─────────
// Point this at any OpenAI-compatible endpoint: Ollama, Azure OpenAI,
// a local proxy, or any provider that speaks the /v1/chat/completions format.
// When AI_ANALYSIS_URL is unset the MCP server returns purely algorithmic
// evidence — the connected AI agent performs its own reasoning on the result.
const AI_ANALYSIS_URL = process.env.AI_ANALYSIS_URL || null;
const AI_ANALYSIS_MODEL = process.env.AI_ANALYSIS_MODEL || 'gpt-4o-mini';
const AI_ANALYSIS_API_KEY = process.env.AI_ANALYSIS_API_KEY || '';

// ── MCP protocol state ───────────────────────────────────────────────────────
const activeSubscriptions = new Set(); // subscribed resource URIs
let currentLogLevel = 'info';          // adjusted by logging/setLevel

// ── Toolset profiles ─────────────────────────────────────────────────────────
// Set MCP_TOOLSET env var to expose only a subset of tools to the connected client.
const TOOLSETS = {
  research:  ['scrape_url','research_url','get_page_text','extract_entities','to_markdown','list_links','list_images','get_tech_stack','detect_site','preflight_url','http_fetch'],
  security:  ['score_security_headers','test_oidc_security','test_tls_fingerprint','scan_pii','inspect_ssl','decode_jwt_tokens','get_api_calls','find_graphql_endpoints','probe_endpoints','lookup_dns'],
  ecommerce: ['scrape_url','extract_product_data','extract_deals','extract_structured_data','extract_entities','get_page_text','list_images','detect_site'],
  seo:       ['scrape_url','get_link_graph','check_broken_links','generate_sitemap','crawl_sitemap','list_links','list_internal_pages','find_site_issues'],
  ops:       ['list_active_scrapes','get_scrape_status','stop_scrape','pause_scrape','resume_scrape','list_schedules','schedule_scrape','delete_schedule','monitor_page','delete_monitor','list_saves','delete_save','check_saved_session','clear_saved_session','get_save_overview'],
  full:      null, // null = all tools
};
const activeToolset = (process.env.MCP_TOOLSET || 'full').toLowerCase();

/**
 * Call the configured AI backend (OpenAI-compatible /v1/chat/completions).
 * Returns the model's reply string, or null if no backend is configured or
 * if the call fails. Callers MUST handle a null return gracefully.
 */
async function analyzeWithAI(systemPrompt, userPrompt, { url = AI_ANALYSIS_URL, model = AI_ANALYSIS_MODEL, apiKey = AI_ANALYSIS_API_KEY } = {}) {
  // Try MCP sampling first — uses whatever model the connected client has (Claude, Copilot, Codex, etc.)
  const sampled = await sampleFromClient(systemPrompt, userPrompt, { maxTokens: 1024 });
  if (sampled !== null) return sampled;

  // Fall back to HTTP (OpenAI-compatible endpoint: Ollama, Azure OpenAI, etc.)
  if (!url) return null;
  try {
    const body = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      max_tokens: 1024,
      temperature: 0.2,
    });
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const response = await fetch(`${url.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

/**
 * Ask the connected MCP client to run an LLM inference (sampling).
 * Works with any client that supports sampling: Claude Code, Copilot, Codex, etc.
 * Returns the model's reply string, or null if sampling is unsupported/fails.
 */
async function sampleFromClient(systemPrompt, userContent, { maxTokens = 1024 } = {}) {
  try {
    const result = await server.request(
      {
        method: 'sampling/createMessage',
        params: {
          messages: [{ role: 'user', content: { type: 'text', text: userContent } }],
          systemPrompt,
          maxTokens,
          modelPreferences: {
            intelligencePriority: 0.8,
            speedPriority:        0.3,
          },
        },
      },
      CreateMessageResultSchema,
    );
    const text = result?.content?.text ?? result?.content?.[0]?.text ?? null;
    return typeof text === 'string' && text.length > 0 ? text : null;
  } catch {
    return null; // client doesn't support sampling — fall through to HTTP fallback
  }
}

// ── Keyword extraction (Tier 1 fallback — no deps, pure JS) ───────────────
const _STOPWORDS = new Set([
  'the','a','an','is','are','was','were','what','which','find','tell','me','about',
  'can','you','how','do','does','on','in','at','of','to','for','and','or','but',
  'it','its','this','that','these','those','be','been','have','has','had','will',
  'would','could','should','may','might','from','with','by','as','if','then',
  'than','so','not','no','get','give','show','list','all','any','some','use',
]);

function keywordExtract(pages, question) {
  const keywords = question.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !_STOPWORDS.has(w));

  const headings = [];
  const allParas = [];

  for (const page of pages) {
    const text = page.fullText || '';
    // Collect headings
    for (const h of [...(page.headings?.h1 || []), ...(page.headings?.h2 || [])]) {
      const t = typeof h === 'string' ? h : (h.text || '');
      if (t.trim()) headings.push(t.trim());
    }
    // Split into paragraphs
    const paras = text.split(/\n{2,}|\. {2,}/).map(p => p.trim()).filter(p => p.length > 20);
    for (const para of paras) {
      let score = 0;
      const lower = para.toLowerCase();
      for (const kw of keywords) {
        const matches = (lower.match(new RegExp(kw, 'g')) || []).length;
        score += matches * 2;
      }
      if (score > 0) allParas.push({ text: para, score, pageUrl: page.url });
    }
  }

  allParas.sort((a, b) => b.score - a.score);
  const topParas = allParas.slice(0, 8).map(p => p.text);

  // Extract dates, prices, capitalized proper phrases
  const fullText = pages.map(p => p.fullText || '').join('\n');
  const dates = [...new Set((fullText.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{4}[\/\-]\d{2}[\/\-]\d{2}/g) || []))].slice(0, 10);
  const prices = [...new Set((fullText.match(/\$[\d,]+(?:\.\d{2})?/g) || []))].slice(0, 10);

  const confidence = allParas.length >= 3 ? 'high' : allParas.length >= 1 ? 'medium' : 'low';

  return {
    analysisMethod: 'keyword-extraction',
    answer: topParas.length > 0
      ? `Found ${topParas.length} relevant sections. Top result: ${topParas[0].substring(0, 300)}`
      : 'No strongly matching content found for the question. See relevantText for best available content.',
    findings: topParas.slice(0, 4).map(p => p.substring(0, 200)),
    relevantText: topParas,
    headings: [...new Set(headings)].slice(0, 20),
    detectedDates: dates,
    detectedPrices: prices,
    confidence,
    suggestedFollowUp: [],
  };
}

function getResearchProfile(profileName = 'deep') {
  if (profileName === 'fast') {
    return {
      name: 'fast',
      maxPages: RESEARCH_FAST_MAX_PAGES,
      maxSnippets: RESEARCH_FAST_MAX_SNIPPETS,
      snippetChars: RESEARCH_FAST_SNIPPET_CHARS,
      maxTotalChars: RESEARCH_FAST_MAX_TOTAL_CHARS,
      maxHeadings: RESEARCH_FAST_MAX_HEADINGS,
    };
  }

  return {
    name: 'deep',
    maxPages: RESEARCH_DEEP_MAX_PAGES,
    maxSnippets: RESEARCH_DEEP_MAX_SNIPPETS,
    snippetChars: RESEARCH_DEEP_SNIPPET_CHARS,
    maxTotalChars: RESEARCH_DEEP_MAX_TOTAL_CHARS,
    maxHeadings: RESEARCH_DEEP_MAX_HEADINGS,
  };
}

function normalizeResearchMode(mode) {
  const normalized = String(mode || 'auto').trim().toLowerCase();
  if (!RESEARCH_TOOL_MODES.has(normalized)) {
    throw new Error(`mode must be one of: ${[...RESEARCH_TOOL_MODES].join(', ')}`);
  }
  return normalized;
}

function getQuestionKeywords(question) {
  const normalized = String(question || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  return dedupe(
    normalized
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length > 2 && !_STOPWORDS.has(word))
  );
}

function getResearchHeadings(page) {
  return [
    ...(page?.headings?.h1 || []),
    ...(page?.headings?.h2 || []),
    ...(page?.headings?.h3 || []),
  ]
    .map((item) => (typeof item === 'string' ? item : item?.text || ''))
    .filter(Boolean);
}

function countKeywordMatches(text, keywords) {
  return keywords.reduce((total, keyword) => total + countMatchesInText(text, keyword), 0);
}

function scoreResearchQuestion(question) {
  const normalized = String(question || '').toLowerCase();
  const extractiveSignals = [
    /\b(what|when|where|who|which|list|show|find|give|name)\b/,
    /\bhow many\b/,
    /\burl\b/,
    /\blink\b/,
  ];
  const reasoningSignals = [
    /\b(compare|comparison|versus|vs)\b/,
    /\b(summarize|summary|overview|highlights)\b/,
    /\b(analyze|analysis|reason|why|impact|implications|explain)\b/,
    /\b(recommend|best|should|strategy|plan)\b/,
    /\b(trend|trends|theme|themes|difference|differences)\b/,
  ];

  const extractiveScore = extractiveSignals.reduce((score, regex) => score + (regex.test(normalized) ? 1 : 0), 0);
  const reasoningScore = reasoningSignals.reduce((score, regex) => score + (regex.test(normalized) ? 1 : 0), 0);

  if (reasoningScore >= 2) return 'reasoning-heavy';
  if (reasoningScore === 1 || /\bhow\b/.test(normalized)) return 'mixed';
  if (extractiveScore >= 1) return 'extractive';
  return 'mixed';
}

function determineResearchStrategy(question, mode = 'auto') {
  const normalizedMode = normalizeResearchMode(mode);
  const classification = scoreResearchQuestion(question);

  if (normalizedMode === 'fast') {
    return { mode: normalizedMode, classification, routeUsed: 'fast-ai', profileName: 'fast', useAI: true };
  }
  if (normalizedMode === 'deep') {
    return { mode: normalizedMode, classification, routeUsed: 'deep-ai', profileName: 'deep', useAI: true };
  }
  if (classification === 'extractive') {
    return { mode: normalizedMode, classification, routeUsed: 'extractive', profileName: null, useAI: false };
  }
  if (classification === 'reasoning-heavy') {
    return { mode: normalizedMode, classification, routeUsed: 'reasoning-heavy', profileName: 'deep', useAI: true };
  }
  return { mode: normalizedMode, classification, routeUsed: 'mixed', profileName: 'fast', useAI: true };
}

function buildResearchSnippets(page, keywords, { snippetChars, maxSnippets }) {
  const fields = [
    page?.title || '',
    ...(page?.description ? [page.description] : []),
    ...getResearchHeadings(page),
    page?.fullText || '',
    ...((page?.links || []).map((link) => `${link.text || ''} ${link.href || ''}`.trim())),
  ].filter(Boolean);

  const snippets = [];
  for (const keyword of keywords) {
    for (const field of fields) {
      snippets.push(...extractSnippets(field, keyword, snippetChars, 2));
      if (dedupe(snippets).length >= maxSnippets) {
        return dedupe(snippets).slice(0, maxSnippets);
      }
    }
  }

  if (!snippets.length && page?.fullText) {
    return [truncateText(page.fullText.replace(/\s+/g, ' ').trim(), snippetChars)];
  }

  return dedupe(snippets).slice(0, maxSnippets);
}

function buildResearchEvidence(pages, question, profileName = 'deep') {
  const profile = getResearchProfile(profileName);
  const keywords = getQuestionKeywords(question);
  const selectedKeywords = keywords.length ? keywords.slice(0, 8) : String(question || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 4);

  const rankedPages = (pages || [])
    .map((page, index) => {
      const title = page?.title || page?.meta?.title || '';
      const headings = getResearchHeadings(page);
      const description = page?.description || page?.meta?.description || '';
      const fullText = page?.fullText || '';
      const linkBlob = ((page?.links || []).map((link) => `${link.text || ''} ${link.href || ''}`.trim()).join(' '));
      const score = (
        countKeywordMatches(title, selectedKeywords) * 6 +
        countKeywordMatches(headings.join(' '), selectedKeywords) * 4 +
        Math.min(countKeywordMatches(description, selectedKeywords), 4) * 3 +
        Math.min(countKeywordMatches(linkBlob, selectedKeywords), 4) * 2 +
        Math.min(countKeywordMatches(fullText, selectedKeywords), 12)
      );
      const snippets = buildResearchSnippets({
        ...page,
        title,
        description,
        headings: page?.headings || {},
      }, selectedKeywords, {
        snippetChars: profile.snippetChars,
        maxSnippets: profile.maxSnippets,
      });

      return {
        pageIndex: index,
        page,
        url: page?.url || page?.meta?.url || '',
        title: title || page?.url || page?.meta?.url || `Page ${index + 1}`,
        headings,
        score,
        snippets,
      };
    })
    .sort((a, b) => b.score - a.score || a.pageIndex - b.pageIndex);

  const selectedPages = rankedPages
    .filter((page) => page.score > 0 || page.pageIndex === 0)
    .slice(0, Math.max(1, profile.maxPages));

  let usedChars = 0;
  const promptPages = [];

  for (const entry of selectedPages) {
    const headingBlock = entry.headings.slice(0, profile.maxHeadings).join(' | ');
    const snippetBlock = entry.snippets.slice(0, profile.maxSnippets).join('\n- ');
    let pageText = `URL: ${entry.url}\n`;
    if (headingBlock) pageText += `Headings: ${headingBlock}\n`;
    if (snippetBlock) pageText += `Evidence:\n- ${snippetBlock}\n`;

    if (usedChars + pageText.length > profile.maxTotalChars) {
      const remaining = profile.maxTotalChars - usedChars;
      if (remaining <= 120) break;
      pageText = `${pageText.slice(0, remaining).trim()}…`;
    }

    usedChars += pageText.length;
    promptPages.push({
      url: entry.url,
      title: entry.title,
      headings: {
        h1: entry.headings.slice(0, profile.maxHeadings),
        h2: [],
      },
      fullText: pageText.trim(),
      links: entry.page?.links || [],
    });
  }

  return {
    profile,
    keywords: selectedKeywords,
    selectedPages,
    promptPages,
    publicEvidence: selectedPages.map((entry) => ({
      pageIndex: entry.pageIndex,
      url: entry.url,
      title: entry.title,
      score: entry.score,
      snippets: entry.snippets.slice(0, profile.maxSnippets),
      links: (entry.page?.links || []).slice(0, 5).map((link) => ({
        href: link.href,
        text: link.text || '',
      })),
    })),
  };
}

function enrichResearchHeadings(analysis, pages) {
  if (analysis.headings && analysis.headings.length > 0) return analysis;

  const headings = [];
  for (const page of pages || []) {
    headings.push(...getResearchHeadings(page));
  }

  return {
    ...analysis,
    headings: dedupe(headings).slice(0, 20),
  };
}

function buildExtractiveResearchAnalysis(pages, question, evidence) {
  const keywordResult = keywordExtract(pages, question);
  const matchedSearches = dedupeBy(
    evidence.keywords.flatMap((keyword) => searchSavedPages(
      pages,
      keyword,
      { limit: 3, snippetChars: evidence.profile.snippetChars }
    )),
    (item) => `${item.pageIndex}:${item.url}:${item.snippets.join('|')}`
  ).slice(0, 6);

  const linkFindings = dedupe(
    evidence.selectedPages.flatMap((entry) =>
      (entry.page?.links || [])
        .map((link) => link.text || link.href || '')
        .filter(Boolean)
    )
  ).slice(0, 5);

  const findings = dedupe([
    ...keywordResult.findings,
    ...matchedSearches.flatMap((item) => item.snippets.slice(0, 1)),
    ...linkFindings,
  ]).slice(0, 6);

  const answer = matchedSearches.length
    ? `Found ${matchedSearches.length} strongly matching sections across ${Math.min(matchedSearches.length, evidence.selectedPages.length)} page(s).`
    : keywordResult.answer;

  return {
    ...keywordResult,
    answer,
    findings,
  };
}

const GOAL_TARGET_LIBRARY = {
  deals: {
    aliases: ['deal', 'deals', 'offer', 'offers', 'promotion', 'promotions', 'promo', 'sale', 'sales', 'discount', 'clearance'],
    buckets: [
      { id: 'coupons', aliases: ['coupon', 'coupons', 'digital coupon', 'clip coupon', 'clip coupons'] },
      { id: 'cash_back', aliases: ['cash back', 'cashback'] },
      { id: 'rebates', aliases: ['rebate', 'rebates'] },
      { id: 'weekly_ads', aliases: ['weekly ad', 'weekly ads', 'flyer', 'circular'] },
    ],
  },
  docs: {
    aliases: ['docs', 'documentation', 'guide', 'guides', 'manual', 'reference', 'references', 'help', 'support', 'faq'],
    buckets: [
      { id: 'documentation', aliases: ['docs', 'documentation', 'reference', 'api reference'] },
      { id: 'guides', aliases: ['guide', 'guides', 'tutorial', 'tutorials'] },
      { id: 'support', aliases: ['support', 'help', 'faq', 'troubleshooting'] },
    ],
  },
  jobs: {
    aliases: ['job', 'jobs', 'career', 'careers', 'opening', 'openings', 'hiring', 'position', 'positions'],
    buckets: [
      { id: 'open_roles', aliases: ['jobs', 'careers', 'open positions', 'openings'] },
      { id: 'locations', aliases: ['locations', 'offices', 'remote'] },
      { id: 'benefits', aliases: ['benefits', 'perks', 'why work here'] },
    ],
  },
};

function normalizeScopeLevel(scopeLevel) {
  const normalized = normalizeInteger(scopeLevel, {
    defaultValue: 1,
    min: 1,
    max: 3,
    name: 'scopeLevel',
  });
  if (!ORIENTATION_SCOPE_LEVELS.has(normalized)) {
    throw new Error('scopeLevel must be 1, 2, or 3');
  }
  return normalized;
}

function extractPriceLimit(goal) {
  const normalized = String(goal || '').toLowerCase();
  const match = normalized.match(/(?:under|less than|max(?:imum)?|below)\s+\$?\s*(\d+(?:\.\d{1,2})?)/i)
    || normalized.match(/\$\s*(\d+(?:\.\d{1,2})?)\s+or\s+less/i);
  return match ? Number(match[1]) : null;
}

function buildGoalModel(goal) {
  const normalizedGoal = ensureNonEmptyString(goal, 'goal');
  const lowerGoal = normalizedGoal.toLowerCase();
  const keywords = getQuestionKeywords(normalizedGoal);
  const intents = [];

  Object.entries(GOAL_TARGET_LIBRARY).forEach(([intent, config]) => {
    if (config.aliases.some((alias) => lowerGoal.includes(alias))) {
      intents.push(intent);
    }
  });

  const priceLimit = extractPriceLimit(normalizedGoal);
  if (priceLimit !== null) intents.push('price_sensitive');

  const coverageTargets = [];
  intents.forEach((intent) => {
    if (intent === 'price_sensitive') {
      coverageTargets.push(
        { id: 'priced_items', aliases: ['price', '$', 'under', 'less than'] },
        { id: 'free_items', aliases: ['free', 'free to play', 'free-to-play'] },
        { id: 'sale_items', aliases: ['sale', 'discount', 'special offer', 'special offers'] },
      );
      return;
    }
    const config = GOAL_TARGET_LIBRARY[intent];
    if (config) coverageTargets.push(...config.buckets);
  });

  if (!coverageTargets.length) {
    keywords.slice(0, 8).forEach((keyword) => {
      coverageTargets.push({ id: keyword, aliases: [keyword] });
    });
  }

  return {
    goal: normalizedGoal,
    normalizedGoal: lowerGoal,
    intents: dedupe(intents),
    keywords,
    priceLimit,
    coverageTargets: dedupeBy(
      coverageTargets.map((target) => ({
        id: target.id,
        aliases: dedupe(target.aliases.map((alias) => alias.toLowerCase())),
      })),
      (target) => target.id
    ),
  };
}

function scoreGoalText(text, goalModel) {
  const normalized = cleanText(text).toLowerCase();
  if (!normalized) return { score: 0, matchedTargets: [], matchedKeywords: [] };

  let score = 0;
  const matchedTargets = new Set();
  const matchedKeywords = new Set();

  if (normalized.includes(goalModel.normalizedGoal)) score += 10;

  goalModel.coverageTargets.forEach((target) => {
    let hits = 0;
    target.aliases.forEach((alias) => {
      if (!alias) return;
      const count = countMatchesInText(normalized, alias);
      if (count > 0) {
        hits += count;
        matchedTargets.add(target.id);
      }
    });
    if (hits > 0) {
      score += 6 + Math.min(6, (hits - 1) * 2);
    }
  });

  goalModel.keywords.forEach((keyword) => {
    const count = countMatchesInText(normalized, keyword);
    if (count > 0) {
      matchedKeywords.add(keyword);
      score += Math.min(4, count);
    }
  });

  if (goalModel.priceLimit !== null) {
    if (/\$\s*\d+/.test(normalized)) score += 3;
    if (/\bfree(?:\s+to\s+play)?\b/.test(normalized)) score += 3;
    if (/\bunder\b|\bless than\b|\bmax\b/.test(normalized)) score += 2;
  }

  return {
    score,
    matchedTargets: [...matchedTargets],
    matchedKeywords: [...matchedKeywords],
  };
}

function summarizeMatchedTargets(goalModel, matchedTargetIds) {
  return matchedTargetIds
    .map((id) => goalModel.coverageTargets.find((target) => target.id === id))
    .filter(Boolean)
    .map((target) => target.id);
}

function classifyOrientationConfidence(score) {
  if (score >= 14) return 'high';
  if (score >= 8) return 'medium';
  if (score >= 4) return 'low';
  return null;
}

function guessInteractionActionType(text) {
  const normalized = cleanText(text).toLowerCase();
  if (/load more|show more|view all|see all/.test(normalized)) return 'expand';
  if (/tab|weekly ads|rebates|coupons|cash back|offers|filter|sort/.test(normalized)) return 'click';
  if (/next|previous|prev/.test(normalized)) return 'paginate';
  return 'click';
}

function parseUrlOrigin(rawUrl) {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return '';
  }
}

function getHostnameVariants(hostname) {
  const parts = String(hostname || '').split('.').filter(Boolean);
  if (parts.length <= 2) return [parts.join('.')];
  return [parts.join('.'), parts.slice(-2).join('.')];
}

function isSameSiteHost(hostA, hostB) {
  if (!hostA || !hostB) return false;
  if (hostA === hostB) return true;
  const variantsA = getHostnameVariants(hostA);
  const variantsB = getHostnameVariants(hostB);
  return variantsA.some((variantA) => variantsB.some((variantB) => variantA === variantB));
}

function isLowValueOrientationOrigin(origin, goalModel) {
  const hostname = (() => { try { return new URL(origin).hostname; } catch { return ''; } })().toLowerCase();
  if (!hostname) return true;

  if (/(analytics|doubleclick|googletagmanager|adservice|adzerk|branch\.io|facebook|instagram|linkedin|twitter|x\.com|youtube|tiktok|pinterest|snapchat)/i.test(hostname)) {
    return true;
  }

  if (goalModel?.intents?.includes('jobs')) return false;
  if (/(careers|jobs?)\./i.test(hostname)) return true;

  if (!goalModel?.intents?.includes('docs') && /(support|help|faq|kb|knowledgebase)\./i.test(hostname)) {
    return true;
  }

  if (/(investor|news(?:center)?|press|media)\./i.test(hostname)) return true;
  return false;
}

function pickRelevantOrigins(save, goalModel, startUrl) {
  const startHostname = (() => { try { return new URL(startUrl).hostname; } catch { return ''; } })();
  const ranked = new Map();
  const addOrigin = (origin, reason, score) => {
    if (!origin || origin === parseUrlOrigin(startUrl)) return;
    const existing = ranked.get(origin) || { origin, reasons: [], score: 0 };
    existing.reasons.push(reason);
    existing.score = Math.max(existing.score, score);
    ranked.set(origin, existing);
  };

  collectPageDescriptors(save).forEach((entry) => {
    (entry.page?.links || []).forEach((link) => {
      const origin = parseUrlOrigin(link.href);
      if (!origin) return;
      const textScore = scoreGoalText(`${link.text || ''} ${link.href || ''}`, goalModel);
      const sameSite = isSameSiteHost((() => { try { return new URL(origin).hostname; } catch { return ''; } })(), startHostname);
      const lowValue = isLowValueOrientationOrigin(origin, goalModel);
      if (lowValue) return;
      if (sameSite || textScore.score >= 6) {
        addOrigin(origin, `link:${cleanText(link.text || link.href)}`, sameSite ? 8 : textScore.score);
      }
    });
  });

  [
    ...(save?.apiCalls?.graphql || []),
    ...(save?.apiCalls?.rest || []),
  ].forEach((call) => {
    const origin = parseUrlOrigin(call.url);
    if (!origin) return;
    const textBlobs = [call.url, ...collectTextBlobs(call.body), ...collectTextBlobs(call.response?.body)].join(' | ');
    const score = scoreGoalText(textBlobs, goalModel).score;
    const hostname = (() => { try { return new URL(origin).hostname; } catch { return ''; } })();
    const structuralHint = /store(?:_?code|_?number|_?id)|postal(?:_?code)?|coupon|rebate|offer|deals?|flyer|publication/i.test(call.url || '');
    const sameSite = isSameSiteHost(hostname, startHostname);
    const lowValue = isLowValueOrientationOrigin(origin, goalModel);
    if (lowValue && !structuralHint) return;
    if (score >= 6 || structuralHint || sameSite) {
      addOrigin(origin, `api:${call.url}`, Math.max(score, 7));
    }
  });

  return [...ranked.values()]
    .sort((a, b) => b.score - a.score || a.origin.localeCompare(b.origin))
    .slice(0, ORIENTATION_RELATED_ORIGIN_LIMIT);
}

function orientationCandidateKey(candidate) {
  return [
    candidate.kind || '',
    cleanText(candidate.label || '').toLowerCase(),
    candidate.url || '',
    candidate.sourcePageIndex ?? '',
  ].join('|');
}

function addOrientationCandidate(target, candidate) {
  if (!candidate || !candidate.score) return;
  const confidence = classifyOrientationConfidence(candidate.score);
  if (!confidence) return;
  const key = orientationCandidateKey(candidate);
  const existing = target.get(key);
  if (!existing || existing.score < candidate.score) {
    target.set(key, {
      ...candidate,
      confidence,
      matchedTargets: summarizeMatchedTargets(candidate.goalModel || { coverageTargets: [] }, candidate.matchedTargets || []),
    });
  }
}

function buildSectionGraph(save) {
  const descriptors = collectPageDescriptors(save);
  return descriptors.map((entry) => ({
    pageIndex: entry.pageIndex,
    url: entry.url,
    title: entry.title,
    section: entry.section,
    depth: entry.depth,
    outgoingInternalLinks: dedupe(
      (entry.page?.links || [])
        .filter((link) => link.isInternal && link.href)
        .map((link) => link.href)
    ).slice(0, 15),
  }));
}

function buildOrientationCandidates(save, goalModel) {
  const candidates = new Map();
  const pageDescriptors = collectPageDescriptors(save);

  pageDescriptors.forEach((entry) => {
    const addCandidate = (partial) => {
      const scoringBlob = [partial.label, partial.url, partial.evidence].filter(Boolean).join(' | ');
      const scored = scoreGoalText(scoringBlob, goalModel);
      addOrientationCandidate(candidates, {
        sourcePageIndex: entry.pageIndex,
        sourceUrl: entry.url,
        matchedTargets: scored.matchedTargets,
        matchedKeywords: scored.matchedKeywords,
        score: (partial.baseScore || 0) + scored.score,
        goalModel,
        ...partial,
      });
    };

    addCandidate({
      kind: 'page',
      label: entry.title || entry.url || `Page ${entry.pageIndex + 1}`,
      url: entry.url,
      evidence: [entry.description, ...entry.headings.slice(0, 4)].join(' | '),
      requiresInteraction: false,
      alreadyVisited: true,
      methodHint: 'scrape_url',
      baseScore: 2,
    });

    entry.headings.forEach((heading) => {
      addCandidate({
        kind: 'section_heading',
        label: heading,
        url: entry.url,
        evidence: entry.title,
        requiresInteraction: false,
        alreadyVisited: true,
      });
    });

    (entry.page?.navigation || []).forEach((nav) => {
      (nav.items || []).forEach((item) => {
        addCandidate({
          kind: 'navigation',
          label: item.text || item.href || 'navigation item',
          url: item.href || entry.url,
          evidence: nav.ariaLabel || nav.class || entry.title,
          requiresInteraction: false,
          alreadyVisited: !!item.href && !!(save.visitedUrls || []).includes(item.href),
          methodHint: 'scrape_url',
          baseScore: 1,
        });
      });
    });

    (entry.page?.links || []).forEach((link) => {
      addCandidate({
        kind: 'link',
        label: link.text || link.href || 'link',
        url: link.href || entry.url,
        evidence: `${entry.title} | ${entry.description}`,
        requiresInteraction: false,
        alreadyVisited: !!link.href && !!(save.visitedUrls || []).includes(link.href),
        methodHint: 'scrape_url',
      });
    });

    (entry.page?.buttons || []).forEach((button) => {
      addCandidate({
        kind: 'button',
        label: button.text || button.id || 'button',
        url: entry.url,
        evidence: `${entry.title} | ${entry.description}`,
        requiresInteraction: true,
        alreadyVisited: true,
        actionType: guessInteractionActionType(button.text || button.id),
      });
    });

    (entry.page?.forms || []).forEach((form) => {
      const formLabel = cleanText([
        form.name,
        form.id,
        form.action,
        ...(form.fields || []).map((field) => field.label || field.name || field.placeholder),
      ].filter(Boolean).join(' | '));
      addCandidate({
        kind: 'form',
        label: formLabel || form.action || 'form',
        url: form.action || entry.url,
        evidence: entry.title,
        requiresInteraction: true,
        alreadyVisited: !!form.action && !!(save.visitedUrls || []).includes(form.action),
        actionType: 'submit_form',
        methodHint: form.action ? 'scrape_url' : null,
      });
    });
  });

  const apiSurface = buildApiSurface(save);
  [...(apiSurface.graphql.endpoints || []), ...(apiSurface.rest.endpoints || [])].forEach((endpoint) => {
    const score = scoreGoalText([
      endpoint.endpoint,
      endpoint.path,
      ...(endpoint.queryParamKeys || []),
      ...(endpoint.operationNames || []),
    ].join(' | '), goalModel);
    addOrientationCandidate(candidates, {
      kind: 'api',
      label: endpoint.operationNames?.[0] || endpoint.path || endpoint.endpoint,
      url: endpoint.endpoint,
      evidence: `methods=${(endpoint.methods || []).join(',')} params=${(endpoint.queryParamKeys || []).join(',')}`,
      sourcePageIndex: null,
      sourceUrl: '',
      matchedTargets: score.matchedTargets,
      matchedKeywords: score.matchedKeywords,
      score: score.score + 1,
      goalModel,
      requiresInteraction: false,
      alreadyVisited: true,
      methodHint: 'http_fetch',
    });
  });

  return [...candidates.values()]
    .map((candidate) => ({
      ...candidate,
      matchedTargets: dedupe(candidate.matchedTargets || []),
      matchedKeywords: dedupe(candidate.matchedKeywords || []),
    }))
    .sort((a, b) => b.score - a.score || String(a.label).localeCompare(String(b.label)));
}

function determineSiteType(save, goalModel) {
  const descriptor = collectPageDescriptors(save)[0];
  const blob = cleanText([
    descriptor?.title,
    descriptor?.description,
    descriptor?.url,
    ...(goalModel.intents || []),
  ].join(' | ')).toLowerCase();
  if (/(coupon|deal|rebate|weekly ad|store|product|shop|cart)/.test(blob)) return 'retail_storefront';
  if (/(docs|documentation|api|reference|guide|help)/.test(blob)) return 'documentation';
  if (/(job|career|opening|hiring)/.test(blob)) return 'careers';
  if (/(game|catalog|library|browse)/.test(blob)) return 'catalog';
  return 'general_website';
}

function buildOrientationCoverage(goalModel, relevantSections, relatedOrigins) {
  const byTarget = new Map(goalModel.coverageTargets.map((target) => [target.id, []]));
  relevantSections.forEach((section) => {
    (section.matchedTargets || []).forEach((targetId) => {
      if (byTarget.has(targetId)) byTarget.get(targetId).push(section);
    });
  });

  const found = [];
  const uncertain = [];
  const missing = [];

  for (const target of goalModel.coverageTargets) {
    const matches = byTarget.get(target.id) || [];
    if (matches.some((item) => item.confidence === 'high' || item.confidence === 'medium')) {
      found.push(target.id);
    } else if (matches.length > 0) {
      uncertain.push(target.id);
    } else {
      missing.push(target.id);
    }
  }

  const requiredCount = goalModel.coverageTargets.length;
  const foundCount = found.length;
  const uncertainCount = uncertain.length;
  const isLikelyComplete = requiredCount === 0
    ? relevantSections.some((section) => section.confidence === 'high')
    : (
        foundCount >= Math.max(1, Math.ceil(requiredCount * 0.75)) &&
        (foundCount + uncertainCount) >= requiredCount
      );

  return {
    found,
    missing,
    uncertain,
    relatedOrigins: relatedOrigins.map((entry) => ({
      origin: entry.origin,
      reasons: dedupe(entry.reasons).slice(0, 4),
      score: entry.score,
    })),
    isLikelyComplete,
  };
}

function buildOrientationRisks(aggregateSave, scopeLevel, relatedOrigins, goalModel) {
  const issues = findSiteIssues(aggregateSave);
  const risks = (issues.issues || []).slice(0, 8).map((issue) => ({
    severity: issue.severity,
    category: issue.category,
    title: issue.title,
    evidence: issue.evidence,
  }));

  if (scopeLevel === 1 && relatedOrigins.length > 0) {
    risks.push({
      severity: 'low',
      category: 'cross_origin_supporting_content',
      title: 'Relevant supporting origins were discovered',
      evidence: relatedOrigins.map((entry) => entry.origin).join(', '),
    });
  }

  if (goalModel.intents.includes('deals') && !aggregateSave.apiCalls?.rest?.length && !aggregateSave.apiCalls?.graphql?.length) {
    risks.push({
      severity: 'medium',
      category: 'missing_api_hints',
      title: 'No API hints were captured for a deals-oriented goal',
      evidence: 'The orientation run did not capture REST or GraphQL calls that could clarify structured deal data.',
    });
  }

  return dedupeBy(risks, (risk) => `${risk.category}|${risk.title}`);
}

function getOriginRelation(rawUrl, startUrl, relatedOrigins) {
  const origin = parseUrlOrigin(rawUrl);
  if (!origin) return 'unknown';
  if (origin === parseUrlOrigin(startUrl)) return 'same-origin';
  if (relatedOrigins.some((entry) => entry.origin === origin)) return 'related-origin';
  return 'cross-origin';
}

function isAllowedByScope(rawUrl, startUrl, scopeLevel, relatedOrigins, score) {
  const originRelation = getOriginRelation(rawUrl, startUrl, relatedOrigins);
  if (originRelation === 'same-origin') return true;
  if (scopeLevel === 1) return originRelation === 'related-origin';
  if (scopeLevel === 2) return originRelation === 'related-origin' || score >= 10;
  return score >= 4;
}

function formatGoalTargetLabel(target) {
  const source = cleanText(target?.aliases?.[0] || String(target?.id || '').replace(/_/g, ' '));
  return source.replace(/\b\w/g, (char) => char.toUpperCase());
}

function inferMissingGoalSections(goalModel, relevantSections) {
  const matchedTargets = new Set(relevantSections.flatMap((section) => section.matchedTargets || []));
  const anchorSections = relevantSections.filter((section) =>
    section.confidence === 'high'
    && section.url
    && section.kind !== 'api'
    && /(deal|coupon|rebate|weekly|offer|sale|discount|docs|guide|support|career|job|position|opening|price|free)/i.test(`${section.label} ${section.url}`)
  );
  const fallbackAnchor = anchorSections[0] || relevantSections.find((section) => section.url);
  if (!fallbackAnchor) return [];

  const foundTargets = goalModel.coverageTargets.filter((target) => matchedTargets.has(target.id));
  const inferredConfidence = foundTargets.length >= 2 ? 'medium' : null;
  if (!inferredConfidence) return [];

  return goalModel.coverageTargets
    .filter((target) => !matchedTargets.has(target.id))
    .map((target) => ({
      id: orientationCandidateKey({
        kind: 'inferred_section',
        label: formatGoalTargetLabel(target),
        url: fallbackAnchor.url,
        sourcePageIndex: fallbackAnchor.sourcePageIndex,
      }),
      label: formatGoalTargetLabel(target),
      kind: 'inferred_section',
      url: fallbackAnchor.url,
      sourcePageIndex: fallbackAnchor.sourcePageIndex,
      sourceUrl: fallbackAnchor.sourceUrl || fallbackAnchor.url,
      evidence: `Inferred as a likely sibling section from adjacent goal-matched sections on ${fallbackAnchor.url}.`,
      confidence: inferredConfidence,
      matchedTargets: [target.id],
      requiresInteraction: true,
      alreadyVisited: true,
      actionType: 'click',
      originRelation: fallbackAnchor.originRelation,
      score: inferredConfidence === 'medium' ? 10 : 5,
      inferred: true,
    }));
}

function buildApiHints(save, goalModel, relatedOrigins) {
  const apiSurface = buildApiSurface(save);
  const hints = [];

  [...(apiSurface.graphql.endpoints || []), ...(apiSurface.rest.endpoints || [])].forEach((endpoint) => {
    const scored = scoreGoalText([
      endpoint.endpoint,
      endpoint.path,
      ...(endpoint.operationNames || []),
      ...(endpoint.queryParamKeys || []),
    ].join(' | '), goalModel);
    const confidence = classifyOrientationConfidence(scored.score);
    const structuralHint = /(store(?:_?code|_?number|_?id)|postal(?:_?code)?|coupon|rebate|offer|deal|flyer|publication)/i.test([
      endpoint.endpoint,
      endpoint.path,
      ...(endpoint.queryParamKeys || []),
    ].join(' '));
    if (!confidence && !structuralHint) return;
    hints.push({
      endpoint: endpoint.endpoint,
      methods: endpoint.methods,
      queryParamKeys: endpoint.queryParamKeys,
      operationNames: endpoint.operationNames,
      confidence: confidence || 'low',
      originRelation: getOriginRelation(endpoint.endpoint, save.startUrl || save.options?.url || '', relatedOrigins),
      matchedTargets: summarizeMatchedTargets(goalModel, scored.matchedTargets),
    });
  });

  return hints
    .sort((a, b) => {
      const weights = { high: 3, medium: 2, low: 1 };
      return (weights[b.confidence] || 0) - (weights[a.confidence] || 0) || a.endpoint.localeCompare(b.endpoint);
    })
    .slice(0, 20);
}

function buildOrientationFromSave(save, {
  goal,
  scopeLevel = 1,
  exhaustive = false,
  includeApiHints = true,
  relatedSessionIds = [],
  followUpHistory = [],
  roundCount = 1,
  stopReason = '',
} = {}) {
  const goalModel = buildGoalModel(goal);
  const relatedOrigins = pickRelevantOrigins(save, goalModel, save.startUrl || save.options?.url || '');
  const candidates = buildOrientationCandidates(save, goalModel);
  let relevantSections = candidates
    .filter((candidate) => !candidate.requiresInteraction || candidate.kind !== 'button' || candidate.matchedTargets.length > 0)
    .slice(0, ORIENTATION_RELEVANT_SECTION_LIMIT)
    .map((candidate) => ({
      id: orientationCandidateKey(candidate),
      label: candidate.label,
      kind: candidate.kind,
      url: candidate.url || '',
      sourcePageIndex: candidate.sourcePageIndex,
      sourceUrl: candidate.sourceUrl || '',
      evidence: candidate.evidence || '',
      confidence: candidate.confidence,
      matchedTargets: candidate.matchedTargets,
      requiresInteraction: !!candidate.requiresInteraction,
      alreadyVisited: !!candidate.alreadyVisited,
      actionType: candidate.actionType || null,
      originRelation: getOriginRelation(candidate.url || candidate.sourceUrl || '', save.startUrl || save.options?.url || '', relatedOrigins),
      score: candidate.score,
    }));

  relevantSections = dedupeBy(
    [...relevantSections, ...inferMissingGoalSections(goalModel, relevantSections)]
      .sort((a, b) => b.score - a.score || String(a.label).localeCompare(String(b.label))),
    (section) => [
      section.kind,
      cleanText(section.label || '').toLowerCase(),
      section.url || '',
      section.actionType || '',
    ].join('|')
  ).slice(0, ORIENTATION_RELEVANT_SECTION_LIMIT);

  const candidateInteractions = relevantSections
    .filter((candidate) => candidate.requiresInteraction)
    .slice(0, ORIENTATION_INTERACTION_LIMIT)
    .map((candidate) => ({
      actionType: candidate.actionType || guessInteractionActionType(candidate.label),
      targetLabel: candidate.label,
      reason: candidate.evidence || 'Matched the requested goal terms.',
      priority: candidate.confidence,
      sourcePageIndex: candidate.sourcePageIndex,
      sourceUrl: candidate.sourceUrl,
    }));

  const recommendedScrapes = dedupeBy(
    relevantSections
      .filter((candidate) => candidate.url)
      .filter((candidate) => isAllowedByScope(
        candidate.url,
        save.startUrl || save.options?.url || '',
        scopeLevel,
        relatedOrigins,
        candidate.score
      ))
      .map((candidate) => ({
        purpose: candidate.matchedTargets.length ? candidate.matchedTargets.join(', ') : candidate.label,
        url: candidate.url,
        why: candidate.evidence || candidate.label,
        methodHint: candidate.kind === 'api' ? 'http_fetch' : 'scrape_url',
        priority: candidate.confidence,
        requiresInteraction: candidate.requiresInteraction,
        alreadyVisited: candidate.alreadyVisited,
        originRelation: candidate.originRelation,
        sourcePageIndex: candidate.sourcePageIndex,
        sourceUrl: candidate.sourceUrl,
      }))
      .sort((a, b) => {
        const weights = { high: 3, medium: 2, low: 1 };
        return (weights[b.priority] || 0) - (weights[a.priority] || 0) || String(a.url).localeCompare(String(b.url));
      }),
    (candidate) => `${candidate.methodHint}|${candidate.url}|${candidate.purpose}`
  ).slice(0, ORIENTATION_RECOMMENDED_SCRAPE_LIMIT);

  const coverage = buildOrientationCoverage(goalModel, relevantSections, relatedOrigins);
  const siteType = determineSiteType(save, goalModel);
  const apiHints = includeApiHints ? buildApiHints(save, goalModel, relatedOrigins) : [];
  const risks = buildOrientationRisks(save, scopeLevel, relatedOrigins, goalModel);
  const sectionGraph = buildSectionGraph(save);
  const summary = `Mapped ${relevantSections.length} relevant sections across ${save.pages?.length || 0} page(s) for goal "${goal}".`;

  return {
    sessionId: save.sessionId || '',
    goal,
    summary,
    siteType,
    scopeLevelUsed: scopeLevel,
    exhaustive: !!exhaustive,
    relevantSections,
    candidateInteractions,
    recommendedScrapes,
    apiHints,
    coverage,
    risks,
    stopReason,
    relatedSessionIds: dedupe(relatedSessionIds),
    interactionHistory: followUpHistory,
    roundCount,
    sectionGraph,
    generatedAt: new Date().toISOString(),
  };
}

function mergeScrapeResults(primarySave, additionalSaves = []) {
  const saves = [primarySave, ...additionalSaves].filter(Boolean).map(normalizeCompletedScrapeResult);
  if (!saves.length) return null;
  const base = saves[0];

  return {
    ...base,
    visitedUrls: dedupe(saves.flatMap((save) => save.visitedUrls || [])),
    pages: dedupeBy(
      saves.flatMap((save) => save.pages || []),
      (page) => page?.meta?.url || page?.url || JSON.stringify(page?.meta || {})
    ),
    apiCalls: {
      graphql: dedupeBy(
        saves.flatMap((save) => save.apiCalls?.graphql || []),
        (call) => `${call.method || 'GET'}|${call.url || ''}|${JSON.stringify(call.body || '')}`
      ),
      rest: dedupeBy(
        saves.flatMap((save) => save.apiCalls?.rest || []),
        (call) => `${call.method || 'GET'}|${call.url || ''}|${JSON.stringify(call.body || '')}`
      ),
    },
    assets: dedupeBy(
      saves.flatMap((save) => save.assets || []),
      (asset) => `${asset.url || asset.src || ''}|${asset.type || ''}`
    ),
    downloadedImages: dedupeBy(
      saves.flatMap((save) => save.downloadedImages || []),
      (image) => image.src || JSON.stringify(image)
    ),
    cookies: dedupeBy(
      saves.flatMap((save) => save.cookies || []),
      (cookie) => `${cookie.name || ''}|${cookie.domain || ''}|${cookie.path || ''}`
    ),
    consoleLogs: dedupeBy(
      saves.flatMap((save) => save.consoleLogs || []),
      (entry) => `${entry.type || ''}|${entry.text || entry.message || ''}`
    ),
    errors: dedupeBy(
      saves.flatMap((save) => save.errors || []),
      (entry) => `${entry.message || entry.text || ''}|${entry.stack || ''}`
    ),
    websockets: dedupeBy(
      saves.flatMap((save) => save.websockets || []),
      (entry) => `${entry.url || ''}|${entry.timestamp || ''}`
    ),
    failedPages: dedupeBy(
      saves.flatMap((save) => save.failedPages || []),
      (entry) => `${entry.url || ''}|${entry.reason || ''}`
    ),
  };
}

function countNewRelevantSections(previousOrientation, nextOrientation) {
  const previousKeys = new Set((previousOrientation?.relevantSections || []).map((section) => section.id));
  return (nextOrientation?.relevantSections || []).filter((section) => !previousKeys.has(section.id)).length;
}

function selectOrientationFollowUps(orientation, {
  attemptedUrls,
  scopeLevel,
  startUrl,
}) {
  const relatedOrigins = orientation.coverage?.relatedOrigins || [];
  return (orientation.recommendedScrapes || [])
    .filter((candidate) => candidate.methodHint === 'scrape_url')
    .filter((candidate) => !candidate.alreadyVisited)
    .filter((candidate) => !attemptedUrls.has(candidate.url))
    .filter((candidate) => isAllowedByScope(candidate.url, startUrl, scopeLevel, relatedOrigins, candidate.priority === 'high' ? 14 : candidate.priority === 'medium' ? 8 : 4))
    .sort((a, b) => {
      const weights = { high: 3, medium: 2, low: 1 };
      return (weights[b.priority] || 0) - (weights[a.priority] || 0) || String(a.url).localeCompare(String(b.url));
    });
}

function shouldStopOrientationRun(orientation, {
  exhaustive,
  staleRounds,
  pendingFollowUps,
  newRelevantSections,
}) {
  if (exhaustive) {
    return staleRounds >= 2 && pendingFollowUps === 0 && newRelevantSections === 0;
  }
  if (orientation.coverage?.isLikelyComplete && pendingFollowUps === 0) return true;
  return orientation.coverage?.isLikelyComplete && staleRounds >= 1 && newRelevantSections === 0;
}

function persistOrientationArtifact(sessionId, orientation) {
  const normalizedSessionId = ensureNonEmptyString(sessionId, 'sessionId');
  const file = path.join(SAVES_DIR, `${normalizedSessionId}.json`);
  if (!fs.existsSync(file)) return;
  const save = JSON.parse(fs.readFileSync(file, 'utf8'));
  save.orientation = orientation;
  save.lastSavedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(save, null, 2));
  clearCachedSave(normalizedSessionId);
}

async function mapSiteForGoal({
  url,
  goal,
  scopeLevel = 1,
  exhaustive = false,
  includeApiHints = true,
  maxRounds = undefined,
  username = undefined,
  password = undefined,
  totpSecret = undefined,
  ssoProvider = undefined,
  _onProgress = null,
}) {
  const normalizedUrl = ensureNonEmptyString(url, 'url');
  const normalizedGoal = ensureNonEmptyString(goal, 'goal');
  const normalizedScopeLevel = normalizeScopeLevel(scopeLevel);
  const attemptedUrls = new Set([normalizedUrl]);
  const relatedSessionIds = [];
  const additionalSaves = [];
  const baseLimit = exhaustive ? ORIENTATION_MAX_EXHAUSTIVE_ROUNDS : ORIENTATION_MAX_ROUNDS;
  const roundLimit = typeof maxRounds === 'number' ? Math.min(baseLimit, maxRounds) : baseLimit;
  const batchSize = exhaustive ? ORIENTATION_FOLLOWUP_EXHAUSTIVE_BATCH_SIZE : ORIENTATION_FOLLOWUP_BATCH_SIZE;
  const followUpHistory = [];

  const { sessionId, result } = await startScrapeAndWait({
    url: normalizedUrl,
    fullCrawl: false,
    maxPages: ORIENTATION_SEED_PAGE_COUNT,
    captureGraphQL: true,
    captureREST: true,
    captureAssets: false,
    captureImages: false,
    autoScroll: true,
    captureDropdowns: true,
    scrapeDepth: 0,
    showBrowser: false,
    liveView: false,
    ...(username  ? { hasAuth: true, username } : {}),
    ...(password  ? { password } : {}),
    ...(totpSecret  ? { totpSecret } : {}),
    ...(ssoProvider ? { ssoProvider } : {}),
  }, { timeoutMs: 10 * 60 * 1000 });

  let previousOrientation = null;
  let staleRounds = 0;
  let stopReason = 'Initial orientation crawl complete.';

  for (let round = 1; round <= roundLimit; round++) {
    const aggregate = mergeScrapeResults(result, additionalSaves);
    const orientation = buildOrientationFromSave(aggregate, {
      goal: normalizedGoal,
      scopeLevel: normalizedScopeLevel,
      exhaustive,
      includeApiHints,
      relatedSessionIds,
      followUpHistory,
      roundCount: round,
      stopReason,
    });

    const followUps = selectOrientationFollowUps(orientation, {
      attemptedUrls,
      scopeLevel: normalizedScopeLevel,
      startUrl: normalizedUrl,
    });

    const newRelevantSections = countNewRelevantSections(previousOrientation, orientation);
    if (newRelevantSections === 0) staleRounds += 1;
    else staleRounds = 0;

    if (shouldStopOrientationRun(orientation, {
      exhaustive,
      staleRounds,
      pendingFollowUps: followUps.length,
      newRelevantSections,
    })) {
      stopReason = orientation.coverage?.isLikelyComplete
        ? 'Goal coverage looked complete and new discoveries flattened out.'
        : 'No new high-value sections were found in recent rounds.';
      const finalOrientation = {
        ...orientation,
        stopReason,
      };
      persistOrientationArtifact(sessionId, finalOrientation);
      return finalOrientation;
    }

    if (!followUps.length) {
      stopReason = orientation.coverage?.isLikelyComplete
        ? 'No additional follow-up pages were needed.'
        : 'No additional goal-relevant follow-up pages were discovered within the selected scope.';
      const finalOrientation = {
        ...orientation,
        stopReason,
      };
      persistOrientationArtifact(sessionId, finalOrientation);
      return finalOrientation;
    }

    const nextCandidates = followUps.slice(0, batchSize);
    const nextUrls = nextCandidates.map((candidate) => candidate.url);
    nextUrls.forEach((candidateUrl) => attemptedUrls.add(candidateUrl));
    followUpHistory.push({
      round,
      urls: nextUrls,
      reasons: nextCandidates.map((candidate) => ({
        url: candidate.url,
        purpose: candidate.purpose,
        priority: candidate.priority,
        originRelation: candidate.originRelation,
        requiresInteraction: candidate.requiresInteraction,
      })),
    });

    const { sessionId: followUpSessionId, result: followUpResult } = await startScrapeAndWait({
      urls: nextUrls,
      captureGraphQL: true,
      captureREST: true,
      captureAssets: false,
      captureImages: false,
      autoScroll: true,
      captureDropdowns: true,
      scrapeDepth: 1,
      showBrowser: false,
      liveView: false,
      maxPages: nextUrls.length,
      ...(username  ? { hasAuth: true, username } : {}),
      ...(password  ? { password } : {}),
      ...(totpSecret  ? { totpSecret } : {}),
      ...(ssoProvider ? { ssoProvider } : {}),
    }, { timeoutMs: 5 * 60 * 1000 });

    relatedSessionIds.push(followUpSessionId);
    additionalSaves.push(followUpResult);
    stopReason = `Expanded to ${nextUrls.length} follow-up page(s) in round ${round}.`;
    if (_onProgress) _onProgress(round, roundLimit, `Round ${round}/${roundLimit}: explored ${nextUrls.length} page(s)`);
    previousOrientation = orientation;
  }

  const fallbackOrientation = buildOrientationFromSave(mergeScrapeResults(result, additionalSaves), {
    goal: normalizedGoal,
    scopeLevel: normalizedScopeLevel,
    exhaustive,
    includeApiHints,
    relatedSessionIds,
    followUpHistory,
    roundCount: roundLimit,
    stopReason: 'Stopped after reaching the internal emergency exploration ceiling.',
  });
  persistOrientationArtifact(sessionId, fallbackOrientation);
  return fallbackOrientation;
}

const HTTP_AGENTS = {
  'http:': new http.Agent({ keepAlive: true, maxSockets: 16 }),
  'https:': new https.Agent({ keepAlive: true, maxSockets: 16 }),
};

const saveCache = new Map();

// ── HTTP helpers ────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateText(value, maxChars = MAX_PREVIEW_CHARS) {
  const text = typeof value === 'string'
    ? value
    : value == null
      ? ''
      : JSON.stringify(value);

  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}

function parseResponseBody(data) {
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const transport = url.protocol === 'https:' ? https : http;
    const payload = body == null ? null : JSON.stringify(body);

    const options = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 3000),
      path: url.pathname + url.search,
      method,
      agent: HTTP_AGENTS[url.protocol],
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
      },
    };

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: parseResponseBody(data),
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function get(p)        { return request('GET', p, null); }
function post(p, body) { return request('POST', p, body); }
function del(p)        { return request('DELETE', p, null); }

// ── Wait for scrape completion over WebSocket ───────────────────────────────

function waitForScrapeOverWebSocket(sessionId, timeoutMs = SCRAPE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`Scrape timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    ws.on('error', (err) => { clearTimeout(timer); reject(err); });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.sessionId !== sessionId) return;

      if (msg.type === 'complete') {
        clearTimeout(timer); ws.close(); resolve(msg.data);
      } else if (msg.type === 'stopped') {
        clearTimeout(timer); ws.close();
        reject(new Error(msg.message || 'Scrape stopped before completion'));
      } else if (msg.type === 'error') {
        clearTimeout(timer); ws.close();
        reject(new Error(msg.message || 'Scrape failed'));
      }
    });
  });
}

function normalizeSaveStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function normalizeCompletedScrapeResult(result) {
  if (!result || typeof result !== 'object') return result;
  if (result.meta?.scrapedAt || result.siteInfo || result.apiCalls?.all) return result;

  const pages = Array.isArray(result.pages) ? result.pages : [];
  const graphql = result.apiCalls?.graphql || [];
  const rest = result.apiCalls?.rest || [];
  const assets = result.assets || [];
  const cookies = result.cookies || [];
  const failedPages = result.failedPages || [];
  const startUrl = result.startUrl || result.options?.url || '';
  const firstPage = pages[0] || null;

  return {
    sessionId: result.sessionId || result.id || '',
    status: result.status || 'complete',
    startUrl,
    options: result.options || (startUrl ? { url: startUrl } : {}),
    meta: {
      scrapedAt: result.lastSavedAt || result.startedAt || '',
      targetUrl: startUrl,
      totalPages: pages.length,
      totalGraphQLCalls: graphql.length,
      totalRESTCalls: rest.length,
      totalAllRequests: result.apiCalls?.all?.length || 0,
      totalAssets: assets.length,
      totalWebSockets: (result.websockets || []).length,
      totalImages: firstPage?.images?.length || 0,
      totalDownloadedImages: (result.downloadedImages || []).length,
      totalConsoleLogs: (result.consoleLogs || []).length,
      totalErrors: (result.errors || []).length,
      totalFailedPages: failedPages.length,
    },
    siteInfo: {
      title: firstPage?.meta?.title || firstPage?.title || startUrl,
      origin: startUrl,
      hasLoginForm: false,
    },
    visitedUrls: result.visitedUrls || pages.map((page) => page.meta?.url || page.url).filter(Boolean),
    failedPages,
    pages,
    apiCalls: {
      graphql,
      rest,
      all: result.apiCalls?.all || [],
    },
    assets,
    downloadedImages: result.downloadedImages || [],
    websockets: result.websockets || [],
    cookies,
    securityHeaders: result.securityHeaders || {},
    consoleLogs: result.consoleLogs || [],
    errors: result.errors || [],
  };
}

function toResearchPage(page) {
  if (!page || typeof page !== 'object') return null;
  const url = page.meta?.url || page.url || '';
  return {
    url,
    title: page.meta?.title || page.title || url,
    description: page.meta?.description || page.description || '',
    fullText: page.fullText || '',
    headings: page.headings || {},
    links: page.links || [],
  };
}

async function analyzeResearchQuestion(pages, question, {
  mode = 'auto',
  includeEvidence = false,
  // Dependency-injected AI implementation — used by tests to mock or override.
  // When null/undefined the function falls back to analyzeWithAI (real backend).
  analyzeWithAIImpl,
} = {}) {
  const strategy = determineResearchStrategy(question, mode);
  const evidence = buildResearchEvidence(
    pages,
    question,
    strategy.profileName || 'fast'
  );

  // Skip AI call for pure extractive routes (fast, keyword-only queries)
  if (!strategy.useAI) {
    const analysis = buildExtractiveResearchAnalysis(pages, question, evidence);
    const enrichedAnalysis = enrichResearchHeadings(analysis, pages);
    return {
      ...enrichedAnalysis,
      routeUsed: strategy.routeUsed,
      modelUsed: null,
      analysisMethod: 'keyword-extraction',
      ...(includeEvidence ? { evidence: evidence.publicEvidence } : {}),
    };
  }

  // Try the AI backend (real or injected mock)
  const aiFn = typeof analyzeWithAIImpl === 'function' ? analyzeWithAIImpl : analyzeWithAI;
  const contextText = evidence.promptPages
    .map((p) => `URL: ${p.url}\nTitle: ${p.title}\n${p.fullText}`.slice(0, 2000))
    .join('\n\n---\n\n');
  const systemPrompt = 'You are a research assistant. Answer the user\'s question using only the provided page content. Be concise and factual.';
  const userPrompt = `Question: ${question}\n\nPage content:\n${contextText}`;

  let aiReply = null;
  try {
    aiReply = await aiFn(systemPrompt, userPrompt);
  } catch { /* fall through to keyword extraction */ }

  if (aiReply) {
    return {
      answer: aiReply,
      routeUsed: strategy.routeUsed,
      modelUsed: AI_ANALYSIS_MODEL,
      analysisMethod: 'ai-backend',
      ...(includeEvidence ? { evidence: evidence.publicEvidence } : {}),
    };
  }

  // AI unavailable or returned null — fall back to keyword extraction
  const analysis = buildExtractiveResearchAnalysis(pages, question, evidence);
  const enrichedAnalysis = enrichResearchHeadings(analysis, pages);
  return {
    ...enrichedAnalysis,
    routeUsed: strategy.routeUsed,
    modelUsed: null,
    analysisMethod: 'keyword-extraction',
    ...(includeEvidence ? { evidence: evidence.publicEvidence } : {}),
  };
}

async function waitForSavedScrape(sessionId, timeoutMs = SCRAPE_TIMEOUT_MS, onProgress = null) {
  const startedAt = Date.now();
  let lastPageCount = 0;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const save = await loadSave(sessionId, { fresh: true });
      const status = normalizeSaveStatus(save.status);

      if (onProgress) {
        const pages = save.pages?.length || 0;
        if (pages !== lastPageCount) {
          lastPageCount = pages;
          const total = save.options?.maxPages || pages + 1;
          onProgress(pages, total);
        }
      }

      if (!TERMINAL_SAVE_STATUSES.has(status)) {
        await sleep(SAVE_POLL_INTERVAL_MS);
        continue;
      }

      if (COMPLETE_SAVE_STATUSES.has(status)) {
        return normalizeCompletedScrapeResult(save);
      }

      if (status === 'stopped') {
        throw new Error('Scrape stopped before completion');
      }

      const failureReason = save.lastError
        || save.errors?.[save.errors.length - 1]?.message
        || save.failedPages?.[save.failedPages.length - 1]?.reason
        || 'Scrape failed';
      throw new Error(failureReason);
    } catch (err) {
      if (!String(err.message || '').includes('Save not found')) {
        throw err;
      }
    }

    await sleep(SAVE_POLL_INTERVAL_MS);
  }

  throw new Error(`Scrape timed out after ${timeoutMs / 1000}s`);
}

async function waitForScrape(sessionId, timeoutMs = SCRAPE_TIMEOUT_MS, onProgress = null) {
  try {
    return await Promise.any([
      waitForScrapeOverWebSocket(sessionId, timeoutMs),
      waitForSavedScrape(sessionId, timeoutMs, onProgress),
    ]);
  } catch (err) {
    const message = err?.errors?.[0]?.message || err.message || 'Scrape failed';
    throw new Error(message);
  }
}

function ensureNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeInteger(value, {
  defaultValue,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  name,
}) {
  if (value === undefined || value === null || value === '') return defaultValue;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number`);
  }

  const normalized = Math.trunc(parsed);
  if (normalized < min || normalized > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }

  return normalized;
}

function dedupe(values) {
  return [...new Set((values || []).filter(Boolean))];
}

async function expectOk(response, fallbackMessage) {
  if (response.status >= 200 && response.status < 300) return response.body;
  const errorMessage = response.body?.error || response.body?.message || fallbackMessage || `HTTP ${response.status}`;
  throw new Error(errorMessage);
}

function clearCachedSave(sessionId) {
  if (sessionId) saveCache.delete(sessionId);
}

async function loadSave(sessionId, { fresh = false } = {}) {
  const normalizedSessionId = ensureNonEmptyString(sessionId, 'sessionId');
  const cached = saveCache.get(normalizedSessionId);

  if (!fresh && cached && (Date.now() - cached.cachedAt) < SAVE_CACHE_TTL_MS) {
    return cached.value;
  }

  const body = await expectOk(
    await get(`/api/saves/${encodeURIComponent(normalizedSessionId)}`),
    'Save not found'
  );

  saveCache.set(normalizedSessionId, {
    cachedAt: Date.now(),
    value: body,
  });

  return body;
}

async function loadSavedPage(sessionId, pageIndex = 0) {
  const save = await loadSave(sessionId);
  const normalizedPageIndex = normalizeInteger(pageIndex, {
    defaultValue: 0,
    min: 0,
    max: 100000,
    name: 'pageIndex',
  });
  const page = save.pages?.[normalizedPageIndex];

  if (!page) {
    throw new Error(`Page index ${normalizedPageIndex} not found (total: ${save.pages?.length ?? 0})`);
  }

  return { save, page, pageIndex: normalizedPageIndex };
}

async function startScrapeAndWait(scrapeOptions, { timeoutMs = SCRAPE_TIMEOUT_MS, onProgress = null } = {}) {
  const requestBody = {
    ...scrapeOptions,
    uiVisible: false,
    initiatedBy: 'mcp',
  };
  const body = await expectOk(
    await post('/api/scrape', requestBody),
    'Failed to start scrape'
  );

  const sessionId = ensureNonEmptyString(body.sessionId, 'sessionId');
  const completedResult = await waitForScrape(sessionId, timeoutMs, onProgress);
  const result = normalizeCompletedScrapeResult({
    ...completedResult,
    sessionId,
    startUrl: completedResult?.startUrl || completedResult?.options?.url || scrapeOptions.url || scrapeOptions.urls?.[0] || '',
    options: completedResult?.options || scrapeOptions,
  });
  clearCachedSave(sessionId);
  return { sessionId, result };
}

// ── Result summarisation ────────────────────────────────────────────────────

function summarisePage(page, textLimit) {
  if (!page) return null;
  return {
    url: page.meta?.url || page.url || '',
    title: page.meta?.title || '',
    description: page.meta?.description || '',
    headings: {
      h1: (page.headings?.h1 || []).map(h => h.text || h),
      h2: (page.headings?.h2 || []).map(h => h.text || h),
    },
    fullText: (page.fullText || '').slice(0, textLimit),
    links: (page.links || []).slice(0, 50).map(l => ({ href: l.href, text: l.text })),
    entities: page.entities || {},
    tech: page.tech || {},
    forms: (page.forms || []).map(f => ({
      id: f.id, action: f.action, method: f.method,
      fields: (f.fields || []).map(x => x.name),
    })),
    structuredData: {
      jsonLD:      page.meta?.jsonLD      || [],
      openGraph:   page.meta?.ogTags      || {},
      twitterCard: page.meta?.twitterTags || {},
    },
  };
}

function summariseResult(result) {
  const normalizedResult = normalizeCompletedScrapeResult(result);
  const pages = (normalizedResult.pages || []).map(p => summarisePage(p, MAX_TEXT_CHARS));
  const graphqlCalls = (normalizedResult.apiCalls?.graphql || []).slice(0, 20).map(c => ({
    url: c.url, method: c.method,
    body: truncateText(c.body, MAX_PREVIEW_CHARS),
    responseStatus: c.response?.status,
    responsePreview: truncateText(c.response?.body, MAX_PREVIEW_CHARS),
  }));
  const restCalls = (normalizedResult.apiCalls?.rest || []).slice(0, 20).map(c => ({
    url: c.url, method: c.method, statusCode: c.statusCode,
  }));

  return {
    sessionId: normalizedResult.meta?.sessionId || normalizedResult.sessionId || '',
    url: normalizedResult.meta?.targetUrl || normalizedResult.siteInfo?.origin || '',
    scrapedAt: normalizedResult.meta?.scrapedAt || '',
    pagesScraped: normalizedResult.meta?.totalPages || pages.length,
    graphqlCallsCount: normalizedResult.meta?.totalGraphQLCalls || graphqlCalls.length,
    restCallsCount: normalizedResult.meta?.totalRESTCalls || restCalls.length,
    pages,
    graphqlCalls,
    restCalls,
    cookies: (normalizedResult.cookies || []).map(c => ({ name: c.name, domain: c.domain })),
    securityHeaders: normalizedResult.securityHeaders || {},
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function humanizeToolName(name) {
  return String(name || '')
    .split('_')
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(' ');
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  const output = [];
  for (const item of items || []) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function countMatchesInText(text, query) {
  const normalized = typeof text === 'string' ? text : '';
  if (!normalized) return 0;
  const matches = normalized.match(new RegExp(escapeRegExp(query), 'gi'));
  return matches ? matches.length : 0;
}

function extractSnippets(text, query, snippetChars = 160, maxSnippets = 3) {
  const normalized = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  if (!normalized) return [];

  const snippets = [];
  const queryRe = new RegExp(escapeRegExp(query), 'gi');
  let match;
  while ((match = queryRe.exec(normalized)) !== null) {
    const half = Math.max(20, Math.floor(snippetChars / 2));
    const start = Math.max(0, match.index - half);
    const end = Math.min(normalized.length, match.index + match[0].length + half);
    let snippet = normalized.slice(start, end).trim();
    if (start > 0) snippet = `…${snippet}`;
    if (end < normalized.length) snippet = `${snippet}…`;
    if (!snippets.includes(snippet)) snippets.push(snippet);
    if (snippets.length >= maxSnippets) break;
    if (match[0].length === 0) queryRe.lastIndex += 1;
  }
  return snippets;
}

function searchSavedPages(pages, query, { limit = 20, snippetChars = 160 } = {}) {
  const normalizedQuery = ensureNonEmptyString(query, 'query');
  const safeLimit = normalizeInteger(limit, {
    defaultValue: 20,
    min: 1,
    max: 100,
    name: 'limit',
  });
  const safeSnippetChars = normalizeInteger(snippetChars, {
    defaultValue: 160,
    min: 40,
    max: 500,
    name: 'snippetChars',
  });

  const results = [];
  (pages || []).forEach((page, pageIndex) => {
    const title = page.meta?.title || '';
    const description = page.meta?.description || '';
    const headingTexts = [
      ...(page.headings?.h1 || []).map((item) => item.text || item),
      ...(page.headings?.h2 || []).map((item) => item.text || item),
      ...(page.headings?.h3 || []).map((item) => item.text || item),
    ].filter(Boolean);
    const searchableFields = [title, description, ...headingTexts, page.fullText || ''];
    const matchCount = searchableFields.reduce((total, field) => total + countMatchesInText(field, normalizedQuery), 0);
    if (!matchCount) return;

    const snippets = dedupeBy(
      searchableFields.flatMap((field) => extractSnippets(field, normalizedQuery, safeSnippetChars)),
      (snippet) => snippet
    ).slice(0, 5);

    results.push({
      pageIndex,
      url: page.meta?.url || page.url || '',
      title,
      matchCount,
      snippets,
    });
  });

  return results
    .sort((a, b) => b.matchCount - a.matchCount || a.pageIndex - b.pageIndex)
    .slice(0, safeLimit);
}

function simplifyApiCalls(save, type = 'all', limit = 100) {
  const safeLimit = normalizeInteger(limit, {
    defaultValue: 100,
    min: 1,
    max: 250,
    name: 'limit',
  });
  const apiCalls = save.apiCalls || {};
  const result = { counts: {
    graphql: (apiCalls.graphql || []).length,
    rest: (apiCalls.rest || []).length,
  } };

  if (type === 'graphql' || type === 'all') {
    result.graphql = (apiCalls.graphql || []).slice(0, safeLimit).map((call) => ({
      url: call.url,
      method: call.method,
      body: truncateText(call.body, MAX_API_RESPONSE_CHARS),
      responseStatus: call.response?.status,
      responseBody: truncateText(call.response?.body, MAX_API_RESPONSE_CHARS),
      timestamp: call.timestamp,
    }));
  }

  if (type === 'rest' || type === 'all') {
    result.rest = (apiCalls.rest || []).slice(0, safeLimit).map((call) => ({
      url: call.url,
      method: call.method,
      statusCode: call.statusCode,
      responseBody: truncateText(call.response?.body, MAX_PREVIEW_CHARS),
      timestamp: call.timestamp,
    }));
  }

  return result;
}

function summariseSaveMetadata(save) {
  return {
    sessionId: save.sessionId,
    url: save.startUrl || save.options?.url || '',
    scrapedAt: save.startedAt || '',
    lastSavedAt: save.lastSavedAt || '',
    status: save.status || '',
    pageCount: save.pageCount ?? save.pages?.length ?? 0,
    hasOrientation: !!save.orientation,
    failedPageCount: save.failedPages?.length || 0,
    graphqlCallCount: save.graphqlCallCount ?? save.apiCalls?.graphql?.length ?? 0,
    restCallCount: save.restCallCount ?? save.apiCalls?.rest?.length ?? 0,
  };
}

function summariseSaveResource(save) {
  return {
    ...summariseSaveMetadata(save),
    options: save.options || {},
    visitedUrlCount: save.visitedUrls?.length || 0,
    pages: (save.pages || []).map((page, pageIndex) => ({
      pageIndex,
      url: page.meta?.url || '',
      title: page.meta?.title || '',
      description: page.meta?.description || '',
      headingCounts: {
        h1: (page.headings?.h1 || []).length,
        h2: (page.headings?.h2 || []).length,
      },
      linkCount: (page.links || []).length,
      formCount: (page.forms || []).length,
      imageCount: (page.images || []).length,
      tech: page.tech || {},
    })),
  };
}

function summarizeCookieMetadata(cookies) {
  const safeCookies = Array.isArray(cookies) ? cookies : [];
  const sameSite = {};
  for (const cookie of safeCookies) {
    const key = cookie.sameSite || 'unknown';
    sameSite[key] = (sameSite[key] || 0) + 1;
  }

  return {
    total: safeCookies.length,
    domains: dedupe(safeCookies.map((cookie) => cookie.domain)).slice(0, 25),
    names: dedupe(safeCookies.map((cookie) => cookie.name)).slice(0, 50),
    secureCount: safeCookies.filter((cookie) => cookie.secure).length,
    httpOnlyCount: safeCookies.filter((cookie) => cookie.httpOnly).length,
    sameSite,
  };
}

const STORE_PARAM_RE = /(?:store(?:_?number|_?code|_?id)?|location(?:_?id)?|merchant_store_code)$/i;
const POSTAL_PARAM_RE = /(?:postal(?:_?code)?|zip(?:_?code)?|postcode)$/i;
const DEAL_TRIGGER_RE = /\b(?:deal|deals|sale|coupon|save|saved|offer|offers|promo|promotion|special|bogo|buy one|get one|digital coupon|clearance|markdown|discount|off|for)\b/i;
const PRICE_RE = /\$[\d,]+(?:\.\d{2})?/g;
const AUTH_LEAK_RE = /\b(?:session timeout|sign in again|token expired|not authorized|unauthorized|access denied|authentication required|login required)\b/i;
const BUSINESS_HOURS_RE = /\b\d{1,2}:\d{2}\s?(?:AM|PM)\s*-\s*\d{1,2}:\d{2}\s?(?:AM|PM)\b|\b\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\b/g;
const STREET_ADDRESS_RE = /\b\d{1,6}\s+[A-Za-z0-9.'#-]+(?:\s+[A-Za-z0-9.'#-]+){0,6},\s*[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g;
const STORE_NUMBER_PATTERNS = [
  /\bstore\s*(?:#|number|code)?\s*[:#-]?\s*(\d{3,6})\b/gi,
  /\bmerchant_store_code\s*[:=]\s*"?(\d{3,6})"?/gi,
  /\/store\/(?:info|details|directory)\/(\d{3,6})(?:\/|$)/gi,
];
const DATE_LIKE_RE = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b|\b\d{4}[/-]\d{2}[/-]\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g;

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getPageHeadingTexts(page) {
  return [
    ...(page?.headings?.h1 || []),
    ...(page?.headings?.h2 || []),
    ...(page?.headings?.h3 || []),
  ]
    .map((heading) => cleanText(heading?.text || heading))
    .filter(Boolean);
}

function getPageSection(url) {
  try {
    return new URL(url).pathname.split('/').filter(Boolean)[0] || '(root)';
  } catch {
    return '(root)';
  }
}

function getPageDepth(url) {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).length;
  } catch {
    return 0;
  }
}

function collectTextBlobs(value, output = [], depth = 0) {
  if (value == null || depth > 4 || output.length > 200) return output;

  if (typeof value === 'string') {
    const normalized = cleanText(value);
    if (normalized) output.push(normalized);
    return output;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    output.push(String(value));
    return output;
  }

  if (Array.isArray(value)) {
    value.slice(0, 40).forEach((entry) => collectTextBlobs(entry, output, depth + 1));
    return output;
  }

  if (typeof value === 'object') {
    const preferredKeys = ['title', 'name', 'description', 'offer', 'promotion', 'label', 'text', 'subtitle', 'price'];
    const summary = preferredKeys
      .filter((key) => Object.prototype.hasOwnProperty.call(value, key))
      .map((key) => cleanText(value[key]))
      .filter(Boolean);
    if (summary.length) output.push(summary.join(' | '));
    Object.entries(value).slice(0, 30).forEach(([, entry]) => collectTextBlobs(entry, output, depth + 1));
  }

  return output;
}

function collectPageDescriptors(save) {
  return (save?.pages || []).map((page, pageIndex) => {
    const url = page?.meta?.url || page?.url || '';
    const title = cleanText(page?.meta?.title || page?.title || '');
    const description = cleanText(page?.meta?.description || page?.description || '');
    const headings = getPageHeadingTexts(page);
    const fullText = cleanText(page?.fullText || '');
    return {
      page,
      pageIndex,
      url,
      title,
      description,
      headings,
      fullText,
      section: getPageSection(url),
      depth: getPageDepth(url),
      blob: [title, description, ...headings, fullText].filter(Boolean).join(' | '),
    };
  });
}

function extractRegexMatches(text, patterns, captureGroup = 1) {
  const normalized = cleanText(text);
  const matches = [];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(normalized)) !== null) {
      matches.push(cleanText(match[captureGroup] || match[0]));
      if (match[0].length === 0) pattern.lastIndex += 1;
    }
  }
  return dedupe(matches.filter(Boolean));
}

function extractBusinessHours(text) {
  return dedupe((cleanText(text).match(BUSINESS_HOURS_RE) || []).map(cleanText));
}

function extractDateLikeStrings(text) {
  return dedupe((cleanText(text).match(DATE_LIKE_RE) || []).map(cleanText));
}

function extractAddressCandidates(text) {
  return dedupe((cleanText(text).match(STREET_ADDRESS_RE) || []).map(cleanText)).slice(0, 20);
}

function collectLocationSignalsFromText(text) {
  const normalized = cleanText(text);
  return {
    storeNumbers: extractRegexMatches(normalized, STORE_NUMBER_PATTERNS),
    postalCodes: dedupe((normalized.match(/\b\d{5}(?:-\d{4})?\b/g) || []).map(cleanText)).slice(0, 20),
    addresses: extractAddressCandidates(normalized),
    businessHours: extractBusinessHours(normalized),
    dates: extractDateLikeStrings(normalized),
  };
}

function mergeSignalBuckets(target, source) {
  Object.keys(target).forEach((key) => {
    target[key] = dedupe([...(target[key] || []), ...(source[key] || [])]).slice(0, 25);
  });
}

function collectUrlSignalHints(url) {
  const result = {
    storeNumbers: [],
    postalCodes: [],
    addresses: [],
    businessHours: [],
    dates: [],
  };

  try {
    const parsed = new URL(url);
    parsed.searchParams.forEach((value, key) => {
      if (STORE_PARAM_RE.test(key) && /^\d{3,12}$/.test(String(value))) {
        result.storeNumbers.push(String(value));
      }
      if (POSTAL_PARAM_RE.test(key) && /^\d{5}(?:-\d{4})?$/.test(String(value))) {
        result.postalCodes.push(String(value));
      }
    });
    mergeSignalBuckets(result, collectLocationSignalsFromText(parsed.pathname));
  } catch {}

  return result;
}

function buildApiSurface(save) {
  const grouped = {
    graphql: new Map(),
    rest: new Map(),
  };
  const authHeaderNames = new Set();
  const queryParamKeys = new Set();
  const graphqlOperations = new Set();

  const parseOperationName = (call) => {
    const body = call?.body;
    if (body && typeof body === 'object' && body.operationName) return body.operationName;
    const queryText = typeof body === 'string' ? body : body?.query;
    const match = typeof queryText === 'string' ? queryText.match(/\b(?:query|mutation|subscription)\s+([A-Za-z0-9_]+)/) : null;
    return match?.[1] || null;
  };

  const collectCalls = (calls, type) => {
    (calls || []).forEach((call) => {
      const rawUrl = call?.url || '';
      if (!rawUrl) return;
      let parsed;
      try { parsed = new URL(rawUrl); } catch { return; }

      const endpointKey = `${call?.method || 'GET'} ${parsed.origin}${parsed.pathname}`;
      const bucket = grouped[type].get(endpointKey) || {
        endpoint: `${parsed.origin}${parsed.pathname}`,
        host: parsed.host,
        path: parsed.pathname,
        methods: new Set(),
        count: 0,
        queryParamKeys: new Set(),
        statuses: new Set(),
        operationNames: new Set(),
      };

      bucket.count += 1;
      bucket.methods.add(call?.method || 'GET');
      [...parsed.searchParams.keys()].forEach((key) => {
        bucket.queryParamKeys.add(key);
        queryParamKeys.add(key);
      });

      const status = call?.response?.status ?? call?.statusCode;
      if (status) bucket.statuses.add(status);

      Object.keys(call?.headers || {}).forEach((headerName) => {
        if (/authorization|x-api-key|x-auth|cookie/i.test(headerName)) authHeaderNames.add(headerName);
      });

      if (type === 'graphql') {
        const operationName = parseOperationName(call);
        if (operationName) {
          bucket.operationNames.add(operationName);
          graphqlOperations.add(operationName);
        }
      }

      // Capture a single request body sample and response preview per endpoint
      if (!bucket.requestSample && call?.body) {
        const bodyText = typeof call.body === 'string' ? call.body : JSON.stringify(call.body);
        bucket.requestSample = bodyText.slice(0, 300);
      }
      if (!bucket.responsePreview && call?.response?.body) {
        const bodyText = typeof call.response.body === 'string'
          ? call.response.body
          : JSON.stringify(call.response.body);
        bucket.responsePreview = bodyText.slice(0, 300);
      }

      grouped[type].set(endpointKey, bucket);
    });
  };

  collectCalls(save?.apiCalls?.graphql, 'graphql');
  collectCalls(save?.apiCalls?.rest, 'rest');

  const serializeGroup = (groupMap) => [...groupMap.values()]
    .map((bucket) => ({
      endpoint: bucket.endpoint,
      host: bucket.host,
      path: bucket.path,
      methods: [...bucket.methods],
      count: bucket.count,
      queryParamKeys: [...bucket.queryParamKeys].sort(),
      statuses: [...bucket.statuses].sort((a, b) => a - b),
      operationNames: [...bucket.operationNames].sort(),
      requestSample: bucket.requestSample || undefined,
      responsePreview: bucket.responsePreview || undefined,
    }))
    .sort((a, b) => b.count - a.count || a.endpoint.localeCompare(b.endpoint));

  const cookieSummary = summarizeCookieMetadata(save?.cookies);
  const authCookieNames = cookieSummary.names.filter((name) => /(token|session|auth|bearer|idtoken|apikey|key)/i.test(name));

  return {
    sessionId: save?.sessionId || '',
    graphql: {
      count: save?.apiCalls?.graphql?.length || 0,
      endpoints: serializeGroup(grouped.graphql),
      operations: [...graphqlOperations].sort(),
    },
    rest: {
      count: save?.apiCalls?.rest?.length || 0,
      endpoints: serializeGroup(grouped.rest),
    },
    authHints: {
      headerNames: [...authHeaderNames].sort(),
      cookieNames: authCookieNames,
    },
    queryParamKeys: [...queryParamKeys].sort(),
  };
}

function collectStoreContext(save) {
  const pageSignals = {
    storeNumbers: [],
    postalCodes: [],
    addresses: [],
    businessHours: [],
    dates: [],
  };
  const apiSignals = {
    storeNumbers: [],
    postalCodes: [],
    addresses: [],
    businessHours: [],
    dates: [],
  };
  const pageMentions = [];
  const apiMentions = [];

  collectPageDescriptors(save).forEach((entry) => {
    const storageBlob = [
      ...collectTextBlobs(entry.page?.localStorage || {}),
      ...collectTextBlobs(entry.page?.sessionStorage || {}),
    ].join(' | ');
    const signals = {
      storeNumbers: [],
      postalCodes: [],
      addresses: [],
      businessHours: [],
      dates: [],
    };
    mergeSignalBuckets(signals, collectLocationSignalsFromText(entry.blob));
    mergeSignalBuckets(signals, collectLocationSignalsFromText(storageBlob));
    if (signals.storeNumbers.length || signals.postalCodes.length || signals.addresses.length || signals.businessHours.length) {
      pageMentions.push({
        pageIndex: entry.pageIndex,
        url: entry.url,
        storeNumbers: signals.storeNumbers,
        postalCodes: signals.postalCodes,
        addresses: signals.addresses.slice(0, 2),
        businessHours: signals.businessHours.slice(0, 2),
        storageKeys: dedupe([
          ...Object.keys(entry.page?.localStorage || {}),
          ...Object.keys(entry.page?.sessionStorage || {}),
        ]).slice(0, 12),
      });
    }
    mergeSignalBuckets(pageSignals, signals);
  });

  const allApiCalls = [
    ...(save?.apiCalls?.graphql || []).map((call) => ({ ...call, sourceType: 'graphql' })),
    ...(save?.apiCalls?.rest || []).map((call) => ({ ...call, sourceType: 'rest' })),
  ];

  allApiCalls.forEach((call) => {
    const blobs = [
      call.url || '',
      ...collectTextBlobs(call.body || null),
      ...collectTextBlobs(call.response?.body || null),
    ];
    const signals = {
      storeNumbers: [],
      postalCodes: [],
      addresses: [],
      businessHours: [],
      dates: [],
    };
    mergeSignalBuckets(signals, collectUrlSignalHints(call.url || ''));
    blobs.forEach((blob) => mergeSignalBuckets(signals, collectLocationSignalsFromText(blob)));

    if (signals.storeNumbers.length || signals.postalCodes.length || signals.addresses.length || signals.businessHours.length) {
      apiMentions.push({
        sourceType: call.sourceType,
        url: call.url || '',
        storeNumbers: signals.storeNumbers,
        postalCodes: signals.postalCodes,
        addresses: signals.addresses.slice(0, 2),
        businessHours: signals.businessHours.slice(0, 2),
      });
    }
    mergeSignalBuckets(apiSignals, signals);
  });

  const mismatches = [];
  if (pageSignals.storeNumbers.length && apiSignals.storeNumbers.length && pageSignals.storeNumbers[0] !== apiSignals.storeNumbers[0]) {
    mismatches.push({
      type: 'store_number_mismatch',
      pageStoreNumber: pageSignals.storeNumbers[0],
      apiStoreNumber: apiSignals.storeNumbers[0],
      message: `Visible page context points at store ${pageSignals.storeNumbers[0]}, but background API traffic points at store ${apiSignals.storeNumbers[0]}.`,
    });
  }
  if (pageSignals.postalCodes.length && apiSignals.postalCodes.length && pageSignals.postalCodes[0] !== apiSignals.postalCodes[0]) {
    mismatches.push({
      type: 'postal_code_mismatch',
      pagePostalCode: pageSignals.postalCodes[0],
      apiPostalCode: apiSignals.postalCodes[0],
      message: `Visible page context points at postal code ${pageSignals.postalCodes[0]}, but background API traffic points at ${apiSignals.postalCodes[0]}.`,
    });
  }
  if (pageSignals.businessHours.length && apiSignals.businessHours.length && pageSignals.businessHours[0] !== apiSignals.businessHours[0]) {
    mismatches.push({
      type: 'hours_mismatch',
      pageHours: pageSignals.businessHours[0],
      apiHours: apiSignals.businessHours[0],
      message: `Visible hours (${pageSignals.businessHours[0]}) do not match API-backed hours (${apiSignals.businessHours[0]}).`,
    });
  }

  return {
    sessionId: save?.sessionId || '',
    pageContext: {
      primaryStoreNumber: pageSignals.storeNumbers[0] || null,
      primaryPostalCode: pageSignals.postalCodes[0] || null,
      primaryAddress: pageSignals.addresses[0] || null,
      primaryHours: pageSignals.businessHours[0] || null,
      signals: pageSignals,
      mentions: pageMentions.slice(0, 12),
    },
    apiContext: {
      primaryStoreNumber: apiSignals.storeNumbers[0] || null,
      primaryPostalCode: apiSignals.postalCodes[0] || null,
      primaryAddress: apiSignals.addresses[0] || null,
      primaryHours: apiSignals.businessHours[0] || null,
      signals: apiSignals,
      mentions: apiMentions.slice(0, 15),
    },
    cookieSignals: {
      likelyStateCookies: summarizeCookieMetadata(save?.cookies).names
        .filter((name) => /(store|location|postal|zip|token|session|auth)/i.test(name))
        .slice(0, 20),
    },
    mismatches,
  };
}

function splitTextIntoCandidates(text) {
  return cleanText(text)
    .split(/\s*(?:\n+|\||•|(?<=[.!?])\s+)\s*/)
    .map(cleanText)
    .filter((entry) => entry.length >= 12 && entry.length <= 240);
}

function scoreDealCandidate(text) {
  const prices = text.match(PRICE_RE) || [];
  let score = prices.length * 3;
  if (DEAL_TRIGGER_RE.test(text)) score += 4;
  if (/\b\d+\s+for\s+\$\d|\bbuy\s+one\b|\bget\s+one\b|\b\d+%\s+off\b/i.test(text)) score += 4;
  if (/digital coupon|save \$|save up to|clearance/i.test(text)) score += 2;
  return score;
}

function extractDealsFromSave(save, { pageIndex = null, limit = 25 } = {}) {
  const safeLimit = normalizeInteger(limit, {
    defaultValue: 25,
    min: 1,
    max: 100,
    name: 'limit',
  });
  const requestedPageIndex = pageIndex === null || pageIndex === undefined
    ? null
    : normalizeInteger(pageIndex, {
        defaultValue: 0,
        min: 0,
        max: 100000,
        name: 'pageIndex',
      });

  const dealCandidates = [];
  const pages = collectPageDescriptors(save)
    .filter((entry) => requestedPageIndex === null || entry.pageIndex === requestedPageIndex);

  pages.forEach((entry) => {
    splitTextIntoCandidates(entry.blob).forEach((candidate) => {
      const score = scoreDealCandidate(candidate);
      if (!score) return;
      dealCandidates.push({
        text: candidate,
        priceMatches: candidate.match(PRICE_RE) || [],
        dateMatches: extractDateLikeStrings(candidate),
        sourceType: 'page',
        sourceUrl: entry.url,
        pageIndex: entry.pageIndex,
        score,
      });
    });
  });

  [
    ...(save?.apiCalls?.graphql || []).map((call) => ({ ...call, sourceType: 'graphql' })),
    ...(save?.apiCalls?.rest || []).map((call) => ({ ...call, sourceType: 'rest' })),
  ].forEach((call) => {
    const blobs = [
      ...collectTextBlobs(call.body || null),
      ...collectTextBlobs(call.response?.body || null),
    ];
    blobs.flatMap(splitTextIntoCandidates).forEach((candidate) => {
      const score = scoreDealCandidate(candidate);
      if (!score) return;
      dealCandidates.push({
        text: candidate,
        priceMatches: candidate.match(PRICE_RE) || [],
        dateMatches: extractDateLikeStrings(candidate),
        sourceType: call.sourceType,
        sourceUrl: call.url || '',
        pageIndex: null,
        score,
      });
    });
  });

  const deals = dedupeBy(
    dealCandidates
      .sort((a, b) => b.score - a.score || a.text.length - b.text.length)
      .map((candidate) => ({
        text: candidate.text,
        priceMatches: dedupe(candidate.priceMatches),
        dateMatches: dedupe(candidate.dateMatches),
        sourceType: candidate.sourceType,
        sourceUrl: candidate.sourceUrl,
        pageIndex: candidate.pageIndex,
        confidence: candidate.score >= 8 ? 'high' : candidate.score >= 5 ? 'medium' : 'low',
      })),
    (candidate) => candidate.text.toLowerCase()
  ).slice(0, safeLimit);

  return {
    sessionId: save?.sessionId || '',
    pageIndex: requestedPageIndex,
    count: deals.length,
    activeWindows: dedupe(deals.flatMap((deal) => deal.dateMatches)).slice(0, 20),
    deals,
  };
}

function findSiteIssues(save) {
  const issues = [];
  const normalized = normalizeCompletedScrapeResult(save);
  const cookieSummary = summarizeCookieMetadata(normalized.cookies);
  const securityHeaders = normalized.securityHeaders || {};
  const storeContext = collectStoreContext(normalized);
  const apiSurface = buildApiSurface(normalized);
  const pageDescriptors = collectPageDescriptors(normalized);
  const pageBlob = pageDescriptors.map((entry) => entry.blob).join(' | ');
  const consoleBlob = (normalized.consoleLogs || []).map((entry) => cleanText(entry.text || entry.message || '')).join(' | ');
  const apiBlob = [
    ...(normalized.apiCalls?.graphql || []).flatMap((call) => [call.url, ...collectTextBlobs(call.body), ...collectTextBlobs(call.response?.body)]),
    ...(normalized.apiCalls?.rest || []).flatMap((call) => [call.url, ...collectTextBlobs(call.body), ...collectTextBlobs(call.response?.body)]),
  ].map(cleanText).join(' | ');

  const addIssue = (severity, category, title, evidence, recommendation) => {
    issues.push({ severity, category, title, evidence, recommendation });
  };

  ['content-security-policy', 'strict-transport-security', 'x-frame-options', 'x-content-type-options'].forEach((headerName) => {
    if (!securityHeaders[headerName]) {
      addIssue(
        headerName === 'content-security-policy' || headerName === 'strict-transport-security' ? 'medium' : 'low',
        'security_headers',
        `Missing ${headerName}`,
        `The saved document response does not include ${headerName}.`,
        'Verify whether the site intentionally omits this header or if the response path is missing a standard security header.'
      );
    }
  });

  if ((normalized.consoleLogs || []).length > 0) {
    const errorLogs = (normalized.consoleLogs || []).filter((entry) => ['error', 'warning'].includes(entry.type));
    if (errorLogs.length) {
      addIssue(
        'medium',
        'client_errors',
        'Console warnings or errors were captured',
        errorLogs.slice(0, 3).map((entry) => `${entry.type}: ${cleanText(entry.text)}`).join(' | '),
        'Inspect the affected widgets or requests — client-side errors often explain missing or partially rendered content.'
      );
    }
  }

  if ((normalized.failedPages || []).length > 0) {
    addIssue(
      'medium',
      'crawl_failures',
      'Some pages failed during the scrape',
      normalized.failedPages.slice(0, 5).map((page) => `${page.url || ''} — ${page.reason || 'unknown'}`).join(' | '),
      'Review the failed URLs to decide whether they need a retry, auth handling, or exclusion rules.'
    );
  }

  if (AUTH_LEAK_RE.test(pageBlob) || AUTH_LEAK_RE.test(consoleBlob) || AUTH_LEAK_RE.test(apiBlob)) {
    addIssue(
      'medium',
      'auth_leakage',
      'Auth or session-state text leaked into visible content or API payloads',
      (pageBlob.match(AUTH_LEAK_RE) || consoleBlob.match(AUTH_LEAK_RE) || apiBlob.match(AUTH_LEAK_RE) || [''])[0],
      'Check whether stale auth errors or expired-session messages are being rendered into pages or mixed into storefront/API responses.'
    );
  }

  if (cookieSummary.names.some((name) => /(token|session|auth|bearer|idtoken|apikey|key)/i.test(name))) {
    addIssue(
      'low',
      'auth_surface',
      'Browser storage includes auth-oriented cookie names',
      cookieSummary.names.filter((name) => /(token|session|auth|bearer|idtoken|apikey|key)/i.test(name)).slice(0, 8).join(', '),
      'This is often expected, but it is worth verifying that sensitive session state is scoped, rotated, and protected with secure/httpOnly flags where appropriate.'
    );
  }

  storeContext.mismatches.forEach((mismatch) => {
    addIssue(
      mismatch.type === 'hours_mismatch' ? 'medium' : 'high',
      'context_mismatch',
      mismatch.type === 'hours_mismatch' ? 'Conflicting business hours across systems' : 'Visible page and background API context disagree',
      mismatch.message,
      'Confirm which source is authoritative and whether client-side preferred-store/session state is leaking into the page.'
    );
  });

  if (apiSurface.authHints.headerNames.length) {
    addIssue(
      'low',
      'api_auth',
      'Captured API traffic uses auth-related headers',
      apiSurface.authHints.headerNames.join(', '),
      'Check that these headers are expected for the captured endpoints and that they are not exposing privileged APIs to unauthenticated flows.'
    );
  }

  // ── HTTP vs HTTPS ──────────────────────────────────────────────────────────
  const startUrl = normalized.startUrl || '';
  if (startUrl.startsWith('http://')) {
    addIssue(
      'high',
      'transport_security',
      'Site served over plain HTTP (not HTTPS)',
      startUrl,
      'Enable HTTPS and configure a permanent redirect from HTTP to HTTPS. Without TLS, all traffic including credentials can be intercepted.'
    );
  }

  // ── Mixed content (HTTP resources on HTTPS page) ───────────────────────────
  if (startUrl.startsWith('https://')) {
    const allSrcs = (normalized.pages || []).flatMap((page) => [
      ...(page.images || []).map((img) => img.src || ''),
      ...(page.scripts || []).map((s) => s.src || ''),
    ]).filter((src) => src.startsWith('http://'));
    if (allSrcs.length) {
      addIssue(
        'medium',
        'mixed_content',
        `${allSrcs.length} HTTP resource(s) loaded on HTTPS page`,
        allSrcs.slice(0, 5).join(', '),
        'Update all resource URLs to HTTPS or use protocol-relative URLs to prevent mixed-content browser warnings.'
      );
    }
  }

  // ── Insecure cookies ───────────────────────────────────────────────────────
  const insecureCookies = (normalized.cookies || []).filter(
    (c) => /(session|token|auth|id)/i.test(c.name || '') && (!c.secure || !c.httpOnly)
  );
  if (insecureCookies.length) {
    addIssue(
      'high',
      'cookie_security',
      `${insecureCookies.length} session/auth cookie(s) missing Secure or HttpOnly flag`,
      insecureCookies.slice(0, 5).map((c) => `${c.name}${!c.secure ? ' (no Secure)' : ''}${!c.httpOnly ? ' (no HttpOnly)' : ''}`).join(', '),
      'Set Secure and HttpOnly on all authentication cookies. Missing Secure allows transmission over HTTP; missing HttpOnly exposes the cookie to JavaScript.'
    );
  }

  const bySeverity = issues.reduce((acc, issue) => {
    acc[issue.severity] = (acc[issue.severity] || 0) + 1;
    return acc;
  }, {});

  return {
    sessionId: normalized.sessionId || '',
    count: issues.length,
    bySeverity,
    issues,
    storeContext,
  };
}

function buildSaveOverview(save) {
  const normalized = normalizeCompletedScrapeResult(save);
  const pageDescriptors = collectPageDescriptors(normalized);
  const sections = pageDescriptors.reduce((acc, entry) => {
    acc[entry.section] = (acc[entry.section] || 0) + 1;
    return acc;
  }, {});
  const forms = pageDescriptors.reduce((acc, entry) => acc + (entry.page?.forms?.length || 0), 0);
  const formFields = pageDescriptors.reduce((acc, entry) => acc + (entry.page?.forms || []).reduce((sum, form) => sum + (form.fields?.length || 0), 0), 0);
  const imageCount = pageDescriptors.reduce((acc, entry) => acc + (entry.page?.images?.length || 0), 0);
  const apiSurface = buildApiSurface(normalized);
  const issues = findSiteIssues(normalized);
  const tech = {};
  pageDescriptors.forEach((entry) => {
    Object.entries(entry.page?.tech || {}).forEach(([category, value]) => {
      const list = Array.isArray(value) ? value : value ? [value] : [];
      tech[category] = dedupe([...(tech[category] || []), ...list]);
    });
  });

  const highlights = [
    `${pageDescriptors.length} page${pageDescriptors.length === 1 ? '' : 's'} captured across ${Object.keys(sections).length || 1} section${Object.keys(sections).length === 1 ? '' : 's'}.`,
    `${apiSurface.graphql.count} GraphQL call${apiSurface.graphql.count === 1 ? '' : 's'} and ${apiSurface.rest.count} REST call${apiSurface.rest.count === 1 ? '' : 's'} captured.`,
    `${forms} form${forms === 1 ? '' : 's'} and ${imageCount} image${imageCount === 1 ? '' : 's'} found in the saved pages.`,
    issues.storeContext.mismatches.length ? 'Cross-context mismatches were detected between visible page content and API traffic.' : null,
    issues.count ? `${issues.count} issue${issues.count === 1 ? '' : 's'} flagged for follow-up.` : 'No obvious high-signal issues were detected in the saved scrape.',
  ].filter(Boolean);

  return {
    sessionId: normalized.sessionId || '',
    url: normalized.meta?.targetUrl || normalized.siteInfo?.origin || '',
    title: normalized.siteInfo?.title || '',
    scrapedAt: normalized.meta?.scrapedAt || '',
    counts: {
      pages: pageDescriptors.length,
      visitedUrls: normalized.visitedUrls?.length || 0,
      failedPages: normalized.failedPages?.length || 0,
      graphqlCalls: apiSurface.graphql.count,
      restCalls: apiSurface.rest.count,
      forms,
      formFields,
      images: imageCount,
      downloadedImages: normalized.downloadedImages?.length || 0,
      consoleLogs: normalized.consoleLogs?.length || 0,
      websocketConnections: normalized.websockets?.length || 0,
    },
    sections: Object.entries(sections)
      .map(([section, count]) => ({ section, count }))
      .sort((a, b) => b.count - a.count || a.section.localeCompare(b.section)),
    topPages: pageDescriptors.slice(0, 15).map((entry) => ({
      pageIndex: entry.pageIndex,
      url: entry.url,
      title: entry.title,
      section: entry.section,
      depth: entry.depth,
      linkCount: entry.page?.links?.length || 0,
      formCount: entry.page?.forms?.length || 0,
      imageCount: entry.page?.images?.length || 0,
    })),
    tech,
    cookieSummary: summarizeCookieMetadata(normalized.cookies),
    securityHeaders: normalized.securityHeaders || {},
    apiSurface: {
      graphqlEndpoints:  apiSurface.graphql.endpoints.slice(0, 10),
      graphqlOperations: apiSurface.graphql.operations.slice(0, 15),
      restEndpoints:     apiSurface.rest.endpoints.slice(0, 10),
      authHints:         apiSurface.authHints,
    },
    topActiveEndpoints: (() => {
      // Build a frequency map across all REST calls, then return top-5
      const freq = {};
      (normalized.apiCalls?.rest || []).forEach(c => {
        try {
          const parsed = new URL(c.url);
          const key = `${c.method || 'GET'} ${parsed.origin}${parsed.pathname}`;
          freq[key] = (freq[key] || 0) + 1;
        } catch {}
      });
      return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([endpoint, callCount]) => ({ endpoint, callCount }));
    })(),
    issueSummary: {
      count: issues.count,
      bySeverity: issues.bySeverity,
    },
    highlights,
  };
}

async function fetchActiveScrapes() {
  return expectOk(await get('/api/scrape/active?includeHidden=1'), 'Failed to list active scrapes');
}

async function fetchScrapeStatus(sessionId) {
  return expectOk(
    await get(`/api/scrape/${encodeURIComponent(ensureNonEmptyString(sessionId, 'sessionId'))}/status`),
    'Failed to load scrape status'
  );
}

function buildToolError(name, err) {
  const message = err?.message || String(err);
  let code = 'tool_error';
  let retryable = true;

  if (/must be|Provide either|Provide|Maximum \d+|type must be/i.test(message)) {
    code = 'invalid_input';
    retryable = false;
  } else if (/not found|Session not found|Save not found|Page index/i.test(message)) {
    code = 'not_found';
    retryable = false;
  } else if (/timed out|timeout/i.test(message)) {
    code = 'timeout';
  } else if (/ECONNREFUSED|ECONNRESET|ENOTFOUND|Failed to /i.test(message)) {
    code = 'upstream_error';
  }

  const suggestedNextStep = code === 'invalid_input'
    ? `Check the input arguments for ${name} and try again.`
    : code === 'not_found'
      ? 'Confirm the session or save exists before retrying.'
      : code === 'timeout'
        ? 'Retry the request or reduce the scope of the scrape.'
        : 'Retry the request after confirming the local scraper server is running.';

  return { code, message, retryable, suggestedNextStep };
}

function createToolSuccess(name, data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: { tool: name, data },
  };
}

function createToolFailure(name, err) {
  const error = buildToolError(name, err);
  return {
    content: [{ type: 'text', text: `Error (${error.code}): ${error.message}` }],
    structuredContent: { tool: name, error },
    isError: true,
  };
}

function buildJsonResource(uri, data) {
  return {
    contents: [{
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(data, null, 2),
    }],
  };
}

function buildMarkdownResource(uri, text) {
  return {
    contents: [{
      uri,
      mimeType: 'text/markdown',
      text,
    }],
  };
}

// ── MCP protocol notification helpers ────────────────────────────────────────

const LOG_LEVELS = ['debug','info','notice','warning','error','critical','alert','emergency'];

async function sendLog(level, logger, data) {
  if (LOG_LEVELS.indexOf(level) < LOG_LEVELS.indexOf(currentLogLevel)) return;
  try {
    await server.notification({
      method: 'notifications/message',
      params: { level, logger, data },
    });
  } catch {}
}

async function sendProgress(token, progress, total, message) {
  if (!token) return;
  try {
    await server.notification({
      method: 'notifications/progress',
      params: { progressToken: token, progress, total, message },
    });
  } catch {}
}

async function notifyResourceUpdated(uri) {
  if (!activeSubscriptions.has(uri)) return;
  try {
    await server.notification({
      method: 'notifications/resources/updated',
      params: { uri },
    });
  } catch {}
}

async function notifyResourceListChanged() {
  try {
    await server.notification({
      method: 'notifications/resources/list_changed',
      params: {},
    });
  } catch {}
}

function canWriteDir(dirPath) {
  try {
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function buildServerInfoSnapshot() {
  const requiredEnv = [];
  const recommendedEnv = [
    'SCRAPER_URL',
    'AI_ANALYSIS_URL',
    'AI_ANALYSIS_MODEL',
    'AI_ANALYSIS_API_KEY',
    'API_KEY',
    'MCP_TOOLSET',
    'MAX_ACTIVE_BROWSER_SESSIONS',
    'MAX_ACTIVE_HEADFUL_BROWSER_SESSIONS',
    'BROWSER_SESSION_IDLE_TTL_MS',
  ];
  const directories = [SAVES_DIR, DATA_DIR, LOGS_DIR, BROWSER_SESSION_DIR, BROWSER_SESSION_SAVES_DIR].map((dirPath) => ({
    path: dirPath,
    exists: fs.existsSync(dirPath),
    writable: fs.existsSync(dirPath) ? canWriteDir(dirPath) : false,
  }));

  let restServer = {
    reachable: false,
    status: null,
    error: null,
  };
  let saveCount = 0;
  let activeCount = 0;
  let browserSaveCount = 0;
  let activeBrowserCount = 0;
  try {
    const response = await get('/api/saves?includeHidden=1');
    restServer = {
      reachable: response.status >= 200 && response.status < 500,
      status: response.status,
      error: null,
    };
    saveCount = Array.isArray(response.body) ? response.body.length : 0;
  } catch (err) {
    restServer.error = err.message;
  }

  try {
    const active = await fetchActiveScrapes();
    activeCount = Array.isArray(active) ? active.length : 0;
  } catch {}

  try {
    const browserResponse = await get('/api/browser/saves');
    browserSaveCount = Array.isArray(browserResponse.body) ? browserResponse.body.length : 0;
  } catch {}

  try {
    const browserSessions = await get('/api/browser/sessions');
    activeBrowserCount = Array.isArray(browserSessions.body) ? browserSessions.body.length : 0;
  } catch {}

  let playwrightInstalled = false;
  try {
    require.resolve('playwright');
    playwrightInstalled = true;
  } catch {}

  return {
    server: {
      name: 'web-scraper',
      version: SERVER_VERSION,
      activeToolset,
      baseUrl: BASE_URL,
      pid: process.pid,
      node: process.version,
      platform: process.platform,
    },
    counts: {
      toolsExposed: listToolsForCurrentToolset().length,
      toolsTotal: TOOLS.length,
      prompts: PROMPTS.length,
      fixedResources: FIXED_RESOURCES.length,
      dynamicResources: (saveCount * 7) + activeCount,
      resourceTemplates: RESOURCE_TEMPLATES.length,
      browserSaves: browserSaveCount,
      activeBrowserSessions: activeBrowserCount,
    },
    capabilities: {
      tools: true,
      prompts: true,
      resources: { subscribe: true, listChanged: true },
      logging: true,
      completions: true,
      sampling: true,
      roots: true,
    },
    environment: {
      required: requiredEnv,
      recommended: recommendedEnv,
      present: recommendedEnv.filter((key) => !!process.env[key]),
      missingRecommended: recommendedEnv.filter((key) => !process.env[key]),
    },
    directories,
    runtime: {
      playwrightInstalled,
      activeSubscriptions: activeSubscriptions.size,
      browserAutomation: true,
      activeBrowserSessions: activeBrowserCount,
      browserSaves: browserSaveCount,
    },
    connectivity: {
      restServer,
    },
    workflows: STARTER_WORKFLOWS,
  };
}

function buildDocsToolList() {
  const catalog = getToolCatalog();
  const grouped = new Map();
  for (const tool of catalog) {
    if (!grouped.has(tool.category)) grouped.set(tool.category, []);
    grouped.get(tool.category).push(tool);
  }

  const lines = [
    '# Web Scraper MCP — Tool Reference',
    `Generated: ${new Date().toISOString().slice(0, 10)} | ${catalog.length} tools`,
    '',
    '## Classification Key',
    '- **RO** — Read-only. Safe to call freely.',
    '- **OW** — Open-world. Makes outbound network calls.',
    '- **D** — Destructive. Deletes or irreversibly changes state.',
    '- **stable** — Mature and used in common workflows.',
    '- **beta** — Supported, but still evolving.',
    '- **experimental** — Powerful, but more agent/operator guidance may be needed.',
    '',
    '## Starter Workflows',
    '',
  ];

  for (const workflow of STARTER_WORKFLOWS) {
    lines.push(`- **${workflow.title}** — ${workflow.summary}`);
    lines.push(`  Tools: ${workflow.tools.map((tool) => `\`${tool}\``).join(' → ')}`);
  }

  lines.push('', '## Tool Index', '');

  for (const [category, tools] of grouped.entries()) {
    lines.push(`### ${category}`, '');
    for (const tool of tools) {
      const badgeStr = tool.badges.length ? ` \`[${tool.badges.join('|')}]\`` : '';
      lines.push(`- [\`${tool.name}\`](#${tool.name})${badgeStr} — ${tool.description.split('.')[0]}`);
    }
    lines.push('');
  }

  lines.push('---', '');

  for (const tool of catalog) {
    const badgeStr = tool.badges.length ? ` \`[${tool.badges.join('|')}]\`` : '';

    lines.push(`### \`${tool.name}\`${badgeStr}`);
    lines.push('');
    lines.push(`**Category:** ${tool.category}`);
    lines.push(`**Maturity:** ${tool.maturity}`);
    lines.push('');
    lines.push(tool.description);
    lines.push('');
    if (tool.exampleCall) {
      lines.push(`**Example:** \`${tool.exampleCall}\``);
      lines.push('');
    }

    const props = tool.inputSchema?.properties || {};
    const required = new Set(tool.inputSchema?.required || []);
    const propKeys = Object.keys(props);

    if (propKeys.length > 0) {
      lines.push('**Parameters:**');
      lines.push('');
      for (const key of propKeys) {
        const prop = props[key];
        const req = required.has(key) ? ' *(required)*' : ' *(optional)*';
        const type = prop.type || 'string';
        const desc = prop.description || '';
        const enumVals = prop.enum ? ` — one of: \`${prop.enum.join('`, `')}\`` : '';
        lines.push(`- \`${key}\` (${type})${req} — ${desc}${enumVals}`);
      }
    } else {
      lines.push('**Parameters:** none');
    }

    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

function buildPromptMessage(text) {
  return {
    role: 'user',
    content: {
      type: 'text',
      text,
    },
  };
}

// ── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [

  // ── Tier 1: Core scraping ──────────────────────────────────────────────────

  {
    name: 'detect_site',
    description: 'Detect detailed site metadata without a full browser scrape. Returns: title, description, favicon, final URL after redirects, HTTP status code, CMS (WordPress/Shopify/Drupal/Wix/Squarespace/Ghost/Joomla/Magento/Strapi/Contentful/Sanity/HubSpot), JS frameworks (Next.js/Nuxt/React/Vue/Angular/Svelte/Gatsby/Remix/Astro), rendering mode (SPA/SSR/SSG), anti-bot detection (Cloudflare/reCAPTCHA/DataDome/PerimeterX/Akamai/Imperva), login form presence, OAuth/SSO buttons, primary language, server software, and security headers (CSP/HSTS/X-Frame/X-Content-Type-Options). Good first step before deciding how to scrape.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL to detect (e.g. https://example.com)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'check_saved_session',
    description: 'Check whether a reusable browser session already exists for a URL. Helpful before scraping sites that require login.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to check for an existing saved browser session' },
      },
      required: ['url'],
    },
  },
  {
    name: 'clear_saved_session',
    description: 'Delete a saved browser session for a URL. Useful when a stored login state is stale or broken.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL whose saved browser session should be cleared' },
      },
      required: ['url'],
    },
  },
  {
    name: 'get_known_site_credentials',
    description: 'Check whether the scraper has preconfigured credentials for a URL. Returns only a username hint, never the password.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to check for preconfigured credentials' },
      },
      required: ['url'],
    },
  },
  {
    name: 'scrape_url',
    description: 'Fully scrape a URL using a real browser (Playwright). Captures page text, headings, links, forms, GraphQL/REST API calls, cookies, and tech stack. Returns a summarised result. Use get_page_text for full text of a single page.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to scrape' },
        maxPages: { type: 'number', description: 'Max pages to visit (default: 3)' },
        scrapeDepth: { type: 'number', description: 'How many links deep to follow (default: 1)' },
        captureGraphQL: { type: 'boolean', description: 'Capture GraphQL API calls (default: true)' },
        captureREST: { type: 'boolean', description: 'Capture REST API calls (default: true)' },
        captureIframeAPIs: { type: 'boolean', description: 'Also capture XHR/fetch calls made from within iframes (e.g. embedded widgets, ad units). Requires captureREST: true. Adds a context-level route listener so cross-origin iframe API calls are included in restCalls with fromIframe: true (default: false)' },
        captureSSE: { type: 'boolean', description: 'Capture Server-Sent Events (EventSource / text/event-stream). Patches window.EventSource before page load so every event on every SSE connection is recorded. Results appear in apiCalls.sse[] with url, events[], and timestamps (default: false)' },
        captureBeacons: { type: 'boolean', description: 'Capture navigator.sendBeacon() and ping requests fired on page unload. These POST analytics/tracking payloads that are normally invisible. Results in apiCalls.beacons[] (default: false)' },
        captureBinaryResponses: { type: 'boolean', description: 'Flag XHR/fetch responses with binary content-types (MessagePack, Protobuf, CBOR, gRPC). Results in apiCalls.binary[] with URL, content-type, and size (default: false)' },
        captureServiceWorkers: { type: 'boolean', description: 'Detect registered service workers after page load. Results in serviceWorkers[] with scope, scriptURL, and state (default: false)' },
        bypassServiceWorkers: { type: 'boolean', description: 'Unregister all service workers and reload the page so API requests hit the network directly instead of being served from SW cache. Implies captureServiceWorkers. Use when a PWA is hiding its API calls (default: false)' },
        fullCrawl: { type: 'boolean', description: 'Crawl the entire site up to maxPages (default: false)' },
        autoScroll: { type: 'boolean', description: 'Auto-scroll pages to trigger lazy loading (default: false)' },
        username: { type: 'string', description: 'Username or email for login. Triggers automatic form-based login before scraping.' },
        password: { type: 'string', description: 'Password for login.' },
        totpSecret: { type: 'string', description: 'Base32 TOTP secret for TOTP-based 2FA (e.g. Google Authenticator). If provided, 2FA codes are generated automatically — no manual entry needed.' },
        ssoProvider: { type: 'string', description: 'OAuth/SSO provider hint (google, github, microsoft, facebook, apple, etc.). When set, the scraper clicks the matching SSO button instead of the password form.' },
        verificationCode: { type: 'string', description: 'Static 2FA/OTP code to submit if one is already known (alternative to totpSecret for one-time use).' },
        useTor: { type: 'boolean', description: 'Route all browser traffic through the local Tor SOCKS5 proxy (requires Tor to be running on TOR_SOCKS_HOST:TOR_SOCKS_PORT, default 127.0.0.1:9050). Automatically rotates the Tor circuit every TOR_ROTATE_EVERY pages (default: 10) for IP diversity. Falls back gracefully if Tor is not running.' },
        redisDedupe: { type: 'boolean', description: 'Enable cross-session URL deduplication via Redis. When true, URLs scraped in previous sessions for the same domain are skipped automatically (persisted in Redis with a 7-day TTL). Requires REDIS_URL to be set. Falls back gracefully if Redis is not available.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'batch_scrape',
    description: 'Scrape multiple URLs individually in parallel. Each URL is an independent scrape — one failure does not abort the others. Supports optional authentication so all URLs in the batch share the same credentials. Useful for comparing competitor pages, checking a list of links, or scraping paginated content. Returns per-URL results plus a summary of successes and failures.',
    inputSchema: {
      type: 'object',
      properties: {
        urls:           { type: 'array', items: { type: 'string' }, description: 'List of URLs to scrape (max 20)' },
        captureGraphQL: { type: 'boolean', description: 'Capture GraphQL API calls (default: true)' },
        captureREST:    { type: 'boolean', description: 'Capture REST API calls (default: true)' },
        concurrency:    { type: 'number', description: 'Max parallel scrapes (default: 3, max: 5)' },
        username:       { type: 'string', description: 'Optional username/email to apply to all URLs that require login' },
        password:       { type: 'string', description: 'Optional password to apply to all URLs that require login' },
        totpSecret:     { type: 'string', description: 'Optional base32 TOTP secret for 2FA (applied to all URLs)' },
        ssoProvider:    { type: 'string', description: 'Optional SSO/OAuth provider name (e.g. "google", "github")' },
      },
      required: ['urls'],
    },
  },
  {
    name: 'stop_scrape',
    description: 'Stop a currently running scrape session. Preserves all partial results collected so far. Returns a summary of pages and links found before stopping — use list_saves to access the partial data.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID of the scrape to stop' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'pause_scrape',
    description: 'Pause an in-flight scrape session after its current page finishes. Call list_active_scrapes first to get a valid sessionId and confirm the session is still running. Use get_scrape_status after pausing to confirm the new state. Pausing is safe to call on an already-paused session.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID from list_active_scrapes or scrape_url' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'resume_scrape',
    description: 'Resume a paused scrape session. The session must have status "paused" — call get_scrape_status first to confirm. After resuming, poll get_scrape_status to watch progress. Has no effect on a session that is already running.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID of a paused scrape (check get_scrape_status first)' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'submit_verification_code',
    description: 'Submit a 2FA / OTP / email verification code to an in-flight scrape that is waiting for authentication. Call get_scrape_status first — the session status will be "awaiting_verification" when this is needed. The scraper continues automatically once the code is accepted. Wrong or expired codes cause the scrape to fail.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID whose status is awaiting_verification' },
        code: { type: 'string', description: '2FA / OTP / email verification code (digits or alphanumeric)' },
      },
      required: ['sessionId', 'code'],
    },
  },
  {
    name: 'submit_scrape_credentials',
    description: 'Submit login credentials to an in-flight scrape that has detected and paused at a login wall. Call get_scrape_status first — the session status will be "awaiting_credentials" when this is needed. The scraper resumes automatically after submitting. If 2FA is triggered next, call submit_verification_code.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID whose status is awaiting_credentials' },
        username: { type: 'string', description: 'Username or email address for the login form' },
        password: { type: 'string', description: 'Password for the login form' },
      },
      required: ['sessionId', 'username', 'password'],
    },
  },

  // ── Tier 2: Entity & content extraction ───────────────────────────────────

  {
    name: 'extract_entities',
    description: 'Extract all contact information and identifiers from a URL or saved scrape: emails, phone numbers, physical addresses, social media profiles (Twitter, LinkedIn, GitHub, Instagram, Facebook, TikTok, YouTube), GPS coordinates, cryptocurrency wallet addresses (Bitcoin, Ethereum), and IP addresses. Fast research and OSINT tool.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to scrape and extract entities from (alternative to sessionId)' },
        sessionId: { type: 'string', description: 'Session ID of an already-completed scrape (alternative to url)' },
      },
    },
  },
  {
    name: 'get_api_calls',
    description: 'Get the GraphQL and REST API calls captured during a scrape — without the full page content. Supports filtering by HTTP method, domain, status code range, and URL keyword. Useful for reverse-engineering a site\'s data layer or finding undocumented API endpoints.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId:   { type: 'string', description: 'Session ID from scrape_url' },
        type:        { type: 'string', enum: ['graphql', 'rest', 'all'], description: 'Which calls to return (default: all)' },
        limit:       { type: 'number', description: 'Max calls to return per type (default: 50)' },
        method:      { type: 'string', description: 'Filter by HTTP method (GET, POST, etc.) — case-insensitive' },
        domain:      { type: 'string', description: 'Filter to calls whose URL contains this domain or substring' },
        statusMin:   { type: 'number', description: 'Filter to calls with response status >= this value (e.g. 400 for errors only)' },
        statusMax:   { type: 'number', description: 'Filter to calls with response status <= this value' },
        urlContains: { type: 'string', description: 'Filter to calls whose URL contains this substring (case-insensitive)' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'get_page_text',
    description: 'Get the full text content of a single page from a previously completed scrape. Use this when scrape_url truncated the text and you need more.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID returned by scrape_url' },
        pageIndex: { type: 'number', description: 'Which page to read (0 = first page, default: 0)' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'to_markdown',
    description: 'Convert a scraped page into clean Markdown. Ideal for reading article content, documentation, or structured data.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID from scrape_url' },
        pageIndex: { type: 'number', description: 'Which page to convert (default: 0)' },
      },
      required: ['sessionId'],
    },
  },

  // ── Tier 3: Security & analysis ───────────────────────────────────────────

  {
    name: 'probe_endpoints',
    description: 'Probe a domain for exposed hidden endpoints: admin panels, .env files, GraphQL playgrounds, debug routes, backup files, git repos, health checks, and 80+ other common paths. Returns all accessible paths with HTTP status codes.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Target URL (origin is used — e.g. https://example.com)' },
        concurrency: { type: 'number', description: 'Parallel probe threads (default: 10, max: 20)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'scan_pii',
    description: 'Scan a saved scrape result for exposed PII and secrets: API keys, Bearer tokens, AWS keys, GitHub tokens, Stripe keys, DB connection strings, private keys, SSNs, credit cards, private IPs, and internal hostnames. Results are risk-ranked CRITICAL/HIGH/MEDIUM/LOW.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID from scrape_url' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'introspect_graphql',
    description: 'Run a full GraphQL introspection query against an endpoint to discover its schema: all types, query fields, mutations, enums, interfaces. Can also auto-discover the endpoint from a saved scrape.',
    inputSchema: {
      type: 'object',
      properties: {
        endpoint: { type: 'string', description: 'GraphQL endpoint URL (e.g. https://api.example.com/graphql). Leave blank to auto-discover from sessionId.' },
        sessionId: { type: 'string', description: 'Session ID to auto-discover the GraphQL endpoint from (used if endpoint not provided)' },
        authHeader: { type: 'string', description: 'Optional Authorization header value (e.g. "Bearer token123")' },
      },
    },
  },

  // ── Tier 4: Saves & history ────────────────────────────────────────────────

  {
    name: 'list_saves',
    description: 'List all previously saved scrape results with their metadata.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'delete_save',
    description: 'Permanently delete a saved scrape result and all associated data. Returns the save metadata (URL, page count, timestamps) captured before deletion so you have a record of what was removed.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID of the saved scrape to delete' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'compare_scrapes',
    description: 'Compare two saved scrape results and return a structured diff — pages added/removed, links changed, API calls changed, content changes.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionIdA: { type: 'string', description: 'First scrape session ID' },
        sessionIdB: { type: 'string', description: 'Second scrape session ID' },
      },
      required: ['sessionIdA', 'sessionIdB'],
    },
  },
  {
    name: 'infer_schema',
    description: 'Infer TypeScript interfaces and JSON Schema from GraphQL calls captured during a scrape.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID from scrape_url' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'export_har',
    description: 'Export network traffic from a saved scrape as HAR 1.2 format. Returns a summary (entry count, status code breakdown, top domains, average timing) by default. Pass includeRaw: true to get the full HAR object for import into browser DevTools, Charles Proxy, or Postman.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId:  { type: 'string', description: 'Session ID from scrape_url' },
        includeRaw: { type: 'boolean', description: 'Include the full HAR object in the response (default: false — summary only)' },
      },
      required: ['sessionId'],
    },
  },

  // ── Tier 5: Scheduling ─────────────────────────────────────────────────────

  {
    name: 'schedule_scrape',
    description: 'Create a recurring scheduled scrape using a cron expression. The scraper will run automatically on the schedule and save results. Useful for monitoring pages for changes.',
    inputSchema: {
      type: 'object',
      properties: {
        cronExpr:    { type: 'string', description: 'Cron expression (e.g. "0 9 * * 1-5" = 9am weekdays, "*/30 * * * *" = every 30 min)' },
        url:         { type: 'string', description: 'URL to scrape on the schedule' },
        label:       { type: 'string', description: 'Optional human-readable name for this schedule (e.g. "Morning prices" or "Daily news")' },
        maxPages:    { type: 'number', description: 'Max pages to scrape each run (default: 1)' },
        captureGraphQL: { type: 'boolean', description: 'Capture GraphQL calls (default: true)' },
        captureREST:    { type: 'boolean', description: 'Capture REST calls (default: true)' },
      },
      required: ['cronExpr', 'url'],
    },
  },
  {
    name: 'list_schedules',
    description: 'List all active scheduled scrape jobs with their cron expressions, last run time, status, and recent history.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'delete_schedule',
    description: 'Permanently cancel and remove a scheduled scrape job. Returns the deleted schedule\'s details (URL, cron expression, last run time) so you have a record of what was removed.',
    inputSchema: {
      type: 'object',
      properties: {
        scheduleId: { type: 'string', description: 'Schedule ID to delete (from list_schedules)' },
      },
      required: ['scheduleId'],
    },
  },

  // ── Tier 6: Code generation ────────────────────────────────────────────────

  {
    name: 'generate_react',
    description: 'Generate a React functional component from a scraped page — including navigation, headings, images, links, and text blocks. Good starting point for rebuilding a UI.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID from scrape_url' },
        pageIndex: { type: 'number', description: 'Which page to generate from (default: 0)' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'generate_css',
    description: 'Generate starter CSS from a scraped page, including discovered CSS variables, color palette, and layout styles. Returns the CSS string plus a list of extracted CSS custom properties for quick inspection.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID from scrape_url' },
        pageIndex: { type: 'number', description: 'Which page to generate from (default: 0)' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'generate_sitemap',
    description: 'Generate an XML sitemap from all pages captured in a saved scrape.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID from scrape_url' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'list_active_scrapes',
    description: 'List all currently running and paused scrape sessions with their live status, page counts, elapsed time, and any errors. Use this before calling stop_scrape or pause_scrape to confirm the session is still active.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_scrape_status',
    description: 'Get the current status of a live scrape or the final status of a saved scrape.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID to inspect' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'get_save_overview',
    description: 'Return a compact, high-signal overview of a saved scrape: counts, sections, tech, API surface, cookie summary, and likely follow-up issues.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID from scrape_url' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'find_site_issues',
    description: 'Inspect a saved scrape for likely issues such as security-header gaps, client errors, auth leakage text, context mismatches, and crawl failures.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID from scrape_url' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'get_robots_txt',
    description: 'Fetch and parse robots.txt for a URL. Returns disallowed paths, allowed paths, crawl delay, and referenced sitemaps — all per user-agent. Reveals what the site intentionally hides from crawlers.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL of the site (any page URL — the origin robots.txt will be fetched)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'extract_deals',
    description: 'Extract likely deals, offers, coupons, or sale snippets from saved page content and captured API payloads.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID from scrape_url' },
        pageIndex: { type: 'number', description: 'Optional page index to focus the extraction on a single saved page' },
        limit: { type: 'number', description: 'Maximum deals to return (default: 25)' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'list_internal_pages',
    description: 'List internal saved pages with section and depth metadata so an agent can navigate a scrape cheaply without loading every page.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID from scrape_url' },
        section: { type: 'string', description: 'Optional top-level section to filter by, e.g. products or docs' },
        limit: { type: 'number', description: 'Maximum pages to return (default: 100)' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'get_api_surface',
    description: 'Summarize captured API traffic into grouped endpoints, GraphQL operations, query parameter keys, and auth hints.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID from scrape_url' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'get_store_context',
    description: 'Compare visible page store/location signals against background API traffic to spot leaked or conflicting store context.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID from scrape_url' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'search_scrape_text',
    description: 'Search saved page text, titles, descriptions, and headings without loading the entire scrape payload.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID from scrape_url' },
        query: { type: 'string', description: 'Search term or phrase' },
        limit: { type: 'number', description: 'Maximum matches to return (default: 20)' },
        snippetChars: { type: 'number', description: 'Approximate snippet size around each match (default: 160)' },
      },
      required: ['sessionId', 'query'],
    },
  },
  {
    name: 'list_links',
    description: 'List links captured in a saved scrape, either for one page or aggregated across pages.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID from scrape_url' },
        pageIndex: { type: 'number', description: 'Optional page index to limit the results to one page' },
        internalOnly: { type: 'boolean', description: 'Return only internal links' },
        limit: { type: 'number', description: 'Maximum links to return (default: 100)' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'list_forms',
    description: 'List forms captured in a saved scrape, including fields and source page metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID from scrape_url' },
        pageIndex: { type: 'number', description: 'Optional page index to limit the results to one page' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'list_images',
    description: 'List image assets captured in a saved scrape. Returns per-image alt text, dimensions, and download status, plus a summary of alt-text coverage (total, missing, descriptive) useful for SEO and accessibility audits.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID from scrape_url' },
        pageIndex: { type: 'number', description: 'Optional page index to limit the results to one page' },
        limit: { type: 'number', description: 'Maximum images to return (default: 100)' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'get_tech_stack',
    description: 'Return a compact technology, security, and cookie summary for a saved scrape.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID from scrape_url' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'find_graphql_endpoints',
    description: 'Discover likely GraphQL endpoints from captured API traffic in a saved scrape.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID from scrape_url' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'preflight_url',
    description: 'Do a lightweight readiness check before scraping a URL. No browser launch.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Target URL to preflight' },
      },
      required: ['url'],
    },
  },
  {
    name: 'map_site_for_goal',
    description: 'Map a site for a user goal before scraping. Explores likely relevant sections, tabs, links, and APIs, then returns a structured scrape plan. Use maxRounds to cap how many follow-up crawl rounds it will attempt (default varies by exhaustive flag; set 1–3 for fast results on large sites). Supports optional authentication for sites behind a login wall.',
    inputSchema: {
      type: 'object',
      properties: {
        url:             { type: 'string',  description: 'Starting URL for the site or section to map' },
        goal:            { type: 'string',  description: 'Plain-language target such as "find all deals", "games under $100", or "find all support docs"' },
        scopeLevel:      { type: 'number',  description: 'Origin-expansion level: 1 = same site + related origins (default), 2 = broader goal-relevant cross-origin, 3 = full-web exploratory mode' },
        exhaustive:      { type: 'boolean', description: 'When true, continue much more aggressively before stopping (default: false)' },
        includeApiHints: { type: 'boolean', description: 'Include grouped API/UI linkage hints in the orientation result (default: true)' },
        maxRounds:       { type: 'number',  description: 'Hard cap on follow-up crawl rounds (default: 3 normal / 6 exhaustive). Set to 1 for a single-pass quick map on large sites.' },
        username:        { type: 'string',  description: 'Optional username/email if the site requires login' },
        password:        { type: 'string',  description: 'Optional password for login' },
        totpSecret:      { type: 'string',  description: 'Optional base32 TOTP secret for 2FA login' },
        ssoProvider:     { type: 'string',  description: 'Optional SSO/OAuth provider (e.g. "google", "github")' },
      },
      required: ['url', 'goal'],
    },
  },
  {
    name: 'research_url',
    description: 'Scrape a URL with a real browser then use the connected AI model to analyze the content and directly answer your question. One call replaces scrape_url → get_page_text → manual reading. Works for any site and any question: finding deals, upcoming releases, product comparisons, news summaries, job listings, menu items, changelog diffs, competitive research, or anything else. Falls back to keyword extraction if no AI model is connected.',
    inputSchema: {
      type: 'object',
      properties: {
        url:         { type: 'string',  description: 'URL to scrape and analyze' },
        question:    { type: 'string',  description: 'What to find or answer, e.g. "what upcoming Pokemon TCG sets are announced?" or "what electronics deals are available today?"' },
        maxPages:    { type: 'number',  description: 'Max pages to scrape before analyzing (default: 3)' },
        scrapeDepth: { type: 'number',  description: 'Link depth to follow (default: 1)' },
        autoScroll:  { type: 'boolean', description: 'Auto-scroll pages to trigger lazy loading (default: false)' },
        mode:        { type: 'string',  enum: ['auto', 'fast', 'deep'], description: 'Analysis mode. auto lets the AI choose the approach, fast is optimized for speed, deep is more thorough.' },
        includeEvidence: { type: 'boolean', description: 'Include ranked evidence snippets and links in the response (default: false)' },
        username:    { type: 'string',  description: 'Optional username/email if the site requires login before analysis' },
        password:    { type: 'string',  description: 'Optional password for login' },
        totpSecret:  { type: 'string',  description: 'Optional base32 TOTP secret for 2FA login' },
        ssoProvider: { type: 'string',  description: 'Optional SSO/OAuth provider (e.g. "google", "github")' },
      },
      required: ['url', 'question'],
    },
  },
  {
    name: 'http_fetch',
    description: 'Make a plain HTTP/HTTPS request — no browser, no Playwright. Ideal for JSON APIs and plain HTML pages that do not require JavaScript rendering. Supports GET and POST, custom headers, request body, cookie reuse from a prior scrape session, and automatic redirect following (up to 10 hops). Returns status, headers, final URL, redirect chain, and body (up to 100 KB). Much faster and less detectable than a full scrape.',
    inputSchema: {
      type: 'object',
      properties: {
        url:             { type: 'string',  description: 'Full URL to fetch' },
        method:          { type: 'string',  enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'], description: 'HTTP method (default: GET)' },
        headers:         { type: 'object',  description: 'Extra request headers (e.g. { "Authorization": "Bearer ..." })' },
        body:            { type: ['string', 'object'], description: 'Request body for POST/PUT/PATCH — string or JSON object. JSON objects are serialized automatically.' },
        sessionId:       { type: 'string',  description: 'Optional: reuse cookies from a previously completed scrape session (from scrape_url). Useful for hitting authenticated API endpoints after a browser login.' },
        maxBytes:        { type: 'number',  description: 'Max response bytes to return (default 102400 = 100 KB)' },
        followRedirects: { type: 'boolean', description: 'Follow HTTP 301/302/303/307/308 redirects automatically up to 10 hops. The response includes a redirectChain field listing each hop. (default: true)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'test_tls_fingerprint',
    description: 'Analyze the Node.js TLS fingerprint and compare it to a browser profile (Chrome, Firefox). Reports cipher suite overlap, generates a config snippet to make Node.js requests more browser-like, and optionally connects to a target host to observe what TLS parameters are negotiated. Useful for understanding why direct HTTP requests may be flagged by Akamai/PingAccess bot detection while Playwright (which uses real Chromium) is not.',
    inputSchema: {
      type: 'object',
      properties: {
        compareProfile: { type: 'string', enum: ['chrome-115', 'firefox-117'], description: 'Browser profile to compare against (default: chrome-115)' },
        targetHost:     { type: 'string', description: 'Optional hostname to TLS-connect to and observe negotiated cipher (e.g. example.com)' },
        targetPort:     { type: 'number', description: 'Port for targetHost connection (default: 443)' },
      },
      required: [],
    },
  },
  {
    name: 'test_oidc_security',
    description: 'Lab tool for OIDC/OAuth2 security testing. Tests redirect_uri whitelist validation, state parameter entropy, and JWT alg:none forgery against a LOCAL mock IdP server. Never targets production systems.',
    inputSchema: {
      type: 'object',
      properties: {
        mockServerUrl:    { type: 'string', description: 'Base URL of local mock IdP (e.g. http://localhost:9999)' },
        clientId:         { type: 'string', description: 'OIDC client_id registered on the mock server' },
        clientSecret:     { type: 'string', description: 'Client secret — required for alg_none_attack test' },
        validRedirectUri: { type: 'string', description: 'A known-good redirect_uri used as baseline for validation tests' },
        pkceClientId:     { type: 'string', description: 'Client ID that has PKCE enforced (used by pkce_enforcement test — default: pkce-client)' },
        targetClientId:   { type: 'string', description: 'Second tenant client ID for BOLA/IDOR cross-tenant test (default: vendor-a)' },
        resourceIds:      { type: 'array', items: { type: 'string' }, description: 'Resource IDs to probe in bola_idor test' },
        requestedScopes:  { type: 'array', items: { type: 'string' }, description: 'Scopes to attempt escalating to in scope_escalation test' },
        allowedScopes:    { type: 'array', items: { type: 'string' }, description: 'Scopes the client is legitimately registered for (scope_escalation baseline)' },
        tests: {
          type: 'array',
          items: { type: 'string', enum: [
            'redirect_uri_validation', 'state_entropy', 'alg_none_attack',
            'pkce_enforcement', 'token_rotation', 'bola_idor',
            'scope_escalation', 'header_injection', 'auth_code_replay', 'all',
          ] },
          description: 'Which tests to run — omit or pass ["all"] to run all nine',
        },
      },
      required: ['mockServerUrl', 'clientId'],
    },
  },

  // ── New tools ─────────────────────────────────────────────────────────────

  {
    name: 'extract_structured_data',
    description: 'Extract JSON-LD (schema.org), Open Graph, and Twitter Card structured data from a saved scrape page. Returns machine-readable data that sites embed for search engines — products, events, articles, breadcrumbs, recipes, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        saveId:    { type: 'string',  description: 'Session ID of the saved scrape' },
        pageIndex: { type: 'integer', description: 'Page index within the save (0 = first page)', default: 0 },
      },
      required: ['saveId'],
    },
  },

  {
    name: 'crawl_sitemap',
    description: 'Fetch and parse a site\'s sitemap.xml. Returns all URLs listed — instantly, without a browser. Handles sitemap index files (multiple child sitemaps). Great for getting a complete URL inventory of a site before scraping.',
    inputSchema: {
      type: 'object',
      properties: {
        url:         { type: 'string',  description: 'URL of the site or a direct sitemap.xml URL (e.g. https://example.com or https://example.com/sitemap.xml)' },
        maxUrls:     { type: 'integer', description: 'Max URLs to return (default 500)', default: 500 },
        maxSitemaps: { type: 'integer', description: 'Max child sitemaps to follow for sitemap indexes (default 5)', default: 5 },
      },
      required: ['url'],
    },
  },

  {
    name: 'take_screenshot',
    description: 'Navigate to a URL and capture a screenshot using Playwright. Returns a base64-encoded PNG. Useful for visual verification, UI debugging, before/after comparisons, and evidence capture.',
    inputSchema: {
      type: 'object',
      properties: {
        url:      { type: 'string',  description: 'URL to screenshot' },
        fullPage: { type: 'boolean', description: 'Capture full scrollable page instead of just viewport (default false)', default: false },
        waitMs:   { type: 'integer', description: 'Milliseconds to wait after page load before capture (default 1000)', default: 1000 },
      },
      required: ['url'],
    },
  },

  {
    name: 'fill_form',
    description: 'Navigate to a URL, fill in form fields by CSS selector, and submit. Returns the resulting page content. Use for search boxes, filters, contact forms, or any form that loads new content on submit.',
    inputSchema: {
      type: 'object',
      properties: {
        url:            { type: 'string', description: 'URL of the page containing the form' },
        fields:         {
          type: 'array',
          description: 'Form fields to fill',
          items: {
            type: 'object',
            properties: {
              selector: { type: 'string', description: 'CSS selector for the input field (e.g. "input[name=q]", "#search")' },
              value:    { type: 'string', description: 'Value to type into the field' },
            },
            required: ['selector', 'value'],
          },
        },
        submitSelector: { type: 'string',  description: 'CSS selector for the submit button. If omitted, presses Enter on the last field.' },
        waitMs:         { type: 'integer', description: 'Milliseconds to wait after submit before capturing result (default 2000)', default: 2000 },
      },
      required: ['url', 'fields'],
    },
  },

  {
    name: 'open_browser_session',
    description: 'Open a persistent browser automation session for AI-guided interaction. Returns a browserSessionId plus an initial page snapshot with interactable elements and warnings.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to open in the browser session. Optional when restoreSaveId is provided.' },
        viewMode: { type: 'string', enum: ['console', 'desktop', 'both'], description: 'How the browser should be shown: in-app live console, visible desktop browser, or both. Default: console.' },
        persistenceMode: { type: 'string', enum: ['ephemeral', 'auth_state', 'full_session'], description: 'How much state should be saveable and restorable. Default: auth_state.' },
        restoreSaveId: { type: 'string', description: 'Optional browserSaveId to restore into a new live session.' },
      },
    },
  },
  {
    name: 'list_browser_sessions',
    description: 'List all active browser automation sessions, including current URL, view mode, save linkage, and latest narration.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_browser_session_saves',
    description: 'List saved browser automation states that can be restored later. Useful for reusing authenticated sessions or resuming multi-step flows.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_browser_session_state',
    description: 'Get the current state of a live browser automation session, including the latest page snapshot, recent narration, interactables, logs, and network hints.',
    inputSchema: {
      type: 'object',
      properties: {
        browserSessionId: { type: 'string', description: 'Live browser session ID returned by open_browser_session' },
        refreshSnapshot: { type: 'boolean', description: 'Refresh the page snapshot before returning state (default: false)' },
      },
      required: ['browserSessionId'],
    },
  },
  {
    name: 'navigate_browser_session',
    description: 'Navigate an existing browser session to a new URL and return the updated page snapshot.',
    inputSchema: {
      type: 'object',
      properties: {
        browserSessionId: { type: 'string', description: 'Live browser session ID' },
        url: { type: 'string', description: 'Destination URL' },
        waitMs: { type: 'integer', description: 'Optional extra wait after navigation before inspection (default 0)' },
      },
      required: ['browserSessionId', 'url'],
    },
  },
  {
    name: 'inspect_browser_page',
    description: 'Inspect the current browser page and return an AI-friendly snapshot: visible text summary, forms, interactables, warnings, and stable element IDs for follow-up actions.',
    inputSchema: {
      type: 'object',
      properties: {
        browserSessionId: { type: 'string', description: 'Live browser session ID' },
      },
      required: ['browserSessionId'],
    },
  },
  {
    name: 'click_browser_element',
    description: 'Click an element in a live browser session. Prefer elementId from inspect_browser_page, but raw CSS selectors are accepted as a fallback.',
    inputSchema: {
      type: 'object',
      properties: {
        browserSessionId: { type: 'string', description: 'Live browser session ID' },
        elementId: { type: 'string', description: 'Stable element ID returned by inspect_browser_page' },
        selector: { type: 'string', description: 'Fallback CSS selector if elementId is unavailable' },
        waitMs: { type: 'integer', description: 'Optional wait after the click before re-inspecting the page' },
      },
      required: ['browserSessionId'],
    },
  },
  {
    name: 'type_into_browser_element',
    description: 'Type text into an input, textarea, or editable control within a live browser session and return the updated page snapshot.',
    inputSchema: {
      type: 'object',
      properties: {
        browserSessionId: { type: 'string', description: 'Live browser session ID' },
        elementId: { type: 'string', description: 'Stable element ID returned by inspect_browser_page' },
        selector: { type: 'string', description: 'Fallback CSS selector if elementId is unavailable' },
        value: { type: 'string', description: 'Text to type into the element' },
        waitMs: { type: 'integer', description: 'Optional wait after typing before re-inspecting the page' },
      },
      required: ['browserSessionId', 'value'],
    },
  },
  {
    name: 'select_browser_option',
    description: 'Select a new value in a dropdown within a live browser session and return the updated page snapshot.',
    inputSchema: {
      type: 'object',
      properties: {
        browserSessionId: { type: 'string', description: 'Live browser session ID' },
        elementId: { type: 'string', description: 'Stable element ID returned by inspect_browser_page' },
        selector: { type: 'string', description: 'Fallback CSS selector if elementId is unavailable' },
        value: { type: 'string', description: 'Option value to select' },
        label: { type: 'string', description: 'Fallback visible option label to select when value is unavailable' },
        waitMs: { type: 'integer', description: 'Optional wait after selecting before re-inspecting the page' },
      },
      required: ['browserSessionId'],
    },
  },
  {
    name: 'wait_for_browser_state',
    description: 'Wait for a browser page to reach a target state such as a selector appearing, text showing up, or the URL changing, then return a fresh page snapshot.',
    inputSchema: {
      type: 'object',
      properties: {
        browserSessionId: { type: 'string', description: 'Live browser session ID' },
        selector: { type: 'string', description: 'Optional CSS selector to wait for' },
        state: { type: 'string', enum: ['attached', 'detached', 'visible', 'hidden'], description: 'Desired selector state when selector is provided (default: visible)' },
        textIncludes: { type: 'string', description: 'Optional body text that must appear before returning' },
        urlIncludes: { type: 'string', description: 'Optional URL fragment that must appear before returning' },
        loadState: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle'], description: 'Optional Playwright load state to await' },
        timeoutMs: { type: 'integer', description: 'Maximum wait time in milliseconds (default: 15000)' },
        settleMs: { type: 'integer', description: 'Optional quiet period after the wait condition succeeds' },
      },
      required: ['browserSessionId'],
    },
  },
  {
    name: 'browser_session_screenshot',
    description: 'Capture a screenshot of the current page in a live browser session. The cursor and public narration overlay remain visible for easier debugging.',
    inputSchema: {
      type: 'object',
      properties: {
        browserSessionId: { type: 'string', description: 'Live browser session ID' },
        fullPage: { type: 'boolean', description: 'Capture the full scrollable page instead of only the viewport (default false)' },
        waitMs: { type: 'integer', description: 'Optional wait before capture in milliseconds' },
      },
      required: ['browserSessionId'],
    },
  },
  {
    name: 'run_browser_steps',
    description: 'Execute a compact multi-step browser automation workflow inside one live session. Step types supported in v1: navigate, inspect, click, type, select, wait, screenshot, and scrape.',
    inputSchema: {
      type: 'object',
      properties: {
        browserSessionId: { type: 'string', description: 'Live browser session ID' },
        steps: {
          type: 'array',
          description: 'Ordered list of browser actions to run in sequence',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', description: 'Step type: navigate, inspect, click, type, select, wait, screenshot, or scrape' },
            },
            required: ['type'],
          },
        },
      },
      required: ['browserSessionId', 'steps'],
    },
  },
  {
    name: 'save_browser_session',
    description: 'Save the current browser session state to disk for later restoration. Supports auth-state snapshots and fuller multi-tab session replays.',
    inputSchema: {
      type: 'object',
      properties: {
        browserSessionId: { type: 'string', description: 'Live browser session ID' },
        name: { type: 'string', description: 'Optional human-readable label for the saved browser state' },
      },
      required: ['browserSessionId'],
    },
  },
  {
    name: 'scrape_browser_session',
    description: 'Hand the current live browser state off to the scraper so authenticated cookies and storage can be reused for a normal scrape capture.',
    inputSchema: {
      type: 'object',
      properties: {
        browserSessionId: { type: 'string', description: 'Live browser session ID' },
        url: { type: 'string', description: 'Optional URL override. Defaults to the current browser page.' },
        maxPages: { type: 'integer', description: 'Max pages to capture in the scraper handoff (default: 3)' },
        scrapeDepth: { type: 'integer', description: 'Depth to follow links during the scraper handoff (default: 1)' },
        captureGraphQL: { type: 'boolean', description: 'Capture GraphQL during the scrape handoff (default: true)' },
        captureREST: { type: 'boolean', description: 'Capture REST during the scrape handoff (default: true)' },
        captureAssets: { type: 'boolean', description: 'Capture asset URLs during the scrape handoff (default: true)' },
        autoScroll: { type: 'boolean', description: 'Auto-scroll pages during the scrape handoff (default: false)' },
        fullCrawl: { type: 'boolean', description: 'Use full site crawl mode during the scrape handoff (default: false)' },
      },
      required: ['browserSessionId'],
    },
  },
  {
    name: 'close_browser_session',
    description: 'Close a live browser automation session and free its browser resources. Non-ephemeral sessions auto-save on close when possible.',
    inputSchema: {
      type: 'object',
      properties: {
        browserSessionId: { type: 'string', description: 'Live browser session ID' },
      },
      required: ['browserSessionId'],
    },
  },
  {
    name: 'delete_browser_session_save',
    description: 'Delete a saved browser session snapshot from disk. Use when an authenticated or replayable state is stale or no longer needed.',
    inputSchema: {
      type: 'object',
      properties: {
        browserSaveId: { type: 'string', description: 'Saved browser state ID returned by save_browser_session' },
      },
      required: ['browserSaveId'],
    },
  },

  {
    name: 'monitor_page',
    description: 'Watch a URL for changes. First call (no monitorId) scrapes and stores a baseline. Subsequent calls with the same monitorId scrape again, diff against baseline, and return what changed. Combines scheduling intent with automatic comparison.',
    inputSchema: {
      type: 'object',
      properties: {
        url:       { type: 'string',  description: 'URL to monitor' },
        monitorId: { type: 'string',  description: 'Monitor ID from a previous call. Omit to create a new monitor.' },
        maxPages:  { type: 'integer', description: 'Pages to scrape per check (default 1)', default: 1 },
      },
      required: ['url'],
    },
  },

  {
    name: 'delete_monitor',
    description: 'Permanently delete a page monitor and its stored baseline. Returns the monitor details (URL, creation date, last check time) captured before deletion so you have a record of what was removed.',
    inputSchema: {
      type: 'object',
      properties: {
        monitorId: { type: 'string', description: 'Monitor ID to delete' },
      },
      required: ['monitorId'],
    },
  },

  // ── Tier N: New analytical tools ─────────────────────────────────────────

  {
    name: 'decode_jwt_tokens',
    description: 'Extract and decode all JWT tokens found in a scrape result (headers, localStorage, cookies, response bodies). Returns decoded claims, expiry, security flags, and a score.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID of a completed scrape' },
      },
      required: ['sessionId'],
    },
  },

  {
    name: 'lookup_dns',
    description: 'Perform a full DNS lookup (A, AAAA, MX, TXT, NS, CNAME, SOA) for any domain. Returns email provider inference, SPF/DKIM/DMARC analysis, and service verification tokens.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL or hostname to look up' },
      },
      required: ['url'],
    },
  },

  {
    name: 'inspect_ssl',
    description: 'Inspect the TLS/SSL certificate for any domain. Returns subject, issuer, SANs (potential subdomains), expiry, key size, cipher, and security flags.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL or hostname to inspect' },
        port: { type: 'number', description: 'Port (default 443)' },
      },
      required: ['url'],
    },
  },

  {
    name: 'score_security_headers',
    description: 'Score the security headers from a scrape result 0–100 with a letter grade (A+–F). Returns per-header analysis (CSP, HSTS, X-Frame-Options, etc.) and prioritized recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID of a completed scrape (reads securityHeaders from the result)' },
        headers: { type: 'object', description: 'Raw headers object to score directly (alternative to sessionId)' },
      },
    },
  },

  {
    name: 'get_link_graph',
    description: 'Build a directed link graph from a scrape result. Returns hub pages, authority pages, orphan pages, dead ends, subdomain discovery, and redirect chains.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID of a completed scrape' },
      },
      required: ['sessionId'],
    },
  },

  {
    name: 'check_broken_links',
    description: 'Check all links in a scrape result for broken URLs (HEAD requests, rate-limited, concurrent). Returns broken links, redirects, and ok count.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID of a completed scrape' },
        internalOnly: { type: 'boolean', description: 'Only check internal links (default false)' },
        maxLinks: { type: 'number', description: 'Maximum links to check (default 100)' },
      },
      required: ['sessionId'],
    },
  },

  {
    name: 'extract_product_data',
    description: 'Extract structured e-commerce product data from a scrape result page. Returns name, price, currency, availability, rating, variants, images, and SKU from JSON-LD and DOM.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID of a completed scrape' },
        pageIndex: { type: 'number', description: 'Page index (default 0)' },
      },
      required: ['sessionId'],
    },
  },

  {
    name: 'extract_job_listings',
    description: 'Extract structured job listing data from a scrape result page. Returns title, location, salary, employment type, skills, apply URL from JSON-LD JobPosting and DOM.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID of a completed scrape' },
        pageIndex: { type: 'number', description: 'Page index (default 0)' },
      },
      required: ['sessionId'],
    },
  },

  {
    name: 'extract_company_info',
    description: 'Extract structured company information from a scrape result (About/Home/Contact page). Returns name, founding date, employee count, address, registration number, industry, and social profiles.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID of a completed scrape' },
        pageIndex: { type: 'number', description: 'Page index (default 0)' },
      },
      required: ['sessionId'],
    },
  },

  {
    name: 'classify_pages',
    description: 'Classify each page in a scrape result by type (product, blog, checkout, about, contact, pricing, login, dashboard, etc.) with confidence scores and signals. Returns a structured breakdown for the AI to reason about.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID of a completed scrape' },
      },
      required: ['sessionId'],
    },
  },

  {
    name: 'flag_anomalies',
    description: 'Algorithmically flag anomalies in a scrape result: pages significantly larger or smaller than average, high error rates, excessive external domains, missing expected content. Returns structured anomaly list.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID of a completed scrape' },
      },
      required: ['sessionId'],
    },
  },

  {
    name: 'find_patterns',
    description: 'Find repeating patterns across all scraped pages: common CSS selectors, URL structures, API endpoint patterns, heading hierarchies, and DOM structural similarities. Returns frequency analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID of a completed scrape' },
      },
      required: ['sessionId'],
    },
  },

  {
    name: 'extract_business_intel',
    description: 'Extract business intelligence from a scrape result: pricing tiers, competitor mentions, key metrics, contact info, tech stack, and company facts — all structured for AI analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID of a completed scrape' },
        pageIndex: { type: 'number', description: 'Page index (default: all pages)' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'extract_reviews',
    description: 'Extract review and rating data from a scraped page: aggregate rating, star score, review count, and individual reviews. Sources: JSON-LD Review/AggregateRating, Open Graph, and text patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID of a completed scrape' },
        pageIndex: { type: 'number', description: 'Page index (0-based). Omit to scan all pages and aggregate.' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'get_cache_headers',
    description: 'Extract Cache-Control, ETag, Last-Modified, Expires, and Vary headers from a scraped session. Returns the document-level cache policy plus per-request cache headers from REST and GraphQL API calls — useful for CDN analysis and performance audits.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID from a previous scrape' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'lookup_ip_info',
    description: 'Resolve a hostname or URL to its IP address, geolocation (country, city, timezone), ISP, ASN, and hosting provider via ip-api.com. Useful for infrastructure fingerprinting and CDN/host identification.',
    inputSchema: {
      type: 'object',
      properties: {
        hostname: { type: 'string', description: 'Hostname or full URL to look up (e.g. "example.com" or "https://example.com/path")' },
      },
      required: ['hostname'],
    },
  },
  {
    name: 'get_page_word_count',
    description: 'Count words, sentences, and paragraphs in a saved page\'s extracted text. Useful for content analysis, SEO density checks, and readability scoring.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID of a completed scrape' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'run_agent',
    description: 'Run an autonomous multi-step agent loop powered by the connected AI via MCP sampling. The agent uses web scraping tools to accomplish a goal and broadcasts live progress to the web panel at localhost:12345/wsp (Agent tab). Supports pause, resume, and handoff.',
    inputSchema: {
      type: 'object',
      properties: {
        goal: { type: 'string', description: 'What the agent should accomplish — be specific' },
        maxSteps: { type: 'number', description: 'Maximum steps before stopping (default 20)' },
        agentId: { type: 'string', description: 'Optional: attach to an existing pending run from the web panel' },
      },
      required: ['goal'],
    },
  },
  {
    name: 'server_info',
    description: 'Report MCP server diagnostics: version, exposed toolset, protocol capabilities, local directories, environment flags, and local REST server readiness. Helpful for health checks and debugging client integrations.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

const READ_ONLY_TOOL_NAMES = new Set([
  'detect_site',
  'check_saved_session',
  'get_known_site_credentials',
  'get_api_calls',
  'get_page_text',
  'to_markdown',
  'probe_endpoints',
  'scan_pii',
  'introspect_graphql',
  'list_saves',
  'compare_scrapes',
  'infer_schema',
  'export_har',
  'list_schedules',
  'generate_react',
  'generate_css',
  'generate_sitemap',
  'list_active_scrapes',
  'get_scrape_status',
  'get_save_overview',
  'find_site_issues',
  'extract_deals',
  'list_internal_pages',
  'get_api_surface',
  'get_store_context',
  'search_scrape_text',
  'list_links',
  'list_forms',
  'list_images',
  'get_tech_stack',
  'find_graphql_endpoints',
  'preflight_url',
  'http_fetch',
  'research_url',
  'test_oidc_security',
  'test_tls_fingerprint',
  'extract_structured_data',
  'crawl_sitemap',
  'list_browser_sessions',
  'list_browser_session_saves',
  'get_browser_session_state',
  'inspect_browser_page',
  'wait_for_browser_state',
  'browser_session_screenshot',
  'decode_jwt_tokens',
  'lookup_dns',
  'inspect_ssl',
  'score_security_headers',
  'get_link_graph',
  'check_broken_links',
  'extract_product_data',
  'extract_job_listings',
  'extract_company_info',
  'classify_pages',
  'flag_anomalies',
  'find_patterns',
  'extract_business_intel',
  'extract_reviews',
  'get_cache_headers',
  'lookup_ip_info',
  'get_page_word_count',
  'get_robots_txt',
  'server_info',
]);

const DESTRUCTIVE_TOOL_NAMES = new Set([
  'clear_saved_session',
  'stop_scrape',
  'delete_save',
  'delete_schedule',
  'delete_monitor',
  'close_browser_session',
  'delete_browser_session_save',
]);

const OPEN_WORLD_TOOL_NAMES = new Set([
  'detect_site',
  'scrape_url',
  'batch_scrape',
  'extract_entities',
  'find_graphql_endpoints',
  'find_site_issues',
  'probe_endpoints',
  'introspect_graphql',
  'schedule_scrape',
  'preflight_url',
  'http_fetch',
  'research_url',
  'map_site_for_goal',
  'crawl_sitemap',
  'take_screenshot',
  'fill_form',
  'monitor_page',
  'lookup_ip_info',
  'open_browser_session',
  'navigate_browser_session',
  'inspect_browser_page',
  'click_browser_element',
  'type_into_browser_element',
  'select_browser_option',
  'wait_for_browser_state',
  'browser_session_screenshot',
  'run_browser_steps',
  'scrape_browser_session',
  'get_robots_txt',
  'lookup_dns',
  'inspect_ssl',
  'get_cache_headers',
  'test_oidc_security',
  'test_tls_fingerprint',
  'check_broken_links',
  'run_agent',
]);

TOOLS.forEach((tool) => {
  tool.title = tool.title || humanizeToolName(tool.name);
  tool.annotations = {
    readOnlyHint: READ_ONLY_TOOL_NAMES.has(tool.name),
    destructiveHint: DESTRUCTIVE_TOOL_NAMES.has(tool.name),
    idempotentHint: READ_ONLY_TOOL_NAMES.has(tool.name),
    openWorldHint: OPEN_WORLD_TOOL_NAMES.has(tool.name),
  };
});

function listToolsForCurrentToolset() {
  const allowed = TOOLSETS[activeToolset] ?? null;
  return allowed ? TOOLS.filter((tool) => allowed.includes(tool.name)) : TOOLS;
}

function getToolCatalog(tools = listToolsForCurrentToolset()) {
  return buildToolCatalog(tools, {
    readOnlyNames: READ_ONLY_TOOL_NAMES,
    openWorldNames: OPEN_WORLD_TOOL_NAMES,
    destructiveNames: DESTRUCTIVE_TOOL_NAMES,
  });
}

function getPromptCatalog() {
  return buildPromptCatalog(PROMPTS);
}

function getMcpMeta() {
  const tools = getToolCatalog();
  const prompts = getPromptCatalog();
  return {
    server: {
      name: 'web-scraper',
      version: SERVER_VERSION,
      activeToolset,
      baseUrl: BASE_URL,
    },
    counts: {
      tools: tools.length,
      prompts: prompts.length,
      fixedResources: FIXED_RESOURCES.length,
      resourceTemplates: RESOURCE_TEMPLATES.length,
      workflows: STARTER_WORKFLOWS.length,
    },
    tools,
    prompts,
    resourceTemplates: RESOURCE_TEMPLATES,
    fixedResources: FIXED_RESOURCES,
    workflows: STARTER_WORKFLOWS,
  };
}

function isToolExposed(name) {
  return listToolsForCurrentToolset().some((tool) => tool.name === name);
}

async function callTool(name, args = {}, progressToken = null) {
  if (!TOOLS.some((tool) => tool.name === name)) {
    throw new Error(`Unknown tool: ${name}`);
  }
  if (!isToolExposed(name)) {
    throw new Error(`Tool "${name}" is not exposed by the active toolset profile "${activeToolset}"`);
  }
  return handleTool(name, args, progressToken);
}

// ── Helpers for tool handlers ───────────────────────────────────────────────

function buildRecommendedScrapeOptions(detection) {
  const base = {
    maxPages: 3,
    scrapeDepth: 1,
    captureGraphQL: true,
    captureREST: true,
    fullCrawl: false,
    autoScroll: false,
  };

  if (!detection) return base;

  const siteType = String(detection.siteType || '').toLowerCase();
  const botLevel = String(detection.botProtectionLevel || '').toLowerCase();
  const requiresAuth = !!detection.requiresAuth;

  // Use new detect_site fields when siteType isn't explicitly set
  const frameworks = detection.frameworks || [];
  const antiBot = detection.antiBot || [];
  const renderingMode = String(detection.renderingMode || '').toLowerCase();
  const cms = detection.cms || [];

  const isSpa = renderingMode.includes('spa') || siteType === 'spa';
  const isHighBot = botLevel === 'high' || antiBot.some(a => ['Cloudflare', 'DataDome', 'PerimeterX', 'Imperva'].includes(a));
  const isEcommerce = siteType === 'ecommerce' || cms.some(c => ['Shopify', 'Magento', 'BigCommerce'].includes(c));
  const isStatic = siteType === 'static' || (!frameworks.length && !cms.length && !isSpa);

  if (requiresAuth) {
    return { ...base, maxPages: 1, scrapeDepth: 0, captureGraphQL: true, captureREST: true };
  }
  if (isHighBot) {
    return { ...base, maxPages: 1, autoScroll: false };
  }
  if (isSpa) {
    return { ...base, autoScroll: true, scrapeDepth: 2, captureGraphQL: true };
  }
  if (isEcommerce) {
    return { ...base, maxPages: 10, captureREST: true, autoScroll: true };
  }
  if (isStatic) {
    return { ...base, captureGraphQL: false, captureREST: false, maxPages: 5 };
  }
  return base;
}

// ── Monitor helpers ──────────────────────────────────────────────────────────

const MONITORS_FILE = path.join(__dirname, 'data', 'monitors.json');

function loadMonitors() {
  try {
    const raw = fs.readFileSync(MONITORS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveMonitors(monitors) {
  try {
    fs.mkdirSync(path.dirname(MONITORS_FILE), { recursive: true });
    fs.writeFileSync(MONITORS_FILE, JSON.stringify(monitors, null, 2), 'utf8');
  } catch {}
}

// ── Tool handlers ───────────────────────────────────────────────────────────

async function handleTool(name, args, progressToken = null) {
  const input = args || {};

  switch (name) {

    // ── detect_site ──────────────────────────────────────────────────────────
    case 'detect_site': {
      const url = ensureNonEmptyString(input.url, 'url');
      return expectOk(
        await get(`/api/detect?url=${encodeURIComponent(url)}`),
        'Failed to detect site'
      );
    }

    case 'check_saved_session': {
      const url = ensureNonEmptyString(input.url, 'url');
      const body = await expectOk(
        await get(`/api/session/check?url=${encodeURIComponent(url)}`),
        'Failed to check saved session'
      );
      return { url, exists: !!body?.exists };
    }

    case 'clear_saved_session': {
      const url = ensureNonEmptyString(input.url, 'url');
      const body = await expectOk(
        await del(`/api/session?url=${encodeURIComponent(url)}`),
        'Failed to clear saved session'
      );
      return { url, cleared: !!body?.cleared };
    }

    case 'get_known_site_credentials': {
      const url = ensureNonEmptyString(input.url, 'url');
      const body = await expectOk(
        await get(`/api/site-credentials?url=${encodeURIComponent(url)}`),
        'Failed to check configured credentials'
      );
      return {
        url,
        found: !!body?.found,
        usernameHint: body?.username || null,
      };
    }

    case 'list_active_scrapes': {
      return fetchActiveScrapes();
    }

    case 'get_scrape_status': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      return fetchScrapeStatus(sessionId);
    }

    case 'get_save_overview': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const save = await loadSave(sessionId);
      return buildSaveOverview(save);
    }

    case 'find_site_issues': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const save = await loadSave(sessionId);
      return findSiteIssues(save);
    }

    // ── get_robots_txt ────────────────────────────────────────────────────────
    case 'get_robots_txt': {
      const url = ensureNonEmptyString(input.url, 'url');
      const robots = await fetchAndParseRobots(url);
      const groups = (robots.userAgents || []).map((entry) => ({
        userAgent: entry.agent,
        disallow: entry.disallow || [],
        allow: entry.allow || [],
        crawlDelay: entry.crawlDelay ?? null,
      }));
      const allBots = groups.find((group) => group.userAgent === '*');
      return {
        found: robots.status === 'ok',
        status: robots.status,
        url: robots.url,
        groups,
        sitemaps: robots.sitemaps || [],
        allBotsDisallowed: allBots?.disallow || [],
        allBotsAllowed: allBots?.allow || [],
        isFullyBlocked: !!robots.hasFullBlock,
        crawlDelay: allBots?.crawlDelay || null,
        groupCount: groups.length,
        raw: robots.rawText || null,
        origin: robots.origin,
        httpStatus: robots.httpStatus || null,
        interestingDisallowed: robots.interestingDisallowed || [],
        crawlDelays: robots.crawlDelays || [],
      };
    }

    case 'extract_deals': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const save = await loadSave(sessionId);
      return extractDealsFromSave(save, {
        pageIndex: input.pageIndex,
        limit: input.limit,
      });
    }

    case 'list_internal_pages': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const save = await loadSave(sessionId);
      const limit = normalizeInteger(input.limit, {
        defaultValue: 100,
        min: 1,
        max: 500,
        name: 'limit',
      });
      const normalizedSection = input.section == null ? null : cleanText(input.section).toLowerCase();
      const pages = collectPageDescriptors(save)
        .filter((entry) => !normalizedSection || entry.section.toLowerCase() === normalizedSection)
        .slice(0, limit)
        .map((entry) => ({
          pageIndex: entry.pageIndex,
          url: entry.url,
          title: entry.title,
          description: entry.description,
          section: entry.section,
          depth: entry.depth,
          linkCount: entry.page?.links?.length || 0,
          formCount: entry.page?.forms?.length || 0,
          imageCount: entry.page?.images?.length || 0,
        }));

      return {
        sessionId,
        section: normalizedSection,
        count: pages.length,
        pages,
      };
    }

    case 'get_api_surface': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const save = await loadSave(sessionId);
      return buildApiSurface(save);
    }

    case 'get_store_context': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const save = await loadSave(sessionId);
      return collectStoreContext(save);
    }

    case 'search_scrape_text': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const save = await loadSave(sessionId);
      const results = searchSavedPages(save.pages || [], input.query, {
        limit: input.limit,
        snippetChars: input.snippetChars,
      });
      return {
        sessionId,
        query: ensureNonEmptyString(input.query, 'query'),
        count: results.length,
        matches: results,
      };
    }

    case 'list_links': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const save = await loadSave(sessionId);
      const limit = normalizeInteger(input.limit, {
        defaultValue: 100,
        min: 1,
        max: 500,
        name: 'limit',
      });
      const requestedPageIndex = input.pageIndex === undefined || input.pageIndex === null
        ? null
        : normalizeInteger(input.pageIndex, {
            defaultValue: 0,
            min: 0,
            max: 100000,
            name: 'pageIndex',
          });
      const pages = requestedPageIndex === null
        ? (save.pages || []).map((page, pageIndex) => ({ page, pageIndex }))
        : [{ ...(await loadSavedPage(sessionId, requestedPageIndex)) }];
      const links = dedupeBy(
        pages.flatMap(({ page, pageIndex }) => (page.links || []).map((link) => ({
          href: link.href || '',
          text: link.text || '',
          isInternal: !!link.isInternal,
          sourcePageIndex: pageIndex,
          sourceUrl: page.meta?.url || '',
        }))),
        (link) => `${link.href}|${link.text}|${link.sourcePageIndex}`
      )
        .filter((link) => link.href)
        .filter((link) => input.internalOnly ? link.isInternal : true)
        .slice(0, limit);

      return {
        sessionId,
        pageIndex: requestedPageIndex,
        internalOnly: !!input.internalOnly,
        count: links.length,
        links,
      };
    }

    case 'list_forms': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const save = await loadSave(sessionId);
      const requestedPageIndex = input.pageIndex === undefined || input.pageIndex === null
        ? null
        : normalizeInteger(input.pageIndex, {
            defaultValue: 0,
            min: 0,
            max: 100000,
            name: 'pageIndex',
          });
      const pages = requestedPageIndex === null
        ? (save.pages || []).map((page, pageIndex) => ({ page, pageIndex }))
        : [{ ...(await loadSavedPage(sessionId, requestedPageIndex)) }];
      const forms = pages.flatMap(({ page, pageIndex }) => (page.forms || []).map((form) => ({
        id: form.id || null,
        action: form.action || '',
        method: form.method || 'GET',
        fields: (form.fields || []).map((field) => ({
          name: field.name || '',
          type: field.type || '',
          label: field.label || '',
          required: !!field.required,
          placeholder: field.placeholder || '',
        })),
        sourcePageIndex: pageIndex,
        sourceUrl: page.meta?.url || '',
      })));

      return {
        sessionId,
        pageIndex: requestedPageIndex,
        count: forms.length,
        forms,
      };
    }

    case 'list_images': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const save = await loadSave(sessionId);
      const limit = normalizeInteger(input.limit, {
        defaultValue: 100,
        min: 1,
        max: 500,
        name: 'limit',
      });
      const requestedPageIndex = input.pageIndex === undefined || input.pageIndex === null
        ? null
        : normalizeInteger(input.pageIndex, {
            defaultValue: 0,
            min: 0,
            max: 100000,
            name: 'pageIndex',
          });
      const pages = requestedPageIndex === null
        ? (save.pages || []).map((page, pageIndex) => ({ page, pageIndex }))
        : [{ ...(await loadSavedPage(sessionId, requestedPageIndex)) }];
      const pageSources = new Map();
      const images = [];

      for (const { page, pageIndex } of pages) {
        const sourceUrl = page.meta?.url || '';
        for (const image of page.images || []) {
          if (image.src && !pageSources.has(image.src)) {
            pageSources.set(image.src, { sourcePageIndex: pageIndex, sourceUrl });
          }
          images.push({
            src: image.src || '',
            alt: image.alt || '',
            width: image.width ?? null,
            height: image.height ?? null,
            isBackgroundImage: !!image.isBackgroundImage,
            downloaded: false,
            sourcePageIndex: pageIndex,
            sourceUrl,
          });
        }
      }

      for (const image of save.downloadedImages || []) {
        const source = pageSources.get(image.src) || {
          sourcePageIndex: requestedPageIndex,
          sourceUrl: requestedPageIndex === null ? '' : pages[0]?.page?.meta?.url || '',
        };
        if (requestedPageIndex !== null && source.sourcePageIndex !== requestedPageIndex) continue;
        images.push({
          src: image.src || '',
          alt: image.alt || '',
          width: image.width ?? null,
          height: image.height ?? null,
          size: image.size ?? null,
          downloaded: true,
          sourcePageIndex: source.sourcePageIndex,
          sourceUrl: source.sourceUrl,
        });
      }

      const dedupedImages = dedupeBy(
        images.filter((image) => image.src),
        (image) => `${image.src}|${image.downloaded}|${image.sourcePageIndex}`
      );
      const missingAlt = dedupedImages.filter((img) => !img.alt || img.alt.trim() === '').length;
      const withAlt = dedupedImages.filter((img) => img.alt && img.alt.trim() !== '').length;
      return {
        sessionId,
        pageIndex: requestedPageIndex,
        count: Math.min(limit, dedupedImages.length),
        summary: {
          total: dedupedImages.length,
          missingAlt,
          withAlt,
          downloaded: dedupedImages.filter((img) => img.downloaded).length,
          backgroundImages: dedupedImages.filter((img) => img.isBackgroundImage).length,
          altCoveragePercent: dedupedImages.length > 0
            ? Math.round((withAlt / dedupedImages.length) * 100)
            : 0,
        },
        images: dedupedImages.slice(0, limit),
      };
    }

    case 'get_tech_stack': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const save = await loadSave(sessionId);
      const tech = {};
      for (const page of save.pages || []) {
        for (const [category, value] of Object.entries(page.tech || {})) {
          const list = Array.isArray(value) ? value : value ? [value] : [];
          tech[category] = dedupe([...(tech[category] || []), ...list]);
        }
      }

      return {
        sessionId,
        siteInfo: {
          title: save.pages?.[0]?.meta?.title || '',
          origin: save.startUrl || '',
        },
        pageCount: save.pages?.length || 0,
        failedPageCount: save.failedPages?.length || 0,
        apiCounts: {
          graphql: save.apiCalls?.graphql?.length || 0,
          rest: save.apiCalls?.rest?.length || 0,
        },
        tech,
        securityHeaders: save.securityHeaders || {},
        cookieSummary: summarizeCookieMetadata(save.cookies),
      };
    }

    case 'find_graphql_endpoints': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const save = await loadSave(sessionId);
      const endpoints = dedupe(discoverEndpoints({
        graphqlCalls: save.apiCalls?.graphql || [],
        restCalls: save.apiCalls?.rest || [],
      }));
      return {
        sessionId,
        count: endpoints.length,
        endpoints,
      };
    }

    case 'preflight_url': {
      const url = ensureNonEmptyString(input.url, 'url');
      const [detectionResult, savedSessionResult, credentialsResult] = await Promise.allSettled([
        get(`/api/detect?url=${encodeURIComponent(url)}`),
        get(`/api/session/check?url=${encodeURIComponent(url)}`),
        get(`/api/site-credentials?url=${encodeURIComponent(url)}`),
      ]);

      const warnings = [];
      const resolveOptional = async (settled, fallbackMessage, fallbackValue, warningPrefix) => {
        if (settled.status !== 'fulfilled') {
          warnings.push(`${warningPrefix}: ${settled.reason?.message || settled.reason}`);
          return fallbackValue;
        }
        try {
          return await expectOk(settled.value, fallbackMessage);
        } catch (err) {
          warnings.push(`${warningPrefix}: ${err.message}`);
          return fallbackValue;
        }
      };

      const detection = await resolveOptional(detectionResult, 'Failed to detect site', null, 'Detection unavailable');
      const sessionCheck = await resolveOptional(savedSessionResult, 'Failed to check saved session', { exists: false }, 'Saved session check unavailable');
      const credentialsCheck = await resolveOptional(credentialsResult, 'Failed to check configured credentials', { found: false }, 'Credential check unavailable');

      return {
        url,
        detection,
        hasSavedSession: !!sessionCheck?.exists,
        hasKnownCredentials: !!credentialsCheck?.found,
        recommendedScrapeOptions: buildRecommendedScrapeOptions(detection),
        warnings,
      };
    }

    case 'map_site_for_goal': {
      return mapSiteForGoal({
        url:             input.url,
        goal:            input.goal,
        scopeLevel:      input.scopeLevel,
        exhaustive:      !!input.exhaustive,
        includeApiHints: input.includeApiHints !== false,
        maxRounds:       typeof input.maxRounds === 'number' ? Math.max(1, Math.floor(input.maxRounds)) : undefined,
        username:        input.username || undefined,
        password:        input.password || undefined,
        totpSecret:      input.totpSecret || undefined,
        ssoProvider:     input.ssoProvider || undefined,
        _onProgress:     progressToken
          ? (done, total, msg) => sendProgress(progressToken, done, total, msg)
          : null,
      });
    }

    // ── research_url ─────────────────────────────────────────────────────────
    case 'research_url': {
      const startedAt = Date.now();
      const url = ensureNonEmptyString(input.url, 'url');
      const question = ensureNonEmptyString(input.question, 'question');
      const maxPages = normalizeInteger(input.maxPages, { defaultValue: 3, min: 1, max: 50, name: 'maxPages' });
      const scrapeDepth = normalizeInteger(input.scrapeDepth, { defaultValue: 1, min: 0, max: 5, name: 'scrapeDepth' });
      const autoScroll = !!input.autoScroll;
      const mode = normalizeResearchMode(input.mode || 'auto');
      const includeEvidence = !!input.includeEvidence;

      // 1. Scrape
      if (progressToken) await sendProgress(progressToken, 0, 3, 'Scraping page...');
      const scrapeStartedAt = Date.now();
      const { sessionId, result: scrapeResult } = await startScrapeAndWait({
        url, maxPages, scrapeDepth, autoScroll,
        captureGraphQL: false, captureREST: false,
        ...(input.username  ? { hasAuth: true, username: input.username } : {}),
        ...(input.password  ? { password: input.password } : {}),
        ...(input.totpSecret  ? { totpSecret: input.totpSecret } : {}),
        ...(input.ssoProvider ? { ssoProvider: input.ssoProvider } : {}),
      });
      const scrapeMs = Date.now() - scrapeStartedAt;

      // 2. Load full untruncated page texts from the saved session
      if (progressToken) await sendProgress(progressToken, 1, 3, `Scrape complete (${pages.length || 0} pages), loading content...`);
      let pages = [];
      try {
        const saveResponse = await get(`/api/saves/${sessionId}`);
        if (saveResponse.status >= 200 && saveResponse.status < 300 && Array.isArray(saveResponse.body?.pages)) {
          pages = saveResponse.body.pages.map(toResearchPage).filter(Boolean);
        }
      } catch {}

      // Fall back to summarised text if save load fails
      if (pages.length === 0 && scrapeResult?.pages) {
        pages = scrapeResult.pages.map(toResearchPage).filter(Boolean);
      }

      // 3. Analyze using auto routing or the requested profile.
      if (progressToken) await sendProgress(progressToken, 2, 3, `Analyzing ${pages.length} page(s)...`);
      const analysisStartedAt = Date.now();
      const analysis = await analyzeResearchQuestion(pages, question, {
        mode,
        includeEvidence,
      });
      const analysisMs = Date.now() - analysisStartedAt;

      return {
        url,
        question,
        sessionId,
        pagesScraped: pages.length,
        mode,
        routeUsed: analysis.routeUsed,
        modelUsed: analysis.modelUsed,
        timings: {
          scrapeMs,
          analysisMs,
          totalMs: Date.now() - startedAt,
        },
        ...analysis,
      };
    }

    // ── http_fetch ───────────────────────────────────────────────────────────
    case 'http_fetch': {
      const url      = ensureNonEmptyString(input.url, 'url');
      const method   = (input.method || 'GET').toUpperCase();
      const extraHeaders = (input.headers && typeof input.headers === 'object') ? input.headers : {};
      const maxBytes = typeof input.maxBytes === 'number' ? Math.min(input.maxBytes, 1024 * 1024) : 102400;
      const followRedirects = input.followRedirects !== false; // default true

      // Build request body
      let postData = null;
      let contentTypeHeader = {};
      if (input.body !== undefined && input.body !== null) {
        if (typeof input.body === 'object') {
          postData = JSON.stringify(input.body);
          contentTypeHeader = { 'Content-Type': 'application/json' };
        } else {
          postData = String(input.body);
        }
      }

      // Reuse session cookies if sessionId provided
      let cookieHeader = {};
      if (input.sessionId) {
        try {
          const sessionSave = await loadSave(input.sessionId);
          const cookies = sessionSave?.cookies || [];
          if (cookies.length > 0) {
            const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
            if (cookieStr) cookieHeader = { Cookie: cookieStr };
          }
        } catch {}
      }

      // Inner request function — returns raw status + headers + body
      const doRequest = (targetUrl, reqMethod, reqBody) => new Promise((resolve, reject) => {
        let parsedUrl;
        try { parsedUrl = new URL(targetUrl); } catch { return reject(new Error(`Invalid URL: ${targetUrl}`)); }
        const mod = parsedUrl.protocol === 'https:' ? https : http;
        const bodyBuf = reqBody ? Buffer.from(reqBody, 'utf8') : null;
        const reqOptions = {
          hostname: parsedUrl.hostname,
          port:     parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
          path:     parsedUrl.pathname + parsedUrl.search,
          method:   reqMethod,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; fetch/1.0)',
            'Accept':     '*/*',
            ...contentTypeHeader,
            ...(bodyBuf ? { 'Content-Length': String(bodyBuf.length) } : {}),
            ...cookieHeader,
            ...extraHeaders,
          },
          timeout: 15000,
          rejectUnauthorized: false,
        };
        const req = mod.request(reqOptions, (res) => {
          const chunks = [];
          let total = 0;
          res.on('data', (chunk) => { total += chunk.length; if (total <= maxBytes) chunks.push(chunk); else res.destroy(); });
          res.on('close', () => resolve({ status: res.statusCode, headers: res.headers, raw: Buffer.concat(chunks).toString('utf8'), total }));
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
        req.on('error', reject);
        if (bodyBuf) req.write(bodyBuf);
        req.end();
      });

      // Follow redirects up to 10 hops
      const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
      const redirectChain = [];
      let currentUrl = url;
      let currentMethod = method;
      let currentBody = postData;
      let finalResponse = null;

      for (let hop = 0; hop <= 10; hop++) {
        const res = await doRequest(currentUrl, currentMethod, currentBody);
        if (followRedirects && REDIRECT_CODES.has(res.status) && res.headers.location) {
          const nextUrl = new URL(res.headers.location, currentUrl).toString();
          redirectChain.push({ from: currentUrl, to: nextUrl, status: res.status });
          // 303 always becomes GET with no body; 307/308 preserve method
          if (res.status === 303 || (res.status === 301 || res.status === 302)) {
            currentMethod = 'GET';
            currentBody = null;
            contentTypeHeader = {};
          }
          currentUrl = nextUrl;
          continue;
        }
        finalResponse = res;
        break;
      }

      if (!finalResponse) throw new Error('Too many redirects (>10 hops)');

      const contentType = finalResponse.headers['content-type'] || '';
      let parsedBody = finalResponse.raw;
      if (contentType.includes('application/json')) {
        try { parsedBody = JSON.parse(finalResponse.raw); } catch {}
      }

      return {
        status:        finalResponse.status,
        method:        currentMethod,
        url:           currentUrl,
        contentType,
        bodyLength:    finalResponse.total,
        truncated:     finalResponse.total > maxBytes,
        headers:       finalResponse.headers,
        body:          parsedBody,
        usedCookies:   !!cookieHeader.Cookie,
        redirectChain: redirectChain.length > 0 ? redirectChain : undefined,
      };
    }

    // ── scrape_url ───────────────────────────────────────────────────────────
    case 'scrape_url': {
      const url = ensureNonEmptyString(input.url, 'url');
      const maxPages = normalizeInteger(input.maxPages, {
        defaultValue: 3,
        min: 1,
        max: 1000,
        name: 'maxPages',
      });
      const scrapeDepth = normalizeInteger(input.scrapeDepth, {
        defaultValue: 1,
        min: 0,
        max: 10,
        name: 'scrapeDepth',
      });

      const { sessionId, result } = await startScrapeAndWait({
        url, maxPages, scrapeDepth,
        captureGraphQL: input.captureGraphQL !== false,
        captureREST: input.captureREST !== false,
        captureIframeAPIs: !!input.captureIframeAPIs,
        captureSSE: !!input.captureSSE,
        captureBeacons: !!input.captureBeacons,
        captureBinaryResponses: !!input.captureBinaryResponses,
        captureServiceWorkers: !!input.captureServiceWorkers || !!input.bypassServiceWorkers,
        bypassServiceWorkers: !!input.bypassServiceWorkers,
        captureAssets: false,
        captureImages: false,
        fullCrawl: !!input.fullCrawl,
        autoScroll: !!input.autoScroll,
        showBrowser: false,
        liveView: false,
        ...(input.username ? { hasAuth: true, username: input.username } : {}),
        ...(input.password ? { password: input.password } : {}),
        ...(input.totpSecret ? { totpSecret: input.totpSecret } : {}),
        ...(input.ssoProvider ? { ssoProvider: input.ssoProvider } : {}),
        ...(input.verificationCode ? { verificationCode: input.verificationCode } : {}),
        useTor: !!input.useTor,
        redisDedupe: !!input.redisDedupe,
      }, {
        onProgress: progressToken
          ? (done, total) => sendProgress(progressToken, done, total || maxPages, `Scraped ${done}/${total || maxPages} pages`)
          : null,
      });

      const summary = summariseResult(result);
      summary.sessionId = sessionId;
      return summary;
    }

    // ── batch_scrape ─────────────────────────────────────────────────────────
    case 'batch_scrape': {
      if (!Array.isArray(input.urls) || input.urls.length === 0) {
        throw new Error('urls must be a non-empty array');
      }

      const urls = dedupe(input.urls.map((url) => ensureNonEmptyString(url, 'urls entry')));
      if (urls.length > 20) throw new Error('Maximum 20 URLs per batch_scrape call');

      const concurrency = normalizeInteger(input.concurrency, { defaultValue: 3, min: 1, max: 5, name: 'concurrency' });
      const scrapeOpts  = {
        captureGraphQL: input.captureGraphQL !== false,
        captureREST:    input.captureREST !== false,
        captureAssets: false,
        captureImages: false,
        showBrowser: false,
        liveView: false,
        maxPages: 1,
        ...(input.username  ? { hasAuth: true, username: input.username } : {}),
        ...(input.password  ? { password: input.password } : {}),
        ...(input.totpSecret  ? { totpSecret: input.totpSecret } : {}),
        ...(input.ssoProvider ? { ssoProvider: input.ssoProvider } : {}),
      };

      // Semaphore for concurrency control
      let active = 0;
      let batchDone = 0;
      const batchTotal = urls.length;
      const queue = [];
      function runNext() {
        while (active < concurrency && queue.length) {
          active++;
          const { url, resolve, reject } = queue.shift();
          startScrapeAndWait({ url, ...scrapeOpts })
            .then(({ sessionId, result }) => {
              const s = summariseResult(result);
              s.sessionId = sessionId;
              resolve({ url, status: 'fulfilled', sessionId, result: s });
            })
            .catch(err => resolve({ url, status: 'rejected', error: err.message }))
            .finally(() => {
              active--;
              batchDone++;
              if (progressToken) sendProgress(progressToken, batchDone, batchTotal, `Scraped ${batchDone}/${batchTotal} URLs`);
              runNext();
            });
        }
      }

      const results = await Promise.all(urls.map(url => new Promise((resolve, reject) => {
        queue.push({ url, resolve, reject });
        runNext();
      })));

      const succeeded = results.filter(r => r.status === 'fulfilled');
      const failed    = results.filter(r => r.status === 'rejected');

      return {
        totalUrls:     urls.length,
        succeededCount: succeeded.length,
        failedCount:   failed.length,
        results,
        note: failed.length > 0
          ? `${failed.length} URL(s) failed independently: ${failed.map(f => f.url).join(', ')}`
          : `All ${urls.length} URLs scraped successfully.`,
      };
    }

    // ── stop_scrape ──────────────────────────────────────────────────────────
    case 'stop_scrape': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      let partialStatus = null;
      try { partialStatus = await fetchScrapeStatus(sessionId); } catch {}
      await expectOk(
        await post(`/api/scrape/${encodeURIComponent(sessionId)}/stop`, {}),
        'Session not found — may have already completed or timed out'
      );
      return {
        stopped: true,
        sessionId,
        stoppedAt: new Date().toISOString(),
        partialResults: partialStatus
          ? {
              pagesCompleted: partialStatus.pages?.length ?? partialStatus.pagesCompleted ?? 0,
              linksFound: partialStatus.linksFound ?? 0,
              status: partialStatus.status ?? 'stopped',
            }
          : null,
        note: 'Partial results are preserved. Use list_saves or get_save_overview to inspect collected data.',
      };
    }

    case 'pause_scrape': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      await expectOk(
        await post(`/api/scrape/${encodeURIComponent(sessionId)}/pause`, {}),
        'Session not found — use list_active_scrapes to verify sessionId'
      );
      let statusAfter = null;
      try { statusAfter = await fetchScrapeStatus(sessionId); } catch {}
      return {
        paused: true,
        sessionId,
        pausedAt: new Date().toISOString(),
        note: 'Scrape will finish its current page then pause. Call get_scrape_status to confirm the paused state.',
        statusAfter,
      };
    }

    case 'resume_scrape': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      await expectOk(
        await post(`/api/scrape/${encodeURIComponent(sessionId)}/resume`, {}),
        'Session not found — it may have completed or never been paused'
      );
      let statusAfter = null;
      try { statusAfter = await fetchScrapeStatus(sessionId); } catch {}
      return {
        resumed: true,
        sessionId,
        resumedAt: new Date().toISOString(),
        note: 'Scrape is resuming from where it paused. Poll get_scrape_status to watch progress.',
        statusAfter,
      };
    }

    case 'submit_verification_code': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const code = ensureNonEmptyString(input.code, 'code');
      await expectOk(
        await post(`/api/scrape/${encodeURIComponent(sessionId)}/verify`, { code }),
        'Session not found — verify sessionId with list_active_scrapes'
      );
      return {
        submitted: true,
        sessionId,
        codeLength: code.length,
        note: 'Code submitted. The scrape will continue automatically if the code is accepted. Call get_scrape_status to monitor.',
      };
    }

    case 'submit_scrape_credentials': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const username = ensureNonEmptyString(input.username, 'username');
      const password = ensureNonEmptyString(input.password, 'password');
      await expectOk(
        await post(`/api/scrape/${encodeURIComponent(sessionId)}/credentials`, { username, password }),
        'Session not found — verify sessionId with list_active_scrapes'
      );
      return {
        submitted: true,
        sessionId,
        username,
        note: 'Credentials submitted. The scrape will attempt login automatically. If 2FA is triggered next, call submit_verification_code.',
      };
    }

    // ── extract_entities ─────────────────────────────────────────────────────
    case 'extract_entities': {
      const url = input.url ? ensureNonEmptyString(input.url, 'url') : null;
      const sessionId = input.sessionId ? ensureNonEmptyString(input.sessionId, 'sessionId') : null;
      if (!url && !sessionId) throw new Error('Provide either url or sessionId');

      let pages;
      let usedSessionId = sessionId;

      if (sessionId) {
        const save = await loadSave(sessionId);
        pages = save.pages || [];
      } else {
        const { sessionId: newSessionId, result } = await startScrapeAndWait({
          url, maxPages: 1, scrapeDepth: 1,
          captureGraphQL: false, captureREST: false,
          captureAssets: false, captureImages: false,
          showBrowser: false, liveView: false,
        });
        usedSessionId = newSessionId;
        pages = result.pages || [];
      }

      const merged = {
        emails: [], phones: [], urls: [], addresses: [],
        coordinates: [], ipAddresses: [],
        crypto: { bitcoin: [], ethereum: [] },
        socials: { twitter: [], linkedin: [], github: [], instagram: [], facebook: [], tiktok: [], youtube: [] },
      };
      for (const page of pages) {
        const e = page.entities || {};
        for (const key of ['emails', 'phones', 'urls', 'addresses', 'coordinates', 'ipAddresses']) {
          if (Array.isArray(e[key])) merged[key].push(...e[key]);
        }
        if (e.crypto) {
          if (Array.isArray(e.crypto.bitcoin)) merged.crypto.bitcoin.push(...e.crypto.bitcoin);
          if (Array.isArray(e.crypto.ethereum)) merged.crypto.ethereum.push(...e.crypto.ethereum);
        }
        if (e.socials) {
          for (const net of ['twitter', 'linkedin', 'github', 'instagram', 'facebook', 'tiktok', 'youtube']) {
            if (Array.isArray(e.socials[net])) merged.socials[net].push(...e.socials[net]);
          }
        }
      }

      for (const key of ['emails', 'phones', 'urls', 'addresses', 'coordinates', 'ipAddresses']) {
        merged[key] = dedupe(merged[key]);
      }
      merged.crypto.bitcoin = dedupe(merged.crypto.bitcoin);
      merged.crypto.ethereum = dedupe(merged.crypto.ethereum);
      for (const net of Object.keys(merged.socials)) {
        merged.socials[net] = dedupe(merged.socials[net]);
      }

      return {
        sessionId: usedSessionId,
        pagesScanned: pages.length,
        entities: merged,
        totals: {
          emails: merged.emails.length,
          phones: merged.phones.length,
          addresses: merged.addresses.length,
          socialProfiles: Object.values(merged.socials).flat().length,
          coordinates: merged.coordinates.length,
          cryptoAddresses: merged.crypto.bitcoin.length + merged.crypto.ethereum.length,
          ipAddresses: merged.ipAddresses.length,
        },
      };
    }

    // ── get_api_calls ─────────────────────────────────────────────────────────
    case 'get_api_calls': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const type = input.type || 'all';
      const limit = normalizeInteger(input.limit, { defaultValue: 50, min: 1, max: 250, name: 'limit' });
      if (!['graphql', 'rest', 'all'].includes(type)) {
        throw new Error('type must be one of graphql, rest, or all');
      }

      // Build filters from input
      const filterMethod     = input.method ? input.method.toUpperCase() : null;
      const filterDomain     = input.domain ? input.domain.toLowerCase() : null;
      const filterUrlContains = input.urlContains ? input.urlContains.toLowerCase() : null;
      const filterStatusMin  = typeof input.statusMin === 'number' ? input.statusMin : null;
      const filterStatusMax  = typeof input.statusMax === 'number' ? input.statusMax : null;

      function applyFilters(calls) {
        return calls.filter(c => {
          if (filterMethod && (c.method || '').toUpperCase() !== filterMethod) return false;
          if (filterDomain && !c.url.toLowerCase().includes(filterDomain)) return false;
          if (filterUrlContains && !c.url.toLowerCase().includes(filterUrlContains)) return false;
          const status = c.response?.status ?? c.statusCode;
          if (filterStatusMin !== null && (status == null || status < filterStatusMin)) return false;
          if (filterStatusMax !== null && (status == null || status > filterStatusMax)) return false;
          return true;
        });
      }

      const save = await loadSave(sessionId);
      const apiCalls = save.apiCalls || {};
      const result = {};

      const totalCounts = {
        graphql: (apiCalls.graphql || []).length,
        rest:    (apiCalls.rest || []).length,
      };

      if (type === 'graphql' || type === 'all') {
        const filtered = applyFilters(apiCalls.graphql || []);
        result.graphql = filtered.slice(0, limit).map(c => ({
          url: c.url,
          method: c.method,
          duration: c.duration,
          body: truncateText(c.body, MAX_API_RESPONSE_CHARS),
          responseStatus: c.response?.status,
          responseBody: truncateText(c.response?.body, MAX_API_RESPONSE_CHARS),
          timestamp: c.timestamp,
        }));
        result.graphqlFiltered = filtered.length;
      }

      if (type === 'rest' || type === 'all') {
        const filtered = applyFilters(apiCalls.rest || []);
        result.rest = filtered.slice(0, limit).map(c => ({
          url: c.url,
          method: c.method,
          duration: c.duration,
          statusCode: c.response?.status ?? c.statusCode,
          responseBody: truncateText(c.response?.body, MAX_PREVIEW_CHARS),
          timestamp: c.timestamp,
        }));
        result.restFiltered = filtered.length;
      }

      result.counts = totalCounts;
      result.filtersApplied = { method: filterMethod, domain: filterDomain, urlContains: filterUrlContains, statusMin: filterStatusMin, statusMax: filterStatusMax };

      return result;
    }

    // ── get_page_text ─────────────────────────────────────────────────────────
    case 'get_page_text': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const { page } = await loadSavedPage(sessionId, input.pageIndex);
      return {
        url: page.meta?.url || '',
        title: page.meta?.title || '',
        fullText: page.fullText || '',
        headings: page.headings || {},
        links: (page.links || []).map(l => ({ href: l.href, text: l.text })),
        entities: page.entities || {},
      };
    }

    // ── to_markdown ───────────────────────────────────────────────────────────
    case 'to_markdown': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const { page, pageIndex } = await loadSavedPage(sessionId, input.pageIndex);
      const body = await expectOk(
        await post('/api/generate/markdown', { pageData: page }),
        'Failed to generate markdown'
      );
      return { sessionId, pageIndex, markdown: body.markdown };
    }

    // ── probe_endpoints ───────────────────────────────────────────────────────
    case 'probe_endpoints': {
      const url = ensureNonEmptyString(input.url, 'url');
      const safeConc = normalizeInteger(input.concurrency, {
        defaultValue: 10,
        min: 1,
        max: 20,
        name: 'concurrency',
      });
      const { accessible, interesting, summary } = await probeEndpoints(url, {
        concurrency: safeConc,
        timeoutMs: 6000,
      });
      return {
        target: new URL(url).origin,
        summary,
        accessible: accessible.map(r => ({
          path: r.path,
          status: r.status,
          contentType: r.contentType,
          contentLength: r.contentLength,
          category: r.category,
          bodyPreview: r.bodyPreview || undefined,
        })),
        interesting: interesting
          .filter(r => !r.accessible) // non-2xx but not 404/410
          .map(r => ({ path: r.path, status: r.status, redirectTo: r.redirectTo })),
      };
    }

    // ── scan_pii ──────────────────────────────────────────────────────────────
    case 'scan_pii': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const data = await loadSave(sessionId);
      const scanTarget = {
        graphqlCalls: data.apiCalls?.graphql || [],
        restCalls: data.apiCalls?.rest || [],
        pages: data.pages || [],
      };

      const { findings, summary } = scanScrapeResult(scanTarget);
      const cap = 500;
      // Build byType breakdown for quick triage
      const byType = {};
      for (const f of findings) {
        if (!byType[f.type]) byType[f.type] = { risk: f.risk, count: 0 };
        byType[f.type].count++;
      }
      return {
        sessionId,
        summary: { ...summary, byType },
        findings: findings.slice(0, cap),
        note: findings.length > cap ? `Showing ${cap} of ${findings.length} total findings` : undefined,
      };
    }

    // ── introspect_graphql ────────────────────────────────────────────────────
    case 'introspect_graphql': {
      const authHeader = input.authHeader ? ensureNonEmptyString(input.authHeader, 'authHeader') : null;
      const headers = authHeader ? { Authorization: authHeader } : {};

      let targetEndpoint = input.endpoint ? ensureNonEmptyString(input.endpoint, 'endpoint') : null;

      if (!targetEndpoint && input.sessionId) {
        const save = await loadSave(input.sessionId);
        const discovered = discoverEndpoints({
          graphqlCalls: save.apiCalls?.graphql || [],
          restCalls: save.apiCalls?.rest || [],
        });
        if (!discovered.length) throw new Error('No GraphQL endpoints found in scrape. Provide endpoint URL directly.');
        targetEndpoint = discovered[0];
      }

      if (!targetEndpoint) throw new Error('Provide either endpoint URL or sessionId to discover from');

      const result = await introspect(targetEndpoint, { headers, timeoutMs: 20000 });

      return {
        endpoint: result.endpoint,
        accessible: result.accessible,
        pingStatus: result.pingStatus,
        error: result.error,
        introspectionError: result.introspectionError,
        summary: result.summary,
        queryFields: result.queryFields.map(f => ({ name: f.name, description: f.description })),
        mutationFields: result.mutationFields.map(f => ({ name: f.name, description: f.description })),
        typeNames: result.summary?.typeNames || [],
      };
    }

    // ── list_saves ────────────────────────────────────────────────────────────
    case 'list_saves': {
      const saves = await expectOk(await get('/api/saves?includeHidden=1'), 'Failed to list saves');
      return (saves || []).map(s => ({
        sessionId: s.sessionId,
        url: s.startUrl,
        scrapedAt: s.startedAt,
        lastSaved: s.lastSavedAt,
        status: s.status,
        pageCount: s.pageCount,
      }));
    }

    case 'delete_save': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      let summary = null;
      try {
        const save = await loadSave(sessionId);
        summary = {
          url: save.startUrl || save.pages?.[0]?.meta?.url || null,
          pageCount: save.pages?.length || 0,
          startedAt: save.startedAt || null,
          completedAt: save.completedAt || null,
        };
      } catch {}
      await expectOk(
        await del(`/api/saves/${encodeURIComponent(sessionId)}`),
        'Failed to delete save'
      );
      clearCachedSave(sessionId);
      return { deleted: true, sessionId, deletedAt: new Date().toISOString(), summary };
    }

    // ── compare_scrapes ───────────────────────────────────────────────────────
    case 'compare_scrapes': {
      const sessionIdA = ensureNonEmptyString(input.sessionIdA, 'sessionIdA');
      const sessionIdB = ensureNonEmptyString(input.sessionIdB, 'sessionIdB');
      const [resultA, resultB] = await Promise.all([
        loadSave(sessionIdA),
        loadSave(sessionIdB),
      ]);
      return expectOk(
        await post('/api/diff', { resultA, resultB }),
        'Failed to compare scrapes'
      );
    }

    // ── infer_schema ──────────────────────────────────────────────────────────
    case 'infer_schema': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const save = await loadSave(sessionId);
      const graphqlCalls = save.apiCalls?.graphql || [];
      if (!graphqlCalls.length) return { message: 'No GraphQL calls captured in this scrape.', schema: {} };
      return expectOk(
        await post('/api/schema', { graphqlCalls }),
        'Failed to infer schema'
      );
    }

    // ── export_har ────────────────────────────────────────────────────────────
    case 'export_har': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const includeRaw = input.includeRaw === true;
      const save = await loadSave(sessionId);
      const har = save.har;
      if (!har) return { message: 'No HAR data in this save. Re-scrape to generate HAR.', har: null };
      const entries = har.log?.entries || [];
      const entryCount = entries.length;
      const statusCodes = {};
      const domains = {};
      let totalBytes = 0;
      let totalMs = 0;
      for (const entry of entries) {
        const status = entry.response?.status;
        if (status) statusCodes[String(status)] = (statusCodes[String(status)] || 0) + 1;
        try {
          const host = new URL(entry.request?.url || '').hostname;
          if (host) domains[host] = (domains[host] || 0) + 1;
        } catch {}
        if (entry.response?.bodySize > 0) totalBytes += entry.response.bodySize;
        if (entry.time > 0) totalMs += entry.time;
      }
      const topDomains = Object.entries(domains)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([domain, count]) => ({ domain, count }));
      const result = {
        sessionId,
        entryCount,
        summary: {
          totalBodyBytes: totalBytes,
          avgTimeMs: entryCount > 0 ? Math.round(totalMs / entryCount) : 0,
          statusCodes,
          topDomains,
        },
        note: entryCount > 0
          ? `HAR contains ${entryCount} entries. Pass includeRaw: true to get the full HAR object for DevTools / Postman import.`
          : 'HAR generated but contains no network entries.',
      };
      if (includeRaw) result.har = har;
      return result;
    }

    // ── schedule_scrape ───────────────────────────────────────────────────────
    case 'schedule_scrape': {
      const cronExpr = ensureNonEmptyString(input.cronExpr, 'cronExpr');
      const url = ensureNonEmptyString(input.url, 'url');
      const maxPages = normalizeInteger(input.maxPages, {
        defaultValue: 1,
        min: 1,
        max: 1000,
        name: 'maxPages',
      });
      const label = input.label ? String(input.label).trim().slice(0, 120) : null;
      const body = await expectOk(
        await post('/api/schedules', {
          cronExpr,
          label,
          scrapeOptions: {
            url, maxPages,
            captureGraphQL: input.captureGraphQL !== false,
            captureREST: input.captureREST !== false,
            captureAssets: false,
            captureImages: false,
            showBrowser: false,
            liveView: false,
          },
        }),
        'Failed to create schedule'
      );
      let nextRunAt = null;
      try {
        const all = await expectOk(await get('/api/schedules'), 'Failed to fetch schedule list');
        const match = (all || []).find((s) => s.id === body.id);
        if (match) nextRunAt = match.nextRunAt || null;
      } catch {}
      return {
        scheduleId: body.id,
        label: label || null,
        cronExpr,
        url,
        nextRunAt,
        message: body.message,
        note: 'Use list_schedules to see full status and history. Results will be saved automatically after each run.',
      };
    }

    // ── list_schedules ────────────────────────────────────────────────────────
    case 'list_schedules': {
      const schedules = await expectOk(await get('/api/schedules'), 'Failed to list schedules');
      return schedules || [];
    }

    // ── delete_schedule ───────────────────────────────────────────────────────
    case 'delete_schedule': {
      const scheduleId = ensureNonEmptyString(input.scheduleId, 'scheduleId');
      let scheduleSummary = null;
      try {
        const all = await expectOk(await get('/api/schedules'), 'Failed to list schedules');
        const match = (all || []).find((s) => s.id === scheduleId);
        if (match) {
          scheduleSummary = {
            label: match.label || null,
            cronExpr: match.cronExpr,
            url: match.scrapeOptions?.url || null,
            createdAt: match.createdAt || null,
            lastRun: match.lastRun || null,
            nextRunAt: match.nextRunAt || null,
          };
        }
      } catch {}
      await expectOk(
        await del(`/api/schedules/${encodeURIComponent(scheduleId)}`),
        `Schedule ${scheduleId} not found`
      );
      return { deleted: true, scheduleId, deletedAt: new Date().toISOString(), schedule: scheduleSummary };
    }

    // ── generate_react ────────────────────────────────────────────────────────
    case 'generate_react': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const { page, pageIndex } = await loadSavedPage(sessionId, input.pageIndex);
      const body = await expectOk(
        await post('/api/generate/react', { pageData: page }),
        'Failed to generate React component'
      );
      return { sessionId, pageIndex, jsx: body.jsx };
    }

    case 'generate_css': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const { page, pageIndex } = await loadSavedPage(sessionId, input.pageIndex);
      const body = await expectOk(
        await post('/api/generate/css', { pageData: page }),
        'Failed to generate CSS'
      );
      const css = body.css || '';
      const cssVarNames = [...new Set((css.match(/--[\w-]+/g) || []))];
      return {
        sessionId,
        pageIndex,
        css,
        cssVariableCount: cssVarNames.length,
        cssVariables: cssVarNames.slice(0, 40),
      };
    }

    case 'generate_sitemap': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const save = await loadSave(sessionId);
      const xml = await expectOk(
        await post('/api/generate/sitemap', { pages: save.pages || [] }),
        'Failed to generate sitemap'
      );
      return {
        sessionId,
        pageCount: save.pages?.length || 0,
        xml,
      };
    }

    case 'test_tls_fingerprint': {
      const compareProfile = input.compareProfile ? String(input.compareProfile) : 'chrome-115';
      const targetHost     = input.targetHost     ? String(input.targetHost)     : null;
      const targetPort     = input.targetPort     ? Number(input.targetPort)     : 443;
      return expectOk(
        await post('/api/tls-fingerprint', { compareProfile, targetHost, targetPort }),
        'TLS fingerprint analysis failed'
      );
    }

    case 'test_oidc_security': {
      const mockServerUrl    = ensureNonEmptyString(input.mockServerUrl, 'mockServerUrl');
      const clientId         = ensureNonEmptyString(input.clientId, 'clientId');
      const clientSecret     = input.clientSecret     ? String(input.clientSecret)     : null;
      const validRedirectUri = input.validRedirectUri ? String(input.validRedirectUri) : null;
      const testsToRun       = Array.isArray(input.tests) && input.tests.length ? input.tests : ['all'];
      const pkceClientId     = input.pkceClientId     ? String(input.pkceClientId)     : null;
      const targetClientId   = input.targetClientId   ? String(input.targetClientId)   : null;
      const resourceIds      = Array.isArray(input.resourceIds)     ? input.resourceIds     : null;
      const requestedScopes  = Array.isArray(input.requestedScopes) ? input.requestedScopes : null;
      const allowedScopes    = Array.isArray(input.allowedScopes)   ? input.allowedScopes   : null;
      return expectOk(
        await post('/api/oidc-test', {
          mockServerUrl, clientId, clientSecret, validRedirectUri, tests: testsToRun,
          pkceClientId, targetClientId, resourceIds, requestedScopes, allowedScopes,
        }),
        'OIDC security test failed'
      );
    }

    // ── extract_structured_data ───────────────────────────────────────────────
    case 'extract_structured_data': {
      const saveId = ensureNonEmptyString(input.saveId, 'saveId');
      const pageIndex = normalizeInteger(input.pageIndex, { defaultValue: 0, min: 0, max: 100000, name: 'pageIndex' });
      const save = await loadSave(saveId);
      const page = save.pages?.[pageIndex];
      if (!page) throw new Error(`Page index ${pageIndex} not found in save ${saveId}`);

      const url = page.meta?.url || page.url || '';
      const jsonLD = page.meta?.jsonLD || [];
      const openGraph = page.meta?.ogTags || {};
      const twitterCard = page.meta?.twitterTags || {};

      const schemaTypes = [...new Set(jsonLD.map(item => item['@type']).flat().filter(Boolean))];
      return {
        url,
        title: page.meta?.title || '',
        jsonLD,
        openGraph,
        twitterCard,
        schemaTypes,
        summary: {
          jsonLDCount:    jsonLD.length,
          hasProduct:     schemaTypes.some(t => t === 'Product' || t === 'ProductGroup'),
          hasEvent:       schemaTypes.some(t => t === 'Event'),
          hasArticle:     schemaTypes.some(t => t === 'Article' || t === 'NewsArticle' || t === 'BlogPosting'),
          hasBreadcrumb:  schemaTypes.some(t => t === 'BreadcrumbList'),
          hasOrganization:schemaTypes.some(t => t === 'Organization' || t === 'LocalBusiness'),
          openGraphCount: Object.keys(openGraph).length,
          twitterCardType: twitterCard['twitter:card'] || null,
        },
      };
    }

    // ── crawl_sitemap ─────────────────────────────────────────────────────────
    case 'crawl_sitemap': {
      const rawUrl = ensureNonEmptyString(input.url, 'url');
      const maxUrls = normalizeInteger(input.maxUrls, { defaultValue: 500, min: 1, max: 5000, name: 'maxUrls' });
      const maxSitemaps = normalizeInteger(input.maxSitemaps, { defaultValue: 5, min: 1, max: 20, name: 'maxSitemaps' });

      async function fetchText(targetUrl) {
        return new Promise((resolve, reject) => {
          const parsed = new URL(targetUrl);
          const mod = parsed.protocol === 'https:' ? https : http;
          const req = mod.get({ hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SitemapCrawler/1.0)' }, timeout: 15000 }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
          });
          req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
          req.on('error', reject);
        });
      }

      async function parseSitemap(sitemapUrl) {
        const xml = await fetchText(sitemapUrl);
        const urls = [];
        for (const m of xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)) {
          urls.push(m[1].trim());
        }
        return { xml, urls };
      }

      let parsedBase;
      try { parsedBase = new URL(rawUrl); } catch { throw new Error('Invalid URL'); }

      const robots = await fetchAndParseRobots(parsedBase.origin).catch(() => null);
      const candidateSitemaps = [];
      const addCandidate = (candidate) => {
        if (!candidate || candidateSitemaps.includes(candidate)) return;
        candidateSitemaps.push(candidate);
      };

      if (rawUrl.endsWith('.xml') || /sitemap/i.test(rawUrl)) {
        addCandidate(rawUrl);
      } else {
        for (const sitemap of robots?.sitemaps || []) addCandidate(sitemap);
        addCandidate(`${parsedBase.origin}/sitemap.xml`);
      }

      let sitemapUrl = null;
      let xml = null;
      let firstUrls = [];
      let discoverySource = 'default';
      let lastError = null;
      for (const candidate of candidateSitemaps) {
        try {
          const parsed = await parseSitemap(candidate);
          sitemapUrl = candidate;
          xml = parsed.xml;
          firstUrls = parsed.urls;
          discoverySource = candidate === rawUrl
            ? 'direct-url'
            : (robots?.sitemaps || []).includes(candidate)
              ? 'robots.txt'
              : 'default';
          break;
        } catch (err) {
          lastError = err;
        }
      }
      if (!sitemapUrl || xml === null) {
        throw new Error(`Unable to fetch sitemap. ${lastError?.message || 'No sitemap candidates succeeded.'}`);
      }

      const isSitemapIndex = /<sitemapindex/i.test(xml);

      let allUrls = [];
      const childSitemaps = [];

      if (isSitemapIndex) {
        const childUrls = firstUrls.slice(0, maxSitemaps);
        for (let ci = 0; ci < childUrls.length; ci++) {
          const child = childUrls[ci];
          childSitemaps.push(child);
          try {
            const { urls } = await parseSitemap(child);
            allUrls.push(...urls);
          } catch {}
          if (progressToken) await sendProgress(progressToken, ci + 1, childUrls.length, `Fetched sitemap ${ci + 1}/${childUrls.length}`);
          if (allUrls.length >= maxUrls) break;
        }
      } else {
        allUrls = firstUrls;
      }

      const truncated = allUrls.length > maxUrls;
      return {
        sitemapUrl,
        discoverySource,
        robots,
        isSitemapIndex,
        childSitemaps,
        totalUrls: allUrls.length,
        urls: allUrls.slice(0, maxUrls),
        truncated,
      };
    }

    // ── take_screenshot ───────────────────────────────────────────────────────
    case 'take_screenshot': {
      const url = ensureNonEmptyString(input.url, 'url');
      const fullPage = !!input.fullPage;
      const waitMs = normalizeInteger(input.waitMs, { defaultValue: 1000, min: 0, max: 10000, name: 'waitMs' });
      return expectOk(
        await post('/api/screenshot', { url, fullPage, waitMs }),
        'Screenshot failed'
      );
    }

    // ── fill_form ─────────────────────────────────────────────────────────────
    case 'fill_form': {
      const url = ensureNonEmptyString(input.url, 'url');
      if (!Array.isArray(input.fields) || input.fields.length === 0) {
        throw new Error('fields must be a non-empty array');
      }
      const fields = input.fields.map((f, i) => ({
        selector: ensureNonEmptyString(f.selector, `fields[${i}].selector`),
        value:    typeof f.value === 'string' ? f.value : String(f.value ?? ''),
      }));
      const submitSelector = input.submitSelector || null;
      const waitMs = normalizeInteger(input.waitMs, { defaultValue: 2000, min: 0, max: 15000, name: 'waitMs' });
      return expectOk(
        await post('/api/fill-form', { url, fields, submitSelector, waitMs }),
        'Form fill failed'
      );
    }

    // ── Browser automation session tools ─────────────────────────────────────
    case 'open_browser_session': {
      const url = input.url ? ensureNonEmptyString(input.url, 'url') : null;
      const restoreSaveId = input.restoreSaveId ? ensureNonEmptyString(input.restoreSaveId, 'restoreSaveId') : null;
      if (!url && !restoreSaveId) {
        throw new Error('Either url or restoreSaveId is required');
      }
      return expectOk(
        await post('/api/browser/sessions', {
          url,
          viewMode: input.viewMode || 'console',
          persistenceMode: input.persistenceMode || 'auth_state',
          restoreSaveId,
        }),
        'Browser session failed to open'
      );
    }

    case 'list_browser_sessions': {
      return expectOk(
        await get('/api/browser/sessions'),
        'Failed to list browser sessions'
      );
    }

    case 'list_browser_session_saves': {
      return expectOk(
        await get('/api/browser/saves'),
        'Failed to list browser session saves'
      );
    }

    case 'get_browser_session_state': {
      const browserSessionId = ensureNonEmptyString(input.browserSessionId, 'browserSessionId');
      const refreshSnapshot = input.refreshSnapshot === true;
      return expectOk(
        await get(`/api/browser/sessions/${encodeURIComponent(browserSessionId)}?refreshSnapshot=${refreshSnapshot ? '1' : '0'}`),
        'Failed to fetch browser session state'
      );
    }

    case 'navigate_browser_session': {
      const browserSessionId = ensureNonEmptyString(input.browserSessionId, 'browserSessionId');
      const url = ensureNonEmptyString(input.url, 'url');
      return expectOk(
        await post(`/api/browser/sessions/${encodeURIComponent(browserSessionId)}/navigate`, {
          url,
          waitMs: normalizeInteger(input.waitMs, { defaultValue: 0, min: 0, max: 15000, name: 'waitMs' }),
        }),
        'Browser navigation failed'
      );
    }

    case 'inspect_browser_page': {
      const browserSessionId = ensureNonEmptyString(input.browserSessionId, 'browserSessionId');
      return expectOk(
        await post(`/api/browser/sessions/${encodeURIComponent(browserSessionId)}/inspect`, {}),
        'Browser inspection failed'
      );
    }

    case 'click_browser_element': {
      const browserSessionId = ensureNonEmptyString(input.browserSessionId, 'browserSessionId');
      const elementId = input.elementId ? ensureNonEmptyString(input.elementId, 'elementId') : null;
      const selector = input.selector ? ensureNonEmptyString(input.selector, 'selector') : null;
      if (!elementId && !selector) throw new Error('elementId or selector is required');
      return expectOk(
        await post(`/api/browser/sessions/${encodeURIComponent(browserSessionId)}/click`, {
          elementId,
          selector,
          waitMs: normalizeInteger(input.waitMs, { defaultValue: 0, min: 0, max: 15000, name: 'waitMs' }),
        }),
        'Browser click failed'
      );
    }

    case 'type_into_browser_element': {
      const browserSessionId = ensureNonEmptyString(input.browserSessionId, 'browserSessionId');
      const elementId = input.elementId ? ensureNonEmptyString(input.elementId, 'elementId') : null;
      const selector = input.selector ? ensureNonEmptyString(input.selector, 'selector') : null;
      const value = ensureNonEmptyString(input.value, 'value');
      if (!elementId && !selector) throw new Error('elementId or selector is required');
      return expectOk(
        await post(`/api/browser/sessions/${encodeURIComponent(browserSessionId)}/type`, {
          elementId,
          selector,
          value,
          waitMs: normalizeInteger(input.waitMs, { defaultValue: 0, min: 0, max: 15000, name: 'waitMs' }),
        }),
        'Browser typing failed'
      );
    }

    case 'select_browser_option': {
      const browserSessionId = ensureNonEmptyString(input.browserSessionId, 'browserSessionId');
      const elementId = input.elementId ? ensureNonEmptyString(input.elementId, 'elementId') : null;
      const selector = input.selector ? ensureNonEmptyString(input.selector, 'selector') : null;
      const value = input.value != null ? String(input.value) : null;
      const label = input.label != null ? String(input.label) : null;
      if (!elementId && !selector) throw new Error('elementId or selector is required');
      if (!value && !label) throw new Error('value or label is required');
      return expectOk(
        await post(`/api/browser/sessions/${encodeURIComponent(browserSessionId)}/select`, {
          elementId,
          selector,
          value,
          label,
          waitMs: normalizeInteger(input.waitMs, { defaultValue: 0, min: 0, max: 15000, name: 'waitMs' }),
        }),
        'Browser select failed'
      );
    }

    case 'wait_for_browser_state': {
      const browserSessionId = ensureNonEmptyString(input.browserSessionId, 'browserSessionId');
      return expectOk(
        await post(`/api/browser/sessions/${encodeURIComponent(browserSessionId)}/wait`, {
          selector: input.selector || null,
          state: input.state || 'visible',
          textIncludes: input.textIncludes || null,
          urlIncludes: input.urlIncludes || null,
          loadState: input.loadState || null,
          timeoutMs: normalizeInteger(input.timeoutMs, { defaultValue: 15000, min: 1, max: 120000, name: 'timeoutMs' }),
          settleMs: normalizeInteger(input.settleMs, { defaultValue: 0, min: 0, max: 15000, name: 'settleMs' }),
        }),
        'Browser wait failed'
      );
    }

    case 'browser_session_screenshot': {
      const browserSessionId = ensureNonEmptyString(input.browserSessionId, 'browserSessionId');
      return expectOk(
        await post(`/api/browser/sessions/${encodeURIComponent(browserSessionId)}/screenshot`, {
          fullPage: !!input.fullPage,
          waitMs: normalizeInteger(input.waitMs, { defaultValue: 0, min: 0, max: 15000, name: 'waitMs' }),
        }),
        'Browser session screenshot failed'
      );
    }

    case 'run_browser_steps': {
      const browserSessionId = ensureNonEmptyString(input.browserSessionId, 'browserSessionId');
      if (!Array.isArray(input.steps) || input.steps.length === 0) {
        throw new Error('steps must be a non-empty array');
      }
      return expectOk(
        await post(`/api/browser/sessions/${encodeURIComponent(browserSessionId)}/steps`, {
          steps: input.steps,
        }),
        'Browser step workflow failed'
      );
    }

    case 'save_browser_session': {
      const browserSessionId = ensureNonEmptyString(input.browserSessionId, 'browserSessionId');
      return expectOk(
        await post(`/api/browser/sessions/${encodeURIComponent(browserSessionId)}/save`, {
          name: input.name || null,
        }),
        'Browser session save failed'
      );
    }

    case 'scrape_browser_session': {
      const browserSessionId = ensureNonEmptyString(input.browserSessionId, 'browserSessionId');
      return expectOk(
        await post(`/api/browser/sessions/${encodeURIComponent(browserSessionId)}/scrape`, {
          url: input.url || null,
          maxPages: input.maxPages == null ? undefined : normalizeInteger(input.maxPages, { defaultValue: 3, min: 1, max: 50, name: 'maxPages' }),
          scrapeDepth: input.scrapeDepth == null ? undefined : normalizeInteger(input.scrapeDepth, { defaultValue: 1, min: 0, max: 5, name: 'scrapeDepth' }),
          captureGraphQL: input.captureGraphQL !== false,
          captureREST: input.captureREST !== false,
          captureAssets: input.captureAssets !== false,
          autoScroll: !!input.autoScroll,
          fullCrawl: !!input.fullCrawl,
        }),
        'Browser session scrape handoff failed'
      );
    }

    case 'close_browser_session': {
      const browserSessionId = ensureNonEmptyString(input.browserSessionId, 'browserSessionId');
      return expectOk(
        await del(`/api/browser/sessions/${encodeURIComponent(browserSessionId)}`),
        'Failed to close browser session'
      );
    }

    case 'delete_browser_session_save': {
      const browserSaveId = ensureNonEmptyString(input.browserSaveId, 'browserSaveId');
      return expectOk(
        await del(`/api/browser/saves/${encodeURIComponent(browserSaveId)}`),
        'Failed to delete browser session save'
      );
    }

    // ── monitor_page ──────────────────────────────────────────────────────────
    case 'monitor_page': {
      const url = ensureNonEmptyString(input.url, 'url');
      const maxPages = normalizeInteger(input.maxPages, { defaultValue: 1, min: 1, max: 10, name: 'maxPages' });
      const monitors = loadMonitors();

      let monitorId = input.monitorId ? String(input.monitorId).trim() : null;

      // Create new baseline
      if (!monitorId || !monitors[monitorId]) {
        const { sessionId } = await startScrapeAndWait({ url, maxPages, captureGraphQL: true, captureREST: true, captureAssets: false, captureImages: false, showBrowser: false, liveView: false });
        monitorId = monitorId || require('crypto').randomUUID();
        monitors[monitorId] = { monitorId, url, baselineSessionId: sessionId, createdAt: new Date().toISOString(), lastCheckedAt: new Date().toISOString() };
        saveMonitors(monitors);
        return { status: 'baseline_created', monitorId, url, baselineSessionId: sessionId, message: 'Baseline stored. Call monitor_page with this monitorId to check for changes.' };
      }

      // Check for changes
      const monitor = monitors[monitorId];
      const { sessionId: newSessionId } = await startScrapeAndWait({ url: monitor.url, maxPages, captureGraphQL: true, captureREST: true, captureAssets: false, captureImages: false, showBrowser: false, liveView: false });

      const [baselineSave, newSave] = await Promise.all([
        loadSave(monitor.baselineSessionId),
        loadSave(newSessionId),
      ]);

      const { diffScrapes } = require('./src/diff');
      const diff = diffScrapes(baselineSave, newSave);

      monitor.previousBaselineSessionId = monitor.baselineSessionId;
      monitor.baselineSessionId = newSessionId;
      monitor.lastCheckedAt = new Date().toISOString();
      saveMonitors(monitors);

      const changed = (diff.summary?.content?.added || 0) + (diff.summary?.content?.removed || 0) + (diff.summary?.pages?.added || 0) + (diff.summary?.pages?.removed || 0) > 0;
      return { status: 'checked', monitorId, url: monitor.url, changed, newSessionId, diff };
    }

    // ── delete_monitor ────────────────────────────────────────────────────────
    case 'delete_monitor': {
      const monitorId = ensureNonEmptyString(input.monitorId, 'monitorId');
      const monitors = loadMonitors();
      if (!monitors[monitorId]) throw new Error(`Monitor not found: ${monitorId}`);
      const monitor = monitors[monitorId];
      delete monitors[monitorId];
      saveMonitors(monitors);
      return {
        deleted: true,
        monitorId,
        deletedAt: new Date().toISOString(),
        summary: {
          url: monitor.url || null,
          createdAt: monitor.createdAt || null,
          lastCheckedAt: monitor.lastCheckedAt || null,
          baselineSessionId: monitor.baselineSessionId || null,
        },
      };
    }

    // ── decode_jwt_tokens ─────────────────────────────────────────────────────
    case 'decode_jwt_tokens': {
      const save = await loadSave(input.sessionId);
      const result = extractJWTs(save);
      return result;
    }

    // ── lookup_dns ────────────────────────────────────────────────────────────
    case 'lookup_dns': {
      const url = ensureNonEmptyString(input.url, 'url');
      return await lookupDNS(url);
    }

    // ── inspect_ssl ───────────────────────────────────────────────────────────
    case 'inspect_ssl': {
      const url = ensureNonEmptyString(input.url, 'url');
      const port = input.port ? parseInt(input.port, 10) : 443;
      return await inspectSSL(url, port);
    }

    // ── score_security_headers ────────────────────────────────────────────────
    case 'score_security_headers': {
      let headers = input.headers;
      if (!headers && input.sessionId) {
        const save = await loadSave(input.sessionId);
        headers = save.securityHeaders?.all || save.securityHeaders || {};
      }
      if (!headers) throw new Error('Provide either sessionId or headers object');
      return scoreSecurityHeaders(headers);
    }

    // ── get_link_graph ────────────────────────────────────────────────────────
    case 'get_link_graph': {
      const save = await loadSave(input.sessionId);
      const pages = save.pages || [];
      const apiCalls = [...(save.restCalls || []), ...(save.graphqlCalls || [])];
      const graph = buildLinkGraph(pages);
      const redirectChains = findRedirectChains(pages, apiCalls);

      // Subdomain discovery
      let subdomains = [];
      try {
        const origin = pages[0]?.url ? new URL(pages[0].url).hostname : null;
        const targetDomain = origin ? origin.replace(/^www\./, '') : null;
        if (targetDomain) subdomains = discoverSubdomains(pages, apiCalls, targetDomain);
      } catch { /* skip */ }

      return { ...graph, redirectChains, subdomains };
    }

    // ── check_broken_links ────────────────────────────────────────────────────
    case 'check_broken_links': {
      const save = await loadSave(input.sessionId);
      const pages = save.pages || [];
      const allLinks = pages.flatMap(p => (p.links || []).map(l => (typeof l === 'string' ? l : l.href)));
      const origin = pages[0]?.url ? new URL(pages[0].url).origin : '';
      return await checkBrokenLinks(allLinks, {
        internalOnly: input.internalOnly || false,
        origin,
        maxLinks: input.maxLinks || 100,
        onProgress: progressToken
          ? (done, total) => sendProgress(progressToken, done, total, `Checked ${done}/${total} links`)
          : null,
      });
    }

    // ── extract_product_data ──────────────────────────────────────────────────
    case 'extract_product_data': {
      const pageData = await loadSavedPage(input.sessionId, input.pageIndex || 0);
      return extractProductData(pageData);
    }

    // ── extract_job_listings ──────────────────────────────────────────────────
    case 'extract_job_listings': {
      const save = await loadSave(input.sessionId);
      const pageIndex = input.pageIndex !== undefined ? input.pageIndex : null;
      if (pageIndex !== null) {
        const pageData = save.pages?.[pageIndex];
        if (!pageData) throw new Error(`Page ${pageIndex} not found`);
        return extractJobData(pageData);
      }
      // Scan all pages, aggregate results
      const allJobs = [];
      for (const page of (save.pages || [])) {
        const result = extractJobData(page);
        if (result.isJobPage) allJobs.push(...result.jobs);
      }
      return { totalJobs: allJobs.length, jobs: allJobs };
    }

    // ── extract_company_info ──────────────────────────────────────────────────
    case 'extract_company_info': {
      const pageData = await loadSavedPage(input.sessionId, input.pageIndex || 0);
      return extractCompanyInfo(pageData);
    }

    // ── classify_pages ────────────────────────────────────────────────────────
    case 'classify_pages': {
      const save = await loadSave(input.sessionId);
      const pages = save.pages || [];
      const classified = pages.map((page, idx) => {
        const url = page.url || '';
        const text = (page.fullText || '').toLowerCase();
        const h1s = (page.headings?.h1 || []).map(h => h.text || '').join(' ').toLowerCase();
        const title = (page.meta?.title || '').toLowerCase();

        const signals = [];
        let type = 'unknown';
        let confidence = 0.4;

        const checks = [
          { type: 'product', pattern: /\/product|\/item|\/p\/|add.to.cart|buy.now/i, textPattern: /add\s+to\s+(cart|bag)|price|in\s+stock/i, weight: 0.9 },
          { type: 'checkout', pattern: /\/checkout|\/cart|\/basket|\/order/i, textPattern: /checkout|payment|billing|shipping\s+address/i, weight: 0.95 },
          { type: 'pricing', pattern: /\/pricing|\/plans|\/packages/i, textPattern: /per\s+month|\/mo|annual|upgrade|subscribe|free\s+trial/i, weight: 0.9 },
          { type: 'blog', pattern: /\/blog|\/post|\/article|\/news|\/story/i, textPattern: /published|author|read\s+time|min\s+read/i, weight: 0.85 },
          { type: 'about', pattern: /\/about|\/our-story|\/company|\/team|\/who-we-are/i, textPattern: /founded|our\s+mission|our\s+values|meet\s+the\s+team/i, weight: 0.85 },
          { type: 'contact', pattern: /\/contact|\/reach-us|\/get-in-touch|\/support/i, textPattern: /get\s+in\s+touch|send\s+us|email\s+us|phone\s+number/i, weight: 0.9 },
          { type: 'login', pattern: /\/login|\/signin|\/sign-in|\/auth/i, textPattern: /sign\s+in|log\s+in|password|forgot\s+password/i, weight: 0.95 },
          { type: 'signup', pattern: /\/signup|\/register|\/join|\/create-account/i, textPattern: /create\s+account|sign\s+up|get\s+started/i, weight: 0.9 },
          { type: 'dashboard', pattern: /\/dashboard|\/app\/|\/portal|\/console/i, textPattern: /overview|recent\s+activity|your\s+account/i, weight: 0.8 },
          { type: 'careers', pattern: /\/careers|\/jobs|\/hiring|\/openings/i, textPattern: /open\s+positions|we.re\s+hiring|join\s+our\s+team/i, weight: 0.9 },
          { type: 'landing', pattern: /^\/?$|\/lp\/|\/l\//, textPattern: /get\s+started|try\s+for\s+free|sign\s+up\s+free/i, weight: 0.7 },
          { type: 'documentation', pattern: /\/docs|\/documentation|\/guide|\/api-ref/i, textPattern: /api\s+reference|code\s+example|endpoint|parameter/i, weight: 0.9 },
          { type: 'search-results', pattern: /\/search|[?&]q=|[?&]query=/i, textPattern: /results\s+for|no\s+results/i, weight: 0.9 },
          { type: 'error', pattern: /\/404|\/error|\/not-found/i, textPattern: /page\s+not\s+found|404|oops|something\s+went\s+wrong/i, weight: 0.95 },
        ];

        for (const check of checks) {
          const urlMatch = check.pattern.test(url);
          const textMatch = check.textPattern?.test(text + ' ' + h1s + ' ' + title);
          if (urlMatch && textMatch) { type = check.type; confidence = check.weight; break; }
          if (urlMatch) { type = check.type; confidence = check.weight - 0.15; signals.push('url-pattern'); }
          if (textMatch && confidence < check.weight - 0.15) { type = check.type; confidence = check.weight - 0.15; signals.push('text-pattern'); }
        }

        return {
          pageIndex: idx,
          url: page.url,
          title: page.meta?.title || null,
          type,
          confidence: Math.round(confidence * 100) / 100,
          signals,
        };
      });

      const byType = {};
      for (const p of classified) {
        if (!byType[p.type]) byType[p.type] = 0;
        byType[p.type]++;
      }

      return { totalPages: pages.length, classified, byType };
    }

    // ── flag_anomalies ────────────────────────────────────────────────────────
    case 'flag_anomalies': {
      const save = await loadSave(input.sessionId);
      const pages = save.pages || [];
      const anomalies = [];

      if (pages.length === 0) return { anomalies: [], totalPages: 0 };

      // Page size anomalies (text length)
      const sizes = pages.map(p => (p.fullText || '').length);
      const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
      const variance = sizes.reduce((a, b) => a + (b - mean) ** 2, 0) / sizes.length;
      const stdDev = Math.sqrt(variance);

      sizes.forEach((size, idx) => {
        const zScore = stdDev > 0 ? Math.abs(size - mean) / stdDev : 0;
        if (zScore >= 2.5) {
          anomalies.push({
            type: size > mean ? 'unusually-large-page' : 'unusually-small-page',
            severity: zScore >= 3 ? 'high' : 'medium',
            pageIndex: idx,
            url: pages[idx].url,
            textLength: size,
            zScore: Math.round(zScore * 10) / 10,
            description: `Page is ${size > mean ? 'significantly larger' : 'significantly smaller'} than average (${Math.round(mean)} chars avg, this page: ${size})`,
          });
        }
      });

      // Error pages (HTTP errors or empty content)
      pages.forEach((p, idx) => {
        if ((p.fullText || '').length < 100 && idx > 0) {
          anomalies.push({
            type: 'near-empty-page',
            severity: 'high',
            pageIndex: idx,
            url: p.url,
            description: 'Page has less than 100 characters of text — may be an error, redirect, or access-denied page',
          });
        }
      });

      // Excessive external API calls
      const totalCalls = (save.restCalls || []).length + (save.graphqlCalls || []).length;
      const externalDomains = new Set();
      for (const call of [...(save.restCalls || []), ...(save.graphqlCalls || [])]) {
        try { externalDomains.add(new URL(call.url).hostname); } catch {}
      }
      if (externalDomains.size > 20) {
        anomalies.push({
          type: 'excessive-external-domains',
          severity: 'medium',
          count: externalDomains.size,
          domains: [...externalDomains].slice(0, 20),
          description: `${externalDomains.size} unique external API domains — may indicate heavy third-party reliance or tracking`,
        });
      }

      // Console errors
      const errorCount = (save.consoleLogs || []).filter(l => l.type === 'error' || l.type === 'pageerror').length;
      if (errorCount > 5) {
        anomalies.push({
          type: 'high-js-error-count',
          severity: errorCount > 20 ? 'high' : 'medium',
          count: errorCount,
          description: `${errorCount} JavaScript errors logged — may indicate broken features or missing dependencies`,
          errors: (save.consoleLogs || []).filter(l => l.type === 'error').slice(0, 5).map(e => e.text),
        });
      }

      // Security header issues
      const secHeaders = save.securityHeaders || {};
      const missingCritical = [];
      if (!secHeaders['strict-transport-security']) missingCritical.push('HSTS');
      if (!secHeaders['content-security-policy']) missingCritical.push('CSP');
      if (!secHeaders['x-frame-options'] && !secHeaders['content-security-policy']?.includes('frame-ancestors')) missingCritical.push('X-Frame-Options');
      if (missingCritical.length >= 2) {
        anomalies.push({
          type: 'missing-security-headers',
          severity: 'medium',
          missing: missingCritical,
          description: `Critical security headers absent: ${missingCritical.join(', ')}`,
        });
      }

      return {
        totalPages: pages.length,
        anomalyCount: anomalies.length,
        anomalies,
        stats: { meanPageSize: Math.round(mean), stdDevPageSize: Math.round(stdDev), totalApiCalls: totalCalls, externalDomains: externalDomains.size },
      };
    }

    // ── find_patterns ─────────────────────────────────────────────────────────
    case 'find_patterns': {
      const save = await loadSave(input.sessionId);
      const pages = save.pages || [];
      if (pages.length === 0) return { patterns: [] };

      // CSS class frequency across pages
      const classFreq = {};
      const selectorFreq = {};
      const h1Patterns = {};
      const apiPathPatterns = {};
      const urlStructures = {};

      for (const page of pages) {
        // URL structure grouping (path depth and pattern)
        try {
          const u = new URL(page.url || '');
          const pathParts = u.pathname.split('/').filter(Boolean);
          const structure = pathParts.map(p => (/^\d+$/.test(p) ? ':id' : (/^[0-9a-f-]{32,}$/.test(p) ? ':uuid' : p))).join('/');
          urlStructures[structure] = (urlStructures[structure] || 0) + 1;
        } catch {}

        // H1 word frequency
        for (const h of (page.headings?.h1 || [])) {
          const words = (h.text || '').toLowerCase().split(/\s+/).filter(w => w.length > 4);
          for (const w of words) { h1Patterns[w] = (h1Patterns[w] || 0) + 1; }
        }

        // API path patterns
        for (const call of [...(page.apiCalls || []), ...(page.restCalls || [])]) {
          try {
            const u = new URL(call.url || '');
            const pattern = u.pathname.split('/').map(p => (/^\d+$/.test(p) ? ':id' : p)).join('/');
            apiPathPatterns[pattern] = (apiPathPatterns[pattern] || 0) + 1;
          } catch {}
        }
      }

      // Common URL structures (present on 2+ pages)
      const commonUrlPatterns = Object.entries(urlStructures)
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([pattern, count]) => ({ pattern, count }));

      // Common H1 topics
      const commonTopics = Object.entries(h1Patterns)
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([word, count]) => ({ word, count }));

      // Recurring API paths
      const recurringApiPaths = Object.entries(apiPathPatterns)
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([path, count]) => ({ path, count }));

      // Structural consistency — do pages share the same nav items?
      const navSets = pages.map(p => new Set((p.navigation || []).flatMap(n => (n.items || []).map(i => i.text))));
      const sharedNavItems = navSets.length > 1
        ? [...navSets[0]].filter(item => navSets.every(s => s.has(item)))
        : [];

      return {
        totalPages: pages.length,
        patterns: {
          urlStructures: commonUrlPatterns,
          topics: commonTopics,
          recurringApiPaths,
          sharedNavItems,
          avgPageTextLength: Math.round(pages.reduce((sum, p) => sum + (p.fullText || '').length, 0) / pages.length),
          totalUniqueApiCalls: Object.keys(apiPathPatterns).length,
        },
      };
    }

    // ── extract_business_intel ────────────────────────────────────────────────
    case 'extract_business_intel': {
      const save = await loadSave(input.sessionId);
      const targetPages = input.pageIndex !== undefined
        ? [save.pages?.[input.pageIndex]].filter(Boolean)
        : (save.pages || []);

      const pricing = [];
      const competitorMentions = [];
      const metrics = [];
      const contactInfo = { emails: [], phones: [], addresses: [] };
      const allEntities = [];

      const PRICING_PATTERN = /\$\s*\d+(?:\.\d{2})?(?:\s*\/\s*(?:mo|month|yr|year|seat|user))?|\bfree\s*(?:plan|tier|forever)\b|\bpro\b|\benterprise\b|\bstarter\b|\bprofessional\b/gi;
      const METRIC_PATTERN = /(\d[\d,]*(?:\.\d+)?)\s*\+?\s*(users?|customers?|companies|clients|enterprises|downloads?|installs?|reviews?|ratings?|countries|languages)/gi;

      for (const page of targetPages) {
        const text = page.fullText || '';
        const url = page.url || '';

        // Pricing signals
        const priceMatches = [...text.matchAll(PRICING_PATTERN)].slice(0, 10).map(m => m[0]);
        if (priceMatches.length > 0) {
          pricing.push({ url, mentions: priceMatches });
        }

        // Business metrics (users, customers, etc.)
        const metricMatches = [...text.matchAll(METRIC_PATTERN)].slice(0, 5);
        for (const m of metricMatches) {
          metrics.push({ count: m[1].replace(/,/g, ''), unit: m[2], url });
        }

        // Contact aggregation
        if (page.entities) {
          contactInfo.emails.push(...(page.entities.emails || []));
          contactInfo.phones.push(...(page.entities.phones || []));
          contactInfo.addresses.push(...(page.entities.addresses || []));
        }

        // Company info
        const compInfo = extractCompanyInfo(page);
        if (compInfo.company?.name) allEntities.push(compInfo.company);
      }

      // Dedup contact info
      contactInfo.emails = [...new Set(contactInfo.emails)].slice(0, 10);
      contactInfo.phones = [...new Set(contactInfo.phones)].slice(0, 10);
      contactInfo.addresses = [...new Set(contactInfo.addresses)].slice(0, 5);

      return {
        pricing: pricing.slice(0, 10),
        metrics: metrics.slice(0, 20),
        contactInfo,
        techStack: save.pages?.[0]?.tech || {},
        companies: allEntities.slice(0, 3),
        pagesAnalyzed: targetPages.length,
      };
    }

    // ── extract_reviews ───────────────────────────────────────────────────────
    case 'extract_reviews': {
      const save = await loadSave(input.sessionId);
      const pages = save.pages || [];
      if (input.pageIndex !== undefined) {
        const page = pages[input.pageIndex];
        if (!page) throw new Error(`Page ${input.pageIndex} not found`);
        return extractReviews(page);
      }
      // Scan all pages, aggregate
      const allReviews = [];
      let bestAggregate = null;
      let reviewPages = 0;
      for (const page of pages) {
        const result = extractReviews(page);
        if (result.isReviewPage) {
          reviewPages++;
          allReviews.push(...result.reviews);
          if (!bestAggregate && result.aggregateRating) bestAggregate = result.aggregateRating;
        }
      }
      return {
        reviewPages,
        aggregateRating: bestAggregate,
        totalReviews: allReviews.length,
        reviews: allReviews.slice(0, 50),
      };
    }

    // ── get_cache_headers ────────────────────────────────────────────────────
    case 'get_cache_headers': {
      const sessionId = ensureNonEmptyString(input.sessionId, 'sessionId');
      const save = await loadSave(sessionId);

      const CACHE_FIELDS = ['cache-control', 'etag', 'last-modified', 'expires', 'vary', 'age', 'pragma'];

      // Document-level headers from security header scan
      const docHeaders = {};
      for (const field of CACHE_FIELDS) {
        const val = save.securityHeaders?.[field] ?? save.securityHeaders?.[field.replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
        if (val != null) docHeaders[field] = val;
      }

      // Per-request cache headers from REST + GraphQL
      const requestHeaders = [];
      const collectFromCalls = (calls) => {
        if (!Array.isArray(calls)) return;
        for (const call of calls) {
          const headers = call.response?.headers || {};
          const cacheInfo = {};
          for (const field of CACHE_FIELDS) {
            if (headers[field]) cacheInfo[field] = headers[field];
          }
          if (Object.keys(cacheInfo).length > 0) {
            requestHeaders.push({ url: call.url || call.endpoint || null, method: call.method || null, ...cacheInfo });
          }
        }
      };
      collectFromCalls(save.apiCalls?.rest);
      collectFromCalls(save.apiCalls?.graphql);

      const summary = requestHeaders.length === 0 && Object.keys(docHeaders).length === 0
        ? 'No cache headers found in this session.'
        : `Found cache headers on document${requestHeaders.length > 0 ? ` and ${requestHeaders.length} request(s)` : ''}.`;

      return {
        sessionId,
        summary,
        documentCacheHeaders: docHeaders,
        requestCount: requestHeaders.length,
        requestCacheHeaders: requestHeaders.slice(0, 50),
      };
    }

    // ── lookup_ip_info ────────────────────────────────────────────────────────
    case 'lookup_ip_info': {
      const hostnameInput = ensureNonEmptyString(input.hostname, 'hostname');
      const info = await lookupIpInfo(hostnameInput);
      return info;
    }

    // ── get_page_word_count ───────────────────────────────────────────────────
    case 'get_page_word_count': {
      const { sessionId } = input;
      if (!sessionId) throw new Error('sessionId is required');
      const save = await loadSave(sessionId);
      if (!save) throw new Error(`No save found for sessionId: ${sessionId}`);
      const text = (save.pageText || save.extractedText || '').trim();
      const words = text ? text.split(/\s+/).filter(Boolean) : [];
      const sentences = text ? text.split(/[.!?]+/).filter((s) => s.trim().length > 0) : [];
      const paragraphs = text ? text.split(/\n\s*\n/).filter((p) => p.trim().length > 0) : [];
      return {
        sessionId,
        wordCount: words.length,
        characterCount: text.length,
        sentenceCount: sentences.length,
        paragraphCount: paragraphs.length,
        avgWordsPerSentence: sentences.length > 0 ? Math.round(words.length / sentences.length) : 0,
      };
    }

    // ── run_agent ─────────────────────────────────────────────────────────────
    case 'run_agent': {
      const { goal, maxSteps, agentId: requestedId } = input;
      if (!goal || !goal.trim()) throw new Error('goal is required');

      const { createAgentRun, runAgent } = require('./src/agent');
      const scraper_url = process.env.SCRAPER_URL || 'http://localhost:12345';

      async function pushEvent(agentId, event) {
        try {
          await fetch(`${scraper_url}/api/agent/event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId, event }),
          });
        } catch { /* web server may not be running — ignore */ }
      }

      const run = createAgentRun(
        goal.trim(),
        { maxSteps: maxSteps || 20, agentId: requestedId },
        {
          broadcast: pushEvent,
          callTool: (name, args) => handleTool(name, args),
          sampleFn: sampleFromClient,
        }
      );

      await runAgent(run);

      return createToolSuccess({
        agentId: run.id,
        status: run.status,
        steps: run.steps,
        toolCalls: run.toolCallCount,
        result: run.result,
        error: run.error,
      });
    }

    // ── server_info ───────────────────────────────────────────────────────────
    case 'server_info': {
      return buildServerInfoSnapshot();
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Inline docs content (served via scrape://docs/* resources) ───────────────

const DOCS_QUICKSTART = `# Web Scraper MCP — Quick Start

## 10-Step Getting Started Workflow

**Step 1 — Understand the site first**
\`\`\`
detect_site url="https://example.com"
preflight_url url="https://example.com"
\`\`\`

**Step 2 — Check for an existing saved session**
\`\`\`
list_saves
check_saved_session url="https://example.com"
\`\`\`

**Step 3 — Scrape the site**
\`\`\`
scrape_url url="https://example.com" maxPages=5
\`\`\`
For JS-heavy sites add: \`captureGraphQL=true\`, \`autoScroll=true\`
For authenticated sites add: \`username="..." password="..."\`

**Step 4 — Read the overview first (not raw pages)**
\`\`\`
get_save_overview sessionId="<id>"
\`\`\`
Or read: \`scrape://save/{id}/overview\`

**Step 5 — Dig into specifics**
\`\`\`
get_page_text sessionId="<id>" pageIndex=0
extract_entities sessionId="<id>"
get_tech_stack sessionId="<id>"
\`\`\`

**Step 6 — Explore the API surface**
\`\`\`
get_api_surface sessionId="<id>"
get_api_calls sessionId="<id>"
\`\`\`
Or read: \`scrape://save/{id}/api-surface\`

**Step 7 — Extract structured data**
\`\`\`
extract_product_data sessionId="<id>"
extract_company_info sessionId="<id>"
extract_job_listings sessionId="<id>"
extract_business_intel sessionId="<id>"
\`\`\`

**Step 8 — Export or generate**
\`\`\`
to_markdown sessionId="<id>"
generate_react sessionId="<id>" pageIndex=0
export_har sessionId="<id>"
\`\`\`

**Step 9 — Use prompts for multi-step workflows**
Use prompts for: security_full_audit, site_health_check, competitive_intel, company_deep_dive, etc.

**Step 10 — Clean up when done**
\`\`\`
delete_save sessionId="<id>"
\`\`\`

## Key Rules
- Always read overview before raw pages — 10× smaller, much faster
- Use prompts for multi-step workflows instead of manually chaining tools
- Long-running tools emit progress notifications — listen for them
- Destructive tools [D] are permanent — confirm before calling delete_*
- Open-world tools [OW] make outbound network calls — be mindful of rate limits
`;

const DOCS_WORKFLOW_RECIPES = `# Web Scraper MCP — Workflow Recipes

## Recipe 1: Security Audit
\`\`\`
scrape_url url="https://target.com" captureGraphQL=true captureREST=true
score_security_headers sessionId="<id>"
inspect_ssl url="https://target.com"
decode_jwt_tokens sessionId="<id>"
scan_pii sessionId="<id>"
lookup_dns url="https://target.com"
\`\`\`
Or use prompt: \`security_full_audit url="https://target.com"\`

## Recipe 2: Competitive Intelligence
\`\`\`
scrape_url url="https://competitor.com" maxPages=10
get_save_overview sessionId="<id>"
extract_business_intel sessionId="<id>"
extract_company_info sessionId="<id>"
get_tech_stack sessionId="<id>"
\`\`\`
Or use prompt: \`competitive_intel sessionId="<id>"\`

## Recipe 3: API Discovery & Documentation
\`\`\`
scrape_url url="https://app.com" captureGraphQL=true captureREST=true
get_api_surface sessionId="<id>"
find_graphql_endpoints sessionId="<id>"
introspect_graphql url="https://app.com/graphql"
infer_schema sessionId="<id>"
\`\`\`
Or use prompt: \`reverse_engineer_site_api sessionId="<id>"\`

## Recipe 4: Site Health Monitoring
\`\`\`
scrape_url url="https://site.com" maxPages=20
check_broken_links sessionId="<id>"
score_security_headers sessionId="<id>"
find_site_issues sessionId="<id>"
inspect_ssl url="https://site.com"
\`\`\`
Or use prompt: \`site_health_check sessionId="<id>"\`

## Recipe 5: Contact & Lead Extraction
\`\`\`
scrape_url url="https://company.com" maxPages=10
extract_entities sessionId="<id>"
extract_company_info sessionId="<id>"
list_forms sessionId="<id>"
\`\`\`
Or use prompt: \`extract_contacts_from_scrape sessionId="<id>"\`

## Recipe 6: E-Commerce Product Harvest
\`\`\`
scrape_url url="https://shop.com" maxPages=50 fullCrawl=true autoScroll=true
extract_product_data sessionId="<id>"
extract_deals sessionId="<id>"
get_api_calls sessionId="<id>"
\`\`\`
Or use prompt: \`ecommerce_audit sessionId="<id>"\`

## Recipe 7: Monitor a Page for Changes
\`\`\`
monitor_page url="https://site.com/pricing" intervalMinutes=60
list_schedules
\`\`\`

## Recipe 8: Compare Two Scrapes
\`\`\`
compare_scrapes sessionIdA="<id1>" sessionIdB="<id2>"
\`\`\`
Or use prompt: \`compare_scrapes_workflow sessionIdA="<id1>" sessionIdB="<id2>"\`
`;

const DOCS_TOOL_SELECTION_GUIDE = `# Web Scraper MCP — Tool Selection Guide

## What do you want to do?

### Understand a new site before scraping
→ \`detect_site\`, \`preflight_url\`, \`map_site_for_goal\`

### Scrape a site
- Single URL, few pages: \`scrape_url\`
- Multiple URLs in parallel: \`batch_scrape\`
- Entire site: \`scrape_url fullCrawl=true\` or \`crawl_sitemap\` → \`batch_scrape\`
- Authenticated site: \`scrape_url username="..." password="..."\`
- Check before re-scraping: \`check_saved_session\` first

### Read scraped data
- Fast overview (start here): \`get_save_overview\` or \`scrape://save/{id}/overview\`
- Full text: \`get_page_text\`
- Links: \`list_links\`
- Images: \`list_images\`
- Forms: \`list_forms\`
- Search across pages: \`search_scrape_text\`
- Internal page list: \`list_internal_pages\`

### Extract structured data
- People, emails, phones, addresses: \`extract_entities\`
- Products with prices: \`extract_product_data\`
- Job listings: \`extract_job_listings\`
- Company info: \`extract_company_info\`
- Business intelligence (pricing, metrics): \`extract_business_intel\`
- Deals and promotions: \`extract_deals\`
- Any structured schema: \`extract_structured_data\`

### Understand the API
- All calls: \`get_api_calls\` or \`scrape://save/{id}/api/all\`
- GraphQL only: \`get_api_calls kind="graphql"\` or \`find_graphql_endpoints\`
- REST only: \`get_api_calls kind="rest"\`
- GraphQL schema: \`introspect_graphql\`
- TypeScript schema: \`infer_schema\`
- Grouped summary: \`get_api_surface\`

### Security & privacy analysis
- Security headers grade: \`score_security_headers\`
- SSL certificate: \`inspect_ssl\`
- JWT tokens: \`decode_jwt_tokens\`
- PII scan: \`scan_pii\`
- TLS fingerprint: \`test_tls_fingerprint\`
- DNS records: \`lookup_dns\`

### SEO & content analysis
- Broken links: \`check_broken_links\`
- Link graph: \`get_link_graph\`
- All issues: \`find_site_issues\`
- Sitemap: \`generate_sitemap\` or \`crawl_sitemap\`

### Generate code or exports
- React component: \`generate_react\`
- CSS: \`generate_css\`
- Markdown: \`to_markdown\`
- HAR file: \`export_har\`

### Monitor or schedule
- Watch for changes: \`monitor_page\`
- Recurring scrape: \`schedule_scrape\`
- List schedules: \`list_schedules\`

### Manage sessions
- List saved scrapes: \`list_saves\`
- Check status: \`get_scrape_status\`
- Stop running scrape: \`stop_scrape\`
- Delete save: \`delete_save\` [D]

## Classification Badges
- **[RO]** Read-only — safe to call freely, no side effects
- **[OW]** Open-world — makes outbound network calls, be mindful of rate limits
- **[D]** Destructive — permanently deletes data, always confirm first
`;

const DOCS_TROUBLESHOOTING = `# Web Scraper MCP — Troubleshooting

## "Session not found" or "Save not found"
- The session ID doesn't exist or was deleted
- Run \`list_saves\` to see available sessions
- If the scrape is still running: \`get_scrape_status sessionId="<id>"\`

## "Scrape timed out after 180s"
- The site is very slow or JS-heavy
- Try with fewer maxPages (start with \`maxPages=1\`)
- For complex SPAs: add \`autoScroll=true\`
- Check if site requires auth: \`preflight_url\` first

## Authentication fails / login not working
- For TOTP: provide \`totpSecret\` (base32 secret, NOT the 6-digit code)
- For SSO: provide \`ssoProvider\` ("google"|"microsoft"|"github")
- For complex flows: use \`submit_scrape_credentials\` / \`submit_verification_code\` while scrape is running
- Check if a saved session already works: \`check_saved_session\`

## "No API calls captured" / empty apiCalls
- The site may not make XHR/fetch calls on first page load
- Add \`autoScroll=true\` to trigger lazy-loading
- Set \`captureGraphQL=true\` and \`captureREST=true\` explicitly
- Some APIs are called only on user interaction — the scraper captures what fires automatically

## GraphQL introspection disabled
- The site has disabled introspection (common in production)
- Use \`find_graphql_endpoints\` to find the endpoint URL
- Use \`get_api_calls\` to see actual operation names from captured traffic

## Scraper getting 403 / blocked
- The scraper uses stealth mode by default — most sites pass
- Try \`useTor=true\` if still blocked (requires Tor to be running)

## "Page text is empty" or minimal content
- The site is SPA/JS-rendered but may have errors
- Add \`captureConsole=true\` to see what's breaking
- Some content may be in iframes (not captured by default)

## Resource read returns empty
- The scraper REST server must be running (\`npm start\` in the project dir)
- The session must be for a **completed** scrape
- For live sessions: use \`scrape://active/{sessionId}\` instead of \`scrape://save/{sessionId}/...\`

## "Unknown tool" error
- MCP server may be outdated — restart it
- Check \`MCP_TOOLSET\` env var — if set, only a subset of tools are exposed
- Read \`scrape://docs/tool-list\` to see what's available
`;

const FIXED_RESOURCES = [
  {
    uri: 'scrape://saves',
    name: 'scrape_saves',
    title: 'Saved Scrapes',
    description: 'Saved scrape metadata.',
    mimeType: 'application/json',
  },
  {
    uri: 'scrape://active',
    name: 'scrape_active',
    title: 'Active Scrapes',
    description: 'Live status snapshots for active scrape sessions.',
    mimeType: 'application/json',
  },
  {
    uri: 'scrape://docs/tool-list',
    name: 'docs_tool_list',
    title: 'MCP Tool Reference',
    description: 'Complete reference for all tools — names, descriptions, parameters, and classification badges (RO/OW/D). Generated live from the running server so always accurate.',
    mimeType: 'text/markdown',
  },
  {
    uri: 'scrape://docs/mcp-reference',
    name: 'docs_mcp_reference',
    title: 'MCP.md — Architecture & Rules',
    description: 'Full MCP server architecture overview, category tables, source module mapping, and rules for adding new tools.',
    mimeType: 'text/markdown',
  },
  {
    uri: 'scrape://docs/capture-tracker',
    name: 'docs_capture_tracker',
    title: 'Capture Tracker',
    description: 'What the scraper can and cannot capture. Every data type rated and marked implemented (✅) or not yet (❌).',
    mimeType: 'text/markdown',
  },
  {
    uri: 'scrape://docs/quickstart',
    name: 'docs_quickstart',
    title: 'Quick Start Guide',
    description: '10-step getting-started workflow: detect → scrape → overview → extract → export.',
    mimeType: 'text/markdown',
  },
  {
    uri: 'scrape://docs/workflow-recipes',
    name: 'docs_workflow_recipes',
    title: 'Workflow Recipes',
    description: 'Copy-paste multi-tool workflow sequences for common tasks.',
    mimeType: 'text/markdown',
  },
  {
    uri: 'scrape://docs/tool-selection-guide',
    name: 'docs_tool_selection_guide',
    title: 'Tool Selection Guide',
    description: 'Decision guide: what do you want to do → which tool to call.',
    mimeType: 'text/markdown',
  },
  {
    uri: 'scrape://docs/troubleshooting',
    name: 'docs_troubleshooting',
    title: 'Troubleshooting Guide',
    description: 'Common errors and fixes: session not found, auth failure, timeout, blocked scrapes.',
    mimeType: 'text/markdown',
  },
];

const RESOURCE_TEMPLATES = [
  {
    uriTemplate: 'scrape://save/{sessionId}/summary',
    name: 'scrape_save_summary',
    title: 'Saved Scrape Summary',
    description: 'Compact metadata and per-page summaries for a saved scrape.',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'scrape://save/{sessionId}/page/{pageIndex}',
    name: 'scrape_save_page',
    title: 'Saved Scrape Page',
    description: 'Single-page payload for a saved scrape.',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'scrape://save/{sessionId}/overview',
    name: 'scrape_save_overview',
    title: 'Saved Scrape Overview',
    description: 'Compact overview of a saved scrape with counts, sections, tech, API surface, and issue summary.',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'scrape://save/{sessionId}/issues',
    name: 'scrape_save_issues',
    title: 'Saved Scrape Issues',
    description: 'Likely issues detected in a saved scrape, including context mismatches and security/header gaps.',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'scrape://save/{sessionId}/deals',
    name: 'scrape_save_deals',
    title: 'Saved Scrape Deals',
    description: 'Likely deals, offers, coupons, or sale snippets extracted from a saved scrape.',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'scrape://save/{sessionId}/orientation',
    name: 'scrape_save_orientation',
    title: 'Saved Scrape Orientation',
    description: 'Goal-aware site orientation metadata showing relevant sections, interactions, recommendations, and coverage.',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'scrape://save/{sessionId}/store-context',
    name: 'scrape_save_store_context',
    title: 'Saved Scrape Store Context',
    description: 'Visible-page versus API-background store/location context signals for a saved scrape.',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'scrape://save/{sessionId}/api-surface',
    name: 'scrape_save_api_surface',
    title: 'Saved Scrape API Surface',
    description: 'Grouped endpoints, GraphQL operations, and auth hints derived from a saved scrape.',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'scrape://save/{sessionId}/api/{kind}',
    name: 'scrape_save_api',
    title: 'Saved Scrape API Calls',
    description: 'Captured API calls for a saved scrape. kind = graphql, rest, or all.',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'scrape://active/{sessionId}',
    name: 'scrape_active_status',
    title: 'Active Scrape Status',
    description: 'Single active or completed scrape status snapshot.',
    mimeType: 'application/json',
  },
];

const PROMPTS = [
  {
    name: 'reverse_engineer_site_api',
    title: 'Reverse Engineer Site API',
    description: 'Inspect captured API calls and summarize likely client/server contracts.',
    arguments: [{ name: 'sessionId', description: 'Saved scrape session ID', required: true }],
  },
  {
    name: 'extract_contacts_from_scrape',
    title: 'Extract Contacts From Scrape',
    description: 'Pull contact details, forms, and relevant links from a saved scrape.',
    arguments: [{ name: 'sessionId', description: 'Saved scrape session ID', required: true }],
  },
  {
    name: 'review_scrape_security',
    title: 'Review Scrape Security',
    description: 'Review saved scrape data for secrets, PII, and exposed APIs.',
    arguments: [{ name: 'sessionId', description: 'Saved scrape session ID', required: true }],
  },
  {
    name: 'compare_scrapes_workflow',
    title: 'Compare Scrapes Workflow',
    description: 'Compare two saved scrapes for content and API drift.',
    arguments: [
      { name: 'sessionIdA', description: 'First saved scrape session ID', required: true },
      { name: 'sessionIdB', description: 'Second saved scrape session ID', required: true },
    ],
  },
  {
    name: 'investigate_site_leakage',
    title: 'Investigate Site Leakage',
    description: 'Investigate likely context leakage, auth leakage, or inconsistent store/location state in a saved scrape.',
    arguments: [{ name: 'sessionId', description: 'Saved scrape session ID', required: true }],
  },
  {
    name: 'extract_store_deals',
    title: 'Extract Store Deals',
    description: 'Extract deal snippets and supporting context from a saved scrape of a storefront or weekly ad flow.',
    arguments: [{ name: 'sessionId', description: 'Saved scrape session ID', required: true }],
  },
  {
    name: 'map_api_surface',
    title: 'Map API Surface',
    description: 'Map a saved scrape into grouped endpoints, GraphQL operations, and likely auth assumptions.',
    arguments: [{ name: 'sessionId', description: 'Saved scrape session ID', required: true }],
  },
  {
    name: 'plan_site_extraction_for_goal',
    title: 'Plan Site Extraction For Goal',
    description: 'Plan a broad scrape from orientation metadata before producing final output.',
    arguments: [
      { name: 'sessionId', description: 'Saved scrape session ID', required: true },
      { name: 'goal', description: 'The user goal the orientation was built for', required: true },
    ],
  },
  {
    name: 'browser_interaction_workflow',
    title: 'Browser Interaction Workflow',
    description: 'Guide an AI through opening a live browser session, inspecting interactables, and completing a compact action sequence safely.',
    arguments: [
      { name: 'url', description: 'Target URL to open in a browser session', required: true },
      { name: 'goal', description: 'What the browser interaction should accomplish', required: true },
    ],
  },
  {
    name: 'authenticated_browser_to_scrape_workflow',
    title: 'Authenticated Browser To Scrape Workflow',
    description: 'Guide an AI through reusing a live authenticated browser state as the starting point for a normal scrape capture.',
    arguments: [
      { name: 'browserSessionId', description: 'Active browser session ID to hand off to the scraper', required: true },
      { name: 'goal', description: 'What data or outcome the final scrape should produce', required: true },
    ],
  },
  {
    name: 'security_full_audit',
    title: 'Full Security Audit',
    description: 'Complete security posture: headers, TLS, JWT tokens, PII scan, and CORS in one guided workflow.',
    arguments: [{ name: 'url', description: 'Target URL to audit', required: true }],
  },
  {
    name: 'privacy_gdpr_audit',
    title: 'Privacy & GDPR Audit',
    description: 'Audit cookie consent, tracking vendors, third-party data sharing, and GDPR compliance signals.',
    arguments: [{ name: 'sessionId', description: 'Saved scrape session ID', required: true }],
  },
  {
    name: 'tech_stack_fingerprint',
    title: 'Tech Stack Fingerprint',
    description: 'Deep tech identification: CDN, frameworks, analytics, payment processors, tag managers, and chat tools.',
    arguments: [{ name: 'sessionId', description: 'Saved scrape session ID', required: true }],
  },
  {
    name: 'competitive_intel',
    title: 'Competitive Intelligence',
    description: 'Extract pricing tiers, feature claims, social proof signals, and tech stack for competitive analysis.',
    arguments: [{ name: 'sessionId', description: 'Saved scrape session ID', required: true }],
  },
  {
    name: 'site_health_check',
    title: 'Site Health Check',
    description: 'Comprehensive health check: broken links, JS errors, Core Web Vitals, SSL expiry, and security header grade.',
    arguments: [{ name: 'sessionId', description: 'Saved scrape session ID', required: true }],
  },
  {
    name: 'ecommerce_audit',
    title: 'E-Commerce Audit',
    description: 'Extract products, pricing patterns, cart flow, payment processors, and trust signals.',
    arguments: [{ name: 'sessionId', description: 'Saved scrape session ID', required: true }],
  },
  {
    name: 'company_deep_dive',
    title: 'Company Deep Dive',
    description: 'Extract company info, job listings (hiring signals), social profiles, contacts, and registration details.',
    arguments: [{ name: 'sessionId', description: 'Saved scrape session ID', required: true }],
  },
  {
    name: 'content_seo_audit',
    title: 'Content & SEO Audit',
    description: 'Review heading hierarchy, canonical tags, hreflang, image alt text, internal links, and structured data.',
    arguments: [{ name: 'sessionId', description: 'Saved scrape session ID', required: true }],
  },
  {
    name: 'monitor_setup_workflow',
    title: 'Monitor Setup Workflow',
    description: 'Detect key page elements to watch and recommend optimal monitoring frequency and CSS selectors.',
    arguments: [{ name: 'sessionId', description: 'Saved scrape session ID', required: true }],
  },
  {
    name: 'data_extraction_plan',
    title: 'Data Extraction Plan',
    description: 'Given a goal, plan the optimal tool sequence and scrape options to extract the target data.',
    arguments: [
      { name: 'url', description: 'Target URL', required: true },
      { name: 'goal', description: 'What data you want to extract', required: true },
    ],
  },
  {
    name: 'bulk_site_inventory',
    title: 'Bulk Site Inventory',
    description: 'Crawl sitemap, classify page types, and build a structured inventory of site sections.',
    arguments: [{ name: 'url', description: 'Site URL (root or sitemap URL)', required: true }],
  },
  {
    name: 'auth_flow_analysis',
    title: 'Auth Flow Analysis',
    description: 'Detect login mechanisms, 2FA types, OAuth providers, and session management approach.',
    arguments: [{ name: 'url', description: 'Target URL', required: true }],
  },
  {
    name: 'performance_deep_dive',
    title: 'Performance Deep Dive',
    description: 'Break down LCP, CLS, TBT, and TTFB from scrape data and identify render-blocking bottlenecks.',
    arguments: [{ name: 'sessionId', description: 'Saved scrape session ID', required: true }],
  },
  {
    name: 'api_security_review',
    title: 'API Security Review',
    description: 'Review JWT tokens, CORS policy, CSP effectiveness, and sensitive endpoint exposure from a scrape.',
    arguments: [{ name: 'sessionId', description: 'Saved scrape session ID', required: true }],
  },
  {
    name: 'infrastructure_fingerprint',
    title: 'Infrastructure Fingerprint',
    description: 'Build a full infrastructure picture: IP, ASN, hosting provider, CDN, DNS records, SSL cert, and server headers.',
    arguments: [{ name: 'url', description: 'Target site URL', required: true }],
  },
  {
    name: 'iframe_content_map',
    title: 'iFrame Content Map',
    description: 'Scrape a page and report all embedded iFrames — URL, title, text, and form presence — to uncover hidden embedded content.',
    arguments: [{ name: 'url', description: 'Page URL to inspect', required: true }],
  },
  {
    name: 'robots_and_seo_audit',
    title: 'Robots & SEO Audit',
    description: 'Audit robots.txt rules, canonical tags, hreflang, structured data, and broken links in one workflow.',
    arguments: [{ name: 'url', description: 'Target site URL', required: true }],
  },
  {
    name: 'third_party_privacy_audit',
    title: 'Third-Party Privacy Audit',
    description: 'Audit third-party scripts, tracking pixels, cookie consent, CSP coverage, and PII exposure risk from a saved scrape.',
    arguments: [{ name: 'sessionId', description: 'Saved scrape session ID', required: true }],
  },
  {
    name: 'review_sentiment_analysis',
    title: 'Review & Sentiment Analysis',
    description: 'Extract reviews and ratings from a scraped page then score sentiment and summarize key themes.',
    arguments: [{ name: 'sessionId', description: 'Saved scrape session ID', required: true }],
  },
];

async function listResources() {
  const resources = [...FIXED_RESOURCES];
  const saves = await expectOk(await get('/api/saves?includeHidden=1'), 'Failed to list saves');
  const active = await fetchActiveScrapes();

  for (const save of saves || []) {
    const encodedId = encodeURIComponent(save.sessionId);
    [
      {
        suffix: 'summary',
        name: `scrape_save_${save.sessionId}_summary`,
        title: `Saved Scrape ${save.sessionId}`,
        description: `Summary resource for saved scrape ${save.sessionId}.`,
      },
      {
        suffix: 'overview',
        name: `scrape_save_${save.sessionId}_overview`,
        title: `Saved Scrape ${save.sessionId} Overview`,
        description: `Overview resource for saved scrape ${save.sessionId}.`,
      },
      {
        suffix: 'issues',
        name: `scrape_save_${save.sessionId}_issues`,
        title: `Saved Scrape ${save.sessionId} Issues`,
        description: `Issue-analysis resource for saved scrape ${save.sessionId}.`,
      },
      {
        suffix: 'deals',
        name: `scrape_save_${save.sessionId}_deals`,
        title: `Saved Scrape ${save.sessionId} Deals`,
        description: `Deal extraction resource for saved scrape ${save.sessionId}.`,
      },
      {
        suffix: 'orientation',
        name: `scrape_save_${save.sessionId}_orientation`,
        title: `Saved Scrape ${save.sessionId} Orientation`,
        description: `Goal-aware orientation resource for saved scrape ${save.sessionId}.`,
      },
      {
        suffix: 'store-context',
        name: `scrape_save_${save.sessionId}_store_context`,
        title: `Saved Scrape ${save.sessionId} Store Context`,
        description: `Store-context resource for saved scrape ${save.sessionId}.`,
      },
      {
        suffix: 'api-surface',
        name: `scrape_save_${save.sessionId}_api_surface`,
        title: `Saved Scrape ${save.sessionId} API Surface`,
        description: `API-surface resource for saved scrape ${save.sessionId}.`,
      },
    ].forEach((resource) => {
      resources.push({
        uri: `scrape://save/${encodedId}/${resource.suffix}`,
        name: resource.name,
        title: resource.title,
        description: resource.description,
        mimeType: 'application/json',
      });
    });
  }

  for (const session of active || []) {
    resources.push({
      uri: `scrape://active/${encodeURIComponent(session.sessionId)}`,
      name: `scrape_active_${session.sessionId}`,
      title: `Active Scrape ${session.sessionId}`,
      description: `Live status resource for scrape ${session.sessionId}.`,
      mimeType: 'application/json',
    });
  }

  return resources;
}

function parseResourceUri(uri) {
  const parsed = new URL(uri);
  if (parsed.protocol !== 'scrape:') throw new Error(`Unsupported resource URI: ${uri}`);

  const host = parsed.hostname;
  const segments = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent);

  if (host === 'saves' && segments.length === 0) {
    return { kind: 'saves' };
  }

  if (host === 'active' && segments.length === 0) {
    return { kind: 'active' };
  }

  if (host === 'active' && segments.length === 1) {
    return { kind: 'activeSession', sessionId: segments[0] };
  }

  if (host === 'save' && segments.length === 2 && segments[1] === 'summary') {
    return { kind: 'saveSummary', sessionId: segments[0] };
  }

  if (host === 'save' && segments.length === 2 && segments[1] === 'overview') {
    return { kind: 'saveOverview', sessionId: segments[0] };
  }

  if (host === 'save' && segments.length === 2 && segments[1] === 'issues') {
    return { kind: 'saveIssues', sessionId: segments[0] };
  }

  if (host === 'save' && segments.length === 2 && segments[1] === 'deals') {
    return { kind: 'saveDeals', sessionId: segments[0] };
  }

  if (host === 'save' && segments.length === 2 && segments[1] === 'orientation') {
    return { kind: 'saveOrientation', sessionId: segments[0] };
  }

  if (host === 'save' && segments.length === 2 && segments[1] === 'store-context') {
    return { kind: 'saveStoreContext', sessionId: segments[0] };
  }

  if (host === 'save' && segments.length === 2 && segments[1] === 'api-surface') {
    return { kind: 'saveApiSurface', sessionId: segments[0] };
  }

  if (host === 'save' && segments.length === 3 && segments[1] === 'page') {
    return {
      kind: 'savePage',
      sessionId: segments[0],
      pageIndex: normalizeInteger(segments[2], {
        defaultValue: 0,
        min: 0,
        max: 100000,
        name: 'pageIndex',
      }),
    };
  }

  if (host === 'save' && segments.length === 3 && segments[1] === 'api') {
    const apiKind = segments[2];
    if (!['graphql', 'rest', 'all'].includes(apiKind)) {
      throw new Error('Resource api kind must be graphql, rest, or all');
    }
    return { kind: 'saveApi', sessionId: segments[0], apiKind };
  }

  if (uri.startsWith('scrape://docs/')) {
    const doc = uri.slice('scrape://docs/'.length).split('?')[0].split('#')[0];
    if (!['tool-list', 'mcp-reference', 'capture-tracker', 'quickstart', 'workflow-recipes', 'tool-selection-guide', 'troubleshooting'].includes(doc)) {
      throw new Error(`Unknown doc resource: ${doc}`);
    }
    return { kind: 'docs', doc };
  }

  throw new Error(`Unknown resource URI: ${uri}`);
}

async function readResource(uri) {
  const target = parseResourceUri(uri);

  if (target.kind === 'saves') {
    const saves = await expectOk(await get('/api/saves?includeHidden=1'), 'Failed to list saves');
    return buildJsonResource(uri, (saves || []).map(summariseSaveMetadata));
  }

  if (target.kind === 'active') {
    const active = await fetchActiveScrapes();
    return buildJsonResource(uri, active || []);
  }

  if (target.kind === 'activeSession') {
    const status = await fetchScrapeStatus(target.sessionId);
    return buildJsonResource(uri, status);
  }

  if (target.kind === 'saveSummary') {
    const save = await loadSave(target.sessionId);
    return buildJsonResource(uri, summariseSaveResource(save));
  }

  if (target.kind === 'saveOverview') {
    const save = await loadSave(target.sessionId);
    return buildJsonResource(uri, buildSaveOverview(save));
  }

  if (target.kind === 'saveIssues') {
    const save = await loadSave(target.sessionId);
    return buildJsonResource(uri, findSiteIssues(save));
  }

  if (target.kind === 'saveDeals') {
    const save = await loadSave(target.sessionId);
    return buildJsonResource(uri, extractDealsFromSave(save));
  }

  if (target.kind === 'saveOrientation') {
    const save = await loadSave(target.sessionId);
    return buildJsonResource(uri, save.orientation || null);
  }

  if (target.kind === 'saveStoreContext') {
    const save = await loadSave(target.sessionId);
    return buildJsonResource(uri, collectStoreContext(save));
  }

  if (target.kind === 'saveApiSurface') {
    const save = await loadSave(target.sessionId);
    return buildJsonResource(uri, buildApiSurface(save));
  }

  if (target.kind === 'savePage') {
    const { page, pageIndex } = await loadSavedPage(target.sessionId, target.pageIndex);
    return buildJsonResource(uri, {
      sessionId: target.sessionId,
      pageIndex,
      page,
    });
  }

  if (target.kind === 'saveApi') {
    const save = await loadSave(target.sessionId);
    return buildJsonResource(uri, {
      sessionId: target.sessionId,
      type: target.apiKind,
      ...simplifyApiCalls(save, target.apiKind, 100),
    });
  }

  if (target.kind === 'docs') {
    if (target.doc === 'tool-list') {
      return buildMarkdownResource(uri, buildDocsToolList());
    }
    if (target.doc === 'mcp-reference') {
      const mcpMd = path.join(__dirname, 'MCP.md');
      const text = fs.existsSync(mcpMd) ? fs.readFileSync(mcpMd, 'utf8') : '# MCP.md not found';
      return buildMarkdownResource(uri, text);
    }
    if (target.doc === 'capture-tracker') {
      const tracker = path.join(__dirname, 'CAPTURE_TRACKER.md');
      const text = fs.existsSync(tracker) ? fs.readFileSync(tracker, 'utf8') : '# CAPTURE_TRACKER.md not found';
      return buildMarkdownResource(uri, text);
    }
    if (target.doc === 'quickstart') return buildMarkdownResource(uri, DOCS_QUICKSTART);
    if (target.doc === 'workflow-recipes') return buildMarkdownResource(uri, DOCS_WORKFLOW_RECIPES);
    if (target.doc === 'tool-selection-guide') return buildMarkdownResource(uri, DOCS_TOOL_SELECTION_GUIDE);
    if (target.doc === 'troubleshooting') return buildMarkdownResource(uri, DOCS_TROUBLESHOOTING);
  }

  throw new Error(`Unhandled resource URI: ${uri}`);
}

function buildPromptText(name, args = {}) {
  switch (name) {
    case 'reverse_engineer_site_api': {
      const sessionId = ensureNonEmptyString(args.sessionId, 'sessionId');
      return `Use get_scrape_status on ${sessionId} first, then prefer scrape://save/${sessionId}/summary, find_graphql_endpoints, get_api_calls, infer_schema, and scrape://save/${sessionId}/api/all. Start with narrow reads, identify endpoints and auth assumptions, then summarize likely client/server contracts.`;
    }
    case 'extract_contacts_from_scrape': {
      const sessionId = ensureNonEmptyString(args.sessionId, 'sessionId');
      return `Start with scrape://save/${sessionId}/summary, then use extract_entities, search_scrape_text, list_links, and list_forms. Prefer narrow reads first, then summarize emails, phones, social links, contact forms, and next best pages to review.`;
    }
    case 'review_scrape_security': {
      const sessionId = ensureNonEmptyString(args.sessionId, 'sessionId');
      return `Check get_scrape_status for ${sessionId}, then inspect scrape://save/${sessionId}/summary, scan_pii, get_tech_stack, find_graphql_endpoints, and scrape://save/${sessionId}/api/all. Focus on exposed secrets, PII, risky headers, and sensitive endpoints before summarizing risk.`;
    }
    case 'compare_scrapes_workflow': {
      const sessionIdA = ensureNonEmptyString(args.sessionIdA, 'sessionIdA');
      const sessionIdB = ensureNonEmptyString(args.sessionIdB, 'sessionIdB');
      return `Use scrape://save/${sessionIdA}/summary and scrape://save/${sessionIdB}/summary first, then compare_scrapes, get_tech_stack for both saves, and scrape://save/${sessionIdA}/api/all plus scrape://save/${sessionIdB}/api/all. Start narrow, then summarize content changes, endpoint drift, and schema differences.`;
    }
    case 'investigate_site_leakage': {
      const sessionId = ensureNonEmptyString(args.sessionId, 'sessionId');
      return `Start with scrape://save/${sessionId}/overview and scrape://save/${sessionId}/issues, then inspect get_store_context, get_api_surface, search_scrape_text, and scrape://save/${sessionId}/api-surface. Focus on visible-page vs API mismatches, auth/session leakage text, stale store context, and concrete evidence before summarizing what is happening.`;
    }
    case 'extract_store_deals': {
      const sessionId = ensureNonEmptyString(args.sessionId, 'sessionId');
      return `Start with scrape://save/${sessionId}/overview and scrape://save/${sessionId}/deals, then use extract_deals, get_store_context, search_scrape_text, and scrape://save/${sessionId}/api/all only if needed. Prefer narrow reads first, then summarize the strongest active deals, their supporting evidence, and any store-context caveats.`;
    }
    case 'map_api_surface': {
      const sessionId = ensureNonEmptyString(args.sessionId, 'sessionId');
      return `Start with scrape://save/${sessionId}/api-surface and scrape://save/${sessionId}/overview, then use get_api_surface, find_graphql_endpoints, get_api_calls, and infer_schema if GraphQL is present. Summarize grouped endpoints, operation names, auth hints, and which requests look most important.`;
    }
    case 'plan_site_extraction_for_goal': {
      const sessionId = ensureNonEmptyString(args.sessionId, 'sessionId');
      const goal = ensureNonEmptyString(args.goal, 'goal');
      return `Start with scrape://save/${sessionId}/orientation, then inspect scrape://save/${sessionId}/overview and only follow the highest-priority recommendedScrapes that are still needed for the goal "${goal}". Use browser automation or manual UI inspection for live confirmation of tricky interactive flows. Avoid collapsing broad requests into a single page when sibling sections are relevant.`;
    }
    case 'browser_interaction_workflow': {
      const url = ensureNonEmptyString(args.url, 'url');
      const goal = ensureNonEmptyString(args.goal, 'goal');
      return `Work toward the goal "${goal}" on ${url} using the browser automation session tools.

Step 1 - Open a session: call open_browser_session with url="${url}", viewMode="console", persistenceMode="auth_state".
Step 2 - Inspect the page: call inspect_browser_page with the returned browserSessionId and study interactables, forms, warnings, and visible text summary.
Step 3 - Act deliberately: prefer click_browser_element, type_into_browser_element, select_browser_option, and wait_for_browser_state using elementId values from the latest inspection. Re-inspect after meaningful page changes.
Step 4 - Use run_browser_steps only when a short sequence is clearer than many single calls.
Step 5 - Save or hand off: if the browser state is valuable for later reuse call save_browser_session. If the goal now needs a normal structured scrape, call scrape_browser_session.

Keep the interaction compact, narrate only public action intent, and avoid relying on raw selectors unless inspect_browser_page did not surface a usable elementId.`;
    }
    case 'authenticated_browser_to_scrape_workflow': {
      const browserSessionId = ensureNonEmptyString(args.browserSessionId, 'browserSessionId');
      const goal = ensureNonEmptyString(args.goal, 'goal');
      return `Use browser session ${browserSessionId} as the authenticated starting point for the goal "${goal}".

Step 1 - Confirm state: call get_browser_session_state with browserSessionId="${browserSessionId}" and refreshSnapshot=true.
Step 2 - If the target page or filter state is not ready, use inspect_browser_page plus click_browser_element / type_into_browser_element / select_browser_option / wait_for_browser_state until the browser is positioned correctly.
Step 3 - Save the reusable state if it matters: call save_browser_session with browserSessionId="${browserSessionId}".
Step 4 - Hand off to the scraper: call scrape_browser_session with browserSessionId="${browserSessionId}" and choose maxPages, scrapeDepth, and capture flags that match the goal.
Step 5 - Read the returned scrapeSessionId via scrape://save/{id}/overview, then continue with saved-scrape tools like get_api_surface, extract_product_data, extract_company_info, or search_scrape_text depending on the goal.

Prefer browser automation for login walls, filters, tabs, and SPA state. Prefer scraper tools for the final structured capture and downstream analysis.`;
    }
    case 'security_full_audit': {
      const { url } = args;
      if (!url) throw new Error('url is required');
      return `Perform a complete security audit of ${url}.

Step 1 — Scrape: call scrape_url with url="${url}", captureGraphQL=true, captureREST=true. Save the sessionId.
Step 2 — Score security headers: call score_security_headers with the sessionId.
Step 3 — Inspect TLS certificate: call inspect_ssl with url="${url}".
Step 4 — Decode any JWT tokens found: call decode_jwt_tokens with the sessionId.
Step 5 — Scan for PII leakage: call scan_pii with the sessionId.
Step 6 — Review CORS policy: look at corsPreflights in the scrape result.
Step 7 — Check DNS for SPF, DMARC, DKIM: call lookup_dns with url="${url}".

Compile a prioritized report: critical findings first, then warnings, then informational. Include the security header grade (A+–F), TLS certificate expiry, JWT weaknesses found, PII exposure risk, and DNS mail security posture.`;
    }
    case 'privacy_gdpr_audit': {
      const sessionId = ensureNonEmptyString(args.sessionId, 'sessionId');
      return `Audit privacy and GDPR compliance for session ${sessionId}.

Step 1 — Read scrape://save/${sessionId}/overview to understand the site.
Step 2 — Use search_scrape_text with sessionId="${sessionId}" to find "cookie", "consent", "privacy policy", "GDPR" text.
Step 3 — Call get_tech_stack with sessionId="${sessionId}" to identify tracking vendors (GA, Meta Pixel, TikTok, HotJar, Clarity, etc.).
Step 4 — Look for cookieConsent data in the scrape extractor output (search_scrape_text for "cookieConsent").
Step 5 — Review API calls for known tracking endpoints: call get_api_calls with sessionId="${sessionId}".

Report: consent mechanism detected (OneTrust, Cookiebot, native, none), opt-in vs opt-out model, which third-party tracking vendors are present, what data they receive, and overall GDPR risk level (low/medium/high) with specific remediation steps.`;
    }
    case 'tech_stack_fingerprint': {
      const sessionId = ensureNonEmptyString(args.sessionId, 'sessionId');
      return `Produce a deep technology fingerprint for session ${sessionId}.

Step 1 — Call get_tech_stack with sessionId="${sessionId}".
Step 2 — Read scrape://save/${sessionId}/overview for additional infrastructure signals.
Step 3 — Read scrape://save/${sessionId}/api-surface for backend technology clues (API patterns, response formats, auth headers).
Step 4 — Extract the site origin from the save overview (the startUrl field), then call inspect_ssl with that URL to identify CDN and certificate authority.
Step 5 — Call lookup_dns with the same site origin URL to reveal hosting, mail provider, and CDN.

Organize output by layer: CDN → hosting/infrastructure → frontend framework → backend hints → analytics & tracking → marketing automation → payments → support/chat → error tracking → A/B testing. Flag any deprecated or known-vulnerable versions.`;
    }
    case 'competitive_intel': {
      const sessionId = ensureNonEmptyString(args.sessionId, 'sessionId');
      return `Extract competitive intelligence from session ${sessionId}.

Step 1 — Read scrape://save/${sessionId}/overview and scrape://save/${sessionId}/summary.
Step 2 — Call extract_business_intel with sessionId="${sessionId}" for structured pricing and metrics.
Step 3 — Use search_scrape_text with sessionId="${sessionId}" to find pricing tables, plan names, feature lists, and competitor mentions.
Step 4 — Call get_tech_stack with sessionId="${sessionId}" to understand their operational stack.
Step 5 — Look for social proof: review counts, customer logos, testimonials, case studies.

Deliver: pricing tiers table (plan → price → key features), top differentiators claimed, competitor mentions, tech stack profile, trust signals inventory (certifications, reviews, logos), and 3 strategic observations about their positioning.`;
    }
    case 'site_health_check': {
      const sessionId = ensureNonEmptyString(args.sessionId, 'sessionId');
      return `Run a comprehensive health check on session ${sessionId}.

Step 1 — Read scrape://save/${sessionId}/overview and scrape://save/${sessionId}/issues.
Step 2 — Call check_broken_links with sessionId="${sessionId}".
Step 3 — Call score_security_headers with sessionId="${sessionId}".
Step 4 — Look for performance metrics in the scrape data: search_scrape_text with sessionId="${sessionId}" for "lcp", "cls", "fcp", "tbt", "ttfb".
Step 5 — Call find_site_issues with sessionId="${sessionId}" for additional quality signals.

Deliver a health scorecard: Broken Links (count and examples), Security Headers (grade A+–F), Core Web Vitals (LCP/CLS/FCP pass/fail), JS Errors (count), and top 5 prioritized fixes with estimated impact.`;
    }
    case 'ecommerce_audit': {
      const sessionId = ensureNonEmptyString(args.sessionId, 'sessionId');
      return `Audit the e-commerce setup in session ${sessionId}.

Step 1 — Read scrape://save/${sessionId}/overview.
Step 2 — Call extract_product_data with sessionId="${sessionId}" for a product catalog snapshot.
Step 3 — Call extract_deals with sessionId="${sessionId}" for active promotions and offers.
Step 4 — Read scrape://save/${sessionId}/api-surface for cart and checkout API patterns.
Step 5 — Call get_tech_stack with sessionId="${sessionId}" to identify payment processors.
Step 6 — Call score_security_headers with sessionId="${sessionId}" (payment pages need strong security).

Deliver: product count and price range, active promotions/deals, payment processors detected, cart API pattern (REST/GraphQL), checkout flow steps, trust signals (SSL badges, reviews, guarantees, certifications), and any friction points.`;
    }
    case 'company_deep_dive': {
      const sessionId = ensureNonEmptyString(args.sessionId, 'sessionId');
      return `Extract comprehensive company intelligence from session ${sessionId}.

Step 1 — Read scrape://save/${sessionId}/overview.
Step 2 — Call extract_company_info with sessionId="${sessionId}".
Step 3 — Call extract_job_listings with sessionId="${sessionId}" for hiring signals (what roles, what departments, seniority mix).
Step 4 — Call extract_entities with sessionId="${sessionId}" for contacts, emails, phone numbers, addresses.
Step 5 — Use search_scrape_text with sessionId="${sessionId}" for founding year, employee count, funding, and mission statement.
Step 6 — Call get_tech_stack with sessionId="${sessionId}" to understand operational sophistication.

Deliver: company profile card (name, founded, size estimate, location, registration number if found), leadership contacts, social profiles, hiring trend analysis (open roles by department and level), tech stack profile, and 3 strategic observations.`;
    }
    case 'content_seo_audit': {
      const sessionId = ensureNonEmptyString(args.sessionId, 'sessionId');
      return `Audit content and SEO signals for session ${sessionId}.

Step 1 — Read scrape://save/${sessionId}/summary for per-page heading and meta overview.
Step 2 — Call find_site_issues with sessionId="${sessionId}".
Step 3 — Call check_broken_links with sessionId="${sessionId}".
Step 4 — Use search_scrape_text with sessionId="${sessionId}" to spot duplicate H1s, missing meta descriptions, and thin content pages.
Step 5 — Call list_images with sessionId="${sessionId}" to check for missing alt text.

Deliver an SEO scorecard: H1 coverage (%), meta description coverage (%), canonical consistency, hreflang implementation, structured data types found (JSON-LD), broken links count, image alt text rate, and a prioritized top-5 SEO issues list with fix guidance.`;
    }
    case 'monitor_setup_workflow': {
      const sessionId = ensureNonEmptyString(args.sessionId, 'sessionId');
      return `Design a monitoring plan for session ${sessionId}.

Step 1 — Read scrape://save/${sessionId}/overview to understand page types and content.
Step 2 — Call find_site_issues with sessionId="${sessionId}" to see what's already fragile.
Step 3 — Use search_scrape_text with sessionId="${sessionId}" to find price elements, inventory signals, stock status, or time-sensitive content.
Step 4 — Read scrape://save/${sessionId}/api-surface to identify data endpoints that change frequently.

Deliver a monitoring config table: URL | CSS selector to watch | change type (text/price/availability/layout) | recommended interval (minutes) | alert threshold. Then call monitor_page for the 2 highest-priority pages to activate live monitoring immediately.`;
    }
    case 'data_extraction_plan': {
      const { url, goal } = args;
      if (!url) throw new Error('url is required');
      if (!goal) throw new Error('goal is required');
      return `Plan the optimal data extraction for goal: "${goal}" from ${url}.

Step 1 — Call detect_site with url="${url}" to understand site type, technology, and auth requirements.
Step 2 — Call preflight_url with url="${url}" to check if auth is required and what pages are accessible.
Step 3 — Call map_site_for_goal with url="${url}" and goal="${goal}" to build a goal-aware site orientation.
Step 4 — Read scrape://save/{sessionId}/orientation to review recommended scrape targets and interaction hints.

Deliver: recommended scrape_url options (maxPages, captureGraphQL, fullCrawl, autoScroll flags), ordered list of pages to scrape by priority, expected data fields and their sources (DOM vs API call), and estimated scrape time. Then begin executing the top-priority scrapes.`;
    }
    case 'bulk_site_inventory': {
      const { url } = args;
      if (!url) throw new Error('url is required');
      return `Build a structured inventory of ${url}.

Step 1 — Call crawl_sitemap with url="${url}" to get all URLs (up to 500).
Step 2 — Call batch_scrape with the URL list from step 1 to produce a sessionId. Then call classify_pages with that sessionId to categorize page types.
Step 3 — Call get_link_graph with the sessionId to find hub pages, orphans, and dead-ends.
Step 4 — Call find_site_issues with the sessionId for a quality overview.

Deliver: total page count, page type distribution table (landing/product/blog/category/contact/etc.), hub pages (highest in-degree), orphan pages (no internal links in), sitemap coverage estimate, and top 5 structural recommendations.`;
    }
    case 'auth_flow_analysis': {
      const { url } = args;
      if (!url) throw new Error('url is required');
      return `Analyze the authentication flow for ${url}.

Step 1 — Scrape: call scrape_url with url="${url}", captureGraphQL=true, captureREST=true. Save the sessionId.
Step 2 — Call list_forms with sessionId to find login, signup, and password reset forms (fields, actions, methods).
Step 3 — Read scrape://save/{sessionId}/api-surface to identify auth-related endpoints (/login, /oauth, /token, /auth, /session).
Step 4 — Call decode_jwt_tokens with sessionId to inspect any tokens captured during the scrape.
Step 5 — Look for OAuth/SSO providers in the page content and API calls.

Deliver: login mechanism type (form/OAuth/SSO/magic link/2FA), identity providers detected (Google, Microsoft, GitHub, etc.), auth endpoints documented with HTTP methods, token format and key claims if JWT found, session management approach (cookie/localStorage/token), and 3 security recommendations.`;
    }
    case 'performance_deep_dive': {
      const sessionId = ensureNonEmptyString(args.sessionId, 'sessionId');
      return `Analyze web performance in depth for session ${sessionId}.

Step 1 — Read scrape://save/${sessionId}/summary for per-page performance metrics.
Step 2 — Use search_scrape_text with sessionId="${sessionId}" to find performance data in the scrape (LCP, CLS, TBT, FCP, TTFB values from the extractor output).
Step 3 — Read scrape://save/${sessionId}/api-surface to identify large or render-blocking resources.
Step 4 — Call get_tech_stack with sessionId="${sessionId}" to identify performance-impacting tools (tag managers, chat widgets, video embeds, analytics).

Deliver: per-page performance scorecard with Core Web Vitals (LCP: pass < 2.5s, CLS: pass < 0.1, TBT pass < 200ms), top 3 bottlenecks identified, render-blocking resources list, third-party script weight estimate, and a prioritized optimization plan (impact × effort matrix).`;
    }
    case 'api_security_review': {
      const sessionId = ensureNonEmptyString(args.sessionId, 'sessionId');
      return `Review API security posture for session ${sessionId}.

Step 1 — Read scrape://save/${sessionId}/api-surface for all captured endpoints and auth patterns.
Step 2 — Call decode_jwt_tokens with sessionId="${sessionId}" to check for weak token algorithms (alg:none), missing claims (sub, aud, iss), or expired tokens.
Step 3 — Read the corsPreflights data from the scrape result: use search_scrape_text with sessionId="${sessionId}" for "corsPreflights".
Step 4 — Call score_security_headers with sessionId="${sessionId}" to assess CSP and CORS header effectiveness.
Step 5 — Look for sensitive endpoints: search_scrape_text with sessionId="${sessionId}" for "/admin", "/internal", "/debug", "token", "secret", "key".

Report: JWT security assessment, CORS policy findings (wildcard exposure, credentialed requests), most sensitive endpoints discovered, CSP policy gaps, and ranked remediation list.`;
    }
    case 'infrastructure_fingerprint': {
      const url = ensureNonEmptyString(args.url, 'url');
      return `Build a full infrastructure fingerprint for ${url}.

Step 1 — Call lookup_ip_info with hostname="${url}" to get the IP address, country, ISP, ASN, and hosting provider.
Step 2 — Call lookup_dns with url="${url}" to get A, MX, TXT, NS, and CNAME records.
Step 3 — Call inspect_ssl with url="${url}" to check the SSL certificate chain, expiry, SANs, and cipher strength.
Step 4 — Call get_tech_stack via scrape_url or from an existing session (detect_site with url="${url}") to identify CDN, server software, and frameworks.
Step 5 — Call probe_endpoints with url="${url}" to surface any exposed admin panels, debug paths, or version endpoints that reveal additional infrastructure detail.

Deliver: IP address and hosting summary (provider, ASN, country), DNS record map, SSL certificate health (expiry date, issuer, SAN coverage), CDN and WAF identification, server software and framework stack, and a risk assessment for exposed infrastructure information.`;
    }
    case 'iframe_content_map': {
      const url = ensureNonEmptyString(args.url, 'url');
      return `Map all embedded iFrames on ${url}.

Step 1 — Call scrape_url with url="${url}" to capture the page including iFrame content. The scraper will automatically extract same-origin iFrame text, links, and form presence.
Step 2 — Read scrape://save/{sessionId}/overview and look for the iframeContents field to see what was captured from iFrames.
Step 3 — Review the raw iframes list (from the overview) to cross-reference embedded iFrame URLs with the captured content.
Step 4 — For any iFrame URL that looks like a payment, login, or third-party embed (Stripe, PayPal, YouTube, Google Maps, Salesforce), note whether it is same-origin (content accessible) or cross-origin (content blocked by CORS).

Deliver: total iFrame count, list of iFrame URLs with their type classification (same-origin / cross-origin), captured text summaries for accessible iFrames, identification of high-value embedded content (payment flows, login forms, maps, video players), and CORS-blocked iFrame URLs that may hide significant page functionality.`;
    }
    case 'robots_and_seo_audit': {
      const url = ensureNonEmptyString(args.url, 'url');
      return `Run a full robots.txt + SEO audit for ${url}.

Step 1 — Call get_robots_txt with url="${url}" to see what paths are disallowed, which crawlers are targeted, and what sitemaps are referenced.
Step 2 — Call scrape_url with url="${url}" maxPages=5 to capture meta tags, canonical URLs, hreflang, and structured data.
Step 3 — Call check_broken_links with sessionId from the scrape to find broken internal and external links.
Step 4 — Call get_link_graph with sessionId to identify orphan pages, dead-ends, and hub pages.
Step 5 — Review the JSON-LD structured data from the save overview (scrape://save/{sessionId}/overview) for schema.org compliance.

Deliver: robots.txt summary (blocked paths, crawl-delay, sitemap URLs), SEO meta assessment (canonical, hreflang, description completeness), structured data validity, broken links count and list, and a ranked SEO improvement list.`;
    }
    case 'third_party_privacy_audit': {
      const sessionId = ensureNonEmptyString(args.sessionId, 'sessionId');
      return `Audit third-party scripts and tracking for session ${sessionId}.

Step 1 — Read scrape://save/${sessionId}/overview to get the thirdPartyScripts and trackingPixels fields.
Step 2 — Call scan_pii with sessionId="${sessionId}" to identify any PII exposed in network calls.
Step 3 — Call score_security_headers with sessionId="${sessionId}" to check if CSP restricts third-party script domains.
Step 4 — Review the cookieConsent data from the overview: is there an opt-in/opt-out mechanism? Which vendor?

Deliver: third-party script inventory (domain, category, async/defer status), tracking pixel inventory (Facebook, Google, TikTok, etc.), GDPR risk rating (Low/Medium/High), CSP coverage assessment, cookie consent mechanism summary, and recommended remediation steps.`;
    }
    case 'review_sentiment_analysis': {
      const sessionId = ensureNonEmptyString(args.sessionId, 'sessionId');
      return `Extract reviews and analyze sentiment for session ${sessionId}.

Step 1 — Call extract_reviews with sessionId="${sessionId}" to get aggregate ratings and individual reviews.
Step 2 — Analyze the reviews for sentiment: categorize as positive / neutral / negative, identify the most common praise themes and complaint themes.
Step 3 — Read scrape://save/${sessionId}/overview to check the product/service name and overall rating context.
Step 4 — Scan for additional review signals using search_scrape_text with sessionId="${sessionId}" for "review", "rating", "stars", "recommend".

Deliver: aggregate rating summary, review count, sentiment breakdown (% positive / neutral / negative), top 3 praise themes with example quotes, top 3 complaint themes with example quotes, and overall sentiment verdict.`;
    }
    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}

// ── MCP server setup ────────────────────────────────────────────────────────

const server = new Server(
  { name: 'web-scraper', version: SERVER_VERSION },
  {
    capabilities: {
      tools:       {},
      resources:   { subscribe: true, listChanged: true },
      prompts:     {},
      logging:     {},
      completions: {},
    },
    instructions: [
      'You are connected to a production web scraping and analysis platform.',
      '',
      'Workflow guidance:',
      '- Start with detect_site or preflight_url before scraping an unknown site.',
      '- Read scrape://save/{id}/overview before raw page data — smaller, faster, avoids token bloat.',
      '- Use prompts/ for multi-step workflows (security_full_audit, competitive_intel, site_health_check, etc.).',
      '- Long-running tools (scrape_url, batch_scrape, crawl_sitemap) emit progress notifications — listen for them.',
      '- Destructive tools [D] delete permanently. Confirm with the user before calling delete_save, delete_schedule, or delete_monitor.',
      '- Open-world tools [OW] make outbound network calls. Be mindful of rate limits — do not hammer sites.',
      '- For authenticated scraping: call check_saved_session first, then use submit_scrape_credentials / submit_verification_code mid-flight if needed.',
      '- AI analysis (research_url) uses the connected model via MCP sampling — no external Ollama URL required.',
      '- Read scrape://docs/quickstart for the 10-step onboarding workflow.',
      '- Read scrape://docs/workflow-recipes for copy-paste multi-tool sequences.',
      '- Read scrape://docs/tool-selection-guide to pick the right tool for your goal.',
    ].join('\n'),
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: listToolsForCurrentToolset() };
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: await listResources(),
}));

server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
  resourceTemplates: RESOURCE_TEMPLATES,
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = ensureNonEmptyString(request.params.uri, 'uri');
  return readResource(uri);
});

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: PROMPTS,
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const prompt = PROMPTS.find((entry) => entry.name === name);
  if (!prompt) throw new Error(`Unknown prompt: ${name}`);
  return {
    description: prompt.description,
    messages: [buildPromptMessage(buildPromptText(name, args || {}))],
  };
});

// ── Logging ───────────────────────────────────────────────────────────────────
server.setRequestHandler(SetLevelRequestSchema, async (request) => {
  currentLogLevel = request.params.level;
  return {};
});

// ── Resource subscriptions ────────────────────────────────────────────────────
server.setRequestHandler(SubscribeRequestSchema, async (request) => {
  activeSubscriptions.add(request.params.uri);
  return {};
});

server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
  activeSubscriptions.delete(request.params.uri);
  return {};
});

// ── Argument completions ──────────────────────────────────────────────────────
server.setRequestHandler(CompleteRequestSchema, async (request) => {
  const { argument } = request.params;
  const val = argument?.value || '';

  // sessionId — list real saved scrape IDs (plain array from /api/saves)
  if (argument?.name === 'sessionId' || argument?.name === 'sessionIdA' || argument?.name === 'sessionIdB') {
    try {
      const response = await get('/api/saves');
      const saves = response.status >= 200 && response.status < 300 && Array.isArray(response.body) ? response.body : [];
      const ids = saves.map(s => s.sessionId).filter(id => id && id.startsWith(val)).slice(0, 10);
      return { completion: { values: ids, hasMore: false } };
    } catch {
      return { completion: { values: [] } };
    }
  }

  if (argument?.name === 'browserSessionId') {
    try {
      const response = await get('/api/browser/sessions');
      const sessions = response.status >= 200 && response.status < 300 && Array.isArray(response.body) ? response.body : [];
      const ids = sessions.map((session) => session.browserSessionId).filter((id) => id && id.startsWith(val)).slice(0, 10);
      return { completion: { values: ids, hasMore: false } };
    } catch {
      return { completion: { values: [] } };
    }
  }

  if (argument?.name === 'browserSaveId' || argument?.name === 'restoreSaveId') {
    try {
      const response = await get('/api/browser/saves');
      const saves = response.status >= 200 && response.status < 300 && Array.isArray(response.body) ? response.body : [];
      const ids = saves.map((save) => save.browserSaveId).filter((id) => id && id.startsWith(val)).slice(0, 10);
      return { completion: { values: ids, hasMore: false } };
    } catch {
      return { completion: { values: [] } };
    }
  }

  // apiKind / kind
  if (argument?.name === 'apiKind' || argument?.name === 'kind') {
    return { completion: { values: ['graphql', 'rest', 'all'].filter(v => v.startsWith(val)) } };
  }

  // pageIndex
  if (argument?.name === 'pageIndex') {
    return { completion: { values: Array.from({ length: 10 }, (_, i) => String(i)).filter(n => n.startsWith(val)) } };
  }

  // url — recent URLs from saved scrapes
  if (argument?.name === 'url') {
    try {
      const response = await get('/api/saves');
      const saves = response.status >= 200 && response.status < 300 && Array.isArray(response.body) ? response.body : [];
      const urls = saves
        .flatMap(s => s.urls || (s.url ? [s.url] : []))
        .filter((u, i, a) => u && a.indexOf(u) === i)
        .filter(u => u.startsWith(val))
        .slice(0, 10);
      return { completion: { values: urls } };
    } catch {
      return { completion: { values: [] } };
    }
  }

  if (argument?.name === 'viewMode') {
    return { completion: { values: ['console', 'desktop', 'both'].filter((value) => value.startsWith(val)) } };
  }

  if (argument?.name === 'persistenceMode') {
    return { completion: { values: ['ephemeral', 'auth_state', 'full_session'].filter((value) => value.startsWith(val)) } };
  }

  return { completion: { values: [] } };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const callArgs = args || {};
  const progressToken = request.params?._meta?.progressToken ?? null;
  const startedAt = Date.now();
  await sendLog('info', 'tool', { tool: name, status: 'start', args: Object.keys(callArgs) });
  try {
    const result = await callTool(name, callArgs, progressToken);
    const ms = Date.now() - startedAt;
    toolLogger.record(name, callArgs, result, ms, null);
    await sendLog('info', 'tool', { tool: name, status: 'done', ms });
    return createToolSuccess(name, result);
  } catch (err) {
    const ms = Date.now() - startedAt;
    toolLogger.record(name, callArgs, null, ms, err);
    await sendLog('error', 'tool', { tool: name, status: 'error', ms, error: err.message });
    return createToolFailure(name, err);
  }
});

async function startSubscriptionPoller() {
  let knownSaveIds = new Set();
  setInterval(async () => {
    if (activeSubscriptions.size === 0) return;
    try {
      const response = await get('/api/saves');
      if (response.status < 200 || response.status >= 300) return;
      const saves = Array.isArray(response.body) ? response.body : [];
      const currentIds = new Set(saves.map(s => s.sessionId).filter(Boolean));
      const changed = [...currentIds].some(id => !knownSaveIds.has(id)) ||
                      [...knownSaveIds].some(id => !currentIds.has(id));
      if (changed) {
        knownSaveIds = currentIds;
        await notifyResourceUpdated('scrape://saves');
        await notifyResourceListChanged();
      }
    } catch {}
  }, 10_000);
}

async function queryClientRoots() {
  try {
    const roots = await server.request({ method: 'roots/list', params: {} }, ListRootsResultSchema);
    if (roots?.roots?.length) {
      await sendLog('info', 'roots', { clientRoots: roots.roots.map(r => r.uri) });
    }
  } catch {}
}

async function main() {
  toolLogger.init(TOOLS.map((tool) => tool.name));
  const transport = new StdioServerTransport();
  await server.connect(transport);
  startSubscriptionPoller();
  queryClientRoots().catch(() => {});
}

module.exports = {
  TOOLS,
  FIXED_RESOURCES,
  PROMPTS,
  RESOURCE_TEMPLATES,
  SERVER_VERSION,
  handleTool,
  callTool,
  listTools: listToolsForCurrentToolset,
  listPrompts: getPromptCatalog,
  getMcpMeta,
  sampleFromClient,
  __private__: {
    analyzeResearchQuestion,
    buildApiSurface,
    buildGoalModel,
    buildOrientationCandidates,
    buildOrientationCoverage,
    buildOrientationFromSave,
    buildPromptText,
    buildResearchEvidence,
    buildSaveOverview,
    buildToolError,
    buildExtractiveResearchAnalysis,
    collectStoreContext,
    determineResearchStrategy,
    determineSiteType,
    createToolFailure,
    createToolSuccess,
    extractDealsFromSave,
    mapSiteForGoal,
    mergeScrapeResults,
    getQuestionKeywords,
    getResearchProfile,
    findSiteIssues,
    normalizeCompletedScrapeResult,
    normalizeInteger,
    normalizeScopeLevel,
    normalizeResearchMode,
    normalizeSaveStatus,
    parseResourceUri,
    persistOrientationArtifact,
    readResource,
    scoreResearchQuestion,
    scoreGoalText,
    searchSavedPages,
    selectOrientationFollowUps,
    shouldStopOrientationRun,
    simplifyApiCalls,
    summariseSaveMetadata,
    summariseSaveResource,
    summarisePage,
    summariseResult,
    summarizeCookieMetadata,
    toResearchPage,
    truncateText,
  },
};

if (require.main === module) {
  main().catch((err) => {
    console.error('[mcp-server] Fatal:', err.message);
    process.exit(1);
  });
}
