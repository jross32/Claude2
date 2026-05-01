'use strict';

/**
 * ip-lookup.js — Resolve a hostname or URL to IP info via ip-api.com (free tier).
 * No API key required. Returns geolocation, ISP, ASN, and hosting provider.
 */

const http = require('http');

const FIELDS = 'status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,hosting,query';

function extractHostname(input) {
  if (!input) return input;
  try {
    const url = new URL(input.includes('://') ? input : `https://${input}`);
    return url.hostname;
  } catch {
    return input;
  }
}

function lookupIpInfo(input, timeoutMs = 8000) {
  const host = extractHostname(input);
  return new Promise((resolve, reject) => {
    const url = `http://ip-api.com/json/${encodeURIComponent(host)}?fields=${FIELDS}`;

    const req = http.get(url, { timeout: timeoutMs, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`ip-api.com returned HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (data.status === 'fail') return reject(new Error(`ip-api.com: ${data.message || 'lookup failed'} for "${host}"`));
          resolve({
            hostname: host,
            ip: data.query || null,
            country: data.country || null,
            countryCode: data.countryCode || null,
            region: data.regionName || null,
            regionCode: data.region || null,
            city: data.city || null,
            zip: data.zip || null,
            lat: data.lat ?? null,
            lon: data.lon ?? null,
            timezone: data.timezone || null,
            isp: data.isp || null,
            org: data.org || null,
            asn: data.as || null,
            asnName: data.asname || null,
            isHosting: data.hosting ?? null,
          });
        } catch (e) {
          reject(new Error(`ip-api.com parse error: ${e.message}`));
        }
      });
      res.on('error', reject);
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('ip-api.com timed out')); });
    req.on('error', reject);
  });
}

module.exports = { lookupIpInfo };
