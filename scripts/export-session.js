'use strict';
// Export cookies from an existing browser profile into the scraper's session store.
// Run this once after logging in manually — future scrape_url calls will load the session automatically.
//
// Usage:
//   node scripts/export-session.js https://chatgpt.com edge
//   node scripts/export-session.js https://chatgpt.com chrome   (only when Chrome is fully closed)

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');
chromium.use(StealthPlugin());

const url = process.argv[2];
const browserChoice = (process.argv[3] || 'edge').toLowerCase();

if (!url) {
  console.error('Usage: node scripts/export-session.js <url> [edge|chrome]');
  process.exit(1);
}

const PROFILES = {
  edge:   'C:\\Users\\justi\\AppData\\Local\\Microsoft\\Edge\\User Data',
  chrome: 'C:\\Users\\justi\\AppData\\Local\\Google\\Chrome\\User Data',
};
const CHANNELS = { edge: 'msedge', chrome: 'chrome' };

const SESSION_DIR = path.join(__dirname, '..', '.scraper-sessions');
const hostname = new URL(url).hostname;
const outFile = path.join(SESSION_DIR, `${hostname}.json`);

async function main() {
  console.log(`Opening ${browserChoice} profile...`);
  const context = await chromium.launchPersistentContext(PROFILES[browserChoice], {
    channel: CHANNELS[browserChoice],
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
    ],
    viewport: { width: 1280, height: 800 },
  });

  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3000);

  const title = await page.title();
  console.log(`Page title: ${title}`);

  // Export Playwright storage state (cookies + localStorage)
  const state = await context.storageState();

  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(state, null, 2));

  const cookieCount = state.cookies?.length ?? 0;
  console.log(`\nExported ${cookieCount} cookies → ${outFile}`);
  console.log('Done. The scraper will now load this session automatically for', hostname);

  await context.close();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
