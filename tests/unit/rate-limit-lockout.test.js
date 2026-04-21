// tests/unit/rate-limit-lockout.test.js
// Automated tests for rate limiting and lockout logic in the server

describe('Rate Limiting & Lockout', () => {
const request = require('supertest');
const server = require('../../src/server');
const assert = require('assert');

async function main() {
  // Returns 429 after exceeding scrape endpoint rate limit
  let res;
  for (let i = 0; i < 31; i++) {
    res = await request(server)
      .post('/api/scrape')
      .send({ url: 'https://example.com' });
  }
  assert.strictEqual(res.status, 429, 'Should return 429 after exceeding scrape rate limit');
  assert.match(res.body.error, /Rate limit exceeded/);

  // Returns 429 after exceeding generate endpoint rate limit
  for (let i = 0; i < 61; i++) {
    res = await request(server)
      .post('/api/generate')
      .send({ type: 'react', url: 'https://example.com' });
  }
  assert.strictEqual(res.status, 429, 'Should return 429 after exceeding generate rate limit');
  assert.match(res.body.error, /Rate limit exceeded/);
  console.log('rate-limit-lockout: all tests passed');
}

if (require.main === module) main();
