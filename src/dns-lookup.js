'use strict';

/**
 * DNS Records Lookup — parallel A/AAAA/MX/TXT/NS/CNAME/SOA lookup with
 * tech stack inference from MX and TXT records.
 */

const dns = require('dns').promises;

// ── MX record → email/security provider inference ──────────────────────
const MX_PROVIDERS = [
  { pattern: /google\.com$|googlemail\.com$/i, provider: 'Google Workspace', category: 'email' },
  { pattern: /outlook\.com$|protection\.outlook\.com$/i, provider: 'Microsoft 365', category: 'email' },
  { pattern: /mimecast\.com$/i, provider: 'Mimecast', category: 'email-security' },
  { pattern: /proofpoint\.com$/i, provider: 'Proofpoint', category: 'email-security' },
  { pattern: /messagelabs\.com$/i, provider: 'Symantec/Broadcom Email Security', category: 'email-security' },
  { pattern: /pphosted\.com$/i, provider: 'Proofpoint Hosted', category: 'email-security' },
  { pattern: /barracuda\.com$/i, provider: 'Barracuda Networks', category: 'email-security' },
  { pattern: /sendgrid\.net$/i, provider: 'SendGrid', category: 'email-delivery' },
  { pattern: /mailgun\.org$/i, provider: 'Mailgun', category: 'email-delivery' },
  { pattern: /amazonses\.com$/i, provider: 'Amazon SES', category: 'email-delivery' },
  { pattern: /zoho\.com$/i, provider: 'Zoho Mail', category: 'email' },
  { pattern: /fastmail\.(com|fm)$/i, provider: 'Fastmail', category: 'email' },
  { pattern: /icloud\.com$/i, provider: 'Apple iCloud', category: 'email' },
  { pattern: /yandex\.ru$/i, provider: 'Yandex Mail', category: 'email' },
];

// ── TXT record → service inference ─────────────────────────────────────
const TXT_INFERENCES = [
  // SPF
  { pattern: /v=spf1/i, extract: (txt) => {
    const includes = [...txt.matchAll(/include:([^\s]+)/g)].map(m => m[1]);
    return { type: 'spf', includes, raw: txt };
  }},
  // DKIM
  { pattern: /v=DKIM1/i, extract: (txt) => ({ type: 'dkim', raw: txt }) },
  // DMARC
  { pattern: /v=DMARC1/i, extract: (txt) => {
    const policy = (txt.match(/p=([^;\s]+)/i) || [])[1] || 'unknown';
    const rua = (txt.match(/rua=([^;\s]+)/i) || [])[1] || null;
    return { type: 'dmarc', policy, reportTo: rua, raw: txt };
  }},
  // Site verification tokens
  { pattern: /google-site-verification=/i, extract: (txt) => ({ type: 'verification', service: 'Google Search Console', raw: txt }) },
  { pattern: /MS=/i, extract: (txt) => ({ type: 'verification', service: 'Microsoft 365', raw: txt }) },
  { pattern: /facebook-domain-verification=/i, extract: (txt) => ({ type: 'verification', service: 'Facebook', raw: txt }) },
  { pattern: /atlassian-domain-verification=/i, extract: (txt) => ({ type: 'verification', service: 'Atlassian', raw: txt }) },
  { pattern: /docusign=/i, extract: (txt) => ({ type: 'verification', service: 'DocuSign', raw: txt }) },
  { pattern: /stripe-verification=/i, extract: (txt) => ({ type: 'verification', service: 'Stripe', raw: txt }) },
  { pattern: /apple-domain-verification=/i, extract: (txt) => ({ type: 'verification', service: 'Apple', raw: txt }) },
  { pattern: /zoho-verification=/i, extract: (txt) => ({ type: 'verification', service: 'Zoho', raw: txt }) },
  // Auth / SSO providers
  { pattern: /\_domainkey/i, extract: (txt) => ({ type: 'dkim-key', raw: txt }) },
  // Catch-all for services from SPF includes
];

const SPF_PROVIDER_MAP = {
  'sendgrid.net': 'SendGrid',
  'mailgun.org': 'Mailgun',
  'amazonses.com': 'Amazon SES',
  'sparkpostmail.com': 'SparkPost',
  'mandrillapp.com': 'Mandrill',
  'mailchimp.com': 'Mailchimp',
  'salesforce.com': 'Salesforce',
  'hubspotemail.net': 'HubSpot',
  'zendesk.com': 'Zendesk',
  'intercom-mail.com': 'Intercom',
  'google.com': 'Google Workspace',
  'protection.outlook.com': 'Microsoft 365',
  'zoho.com': 'Zoho',
};

