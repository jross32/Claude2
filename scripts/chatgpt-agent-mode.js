'use strict';
// Automates ChatGPT to:
// 1. Load existing session (from .scraper-sessions/chatgpt.com.json)
// 2. Create "AI workspace" project
// 3. Open a new chat in agent/extended mode
// 4. Capture ALL network traffic (especially SSE streams from /backend-api/)
// 5. Save captured data for MCP agent mode research

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
  console.log(`Saved: ${file}`);
}

async function main() {
  if (!fs.existsSync(SESSION_FILE)) {
    console.error('No session found. Run: node scripts/export-session.js https://chatgpt.com edge');
    process.exit(1);
  }

  const storageState = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
  console.log(`Loaded session: ${storageState.cookies?.length} cookies`);

  const browser = await chromium.launch({
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--no-first-run',
    ],
  });

  const context = await browser.newContext({
    storageState,
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  // ── Network capture ─────────────────────────────────────────────────────
  const captured = { requests: [], responses: [], sseEvents: [], wsMessages: [] };

  context.on('request', (req) => {
    const url = req.url();
    if (url.includes('backend-api') || url.includes('backend-anon') || url.includes('conversation')) {
      captured.requests.push({ ts: Date.now(), method: req.method(), url, headers: req.headers() });
      console.log(`→ ${req.method()} ${url}`);
    }
  });

  context.on('response', async (res) => {
    const url = res.url();
    if (url.includes('backend-api') || url.includes('backend-anon') || url.includes('conversation')) {
      const ct = res.headers()['content-type'] || '';
      const entry = { ts: Date.now(), status: res.status(), url, contentType: ct };
      if (ct.includes('event-stream')) {
        // SSE — try to capture body
        try {
          const body = await res.body();
          entry.sseBody = body.toString('utf-8').slice(0, 50000);
          captured.sseEvents.push(entry);
          console.log(`← SSE ${res.status()} ${url} (${body.length} bytes)`);
        } catch {}
      } else if (ct.includes('json')) {
        try {
          const body = await res.body();
          entry.body = JSON.parse(body.toString('utf-8'));
          console.log(`← JSON ${res.status()} ${url}`);
        } catch {}
      }
      captured.responses.push(entry);
    }
  });

  const page = await context.newPage();

  await page.addInitScript(() => {
    try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); } catch {}
    try {
      if (!window.chrome) window.chrome = {};
      if (!window.chrome.runtime) window.chrome.runtime = { connect: () => {}, sendMessage: () => {} };
    } catch {}
    try {
      const orig = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (p) =>
        p.name === 'notifications' ? Promise.resolve({ state: 'default' }) : orig(p);
    } catch {}
  });

  console.log('Navigating to chatgpt.com...');
  await page.goto('https://chatgpt.com', { waitUntil: 'load', timeout: 60000 });

  // Wait for Cloudflare + hydration
  for (let i = 0; i < 8; i++) {
    if (await page.title() !== 'Just a moment...') break;
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(3000);

  await page.screenshot({ path: path.join(OUTPUT_DIR, '01-home.png') });
  const homeTitle = await page.title();
  const homeText = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log(`Home: ${homeTitle}`);
  console.log(`Text: ${homeText.slice(0, 150)}`);
  save('home-text.txt', homeText);

  const loggedIn = homeText.includes('Justin') || (!homeText.includes('Log in') && !homeText.includes('Sign up'));
  if (!loggedIn) {
    console.error('Not logged in — session may have expired. Re-run export-session.js');
    await page.screenshot({ path: path.join(OUTPUT_DIR, '01-not-logged-in.png') });
    await browser.close();
    return;
  }
  console.log('✓ Logged in as Justin Ross');

  // ── Step 1: Find Projects in sidebar and create "AI workspace" ────────────
  console.log('\n--- Creating "AI workspace" project ---');

  // Try clicking on Projects expandable, or look for a new project button
  try {
    // Look for Projects button in sidebar
    const projectsBtn = await page.$('a[href*="/project"], button:has-text("Projects"), [aria-label*="project" i]');
    if (projectsBtn) {
      await projectsBtn.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUTPUT_DIR, '02-projects-clicked.png') });
    }
  } catch (e) {
    console.log('Projects button not found by selector, trying text search...');
  }

  // Look for "New project" or "+" button near Projects
  let projectCreated = false;
  try {
    // Try finding the new project button
    const newProjectBtn = await page.$('button:has-text("New project"), a:has-text("New project"), [data-testid*="new-project"]');
    if (newProjectBtn) {
      await newProjectBtn.click();
      await page.waitForTimeout(1000);
    } else {
      // Try right-clicking or finding a + button
      const plusBtn = await page.$('nav button[aria-label*="new" i], button[title*="project" i]');
      if (plusBtn) await plusBtn.click();
    }
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, '03-new-project-dialog.png') });
  } catch (e) {
    console.log('Could not find new project button:', e.message);
  }

  // Try typing in a project name field
  try {
    const nameField = await page.$('input[placeholder*="project" i], input[placeholder*="name" i], dialog input');
    if (nameField) {
      await nameField.fill('AI workspace');
      await page.waitForTimeout(500);
      // Press Enter or click Create
      const createBtn = await page.$('button:has-text("Create"), button[type="submit"]');
      if (createBtn) await createBtn.click();
      else await nameField.press('Enter');
      await page.waitForTimeout(2000);
      projectCreated = true;
      console.log('✓ Project name submitted');
    }
  } catch (e) {
    console.log('Could not fill project name:', e.message);
  }

  await page.screenshot({ path: path.join(OUTPUT_DIR, '04-after-project-create.png') });

  // ── Step 2: Open a new chat (in project if created, otherwise main) ────────
  console.log('\n--- Opening new chat ---');
  try {
    const newChatBtn = await page.$('a[href="/"], button:has-text("New chat"), [data-testid*="new-chat"]');
    if (newChatBtn) {
      await newChatBtn.click();
      await page.waitForTimeout(2000);
    }
  } catch {}
  await page.screenshot({ path: path.join(OUTPUT_DIR, '05-new-chat.png') });

  // ── Step 3: Find chat input and enable "Extended" / agent mode ────────────
  console.log('\n--- Enabling agent mode ---');
  const textarea = await page.$('textarea[placeholder*="Ask" i], #prompt-textarea, [data-id="root"]');
  if (!textarea) {
    console.log('Could not find chat input');
    await page.screenshot({ path: path.join(OUTPUT_DIR, '05-no-input.png') });
    save('captured.json', captured);
    await browser.close();
    return;
  }

  // Look for "Extended" / tools toggle button
  try {
    const extendedBtn = await page.$('button:has-text("Extended"), button[aria-label*="extended" i], button[aria-label*="tools" i]');
    if (extendedBtn) {
      console.log('Found Extended button — clicking...');
      await extendedBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(OUTPUT_DIR, '06-extended-mode.png') });
    } else {
      console.log('No Extended button found — using default mode');
    }
  } catch (e) {
    console.log('Extended button error:', e.message);
  }

  // ── Step 4: Send a prompt that triggers agent-like multi-step behavior ────
  console.log('\n--- Sending agent mode prompt ---');
  const prompt = `I'm testing your agent mode capabilities. Please use your tools to:
1. Search the web for "latest AI agent frameworks 2025"
2. Write a brief summary of what you find
3. Create a simple code example showing an AI agent loop

Please use all available tools and show your step-by-step process.`;

  await textarea.focus();
  await textarea.fill(prompt);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUTPUT_DIR, '07-prompt-entered.png') });

  // Submit
  const sendBtn = await page.$('button[data-testid="send-button"], button[aria-label*="send" i]');
  if (sendBtn) {
    await sendBtn.click();
  } else {
    await textarea.press('Enter');
  }

  console.log('Prompt submitted — waiting for agent response...');
  await page.screenshot({ path: path.join(OUTPUT_DIR, '08-waiting-response.png') });

  // Wait for the response to complete (up to 90s)
  let responseComplete = false;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1500);
    const stopBtn = await page.$('button[aria-label*="stop" i], button:has-text("Stop")');
    const responseText = await page.evaluate(() => {
      const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
      return msgs.length > 0 ? msgs[msgs.length - 1]?.innerText?.slice(0, 200) : '';
    });
    if (i % 5 === 0) {
      await page.screenshot({ path: path.join(OUTPUT_DIR, `09-response-${i}.png`) });
      console.log(`  Response so far: ${responseText?.slice(0, 80) || '(empty)'}`);
    }
    if (!stopBtn && responseText) {
      responseComplete = true;
      console.log('Response complete!');
      break;
    }
  }

  await page.screenshot({ path: path.join(OUTPUT_DIR, '10-final-response.png') });

  // Capture final page state
  const finalText = await page.evaluate(() => {
    const msgs = document.querySelectorAll('[data-message-author-role]');
    return Array.from(msgs).map(m => ({
      role: m.getAttribute('data-message-author-role'),
      text: m.innerText?.slice(0, 2000),
    }));
  });
  save('conversation.json', finalText);

  // Save all captured network data
  save('captured.json', captured);
  save('captured-summary.txt', [
    `Requests: ${captured.requests.length}`,
    `Responses: ${captured.responses.length}`,
    `SSE streams: ${captured.sseEvents.length}`,
    '',
    'Request URLs:',
    ...captured.requests.map(r => `  ${r.method} ${r.url}`),
    '',
    'SSE streams:',
    ...captured.sseEvents.map(s => `  ${s.url} (${s.sseBody?.length || 0} bytes)`),
  ].join('\n'));

  console.log('\n=== Research Summary ===');
  console.log(`Requests captured: ${captured.requests.length}`);
  console.log(`SSE streams: ${captured.sseEvents.length}`);
  console.log(`Screenshots saved to: ${OUTPUT_DIR}`);
  console.log(`Data saved to: ${OUTPUT_DIR}`);

  await browser.close();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
