'use strict';
// Launches Edge (or Chrome) with the user's existing profile so all sessions/cookies are present.
// Usage: node scripts/launch-with-profile.js [url] [browser]
const { chromium } = require('playwright');
const path = require('path');

const url = process.argv[2] || 'https://chatgpt.com';
const browserChoice = (process.argv[3] || 'edge').toLowerCase();

const PROFILES = {
  edge:   'C:\\Users\\justi\\AppData\\Local\\Microsoft\\Edge\\User Data',
  chrome: 'C:\\Users\\justi\\AppData\\Local\\Google\\Chrome\\User Data',
};

const CHANNELS = {
  edge:   'msedge',
  chrome: 'chrome',
};

async function main() {
  const userDataDir = PROFILES[browserChoice];
  const channel = CHANNELS[browserChoice];

  console.log(`Launching ${browserChoice} with profile: ${userDataDir}`);
  console.log(`Navigating to: ${url}`);

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel,
    headless: false,
    args: ['--no-first-run', '--no-default-browser-check'],
  });

  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const title = await page.title();
  const pageUrl = page.url();
  console.log(`\nPage loaded: ${title}`);
  console.log(`URL: ${pageUrl}`);
  console.log('\nBrowser is open. Press Ctrl+C to close.');

  // Keep alive
  await new Promise(() => {});
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
