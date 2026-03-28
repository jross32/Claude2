/**
 * HAR 1.2 Exporter — converts scrape network data to HAR format.
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

    return {
      startedDateTime: call.timestamp || new Date().toISOString(),
      time: -1,
      request: {
        method: call.method || 'GET',
        url: call.url,
        httpVersion: 'HTTP/1.1',
        headers: reqHeaders,
        queryString: [],
        cookies: [],
        headersSize: -1,
        bodySize: reqBody ? reqBody.text.length : 0,
        ...(reqBody ? { postData: reqBody } : {}),
      },
      response: {
        status: respStatus,
        statusText: respStatus >= 200 && respStatus < 300 ? 'OK' : 'Error',
        httpVersion: 'HTTP/1.1',
        headers: [],
        cookies: [],
        content: {
          size: respBody.length,
          mimeType: 'application/json',
          text: respBody,
        },
        redirectURL: '',
        headersSize: -1,
        bodySize: respBody.length,
      },
      cache: {},
      timings: { send: 0, wait: -1, receive: 0 },
      _type: type,
    };
  };

  (scrapeResult.apiCalls?.graphql || []).forEach((call) => entries.push(buildEntry(call, 'graphql')));
  (scrapeResult.apiCalls?.rest || []).forEach((call) => entries.push(buildEntry(call, 'rest')));

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
