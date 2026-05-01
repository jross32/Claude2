'use strict';

/**
 * Company Info Extractor — extract structured company information from About/Home/Contact pages.
 * Combines JSON-LD Organization schema, OG tags, and text pattern matching.
 */

// ── JSON-LD Organization extraction ──────────────────────────────────────

function _extractFromJsonLD(pageData) {
  const jsonLD = pageData.meta?.jsonLD || [];

  for (const ld of jsonLD) {
    const items = Array.isArray(ld['@graph']) ? ld['@graph'] : [ld];
    for (const item of items) {
      const type = item['@type'] || '';
      if (!/Organization|Corporation|LocalBusiness|Company/i.test(type)) continue;

      const address = item.address;
      const addressStr = address ? [
        address.streetAddress,
        address.addressLocality,
        address.addressRegion,
        address.postalCode,
        address.addressCountry,
      ].filter(Boolean).join(', ') : null;

      return {
        name: item.name || null,
        legalName: item.legalName || null,
        description: item.description?.substring(0, 500) || null,
        url: item.url || null,
        logo: typeof item.logo === 'string' ? item.logo : item.logo?.url || null,
        email: item.email || null,
        phone: item.telephone || null,
        address: addressStr,
        foundingDate: item.foundingDate || null,
        numberOfEmployees: item.numberOfEmployees?.value || null,
        sameAs: item.sameAs || [],
        source: 'json-ld',
      };
    }
  }
  return null;
}

// ── Text pattern matchers ─────────────────────────────────────────────────

function _extractFoundingYear(text) {
  const patterns = [
    /(?:founded|established|started|incorporated|since)\s+(?:in\s+)?(\d{4})/i,
    /est\.?\s+(\d{4})/i,
    /©\s*(\d{4})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const year = parseInt(m[1], 10);
      if (year >= 1800 && year <= new Date().getFullYear()) return String(year);
    }
  }
  return null;
}

function _extractEmployeeCount(text) {
  const patterns = [
    /(\d[\d,]+)\+?\s+(?:employees|team members|people|staff|professionals)/i,
    /team\s+of\s+(?:over\s+)?(\d[\d,]+)/i,
    /(?:employ|hire)\s+(?:over\s+)?(\d[\d,]+)/i,
    /(\d+)[-–](\d+)\s+employees/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const clean = (s) => parseInt(s.replace(/,/g, ''), 10);
      if (m[2]) return `${clean(m[1])}-${clean(m[2])}`;
      const n = clean(m[1]);
      if (n > 0 && n < 10000000) return n < 1000 ? String(n) : `${n}+`;
    }
  }
  return null;
}

