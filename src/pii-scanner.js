/**
 * pii-scanner.js
 * Scans scraped response bodies and page text for PII, credentials, and data leakage.
 * Patterns sourced from references/spammer reconnaissance toolkit.
 */

const PII_PATTERNS = [
  // ── Credentials & secrets ──────────────────────────────────────────────────
  { type: 'API Key',          risk: 'CRITICAL', re: /(api[_\-]?key|apikey)["\s:=]+["']?([a-zA-Z0-9_\-]{32,})["']?/gi },
  { type: 'Bearer Token',     risk: 'CRITICAL', re: /bearer\s+([a-zA-Z0-9\-_=]+\.[a-zA-Z0-9\-_=]+\.?[a-zA-Z0-9\-_.+/=]*)/gi },
  { type: 'AWS Access Key',   risk: 'CRITICAL', re: /AKIA[0-9A-Z]{16}/g },
  { type: 'GitHub Token',     risk: 'CRITICAL', re: /ghp_[a-zA-Z0-9]{36}/g },
  { type: 'Stripe Key',       risk: 'CRITICAL', re: /sk_live_[0-9a-zA-Z]{24}/g },
  { type: 'Firebase Key',     risk: 'HIGH',     re: /AIza[0-9A-Za-z\-_]{35}/g },
  { type: 'DB Connection',    risk: 'CRITICAL', re: /(postgres|mysql|mongodb|redis):\/\/[^\s"'<>]{5,}/gi },
  { type: 'Private Key',      risk: 'CRITICAL', re: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/g },
  // ── PII ───────────────────────────────────────────────────────────────────
  { type: 'Email',            risk: 'LOW',      re: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g },
  { type: 'Phone (US)',       risk: 'LOW',      re: /(\+1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/g },
  { type: 'SSN',              risk: 'CRITICAL', re: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g },
  { type: 'Credit Card',      risk: 'CRITICAL', re: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g },
  // ── Internal infrastructure ───────────────────────────────────────────────
  { type: 'Private IP',       risk: 'MEDIUM',   re: /\b(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g },
  { type: 'Internal Hostname',risk: 'MEDIUM',   re: /\b([a-z][a-z0-9\-]{2,}\.(?:internal|local|corp|lan|intranet))\b/gi },
];

const RISK_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/**
 * Scan a block of text for PII/secrets.
 * @param {string} text
 * @param {string} source - label for where the text came from
 * @returns {Array<{type, risk, value, source}>}
 */
function scanText(text, source = 'unknown') {
  if (!text || typeof text !== 'string') return [];
  const findings = [];
  for (const { type, risk, re } of PII_PATTERNS) {
    re.lastIndex = 0;
    let m;
    const seen = new Set();
    while ((m = re.exec(text)) !== null) {
      // Use the full match or first captured group as the value
      const value = (m[2] || m[1] || m[0]).substring(0, 200);
      if (seen.has(value)) continue;
      seen.add(value);
      // Redact partial value for display (keep first 4 + last 4 chars)
      const redacted = value.length > 12
        ? value.slice(0, 4) + '****' + value.slice(-4)
        : '****';
      findings.push({ type, risk, value: redacted, rawLength: value.length, source });
    }
  }
  return findings;
}

/**
 * Scan a full scrape result object for PII across all captured data.
 * @param {object} scrapeResult - result from ScraperSession.run()
 * @returns {{ findings: Array, summary: object }}
 */
function scanScrapeResult(scrapeResult) {
  const allFindings = [];

  // Scan GraphQL responses
  if (Array.isArray(scrapeResult.graphqlCalls)) {
    for (const call of scrapeResult.graphqlCalls) {
      const body = call.response?.body;
      if (body) {
        const text = typeof body === 'string' ? body : JSON.stringify(body);
        allFindings.push(...scanText(text, `GraphQL: ${call.url}`));
      }
    }
  }

  // Scan REST responses
  if (Array.isArray(scrapeResult.restCalls)) {
    for (const call of scrapeResult.restCalls) {
      const body = call.response?.body;
      if (body) {
        const text = typeof body === 'string' ? body : JSON.stringify(body);
        allFindings.push(...scanText(text, `REST: ${call.url}`));
      }
    }
  }

  // Scan page full text
  if (Array.isArray(scrapeResult.pages)) {
    for (const page of scrapeResult.pages) {
      if (page.fullText) allFindings.push(...scanText(page.fullText, `Page: ${page.url}`));
      // Scan inline script content
      if (Array.isArray(page.scripts)) {
        for (const s of page.scripts) {
          if (s.inlineContent) allFindings.push(...scanText(s.inlineContent, `Script on: ${page.url}`));
        }
      }
      // Scan localStorage
      if (page.localStorage) {
        allFindings.push(...scanText(JSON.stringify(page.localStorage), `localStorage: ${page.url}`));
      }
    }
  }

  // Deduplicate by type+value
  const seen = new Map();
  const deduped = [];
  for (const f of allFindings) {
    const key = `${f.type}:${f.value}`;
    if (seen.has(key)) { seen.get(key).count++; continue; }
    const entry = { ...f, count: 1 };
    seen.set(key, entry);
    deduped.push(entry);
  }

  // Sort by risk level
  deduped.sort((a, b) => (RISK_ORDER[a.risk] ?? 4) - (RISK_ORDER[b.risk] ?? 4));

  const summary = {
    total: deduped.length,
    critical: deduped.filter(f => f.risk === 'CRITICAL').length,
    high:     deduped.filter(f => f.risk === 'HIGH').length,
    medium:   deduped.filter(f => f.risk === 'MEDIUM').length,
    low:      deduped.filter(f => f.risk === 'LOW').length,
  };

  return { findings: deduped, summary };
}

module.exports = { scanText, scanScrapeResult };
