/**
 * apa-gql.js — Node.js helper for authenticated calls to gql.poolplayers.com
 * Used by server.js APA proxy routes.
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const SESSION_FILE = path.join(__dirname, '..', '.scraper-sessions', 'league.poolplayers.com.json');
const GQL_ENDPOINT = 'gql.poolplayers.com';
const GQL_PATH     = '/graphql';

const BASE_HEADERS = {
  'content-type':                 'application/json',
  'apollographql-client-name':    'MemberServices',
  'apollographql-client-version': '3.18.44-3550',
  'accept':                       '*/*',
  'origin':                       'https://league.poolplayers.com',
};

const REFRESH_MUTATION = `
mutation GenerateAccessTokenMutation($refreshToken: String!) {
  generateAccessToken(refreshToken: $refreshToken) {
    accessToken
    __typename
  }
}`;

// ── Token management ──────────────────────────────────────────────────────────

function loadSession() {
  if (!fs.existsSync(SESSION_FILE)) throw new Error('No APA session file. Scrape league.poolplayers.com first.');
  return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
}

function saveAccessToken(newToken) {
  const session = loadSession();
  for (const origin of session.origins || []) {
    for (const item of origin.localStorage || []) {
      if (item.name === 'accessToken') item.value = newToken;
    }
  }
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
}

function getTokens() {
  const session = loadSession();
  let access = null, refresh = null;
  for (const origin of session.origins || []) {
    for (const item of origin.localStorage || []) {
      if (item.name === 'accessToken')  access  = item.value;
      if (item.name === 'refreshToken') refresh = item.value;
    }
  }
  return { access, refresh };
}

function jwtExp(token) {
  try {
    const payload = Buffer.from(token.split('.')[1], 'base64url').toString();
    return JSON.parse(payload).exp || 0;
  } catch { return 0; }
}

function isExpired(token, bufferSec = 60) {
  return Date.now() / 1000 >= jwtExp(token) - bufferSec;
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

function rawGql(token, operationName, variables, query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ operationName, variables, query });
    const req  = https.request({
      hostname: GQL_ENDPOINT,
      path:     GQL_PATH,
      method:   'POST',
      headers:  { ...BASE_HEADERS, authorization: token, 'content-length': Buffer.byteLength(body) },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Non-JSON response (${res.statusCode}): ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function refreshToken(refreshTok) {
  const result = await rawGql(refreshTok, 'GenerateAccessTokenMutation',
    { refreshToken: refreshTok }, REFRESH_MUTATION);
  const newToken = result?.data?.generateAccessToken?.accessToken;
  if (!newToken) throw new Error('Token refresh failed: ' + JSON.stringify(result));
  saveAccessToken(newToken);
  return newToken;
}

async function getValidToken() {
  let { access, refresh } = getTokens();
  if (!access)  throw new Error('No accessToken in session file.');
  if (!refresh) throw new Error('No refreshToken in session file.');
  if (isExpired(access)) access = await refreshToken(refresh);
  return access;
}

// ── Public API ────────────────────────────────────────────────────────────────

async function gql(operationName, variables, query) {
  const token  = await getValidToken();
  const result = await rawGql(token, operationName, variables, query);
  if (result.errors?.length) throw new Error(result.errors.map(e => e.message).join('; '));
  return result;
}

module.exports = { gql };
