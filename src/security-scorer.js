'use strict';

/**
 * Security Header Scorer — grade HTTP security headers 0–100, A–F.
 * Returns per-header analysis and actionable recommendations.
 */

// Minimum HSTS max-age: 126 days in seconds
const HSTS_MIN_MAX_AGE = 126 * 24 * 60 * 60;

// CSP directives that are dangerous
const CSP_DANGEROUS = ['unsafe-inline', 'unsafe-eval', 'unsafe-hashes', 'data:', '*'];

const GRADES = [
  { min: 90, grade: 'A+' },
  { min: 80, grade: 'A' },
  { min: 70, grade: 'B' },
  { min: 60, grade: 'C' },
  { min: 50, grade: 'D' },
  { min: 0,  grade: 'F' },
];

function _grade(score) {
  for (const { min, grade } of GRADES) {
    if (score >= min) return grade;
  }
  return 'F';
}

// ── Individual header analyzers ────────────────────────────────────────────

function _analyzeCSP(value) {
  if (!value) return { status: 'missing', points: 0, notes: ['Content-Security-Policy header is absent — XSS protection is entirely reliant on browser defaults'] };

  const notes = [];
  let points = 20;

  const found = CSP_DANGEROUS.filter(d => value.includes(d));
  for (const d of found) {
    if (d === 'unsafe-inline') { notes.push("'unsafe-inline' defeats XSS protection (-8pts)"); points -= 8; }
    else if (d === 'unsafe-eval') { notes.push("'unsafe-eval' allows code injection via eval() (-6pts)"); points -= 6; }
    else if (d === '*') { notes.push("Wildcard (*) source allows content from any domain (-5pts)"); points -= 5; }
    else if (d === 'data:') { notes.push("'data:' URIs can be a vector for data exfiltration (-3pts)"); points -= 3; }
    else { notes.push(`Dangerous directive: ${d} (-2pts)`); points -= 2; }
  }

  if (!value.includes('default-src')) notes.push("No 'default-src' fallback — policy has gaps");
  if (!value.includes('frame-ancestors') && !value.includes('frame-src')) notes.push("No 'frame-ancestors' — consider also setting X-Frame-Options");
  if (value.includes('upgrade-insecure-requests')) notes.push("'upgrade-insecure-requests' is a nice bonus");

  if (notes.length === 0) notes.push('CSP appears well configured');

  return { status: points >= 15 ? 'good' : 'warn', points: Math.max(0, points), notes };
}

function _analyzeHSTS(value) {
  if (!value) return { status: 'missing', points: 0, notes: ['Strict-Transport-Security absent — site is vulnerable to SSL stripping attacks'] };

  const notes = [];
  let points = 20;

  const maxAgeMatch = value.match(/max-age\s*=\s*(\d+)/i);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;

  if (!maxAgeMatch) {
    notes.push('No max-age directive found (-10pts)');
    points -= 10;
  } else if (maxAge < HSTS_MIN_MAX_AGE) {
    notes.push(`max-age=${maxAge}s is below recommended ${HSTS_MIN_MAX_AGE}s (126 days) (-5pts)`);
    points -= 5;
  } else {
    notes.push(`max-age=${maxAge}s (${Math.round(maxAge / 86400)} days) — good`);
  }

  if (value.includes('includeSubDomains')) {
    notes.push('includeSubDomains extends protection to all subdomains');
  } else {
    notes.push('Missing includeSubDomains — subdomains are unprotected (-2pts)');
    points -= 2;
  }

  if (value.includes('preload')) {
    notes.push('preload directive — eligible for HSTS preload list');
  }

  return { status: points >= 15 ? 'good' : 'warn', points: Math.max(0, points), notes };
}

function _analyzeXFrame(value) {
  if (!value) return { status: 'missing', points: 0, notes: ['X-Frame-Options absent — site may be vulnerable to clickjacking'] };

  const upper = value.trim().toUpperCase();
  const notes = [];
  let points;

  if (upper === 'DENY') {
    points = 10;
    notes.push('DENY — strongest protection, no framing allowed');
  } else if (upper === 'SAMEORIGIN') {
    points = 8;
    notes.push('SAMEORIGIN — framing allowed only from same origin');
  } else if (upper.startsWith('ALLOW-FROM')) {
    points = 5;
    notes.push('ALLOW-FROM is deprecated — use CSP frame-ancestors instead (-3pts)');
  } else {
    points = 3;
    notes.push(`Unrecognized value: "${value}"`);
  }

  return { status: points >= 8 ? 'good' : 'warn', points, notes };
}

function _analyzeXContentType(value) {
  if (!value) return { status: 'missing', points: 0, notes: ['X-Content-Type-Options absent — MIME sniffing attacks are possible'] };
  if (value.trim().toLowerCase() === 'nosniff') {
    return { status: 'good', points: 10, notes: ['nosniff — browser will not MIME-sniff responses'] };
  }
  return { status: 'warn', points: 5, notes: [`Unexpected value: "${value}" — should be "nosniff"`] };
}

