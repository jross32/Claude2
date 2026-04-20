'use strict';

/**
 * Extract entities (emails, phones, URLs, social handles, addresses, coordinates,
 * company names, crypto addresses) from text.
 * Supports US and international phone formats with E.164 normalization.
 */

const US_PHONE_RE   = /(?<![A-Za-z0-9])(\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})(?![A-Za-z0-9])/g;
const INTL_PHONE_RE = /(?<![A-Za-z0-9])\+(?!1\b)[1-9]\d{0,2}[\s.-]?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{1,9}(?![A-Za-z0-9])/g;

// US full address with optional city, state, zip
const ADDRESS_RE = /\d{1,5}\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3}\s+(?:St(?:reet)?|Ave(?:nue)?|Blvd|Boulevard|Rd|Road|Dr(?:ive)?|Ln|Lane|Ct|Court|Pl(?:ace)?|Way|Pkwy|Parkway|Hwy|Highway|Trl|Trail|Cir|Circle|Ter(?:race)?|Fwy|Freeway)\b(?:[^\n]{0,50}(?:[A-Z]{2})\s+\d{5}(?:-\d{4})?)?/g;

// GPS / decimal-degrees coordinates  lat, lon  or  (lat, lon)
const COORDS_RE = /\(?(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})\)?/g;

// Bitcoin / Ethereum / USDT addresses
const CRYPTO_BTC_RE     = /\b(1|3)[A-HJ-NP-Za-km-z1-9]{25,34}\b/g;
const CRYPTO_ETH_RE     = /\b0x[0-9a-fA-F]{40}\b/g;
const CRYPTO_BECH32_RE  = /\bbc1[ac-hj-np-zAC-HJ-NP-Z02-9]{6,87}\b/g;

// IPv4 addresses (useful for API endpoint extraction)
const IPV4_RE = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;

function normalizePhone(raw) {
  const digits = raw.replace(/[^\d+]/g, '');
  if (/^\+\d{7,15}$/.test(digits)) return digits;
  if (/^\d{10}$/.test(digits)) return `+1${digits}`;
  if (/^1\d{10}$/.test(digits)) return `+${digits}`;
  return raw.trim();
}

function extractEntities(text) {
  if (!text || typeof text !== 'string') {
    return {
      emails: [], phones: [], urls: [], socials: {},
      addresses: [], coordinates: [], crypto: {}, ipAddresses: [],
    };
  }

  // ── Emails ──────────────────────────────────────────────────────────────────
  const emails = [...new Set(
    (text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [])
      .filter(e => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.gif'))
  )];

  // ── Phones ───────────────────────────────────────────────────────────────────
  const rawPhones = [
    ...(text.match(US_PHONE_RE) || []),
    ...(text.match(INTL_PHONE_RE) || []),
  ];
  const phones = [...new Set(rawPhones.map(normalizePhone))].filter(p => p.replace(/\D/g, '').length >= 7);

  // ── URLs ─────────────────────────────────────────────────────────────────────
  const urls = [...new Set(text.match(/https?:\/\/[^\s"'<>)\]]+/g) || [])];

  // ── Social handles / profiles ────────────────────────────────────────────────
  const allAtHandles   = (text.match(/@[A-Za-z0-9_.]{2,30}/g) || []).filter(h => !h.includes('.'));
  const linkedinUrls   = urls.filter(u => /linkedin\.com\/(in|company|school)\//i.test(u));
  const githubUrls     = urls.filter(u => /github\.com\/[^/]+\/?$/i.test(u));
  const instagramUrls  = urls.filter(u => /instagram\.com\//i.test(u));
  const facebookUrls   = urls.filter(u => /facebook\.com\/|fb\.com\//i.test(u));
  const tiktokUrls     = urls.filter(u => /tiktok\.com\/@/i.test(u));
  const youtubeUrls    = urls.filter(u => /youtube\.com\/(c\/|@|channel\/|user\/)|youtu\.be\//i.test(u));
  const xUrls          = urls.filter(u => /x\.com\/[^/]+\/?$/i.test(u));

  const socials = {
    twitter:   [...new Set([...allAtHandles, ...xUrls])],
    linkedin:  [...new Set(linkedinUrls)],
    github:    [...new Set(githubUrls)],
    instagram: [...new Set(instagramUrls)],
    facebook:  [...new Set(facebookUrls)],
    tiktok:    [...new Set(tiktokUrls)],
    youtube:   [...new Set(youtubeUrls)],
  };

  // ── Physical addresses ───────────────────────────────────────────────────────
  const addresses = [...new Set(text.match(ADDRESS_RE) || [])].slice(0, 20);

  // ── GPS coordinates ──────────────────────────────────────────────────────────
  const coordinates = [];
  let coordMatch;
  const coordRe = new RegExp(COORDS_RE.source, 'g');
  while ((coordMatch = coordRe.exec(text)) !== null) {
    const lat = parseFloat(coordMatch[1]), lon = parseFloat(coordMatch[2]);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      coordinates.push({ lat, lon, raw: coordMatch[0] });
    }
  }

  // ── Crypto addresses ─────────────────────────────────────────────────────────
  const crypto = {
    bitcoin:  [...new Set([...(text.match(CRYPTO_BTC_RE) || []), ...(text.match(CRYPTO_BECH32_RE) || [])])],
    ethereum: [...new Set(text.match(CRYPTO_ETH_RE) || [])],
  };

  // ── IPv4 addresses ───────────────────────────────────────────────────────────
  const ipAddresses = [...new Set(
    (text.match(IPV4_RE) || []).filter(ip => !ip.startsWith('0.'))
  )];

  return { emails, phones, urls, socials, addresses, coordinates, crypto, ipAddresses };
}

module.exports = { extractEntities };
