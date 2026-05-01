'use strict';

/**
 * Link Graph Builder — directed graph of internal links, orphan/hub detection,
 * redirect chain mapping, broken link checker, and subdomain discovery.
 */

const https = require('https');
const http = require('http');

// ── Graph construction ────────────────────────────────────────────────────

/**
 * Build a directed link graph from an array of scrape page results.
 * @param {Array} pages - Array of page objects with .url and .links
 * @returns {object} { nodes, edges, hubs, authorities, orphans, deadEnds }
 */
function buildLinkGraph(pages) {
  const nodeMap = new Map(); // url -> { url, title, inDegree, outDegree, pageIndex }
  const edges = [];

  // Register all pages as nodes first
  pages.forEach((page, idx) => {
    const url = _normalizeUrl(page.url);
    if (!url) return;
    if (!nodeMap.has(url)) {
      nodeMap.set(url, { url, title: page.title || '', inDegree: 0, outDegree: 0, pageIndex: idx, isScraped: true });
    }
  });

  // Walk links
  for (const page of pages) {
    const fromUrl = _normalizeUrl(page.url);
    if (!fromUrl) continue;

    const links = _collectLinks(page);
    const fromNode = nodeMap.get(fromUrl);

    for (const link of links) {
      const toUrl = _normalizeUrl(link.href);
      if (!toUrl || toUrl === fromUrl) continue;

      // Register target node if not seen
      if (!nodeMap.has(toUrl)) {
        nodeMap.set(toUrl, { url: toUrl, title: link.text || '', inDegree: 0, outDegree: 0, pageIndex: null, isScraped: false });
      }

      const toNode = nodeMap.get(toUrl);
      if (fromNode) fromNode.outDegree++;
      toNode.inDegree++;

      edges.push({ from: fromUrl, to: toUrl, text: link.text || '', rel: link.rel || '' });
    }
  }

  const nodes = [...nodeMap.values()];

  // Identify structural patterns
  const scrapedUrls = new Set(pages.map(p => _normalizeUrl(p.url)).filter(Boolean));
  const startUrl = nodes.find(n => n.pageIndex === 0)?.url;

  const hubs = nodes
    .filter(n => n.outDegree >= 5)
    .sort((a, b) => b.outDegree - a.outDegree)
    .slice(0, 10)
    .map(n => ({ url: n.url, outDegree: n.outDegree }));

  const authorities = nodes
    .filter(n => n.inDegree >= 3)
    .sort((a, b) => b.inDegree - a.inDegree)
    .slice(0, 10)
    .map(n => ({ url: n.url, inDegree: n.inDegree }));

  const orphans = nodes
    .filter(n => n.isScraped && n.inDegree === 0 && n.url !== startUrl)
    .map(n => ({ url: n.url, title: n.title }));

  const deadEnds = nodes
    .filter(n => n.isScraped && n.outDegree === 0)
    .map(n => ({ url: n.url, title: n.title }));

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    scrapedPageCount: scrapedUrls.size,
    nodes,
    edges,
    hubs,
    authorities,
    orphans,
    deadEnds,
  };
}

function _normalizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    // Strip fragment, normalize trailing slash
    u.hash = '';
    let normalized = u.toString();
    if (normalized.endsWith('/') && u.pathname === '/') normalized = normalized.slice(0, -1);
    return normalized;
  } catch {
    return null;
  }
}

function _collectLinks(page) {
  const links = [];
  const raw = page.links || page.extractedLinks || [];
  for (const link of raw) {
    if (typeof link === 'string') {
      links.push({ href: link, text: '', rel: '' });
    } else if (link && link.href) {
      links.push({ href: link.href, text: link.text || link.anchor || '', rel: link.rel || '' });
    } else if (link && link.url) {
      links.push({ href: link.url, text: link.text || '', rel: link.rel || '' });
    }
  }
  return links;
}

// ── Redirect chain mapping ────────────────────────────────────────────────

/**
 * Build a map of redirect chains from network captures.
 * @param {Array} pages
 * @param {Array} apiCalls
 * @returns {object} { chains: { [startUrl]: string[] }, totalRedirects }
 */
function findRedirectChains(pages, apiCalls = []) {
  const chains = {};

  // Look for 3xx responses in API calls
  for (const call of apiCalls) {
    if (!call) continue;
    const status = call.status || call.statusCode;
    if (status >= 300 && status < 400 && call.responseHeaders?.location) {
      const from = call.url || call.requestUrl;
      const to = call.responseHeaders.location;
      if (from && to) {
        if (!chains[from]) chains[from] = [from];
        if (!chains[from].includes(to)) chains[from].push(to);
      }
    }
  }

  // Walk page navigation timing if available
  for (const page of pages) {
    const timing = page.performanceTiming || page.navigationTiming || {};
    if (timing.redirectCount > 0 && page.url && page.redirectedFrom) {
      if (!chains[page.redirectedFrom]) chains[page.redirectedFrom] = [page.redirectedFrom, page.url];
    }
  }

  const totalRedirects = Object.values(chains).reduce((sum, chain) => sum + Math.max(0, chain.length - 1), 0);

  return { chains, totalRedirects };
}

// ── Subdomain discovery ───────────────────────────────────────────────────

/**
 * Discover subdomains of a target domain from all links and API calls.
 * @param {Array} pages
 * @param {Array} apiCalls
 * @param {string} targetDomain - e.g. "example.com"
 * @returns {Array} sorted list of { hostname, seenIn, count }
 */
