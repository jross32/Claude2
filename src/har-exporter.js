'use strict';

/**
 * HAR 1.2 Exporter — converts scrape network data to HAR format.
 * Uses real request duration when available (captured by scraper.js).
 */
function exportHAR(scrapeResult) {
  const entries = [];

  const buildEntry = (call, type) => {
    const reqHeaders = Object.entries(call.headers || {}).map(([name, value]) => ({ name, value: String(value) }));
    const reqBody = call.body
      ? { mimeType: 'application/json', text: typeof call.body === 'string' ? call.body : JSON.stringify(call.body) }
      : undefined;

    const respStatus = call.response?.status || 0;
    const respBody = call.response?.body
      ? (typeof call.response.body === 'string' ? call.response.body : JSON.stringify(call.response.body))
      : '';

    const respHeaders = Object.entries(call.response?.headers || {}).map(([name, value]) => ({ name, value: String(value) }));

    // Use real duration if captured, otherwise -1 (HAR spec: -1 = not applicable)
    const totalMs = (typeof call.duration === 'number' && call.duration >= 0) ? call.duration : -1;
    const waitMs  = totalMs >= 0 ? Math.max(0, totalMs - 1) : -1;  // approximate: nearly all time is wait

    return {
      startedDateTime: call.timestamp || new Date().toISOString(),
      time: totalMs,
      request: {
        method: call.method || 'GET',
        url: call.url,
        httpVersion: 'HTTP/1.1',
        headers: reqHeaders,
        queryString: (() => {
          try {
            return [...new URL(call.url).searchParams.entries()].map(([name, value]) => ({ name, value }));
          } catch { return []; }
        })(),
        cookies: [],
        headersSize: -1,
        bodySize: reqBody ? reqBody.text.length : 0,
        ...(reqBody ? { postData: reqBody } : {}),
      },
      response: {
        status: respStatus,
        statusText: String(respStatus >= 200 && respStatus < 300 ? 'OK' : respStatus >= 300 && respStatus < 400 ? 'Redirect' : 'Error'),
        httpVersion: 'HTTP/1.1',
        headers: respHeaders,
        cookies: [],
        content: {
          size: respBody.length,
          mimeType: call.response?.headers?.['content-type'] || 'application/json',
          text: respBody,
        },
        redirectURL: '',
        headersSize: -1,
        bodySize: respBody.length,
      },
      cache: {},
      timings: { send: 0, wait: waitMs, receive: totalMs >= 0 ? 1 : -1 },
      _type: type,
    };
  };

  (scrapeResult.apiCalls?.graphql || []).forEach((call) => entries.push(buildEntry(call, 'graphql')));
  (scrapeResult.apiCalls?.rest || []).forEach((call) => entries.push(buildEntry(call, 'rest')));

  // Include all other captured network requests (JS, CSS, images, fonts, etc.)
  // that aren't already represented as graphql/rest entries.
  const _seenUrls = new Set([
    ...(scrapeResult.apiCalls?.graphql || []).map(c => c.url),
    ...(scrapeResult.apiCalls?.rest || []).map(c => c.url),
  ]);
  (scrapeResult.allRequests || []).forEach((call) => {
    if (!call.url || _seenUrls.has(call.url)) return;
    _seenUrls.add(call.url);
    entries.push(buildEntry(call, 'request'));
  });
  (scrapeResult.assets || []).forEach((asset) => {
    if (!asset.url || _seenUrls.has(asset.url)) return;
    _seenUrls.add(asset.url);
    entries.push(buildEntry({
      url: asset.url,
      method: 'GET',
      timestamp: asset.timestamp || null,
      headers: {},
      response: { status: 200, headers: { 'content-type': asset.type || 'application/octet-stream' }, body: null },
    }, 'asset'));
  });

  return {
    log: {
      version: '1.2',
      creator: { name: 'WebScraperPro', version: '1.0.0' },
      browser: { name: 'Chromium', version: 'playwright' },
      pages: [],
      entries,
    },
  };
}

module.exports = { exportHAR };
