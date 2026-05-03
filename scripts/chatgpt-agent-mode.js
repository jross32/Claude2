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
        captured.sseEvents.push({ url, bytes: body.length, preview: text.slice(0, 5000) });
        console.log(`  ← SSE ${res.status()} ${url.replace('https://chatgpt.com', '')} (${body.length} bytes)`);
      } catch {}
    }
  });
  // WebSocket capture — ChatGPT streams actual token/tool content over WS after handoff
  context.on('websocket', (ws) => {
    console.log(`  ← WS opened: ${ws.url()}`);
    ws.on('framesent', (frame) => {
      if (frame.text) captured.wsMessages.push({ dir: 'sent', ts: Date.now(), text: frame.text.slice(0, 2000) });
    });
    ws.on('framereceived', (frame) => {
      if (frame.text) {
        const preview = frame.text.slice(0, 2000);
        captured.wsMessages.push({ dir: 'recv', ts: Date.now(), text: preview });
        // Log tool calls and content events
        if (frame.text.includes('"type"') && (frame.text.includes('tool') || frame.text.includes('content') || frame.text.includes('delta'))) {
          console.log(`  ← WS frame: ${preview.slice(0, 120).replace(/\n/g, ' ')}`);
        }
      }
    });
    ws.on('close', () => console.log(`  ← WS closed: ${ws.url()}`));
  });

  const page = await context.newPage();
  await page.addInitScript(() => {
    try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); } catch {}
    try {
      if (!window.chrome) window.chrome = {};
      if (!window.chrome.runtime) window.chrome.runtime = { connect: () => {}, sendMessage: () => {} };
    } catch {}

    // Monkey-patch WebSocket to capture all messages from any domain
    const OrigWS = window.WebSocket;
    window.WebSocket = function(url, protocols) {
      const ws = protocols ? new OrigWS(url, protocols) : new OrigWS(url);
      window.__wsCapture = window.__wsCapture || [];
      window.__wsCapture.push({ url, ts: Date.now(), frames: [] });
      const idx = window.__wsCapture.length - 1;
      console.log('[WS-OPEN]', url);
      const orig = ws.addEventListener.bind(ws);
      ws.addEventListener('message', (e) => {
        const text = typeof e.data === 'string' ? e.data.slice(0, 3000) : '[binary]';
        window.__wsCapture[idx].frames.push({ dir: 'recv', ts: Date.now(), text });
        if (text.includes('delta') || text.includes('tool') || text.includes('content')) {
          console.log('[WS-RECV]', text.slice(0, 200));
        }
      });
      const origSend = ws.send.bind(ws);
      ws.send = function(data) {
        const text = typeof data === 'string' ? data.slice(0, 1000) : '[binary]';
        window.__wsCapture[idx].frames.push({ dir: 'sent', ts: Date.now(), text });
        return origSend(data);
      };
      return ws;
    };
    Object.assign(window.WebSocket, OrigWS);
    window.WebSocket.prototype = OrigWS.prototype;

    // Also intercept fetch to capture SSE from any URL
    const origFetch = window.fetch;
    window.fetch = async function(...args) {
      const res = await origFetch(...args);
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (url.includes('conversation') && res.headers.get('content-type')?.includes('event-stream')) {
        console.log('[SSE-FETCH]', url.replace('https://chatgpt.com', ''));
      }
      return res;
    };
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
  await page.waitForTimeout(1200);
  await shot(page, '02-after-new-project-click.png');

  const urlAfterClick = page.url();
  console.log(`  URL after "New project" click: ${urlAfterClick}`);

  // The "New project" click may open a dialog OR navigate to a URL with an inline form.
  // Use a broad selector that covers both cases — try for up to 15s for loading to finish.
  console.log('  Waiting for project name input...');
  const nameInput = await page.waitForSelector(
    [
      // Classic dialog variants
      'dialog input[type="text"]',
      'dialog input:not([type])',
      // Non-dialog modal/sheet variants (div/section acting as modal)
      '[role="dialog"] input[type="text"]',
      '[role="dialog"] input:not([type])',
      // Placeholder-based (ChatGPT uses "Copenhagen Trip" as example)
      'input[placeholder*="Copenhagen" i]',
      'input[placeholder*="project" i]',
      'input[placeholder*="name" i]',
      // Aria label variants
      '[aria-label*="project name" i]',
      '[aria-label*="name" i]',
    ].join(', '),
    { timeout: 15000 }
  );
  console.log('  ✓ Project name input found');

  await nameInput.click({ clickCount: 3 }).catch(() => nameInput.click());
  await nameInput.fill('AI workspace');
  await page.waitForTimeout(400);
  await shot(page, '03-name-filled.png');

  // Click "Create project" — try dialog-scoped first, then page-wide
  const createBtn = await page.$(
    'dialog button:has-text("Create project"), [role="dialog"] button:has-text("Create project"), button:has-text("Create project")'
  );
  if (createBtn) {
    await createBtn.click();
  } else {
    // Fallback: press Enter in the input
    await nameInput.press('Enter');
  }
  console.log('  ✓ Create project submitted');

  // Wait for the form/dialog to disappear and project to be created
  await page.waitForTimeout(2000);
  await shot(page, '04-project-created.png');

  // ── Start a new chat inside the project ──────────────────────────────────
  console.log('\n[3] Starting a new chat...');

  const currentUrl = page.url();
  console.log(`  URL after project create: ${currentUrl}`);

  // After project creation ChatGPT lands on /g/g-p-xxx/project (settings page).
  // Navigate to /g/g-p-xxx to open a new chat inside the project.
  if (currentUrl.endsWith('/project') || currentUrl.includes('/project?')) {
    const chatUrl = currentUrl.replace(/\/project(\?.*)?$/, '');
    console.log(`  Navigating to project chat: ${chatUrl}`);
    await page.goto(chatUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
  }
  await shot(page, '05-new-chat.png');

  // ── Find chat input and type ──────────────────────────────────────────────
  console.log('\n[4] Locating chat input...');
  // ChatGPT uses a contenteditable div with id="prompt-textarea" as the real input.
  // The <textarea name="prompt-textarea"> is a hidden virtual keyboard fallback — skip it.
  const textarea = await page.waitForSelector(
    'div#prompt-textarea[contenteditable], div[contenteditable="true"][aria-label*="chat" i], [aria-label*="New chat" i][contenteditable]',
    { timeout: 15000 }
  );
  console.log('  ✓ Chat input found');

  // Look for Extended/agent mode toggle button scoped to the chat footer area
  const extendedBtn = await page.$(
    'form button:has-text("Extended"), footer button:has-text("Extended"), ' +
    '[aria-label*="Extended" i]:not([class*="sidebar"]), ' +
    'div[class*="composer"] button:has-text("Search")'
  );
  if (extendedBtn) {
    console.log('  Clicking extended/agent mode button...');
    await extendedBtn.click({ force: true });
    await page.waitForTimeout(600);
  } else {
    console.log('  Extended button not found in chat area — proceeding with prompt only');
  }

  // ── Send a prompt that triggers multi-step agent behavior ─────────────────
  console.log('\n[5] Sending agent mode prompt...');
  const prompt = `Please use your tools to complete these steps and show your thinking process:
1. Search the web for "best AI agent frameworks 2025" and summarize what you find
2. Then write a simple Python example of an AI agent loop

Show me your thinking at each step, use your web search tool, and be thorough.`;

  await textarea.click();
  // Use execCommand insertText so newlines don't submit the form in the contenteditable
  await page.evaluate((text) => {
    const el = document.querySelector('div#prompt-textarea[contenteditable]');
    if (el) {
      el.focus();
      // Clear existing content then insert full text preserving newlines
      document.execCommand('selectAll', false);
      document.execCommand('insertText', false, text);
    }
  }, prompt);
  await page.waitForTimeout(500);
  await shot(page, '06-prompt-entered.png');

  // Submit — try the send button first, then Enter
  const sendBtn = await page.$('[data-testid="send-button"], button[aria-label*="send" i], button[aria-label*="Send" i]');
  if (sendBtn) await sendBtn.click();
  else await textarea.press('Enter');
  console.log('  ✓ Prompt submitted');

  // ── Wait for and capture the agent response ───────────────────────────────
  console.log('\n[6] Waiting for agent response (up to 180s)...');
  let lastText = '';
  for (let i = 0; i < 120; i++) {
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

  // Harvest JS-level WebSocket captures
  const wsCapture = await page.evaluate(() => window.__wsCapture || []).catch(() => []);
  if (wsCapture.length > 0) {
    console.log(`  WS connections captured at JS level: ${wsCapture.length}`);
    wsCapture.forEach(c => console.log(`    ${c.url} — ${c.frames.length} frames`));
    // Merge into captured.wsMessages
    wsCapture.forEach(c => {
      c.frames.forEach(f => captured.wsMessages.push({ url: c.url, ...f }));
    });
  }

  // ── Save research data ────────────────────────────────────────────────────
  console.log('\n[7] Saving research data...');
  save('conversation.json', conversation);
  save('network-requests.json', captured.requests);
  save('sse-streams.json', captured.sseEvents);
  save('ws-messages.json', captured.wsMessages);
  save('research-summary.txt', [
    `=== ChatGPT Agent Mode Research ===`,
    `Date: ${new Date().toISOString()}`,
    ``,
    `Network:`,
    `  API requests to backend-api: ${captured.requests.filter(r => r.url.includes('backend-api')).length}`,
    `  SSE streams captured: ${captured.sseEvents.length}`,
    `  Total SSE bytes: ${captured.sseEvents.reduce((n, s) => n + s.bytes, 0)}`,
    `  WebSocket frames captured: ${captured.wsMessages.length}`,
    `  WS frames sent: ${captured.wsMessages.filter(m => m.dir === 'sent').length}`,
    `  WS frames received: ${captured.wsMessages.filter(m => m.dir === 'recv').length}`,
    ``,
    `Key endpoints:`,
    `  Conversation stream: POST /backend-api/f/conversation`,
    `  Handoff protocol: SSE → JWT token + topic_id → WS subscribe_ws_topic`,
    ``,
    `API Endpoints called:`,
    ...captured.requests.map(r => `  ${r.method} ${r.url.replace('https://chatgpt.com', '')}`),
    ``,
    `SSE Streams (handoff only — actual tokens in WS):`,
    ...captured.sseEvents.map(s => `  ${s.url.replace('https://chatgpt.com', '')} (${s.bytes} bytes)`),
    ``,
    `WebSocket frames (first 20):`,
    ...captured.wsMessages.slice(0, 20).map(m => `  [${m.dir}] ${m.text.slice(0, 120).replace(/\n/g, ' ')}`),
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