function _extractRegistrationNumber(text) {
  const patterns = [
    { pattern: /company\s+(?:no\.|number|registration)[:\s#]+(\d{7,8})/i, country: 'GB' },
    { pattern: /companies\s+house[:\s#]+(\d{7,8})/i, country: 'GB' },
    { pattern: /ein[:\s#]+(\d{2}-\d{7})/i, country: 'US' },
    { pattern: /\b(\d{2}-\d{7})\b/, country: 'US-EIN' },
    { pattern: /vat\s+(?:number|no\.?|reg\.?)[:\s#]+([A-Z]{2}\d{5,15})/i, country: 'EU' },
    { pattern: /crn[:\s#]+(\w{6,10})/i, country: 'GB' },
  ];
  for (const { pattern, country } of patterns) {
    const m = text.match(pattern);
    if (m) return { number: m[1], country };
  }
  return null;
}

function _extractIndustry(text) {
  const INDUSTRIES = [
    { pattern: /\bsoftware|saas|cloud|platform|developer tools/i, industry: 'Software / SaaS' },
    { pattern: /\bfintech|financial technology|payments|lending|banking/i, industry: 'Fintech' },
    { pattern: /\bhealthcare|health tech|medical|biotech|pharma/i, industry: 'Healthcare / Health Tech' },
    { pattern: /\be-?commerce|retail|marketplace|shopping/i, industry: 'E-commerce / Retail' },
    { pattern: /\beducation|edtech|learning|training/i, industry: 'Education / EdTech' },
    { pattern: /\breal estate|proptech|property|housing/i, industry: 'Real Estate' },
    { pattern: /\bmarketing|advertising|media|pr\b|public relations/i, industry: 'Marketing / Media' },
    { pattern: /\bconsulting|advisory|professional services/i, industry: 'Consulting / Professional Services' },
    { pattern: /\bmanufacturing|industrial|production|factory/i, industry: 'Manufacturing' },
    { pattern: /\bfood|restaurant|beverage|hospitality/i, industry: 'Food & Beverage / Hospitality' },
    { pattern: /\btransport|logistics|supply chain|shipping/i, industry: 'Logistics / Supply Chain' },
    { pattern: /\bsecurity|cybersecurity|infosec/i, industry: 'Cybersecurity' },
    { pattern: /\bai\b|artificial intelligence|machine learning|ml\b/i, industry: 'AI / Machine Learning' },
    { pattern: /\bcrypto|blockchain|web3|defi/i, industry: 'Crypto / Web3' },
    { pattern: /\binsurance|insurtech/i, industry: 'Insurance / InsurTech' },
    { pattern: /\btelecommunications|telecom|wireless|5g/i, industry: 'Telecommunications' },
    { pattern: /\baerospace|aviation|defense|defence/i, industry: 'Aerospace / Defense' },
    { pattern: /\benergy|renewable|solar|wind|oil|gas/i, industry: 'Energy' },
    { pattern: /\bgovernment|public sector|municipality/i, industry: 'Government / Public Sector' },
    { pattern: /\bnon-?profit|charity|ngo|foundation/i, industry: 'Non-profit / NGO' },
  ];
  for (const { pattern, industry } of INDUSTRIES) {
    if (pattern.test(text)) return industry;
  }
  return null;
}

function _extractMission(pageData) {
  // Find the about page's first substantive paragraph after the H1/H2
  const h1s = pageData.headings?.h1 || [];
  const h2s = pageData.headings?.h2 || [];
  const allHeadings = [...h1s, ...h2s];

  const blocks = pageData.textBlocks || [];
  for (const block of blocks) {
    if (block.tag === 'p' && block.text.length > 50 && block.text.length < 1000) {
      // Skip if it's just a navigation or legal text
      if (!/copyright|all rights reserved|terms|privacy|cookie/i.test(block.text)) {
        return block.text;
      }
    }
  }
  return null;
}

function _extractSocialProfiles(pageData) {
  const socialPatterns = {
    linkedin: /linkedin\.com\/(company|in)\//i,
    twitter: /(?:twitter|x)\.com\//i,
    facebook: /facebook\.com\//i,
    instagram: /instagram\.com\//i,
    youtube: /youtube\.com\/(channel|c|@)/i,
    github: /github\.com\//i,
    crunchbase: /crunchbase\.com\/organization/i,
    glassdoor: /glassdoor\.com\/company\//i,
  };

  const profiles = {};
  const links = pageData.links || [];

  for (const link of links) {
    if (!link.href || link.isInternal) continue;
    for (const [network, pattern] of Object.entries(socialPatterns)) {
      if (pattern.test(link.href) && !profiles[network]) {
        profiles[network] = link.href;
      }
    }
  }

  return profiles;
}

// ── Main extractor ────────────────────────────────────────────────────────

/**
 * Extract structured company information from a scrape page result.
 * @param {object} pageData - Single page from a scrape result
 * @returns {object} { company }
 */
function extractCompanyInfo(pageData) {
  if (!pageData) return { company: null };

  const text = pageData.fullText || '';
  const url = pageData.url || '';

  // Get name from multiple sources
  const ogSiteName = pageData.meta?.ogTags?.['og:site_name'] || null;
  const titleText = pageData.meta?.title?.split(/[-|·—]/)[0]?.trim() || null;

  // Copyright pattern — reliable company name source
  const copyrightMatch = text.match(/©\s*(?:\d{4})?\s*([A-Z][A-Za-z\s&.,]+?)(?:\.|,|Inc\.|LLC|Ltd|Corp|All rights|\n)/);
  const copyrightName = copyrightMatch ? copyrightMatch[1].trim().replace(/\s+/g, ' ') : null;

  const ldData = _extractFromJsonLD(pageData);

  const foundingDate = _extractFoundingYear(text);
  const employeeRange = _extractEmployeeCount(text);
  const registration = _extractRegistrationNumber(text);
  const industry = _extractIndustry(text);
  const mission = _extractMission(pageData);
  const socialProfiles = _extractSocialProfiles(pageData);

  // Entities from entity extractor (already run by extractor.js)
  const entities = pageData.entities || {};

  const company = {
    name: ldData?.name || ogSiteName || copyrightName || titleText,
    legalName: ldData?.legalName || null,
    description: ldData?.description || mission,
    website: ldData?.url || url,
    logo: ldData?.logo || null,
    email: ldData?.email || entities.emails?.[0] || null,
    phone: ldData?.phone || entities.phones?.[0] || null,
    address: ldData?.address || entities.addresses?.[0] || null,
    foundingDate,
    employeeRange,
    registration,
    industry,
    mission,
    socialProfiles,
    techStack: pageData.tech || {},
    source: ldData ? 'json-ld+dom' : 'dom-heuristic',
  };

  return { company };
}

module.exports = { extractCompanyInfo };