function _resolveAll(hostname) {
  const tasks = [
    dns.resolve4(hostname).catch(() => []),
    dns.resolve6(hostname).catch(() => []),
    dns.resolveMx(hostname).catch(() => []),
    dns.resolveTxt(hostname).catch(() => []),
    dns.resolveNs(hostname).catch(() => []),
    dns.resolveCname(hostname).catch(() => null),
    dns.resolveSoa(hostname).catch(() => null),
  ];
  return Promise.allSettled(tasks);
}

function _inferFromMX(mxRecords) {
  const inferences = [];
  for (const mx of mxRecords) {
    const exchange = (mx.exchange || '').toLowerCase();
    for (const { pattern, provider, category } of MX_PROVIDERS) {
      if (pattern.test(exchange)) {
        inferences.push({ provider, category, mxExchange: mx.exchange, priority: mx.priority });
        break;
      }
    }
  }
  return inferences;
}

function _inferFromTXT(txtArrays) {
  const results = [];
  const flat = txtArrays.map(arr => (Array.isArray(arr) ? arr.join('') : arr));

  for (const txt of flat) {
    for (const { pattern, extract } of TXT_INFERENCES) {
      if (pattern.test(txt)) {
        try { results.push(extract(txt)); } catch { /* ignore */ }
        break;
      }
    }
  }

  // Enrich SPF with provider names
  for (const r of results) {
    if (r.type === 'spf' && r.includes) {
      r.detectedProviders = r.includes.map(inc => {
        for (const [domain, name] of Object.entries(SPF_PROVIDER_MAP)) {
          if (inc.includes(domain)) return name;
        }
        return null;
      }).filter(Boolean);
    }
  }

  return results;
}

async function _reverseLookup(ips) {
  const results = [];
  for (const ip of ips.slice(0, 3)) {
    try {
      const hostnames = await dns.reverse(ip);
      results.push({ ip, hostnames });
    } catch {
      results.push({ ip, hostnames: [] });
    }
  }
  return results;
}

/**
 * Perform a full DNS lookup for the given hostname or URL.
 * @param {string} hostnameOrUrl
 * @returns {Promise<object>}
 */
async function lookupDNS(hostnameOrUrl) {
  let hostname;
  try {
    const u = new URL(hostnameOrUrl.startsWith('http') ? hostnameOrUrl : `https://${hostnameOrUrl}`);
    hostname = u.hostname;
  } catch {
    hostname = hostnameOrUrl.replace(/^https?:\/\//, '').split('/')[0];
  }

  const startTime = Date.now();
  const [a, aaaa, mx, txt, ns, cname, soa] = await _resolveAll(hostname);

  const aRecords = a.status === 'fulfilled' ? a.value : [];
  const aaaaRecords = aaaa.status === 'fulfilled' ? aaaa.value : [];
  const mxRecords = mx.status === 'fulfilled' ? mx.value : [];
  const txtRecords = txt.status === 'fulfilled' ? txt.value : [];
  const nsRecords = ns.status === 'fulfilled' ? ns.value : [];
  const cnameRecord = cname.status === 'fulfilled' ? cname.value : null;
  const soaRecord = soa.status === 'fulfilled' ? soa.value : null;

  const reverseLookups = await _reverseLookup(aRecords);
  const mxInferences = _inferFromMX(mxRecords);
  const txtInferences = _inferFromTXT(txtRecords);

  const dmarc = txtInferences.find(r => r.type === 'dmarc') || null;
  const spf = txtInferences.find(r => r.type === 'spf') || null;
  const hasDKIM = txtInferences.some(r => r.type === 'dkim');
  const verifications = txtInferences.filter(r => r.type === 'verification');

  const emailSecurity = {
    hasSPF: !!spf,
    spfPolicy: spf?.raw || null,
    spfProviders: spf?.detectedProviders || [],
    hasDKIM,
    hasDMARC: !!dmarc,
    dmarcPolicy: dmarc?.policy || null,
    dmarcReportTo: dmarc?.reportTo || null,
    score: (spf ? 33 : 0) + (hasDKIM ? 33 : 0) + (dmarc ? 34 : 0),
  };

  return {
    hostname,
    lookedUpAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    records: {
      A: aRecords,
      AAAA: aaaaRecords,
      MX: mxRecords.sort((a, b) => a.priority - b.priority),
      TXT: txtRecords.map(arr => Array.isArray(arr) ? arr.join('') : arr),
      NS: nsRecords,
      CNAME: cnameRecord,
      SOA: soaRecord,
    },
    reverseLookups,
    emailProvider: mxInferences,
    emailSecurity,
    serviceVerifications: verifications,
    allTxtInferences: txtInferences,
    errors: {
      A: a.status === 'rejected' ? a.reason?.message : null,
      AAAA: aaaa.status === 'rejected' ? aaaa.reason?.message : null,
      MX: mx.status === 'rejected' ? mx.reason?.message : null,
      TXT: txt.status === 'rejected' ? txt.reason?.message : null,
      NS: ns.status === 'rejected' ? ns.reason?.message : null,
    },
  };
}

module.exports = { lookupDNS };
