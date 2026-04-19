'use strict';

/**
 * Extract entities (emails, phones, URLs, social handles, addresses) from text.
 * Supports US and international phone formats with E.164 normalization.
 */

const US_PHONE_RE   = /(\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/g;
const INTL_PHONE_RE = /\+(?!1\b)[1-9]\d{0,2}[\s.-]?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{1,9}/g;

function normalizePhone(raw) {
  // Strip everything except leading + and digits
  const digits = raw.replace(/[^\d+]/g, '');
  // Already E.164
  if (/^\+\d{7,15}$/.test(digits)) return digits;
  // US 10-digit → +1...
  if (/^\d{10}$/.test(digits)) return `+1${digits}`;
  if (/^1\d{10}$/.test(digits)) return `+${digits}`;
  return raw.trim();
}

function extractEntities(text) {
  if (!text || typeof text !== 'string') {
    return {
      emails: [], phones: [], urls: [],
      socials: { twitter: [], linkedin: [], github: [], instagram: [], facebook: [], tiktok: [], youtube: [] },
      addresses: [],
    };
  }

  const emails = [...new Set(text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])];

  // Collect US and international phone matches, normalize to E.164 where possible
  const rawPhones = [
    ...(text.match(US_PHONE_RE) || []),
    ...(text.match(INTL_PHONE_RE) || []),
  ];
  const phones = [...new Set(rawPhones.map(normalizePhone))].filter(p => p.replace(/\D/g, '').length >= 7);

  const urls = [...new Set(text.match(/https?:\/\/[^\s"'<>)]+/g) || [])];

  const allTwitter  = text.match(/@[A-Za-z0-9_]{1,15}/g) || [];
  const linkedinUrls   = urls.filter(u => u.includes('linkedin.com'));
  const githubUrls     = urls.filter(u => u.includes('github.com'));
  const instagramUrls  = urls.filter(u => u.includes('instagram.com'));
  const facebookUrls   = urls.filter(u => u.includes('facebook.com') || u.includes('fb.com'));
  const tiktokUrls     = urls.filter(u => u.includes('tiktok.com'));
  const youtubeUrls    = urls.filter(u => u.includes('youtube.com') || u.includes('youtu.be'));

  const socials = {
    twitter:   [...new Set(allTwitter)],
    linkedin:  [...new Set(linkedinUrls)],
    github:    [...new Set(githubUrls)],
    instagram: [...new Set(instagramUrls)],
    facebook:  [...new Set(facebookUrls)],
    tiktok:    [...new Set(tiktokUrls)],
    youtube:   [...new Set(youtubeUrls)],
  };

  const addressPattern = /\d{1,5}\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3}\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Ct|Court|Pl|Place|Way|Pkwy|Parkway)\b[^,\n]*/g;
  const addresses = [...new Set(text.match(addressPattern) || [])].slice(0, 20);

  return { emails, phones, urls, socials, addresses };
}

module.exports = { extractEntities };
