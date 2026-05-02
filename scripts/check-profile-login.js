'use strict';
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const url = process.argv[2] || 'https://chatgpt.com';
const browserChoice = (process.argv[3] || 'edge').toLowerCase();

const PROFILES = {
  edge:   'C:\\Users\\justi\\AppData\\Local\\Microsoft\\Edge\\User Data',
  chrome: 'C:\\Users\\justi\\AppData\\Local\\Google\\Chrome\\User Data',
};
const CHANNELS = { edge: 'msedge', chrome: 'chrome' };

async function main() {
  const context = await chromium.launchPersistentContext(PROFILES[browserChoice], {
    channel: CHANNELS[browserChoice],
    headless: false,
    args: ['--no-first-run', '--no-default-browser-check'],
    viewport: { width: 1280, height: 800 },
  });

  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });

  // Wait for Cloudflare + JS render
  await page.waitForTimeout(5000);

  const screenshotPath = `C:\\Users\\justi\\Claude2\\scripts\\profile-screenshot.png`;
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const title = await page.title();
  const pageUrl = page.url();
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 800));
  const loggedIn = !bodyText.includes('Log in') && !bodyText.includes('Sign up') && title !== 'Just a moment...';

  console.log(JSON.stringify({ title, pageUrl, loggedIn, bodyPreview: bodyText.slice(0, 300), screenshotPath }, null, 2));
  await context.close();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