function _analyzeReferrerPolicy(value) {
  if (!value) return { status: 'missing', points: 0, notes: ['Referrer-Policy absent — full URLs may be leaked to third parties in the Referer header'] };

  const SAFE = ['no-referrer', 'strict-origin', 'strict-origin-when-cross-origin', 'same-origin', 'no-referrer-when-downgrade'];
  const UNSAFE = ['unsafe-url', 'origin-when-cross-origin'];
  const v = value.trim().toLowerCase();

  if (UNSAFE.includes(v)) return { status: 'warn', points: 3, notes: [`"${v}" sends full URL to third parties — consider stricter policy`] };
  if (SAFE.includes(v)) return { status: 'good', points: 10, notes: [`"${v}" is a safe referrer policy`] };
  return { status: 'warn', points: 5, notes: [`"${v}" — verify this is intentional`] };
}

function _analyzePermissionsPolicy(value) {
  if (!value) return { status: 'missing', points: 0, notes: ['Permissions-Policy absent — browser features (camera, mic, geolocation) may be accessible by third-party scripts'] };
  return { status: 'good', points: 10, notes: ['Permissions-Policy present — browser APIs are gated'] };
}

function _analyzeServerHeader(value) {
  if (!value) return { status: 'good', points: 0, notes: ['Server header absent — no server software disclosed (good)'] };
  if (/\d/.test(value)) {
    return { status: 'warn', points: 0, notes: [`Server header discloses version info: "${value}" — remove or genericize`], disclosure: value };
  }
  return { status: 'warn', points: 0, notes: [`Server header discloses software: "${value}" — consider removing`], disclosure: value };
}

function _analyzeXPoweredBy(value) {
  if (!value) return { status: 'good', points: 0, notes: ['X-Powered-By absent — no framework/runtime disclosed (good)'] };
  return { status: 'warn', points: 0, notes: [`X-Powered-By discloses: "${value}" — remove this header`], disclosure: value };
}

function _analyzeCORS(value) {
  if (!value) return { status: 'missing', points: 0, notes: ['Access-Control-Allow-Origin not set'] };
  if (value.trim() === '*') {
    return { status: 'warn', points: 0, notes: ['Access-Control-Allow-Origin: * — any origin can make cross-origin requests. Acceptable for public APIs, dangerous for authenticated endpoints'] };
  }
  return { status: 'good', points: 0, notes: [`Access-Control-Allow-Origin: "${value}" — restricted to specific origin`] };
}

// ── Main scorer ────────────────────────────────────────────────────────────

/**
 * Score a set of security headers.
 * @param {object} headers - Key/value pairs of HTTP response headers (lowercased keys preferred)
 * @returns {object} Full analysis with score, grade, per-header breakdown, and recommendations
 */
function scoreSecurityHeaders(headers) {
  // Normalize header names to lowercase
  const h = {};
  for (const [k, v] of Object.entries(headers || {})) {
    h[k.toLowerCase()] = typeof v === 'string' ? v : (Array.isArray(v) ? v[0] : String(v));
  }

  const analysis = {
    csp:              _analyzeCSP(h['content-security-policy']),
    hsts:             _analyzeHSTS(h['strict-transport-security']),
    xFrameOptions:    _analyzeXFrame(h['x-frame-options']),
    xContentType:     _analyzeXContentType(h['x-content-type-options']),
    referrerPolicy:   _analyzeReferrerPolicy(h['referrer-policy']),
    permissionsPolicy: _analyzePermissionsPolicy(h['permissions-policy'] || h['feature-policy']),
    server:           _analyzeServerHeader(h['server']),
    xPoweredBy:       _analyzeXPoweredBy(h['x-powered-by']),
    cors:             _analyzeCORS(h['access-control-allow-origin']),
  };

  // Score is sum of points-bearing headers
  const score = Math.min(100,
    analysis.csp.points +
    analysis.hsts.points +
    analysis.xFrameOptions.points +
    analysis.xContentType.points +
    analysis.referrerPolicy.points +
    analysis.permissionsPolicy.points
  );

  const grade = _grade(score);

  // Build recommendations list
  const recommendations = [];
  for (const [key, result] of Object.entries(analysis)) {
    if (result.status === 'missing') {
      recommendations.push({ priority: 'high', header: key, action: result.notes[0] });
    } else if (result.status === 'warn') {
      recommendations.push({ priority: 'medium', header: key, action: result.notes[0] });
    }
    if (result.disclosure) {
      recommendations.push({ priority: 'low', header: key, action: `Remove information disclosure: ${result.disclosure}` });
    }
  }

  recommendations.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });

  return {
    score,
    grade,
    summary: `${score}/100 (${grade}) — ${recommendations.filter(r => r.priority === 'high').length} critical issues, ${recommendations.filter(r => r.priority === 'medium').length} warnings`,
    headers: {
      'content-security-policy': { value: h['content-security-policy'] || null, ...analysis.csp },
      'strict-transport-security': { value: h['strict-transport-security'] || null, ...analysis.hsts },
      'x-frame-options': { value: h['x-frame-options'] || null, ...analysis.xFrameOptions },
      'x-content-type-options': { value: h['x-content-type-options'] || null, ...analysis.xContentType },
      'referrer-policy': { value: h['referrer-policy'] || null, ...analysis.referrerPolicy },
      'permissions-policy': { value: h['permissions-policy'] || h['feature-policy'] || null, ...analysis.permissionsPolicy },
      'server': { value: h['server'] || null, ...analysis.server },
      'x-powered-by': { value: h['x-powered-by'] || null, ...analysis.xPoweredBy },
      'access-control-allow-origin': { value: h['access-control-allow-origin'] || null, ...analysis.cors },
    },
    recommendations,
    scoredAt: new Date().toISOString(),
  };
}

module.exports = { scoreSecurityHeaders };
