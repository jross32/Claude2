'use strict';
// Automates ChatGPT to create "AI workspace" project, start a chat, trigger agent/extended mode,
// and capture all network traffic (SSE, REST, backend-api) for MCP agent mode research.

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');
chromium.use(StealthPlugin());

const SESSION_FILE = path.join(__dirname, '..', '.scraper-sessions', 'chatgpt.com.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'chatgpt-agent-research');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function save(name, data) {
  const file = path.join(OUTPUT_DIR, name);
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  console.log(`  Saved: ${file}`);
}

function shot(page, name) {
  return page.screenshot({ path: path.join(OUTPUT_DIR, name), fullPage: false }).catch(() => {});
}

async function main() {
  if (!fs.existsSync(SESSION_FILE)) {
    console.error('No session. Run: node scripts/export-session.js https://chatgpt.com edge');
    process.exit(1);
  }

  const storageState = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
  console.log(`Session loaded: ${storageState.cookies?.length} cookies`);

  const browser = await chromium.launch({
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--disable-infobars'],
  });

  const context = await browser.newContext({
    storageState,
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  // ── Network capture ─────────────────────────────────────────────────────
  const captured = { requests: [], sseEvents: [], wsMessages: [] };
  context.on('request', (req) => {
    const url = req.url();
    if (url.includes('backend-api') || url.includes('backend-anon') || url.includes('conversation')) {
      const entry = { ts: Date.now(), method: req.method(), url };
      captured.requests.push(entry);
      console.log(`  → ${req.method()} ${url.replace('https://chatgpt.com', '')}`);
    }
  });
  context.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('backend-api') && !url.includes('backend-anon') && !url.includes('conversation')) return;
    const ct = res.headers()['content-type'] || '';
    if (ct.includes('event-stream')) {
      try {
        const body = await res.body();
        const text = body.toString('utf-8');
        captured.sseEvents.push({ url, bytes: body.length, preview: text.slice(0, 3000) });
        console.log(`  ← SSE ${res.status()} ${url.replace('https://chatgpt.com', '')} (${body.length} bytes)`);
      } catch {}
    }
  });

  const page = await context.newPage();
  await page.addInitScript(() => {
    try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); } catch {}
    try {
      if (!window.chrome) window.chrome = {};
      if (!window.chrome.runtime) window.chrome.runtime = { connect: () => {}, sendMessage: () => {} };
    } catch {}
  });

  // ── Navigate ─────────────────────────────────────────────────────────────
  console.log('\n[1] Navigating to chatgpt.com...');
  await page.goto('https://chatgpt.com', { waitUntil: 'load', timeout: 60000 });
  for (let i = 0; i < 8; i++) {
    if (await page.title() !== 'Just a moment...') break;
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(2000);
  await shot(page, '01-home.png');

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 200));
  if (!bodyText.includes('Justin') && bodyText.includes('Log in')) {
    console.error('Not logged in — session expired. Re-run export-session.js');
    await browser.close(); return;
  }
  console.log('  ✓ Logged in');

  // ── Create "AI workspace" project ─────────────────────────────────────────
  console.log('\n[2] Creating "AI workspace" project...');

  // Expand the Projects section in the sidebar first
  await page.click('text=Projects', { timeout: 10000 });
  await page.waitForTimeout(800);

  // Now "New project" should be visible — click it
  await page.click('text=New project', { timeout: 8000 });
  await page.waitForTimeout(800);
  await shot(page, '02-create-project-dialog.png');

  // Dialog is now open — fill the name input (placeholder: "Copenhagen Trip")
  const nameInput = await page.waitForSelector('dialog input[type="text"], dialog input:not([type])', { timeout: 5000 });
  await nameInput.click({ clickCount: 3 }).catch(() => nameInput.click());
  await nameInput.fill('AI workspace');
  await page.waitForTimeout(300);
  await shot(page, '03-name-filled.png');

  // Click "Create project" button inside the dialog
  await page.click('dialog button:has-text("Create project")', { timeout: 5000 });
  console.log('  ✓ Create project clicked');

  // Wait for the dialog to close and project to be created
  await page.waitForSelector('dialog', { state: 'hidden', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot(page, '04-project-created.png');

  // ── Start a new chat inside the project ──────────────────────────────────
  console.log('\n[3] Starting a new chat...');

  // Navigate to the project or click "New chat"
  // After project creation, ChatGPT may navigate into the project automatically
  const currentUrl = page.url();
  console.log(`  URL after project create: ${currentUrl}`);

  // Look for "New chat" button or the chat input
  const newChatBtn = await page.$('a[href="/"]:has-text("New chat"), button:has-text("New chat"), [data-testid="new-chat-button"]');
  if (newChatBtn) {
    await newChatBtn.click();
    await page.waitForTimeout(1500);
  }
  await shot(page, '05-new-chat.png');

  // ── Find chat input and type ──────────────────────────────────────────────
  console.log('\n[4] Locating chat input...');
  const textarea = await page.waitForSelector('#prompt-textarea, textarea[placeholder], [data-id="root"] textarea', { timeout: 15000 });
  console.log('  ✓ Chat input found');

  // Check if Extended / agent mode button is available
  const extendedBtn = await page.$('button:has-text("Extended"), [aria-label*="Extended" i]');
  if (extendedBtn) {
    console.log('  Found "Extended" button — it is already available');
    // Don't click it yet — note its presence for later
  }

  // ── Send a prompt that triggers multi-step agent behavior ─────────────────
  console.log('\n[5] Sending agent mode prompt...');
  const prompt = `Please use your tools to complete these steps and show your thinking process:
1. Search the web for "best AI agent frameworks 2025" and summarize what you find
2. Then write a simple Python example of an AI agent loop

Show me your thinking at each step, use your web search tool, and be thorough.`;

  await textarea.click();
  await textarea.fill(prompt);
  await page.waitForTimeout(500);
  await shot(page, '06-prompt-entered.png');

  // Submit
  const sendBtn = await page.$('[data-testid="send-button"], button[aria-label*="send" i]');
  if (sendBtn) await sendBtn.click();
  else await page.keyboard.press('Enter');
  console.log('  ✓ Prompt submitted');

  // ── Wait for and capture the agent response ───────────────────────────────
  console.log('\n[6] Waiting for agent response (up to 120s)...');
  let lastText = '';
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(1500);

    // Capture screenshots periodically
    if (i % 6 === 0) await shot(page, `07-response-t${i}.png`);

    const stopBtn = await page.$('button[aria-label*="stop" i], button:has-text("Stop generating")');
    const responseText = await page.evaluate(() => {
      const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
      return msgs.length > 0 ? msgs[msgs.length - 1]?.innerText?.slice(0, 300) : '';
    }).catch(() => '');

    if (responseText !== lastText && responseText) {
      console.log(`  [t=${i * 1.5}s] Response: ${responseText.slice(0, 80).replace(/\n/g, ' ')}...`);
      lastText = responseText;
    }

    if (!stopBtn && responseText.length > 50) {
      console.log('  ✓ Response complete');
      break;
    }
  }

  await shot(page, '08-final-response.png');

  // ── Extract full conversation ─────────────────────────────────────────────
  const conversation = await page.evaluate(() => {
    const msgs = document.querySelectorAll('[data-message-author-role]');
    return Array.from(msgs).map(m => ({
      role: m.getAttribute('data-message-author-role'),
      text: m.innerText?.slice(0, 5000),
    }));
  }).catch(() => []);

  // ── Save research data ────────────────────────────────────────────────────
  console.log('\n[7] Saving research data...');
  save('conversation.json', conversation);
  save('network-requests.json', captured.requests);
  save('sse-streams.json', captured.sseEvents);
  save('research-summary.txt', [
    `=== ChatGPT Agent Mode Research ===`,
    `Date: ${new Date().toISOString()}`,
    ``,
    `Network:`,
    `  API requests to backend-api: ${captured.requests.filter(r => r.url.includes('backend-api')).length}`,
    `  SSE streams captured: ${captured.sseEvents.length}`,
    `  Total SSE bytes: ${captured.sseEvents.reduce((n, s) => n + s.bytes, 0)}`,
    ``,
    `API Endpoints called:`,
    ...captured.requests.map(r => `  ${r.method} ${r.url.replace('https://chatgpt.com', '')}`),
    ``,
    `SSE Streams:`,
    ...captured.sseEvents.map(s => `  ${s.url.replace('https://chatgpt.com', '')} (${s.bytes} bytes)`),
    ``,
    `Conversation turns: ${conversation.length}`,
  ].join('\n'));

  console.log('\n=== Done ===');
  console.log(`  API requests: ${captured.requests.length}`);
  console.log(`  SSE streams: ${captured.sseEvents.length}`);
  console.log(`  Output: ${OUTPUT_DIR}`);

  await browser.close();
}

main().catch(async (err) => {
  console.error('\nError:', err.message);
  process.exit(1);
});
