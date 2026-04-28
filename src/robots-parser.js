'use strict';

/**
 * Robots.txt Parser — fetch and parse robots.txt for any origin.
 * Returns structured rule sets per user-agent, sitemaps, and highlights.
 */

const https = require('https');
const http = require('http');

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Fetch the raw text of robots.txt from an origin.
 * Returns { text, status, url, fetchedAt } or throws.
 */
function _fetch(origin, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const url = `${origin.replace(/\/$/, '')}/robots.txt`;
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    const req = lib.get(url, {
      timeout: timeoutMs,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Scraper/1.0)' },
    }, (res) => {
      if (res.statusCode === 404) {
        resolve({ text: null, status: 404, url, fetchedAt: new Date().toISOString() });
        res.resume();
        return;
      }
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // One level of redirect only
        const redirectUrl = new URL(res.headers.location, url).toString();
        _fetchUrl(redirectUrl, timeoutMs).then(text => {
          resolve({ text, status: res.statusCode, url: redirectUrl, fetchedAt: new Date().toISOString() });
        }).catch(reject);
        res.resume();
        return;
      }

      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ text: body, status: res.statusCode, url, fetchedAt: new Date().toISOString() }));
    });

    req.on('timeout', () => { req.destroy(); reject(new Error(`robots.txt fetch timed out after ${timeoutMs}ms`)); });
    req.on('error', reject);
  });
}

function _fetchUrl(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; });
      res.on('end', () => resolve(body));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Redirect fetch timeout')); });
    req.on('error', reject);
  });
}

/**
 * Parse raw robots.txt text into a structured object.
 */
function _parseRobotsTxt(text) {
  const lines = text.split(/\r?\n/);
  const userAgents = [];
  const sitemaps = [];
  let currentAgents = [];
  let currentRules = { disallow: [], allow: [], crawlDelay: null };
  let inBlock = false;

  const commitBlock = () => {
    if (currentAgents.length > 0) {
      for (const agent of currentAgents) {
        userAgents.push({ agent, ...currentRules });
      }
    }
    currentAgents = [];
    currentRules = { disallow: [], allow: [], crawlDelay: null };
    inBlock = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) {
      if (inBlock) commitBlock();
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const directive = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    switch (directive) {
      case 'user-agent':
        if (inBlock && currentAgents.length > 0) {
          // New user-agent block starts — if we already have rules, commit
          if (currentRules.disallow.length > 0 || currentRules.allow.length > 0 || currentRules.crawlDelay !== null) {
            commitBlock();
          }
        }
        currentAgents.push(value);
        inBlock = true;
        break;
      case 'disallow':
        if (value) currentRules.disallow.push(value);
        break;
      case 'allow':
        if (value) currentRules.allow.push(value);
        break;
      case 'crawl-delay':
        currentRules.crawlDelay = parseFloat(value) || null;
        break;
      case 'sitemap':
        if (value) sitemaps.push(value);
        break;
      case 'host':
        // Mirror of canonical host — note but don't store in agents
        break;
    }
  }

  if (currentAgents.length > 0) commitBlock();

  return { userAgents, sitemaps };
}

/**
 * Build highlights and counts from parsed data.
 */
function _analyzeRules(userAgents, origin) {
  const defaultRules = userAgents.find(ua => ua.agent === '*') || null;
  const totalDisallowed = new Set();
  const agentSpecific = [];

  for (const ua of userAgents) {
    if (ua.agent !== '*') agentSpecific.push(ua.agent);
    for (const path of ua.disallow) totalDisallowed.add(path);
  }

  // Interesting paths: admin, login, api, private, internal, staging, test
  const interestingPatterns = [
    /admin/i, /login/i, /auth/i, /\/api\//i, /private/i, /internal/i,
    /staging/i, /test/i, /debug/i, /config/i, /\.env/i, /backup/i,
    /dashboard/i, /panel/i, /manage/i, /secret/i, /hidden/i,
  ];

  const interestingDisallowed = [...totalDisallowed].filter(path =>
    interestingPatterns.some(re => re.test(path))
  );

  const hasFullBlock = userAgents.some(ua =>
    ua.agent === '*' && ua.disallow.includes('/')
  );

  return {
    defaultRules,
    agentSpecificAgents: agentSpecific,
    disallowCount: totalDisallowed.size,
    uniqueDisallowedPaths: [...totalDisallowed].sort(),
    interestingDisallowed,
    hasFullBlock,
    crawlDelays: userAgents
      .filter(ua => ua.crawlDelay !== null)
      .map(ua => ({ agent: ua.agent, delay: ua.crawlDelay })),
  };
}

/**
 * Fetch and parse robots.txt for the given origin URL.
 * @param {string} originOrUrl - Full URL or just origin (https://example.com)
 * @returns {Promise<object>} Structured robots.txt analysis
 */
async function fetchAndParseRobots(originOrUrl) {
  let origin;
  try {
    const u = new URL(originOrUrl.startsWith('http') ? originOrUrl : `https://${originOrUrl}`);
    origin = `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}`;
  } catch {
    throw new Error(`Invalid URL: ${originOrUrl}`);
  }

  let fetchResult;
  try {
    fetchResult = await _fetch(origin);
  } catch (err) {
    return {
      origin,
      url: `${origin}/robots.txt`,
      status: 'error',
      error: err.message,
      userAgents: [],
      sitemaps: [],
      fetchedAt: new Date().toISOString(),
    };
  }

  if (fetchResult.status === 404 || !fetchResult.text) {
    return {
      origin,
      url: fetchResult.url,
      status: 'not-found',
      userAgents: [],
      sitemaps: [],
      disallowCount: 0,
      fetchedAt: fetchResult.fetchedAt,
    };
  }

  let parsed;
  try {
    parsed = _parseRobotsTxt(fetchResult.text);
  } catch (err) {
    return {
      origin,
      url: fetchResult.url,
      status: 'parse-error',
      error: err.message,
      rawText: fetchResult.text.slice(0, 2000),
      userAgents: [],
      sitemaps: [],
      fetchedAt: fetchResult.fetchedAt,
    };
  }

  const analysis = _analyzeRules(parsed.userAgents, origin);

  return {
    origin,
    url: fetchResult.url,
    status: 'ok',
    httpStatus: fetchResult.status,
    fetchedAt: fetchResult.fetchedAt,
    userAgents: parsed.userAgents,
    sitemaps: parsed.sitemaps,
    ...analysis,
    rawText: fetchResult.text.slice(0, 5000), // first 5KB for reference
  };
}

module.exports = { fetchAndParseRobots };