function discoverSubdomains(pages, apiCalls = [], targetDomain) {
  const subdomainCounts = new Map();

  const register = (hostname, seenIn) => {
    if (!hostname.endsWith('.' + targetDomain)) return;
    if (hostname === targetDomain || hostname === 'www.' + targetDomain) return;
    const key = hostname;
    if (!subdomainCounts.has(key)) subdomainCounts.set(key, { hostname, seenIn: new Set(), count: 0 });
    subdomainCounts.get(key).seenIn.add(seenIn);
    subdomainCounts.get(key).count++;
  };

  for (const page of pages) {
    const links = _collectLinks(page);
    for (const link of links) {
      try { register(new URL(link.href).hostname, 'link'); } catch { /* skip */ }
    }

    const assets = [...(page.images || []), ...(page.cssFiles || []), ...(page.jsFiles || [])];
    for (const asset of assets) {
      const url = typeof asset === 'string' ? asset : (asset.src || asset.url || '');
      try { register(new URL(url).hostname, 'asset'); } catch { /* skip */ }
    }
  }

  for (const call of apiCalls) {
    const url = call.url || call.requestUrl || '';
    try { register(new URL(url).hostname, 'api'); } catch { /* skip */ }
  }

  return [...subdomainCounts.values()]
    .map(s => ({ hostname: s.hostname, seenIn: [...s.seenIn].join('+'), count: s.count }))
    .sort((a, b) => b.count - a.count);
}

// ── Broken link checker ───────────────────────────────────────────────────

const MAX_CONCURRENT = 10;
const CHECK_TIMEOUT_MS = 4000;
const MIN_INTERVAL_MS = 200; // 5 req/s rate limit

function _headRequest(url) {
  return new Promise((resolve) => {
    const start = Date.now();
    let responded = false;

    const respond = (result) => {
      if (responded) return;
      responded = true;
      resolve({ ...result, durationMs: Date.now() - start });
    };

    try {
      const parsed = new URL(url);
      const lib = parsed.protocol === 'https:' ? https : http;

      const req = lib.request(url, {
        method: 'HEAD',
        timeout: CHECK_TIMEOUT_MS,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LinkChecker/1.0)' },
      }, (res) => {
        res.resume(); // drain
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          respond({ url, status: res.statusCode, redirectTo: res.headers.location, ok: false, isRedirect: true });
        } else {
          respond({ url, status: res.statusCode, ok: res.statusCode < 400, isRedirect: false });
        }
      });

      req.on('timeout', () => { req.destroy(); respond({ url, status: null, ok: false, error: 'timeout' }); });
      req.on('error', (err) => respond({ url, status: null, ok: false, error: err.message }));
      req.end();
    } catch (err) {
      respond({ url, status: null, ok: false, error: err.message });
    }
  });
}

/**
 * Check a list of links for broken URLs (HEAD requests, rate-limited, concurrent).
 * @param {string[]} links - Array of URLs to check
 * @param {object} opts
 * @param {boolean} [opts.internalOnly] - Only check URLs matching a given origin
 * @param {string} [opts.origin] - Origin to filter on when internalOnly=true
 * @param {number} [opts.maxLinks=100] - Cap on how many links to check
 * @returns {Promise<object>}
 */
async function checkBrokenLinks(links, opts = {}) {
  const { internalOnly = false, origin = '', maxLinks = 100 } = opts;

  // Filter links
  let toCheck = links
    .map(l => (typeof l === 'string' ? l : l.href || l.url || ''))
    .filter(url => {
      if (!url) return false;
      try { new URL(url); } catch { return false; }
      if (/^(mailto:|tel:|#)/i.test(url)) return false;
      if (internalOnly && origin) {
        try { return new URL(url).origin === origin; } catch { return false; }
      }
      return true;
    })
    .slice(0, maxLinks);

  // Deduplicate
  toCheck = [...new Set(toCheck)];

  const broken = [];
  const redirected = [];
  let okCount = 0;

  // Process in concurrent batches
  let index = 0;
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, toCheck.length) }, async () => {
    while (index < toCheck.length) {
      const url = toCheck[index++];
      const startAt = Date.now();

      const result = await _headRequest(url);

      if (result.ok) {
        okCount++;
      } else if (result.isRedirect) {
        // Follow one level to get final status
        const finalResult = await _headRequest(result.redirectTo);
        if (finalResult.ok) {
          redirected.push({ url, finalUrl: result.redirectTo, hops: 1, finalStatus: finalResult.status });
          okCount++;
        } else {
          broken.push({ url, status: result.status, redirectTo: result.redirectTo, error: 'redirect-to-broken' });
        }
      } else {
        broken.push({ url, status: result.status, error: result.error || `HTTP ${result.status}` });
      }

      // Rate limiting
      const elapsed = Date.now() - startAt;
      if (elapsed < MIN_INTERVAL_MS) {
        await new Promise(r => setTimeout(r, MIN_INTERVAL_MS - elapsed));
      }
    }
  });

  await Promise.all(workers);

  return {
    checked: toCheck.length,
    ok: okCount,
    brokenCount: broken.length,
    redirectedCount: redirected.length,
    broken,
    redirected,
    summary: `Checked ${toCheck.length} links: ${okCount} ok, ${broken.length} broken, ${redirected.length} redirects`,
  };
}

module.exports = { buildLinkGraph, findRedirectChains, discoverSubdomains, checkBrokenLinks };
