// tests/unit/session-fixation.test.js
// Automated tests for session fixation and reuse logic in the scraper

const { loadSession, clearSession } = require('../../src/scraper');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const testUrl = 'https://example.com';
const SESSIONS_DIR = path.join(__dirname, '../../.scraper-sessions');
const sessionFilePath = path.join(SESSIONS_DIR, 'example.com.json');

function setup() {
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  fs.writeFileSync(sessionFilePath, JSON.stringify({ session: 'test' }));
}
function cleanup() {
  if (fs.existsSync(sessionFilePath)) fs.unlinkSync(sessionFilePath);
}

function main() {
  setup();
  // Loads session for exact hostname
  let file = loadSession(testUrl);
  assert.strictEqual(file, sessionFilePath, 'Should load session file for exact hostname');

  // Clears session for exact hostname
  clearSession(testUrl);
  assert.strictEqual(fs.existsSync(sessionFilePath), false, 'Session file should be deleted after clearSession');

  // Returns null if no session exists
  file = loadSession(testUrl);
  assert.strictEqual(file, null, 'Should return null if no session exists');
  cleanup();
  console.log('session-fixation: all tests passed');
}

if (require.main === module) main();
