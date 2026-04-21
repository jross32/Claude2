/**
 * Authentication handler — fast, no artificial delays.
 */
const crypto = require('crypto');

// ── TOTP generator (RFC 6238, no external deps) ──────────────────────────────
function _base32Decode(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const input = s.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0, value = 0;
  const output = [];
  for (const char of input) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { bits -= 8; output.push((value >> bits) & 0xff); }
  }
  return Buffer.from(output);
}

function _generateTotp(base32Secret, digits = 6, step = 30) {
  const key     = _base32Decode(base32Secret);
  const counter = Math.floor(Date.now() / 1000 / step);
  const buf     = Buffer.allocUnsafe(8);
  // Write counter as big-endian 64-bit integer
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac   = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code   = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % (10 ** digits);
  return String(code).padStart(digits, '0');
}

// ── CAPTCHA detection and external solving ────────────────────────────────────

async function _detectCaptcha(page) {
  try {
    return await page.evaluate(() => {
      // Cloudflare Turnstile (check first — looks like reCAPTCHA)
      const cf = document.querySelector('.cf-turnstile[data-sitekey], [data-cf-action] [data-sitekey]');
      if (cf) return { type: 'turnstile', sitekey: cf.getAttribute('data-sitekey') };

      // hCaptcha
      const hc = document.querySelector('.h-captcha[data-sitekey]');
      if (hc) return { type: 'hcaptcha', sitekey: hc.getAttribute('data-sitekey') };

      // reCAPTCHA (v2 or invisible)
      const rc = document.querySelector('.g-recaptcha[data-sitekey], [data-sitekey]:not(.cf-turnstile):not(.h-captcha)');
      if (rc) {
        const sitekey = rc.getAttribute('data-sitekey');
        const size = rc.getAttribute('data-size') || '';
        return { type: size === 'invisible' ? 'recaptcha_invisible' : 'recaptcha_v2', sitekey };
      }

      // reCAPTCHA v3 — sitekey in script src
      for (const s of document.querySelectorAll('script[src*="recaptcha"]')) {
        const m = s.src.match(/[?&]render=([^&]+)/);
        if (m && m[1] !== 'explicit') return { type: 'recaptcha_v3', sitekey: m[1] };
      }

      return null;
    });
  } catch { return null; }
}

async function _solveCaptchaExternal(captchaInfo, pageUrl, log) {
  const apiKey   = process.env.CAPTCHA_API_KEY;
  const provider = (process.env.CAPTCHA_PROVIDER || '2captcha').toLowerCase().trim();
  if (!apiKey)                 { log('CAPTCHA_API_KEY not set — skipping auto-solve', 'warn'); return null; }
  if (!captchaInfo?.sitekey) { log('Could not extract CAPTCHA sitekey — skipping', 'warn'); return null; }

  const { type, sitekey } = captchaInfo;
  log(`Solving ${type} via ${provider} (sitekey: ${sitekey.slice(0, 12)}...)`, 'info');

  try {
    if (provider === '2captcha') {
      // Submit
      const params = new URLSearchParams({ key: apiKey, pageurl: pageUrl, json: '1' });
      if (type === 'hcaptcha')                 { params.set('method', 'hcaptcha');      params.set('sitekey', sitekey); }
      else if (type === 'turnstile')           { params.set('method', 'turnstile');     params.set('sitekey', sitekey); }
      else if (type === 'recaptcha_v3')        { params.set('method', 'userrecaptcha'); params.set('googlekey', sitekey); params.set('version', 'v3'); params.set('action', 'verify'); }
      else                                     { params.set('method', 'userrecaptcha'); params.set('googlekey', sitekey); }

      const submitRes = await fetch(`https://2captcha.com/in.php?${params}`);
      const submitData = await submitRes.json().catch(async () => {
        const t = await submitRes.text(); return { status: 0, request: t };
      });
      if (submitData.status !== 1) { log(`2captcha submit error: ${submitData.request}`, 'warn'); return null; }
      const taskId = submitData.request;
      log(`2captcha task submitted: ${taskId}`, 'info');

      // Poll up to 120s
      for (let i = 0; i < 24; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const pollRes  = await fetch(`https://2captcha.com/res.php?key=${apiKey}&action=get&id=${taskId}&json=1`);
        const pollData = await pollRes.json().catch(() => ({ status: 0, request: 'parse_error' }));
        if (pollData.status === 1) { log('2captcha solved', 'success'); return pollData.request; }
        if (pollData.request !== 'CAPCHA_NOT_READY') { log(`2captcha error: ${pollData.request}`, 'warn'); return null; }
      }
      log('2captcha timed out (120s)', 'warn');
      return null;
    }

    if (provider === 'capsolver') {
      const typeMap = { recaptcha_v2: 'ReCaptchaV2Task', recaptcha_invisible: 'ReCaptchaV2Task', recaptcha_v3: 'ReCaptchaV3Task', hcaptcha: 'HCaptchaTask', turnstile: 'AntiTurnstileTask' };
      const taskType = typeMap[type] || 'ReCaptchaV2Task';
      const createRes  = await fetch('https://api.capsolver.com/createTask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: apiKey, task: { type: taskType, websiteURL: pageUrl, websiteKey: sitekey } }),
      });
      const createData = await createRes.json();
      if (createData.errorId) { log(`CapSolver error: ${createData.errorDescription}`, 'warn'); return null; }
      const taskId = createData.taskId;

      for (let i = 0; i < 24; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const resData = await (await fetch('https://api.capsolver.com/getTaskResult', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientKey: apiKey, taskId }),
        })).json();
        if (resData.status === 'ready') {
          const token = resData.solution?.gRecaptchaResponse || resData.solution?.token;
          log('CapSolver solved', 'success');
          return token || null;
        }
        if (resData.errorId) { log(`CapSolver poll error: ${resData.errorDescription}`, 'warn'); return null; }
      }
      log('CapSolver timed out (120s)', 'warn');
      return null;
    }

    if (provider === 'anticaptcha') {
      const typeMap = { recaptcha_v2: 'NoCaptchaTask', recaptcha_invisible: 'NoCaptchaTask', recaptcha_v3: 'RecaptchaV3Task', hcaptcha: 'HCaptchaTask', turnstile: 'TurnstileTask' };
      const taskType = typeMap[type] || 'NoCaptchaTask';
      const createData = await (await fetch('https://api.anti-captcha.com/createTask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: apiKey, task: { type: taskType, websiteURL: pageUrl, websiteKey: sitekey } }),
      })).json();
      if (createData.errorId) { log(`anti-captcha error: ${createData.errorDescription}`, 'warn'); return null; }
      const taskId = createData.taskId;

      for (let i = 0; i < 24; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const resData = await (await fetch('https://api.anti-captcha.com/getTaskResult', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientKey: apiKey, taskId }),
        })).json();
        if (resData.status === 'ready') {
          log('anti-captcha solved', 'success');
          return resData.solution?.gRecaptchaResponse || null;
        }
        if (resData.errorId) { log(`anti-captcha poll error: ${resData.errorDescription}`, 'warn'); return null; }
      }
      log('anti-captcha timed out (120s)', 'warn');
      return null;
    }

    log(`Unknown CAPTCHA provider: ${provider} (use 2captcha|capsolver|anticaptcha)`, 'warn');
    return null;
  } catch (err) {
    log(`CAPTCHA solver request failed: ${err.message}`, 'warn');
    return null;
  }
}

async function _injectCaptchaToken(page, captchaInfo, token, log) {
  await page.evaluate(({ type, token: t }) => {
    // reCAPTCHA v2 / v3 / invisible — inject into response textarea
    const rc = document.getElementById('g-recaptcha-response')
      || document.querySelector('textarea[name="g-recaptcha-response"]');
    if (rc) { rc.value = t; rc.style.display = 'block'; rc.dispatchEvent(new Event('input', { bubbles: true })); }

    // hCaptcha — also uses h-captcha-response + g-recaptcha-response
    const hc = document.querySelector('[name="h-captcha-response"]');
    if (hc) { hc.value = t; hc.dispatchEvent(new Event('input', { bubbles: true })); }

    // Cloudflare Turnstile
    const cf = document.querySelector('[name="cf-turnstile-response"]');
    if (cf) { cf.value = t; cf.dispatchEvent(new Event('input', { bubbles: true })); }

    // Fire any registered callback (reCAPTCHA v2 widget callback)
    try {
      const cfg = window.___grecaptcha_cfg;
      if (cfg?.clients) {
        for (const client of Object.values(cfg.clients)) {
          const cb = client?.K?.K?.callback || client?.callback;
          if (typeof cb === 'function') { cb(t); break; }
        }
      }
    } catch {}
  }, { type: captchaInfo.type, token }).catch(() => {});
  log('CAPTCHA token injected', 'info');
}

// ── OAuth / SSO flow handler ───────────────────────────────────────────────────

const _OAUTH_PATTERNS = [
  { provider: 'Google',    hrefRe: /google\.com\/(oauth2|accounts|signin)/i,    textRe: /google/i },
  { provider: 'Facebook',  hrefRe: /facebook\.com\/(dialog|login|oauth)|fb\.com/i, textRe: /facebook/i },
  { provider: 'Apple',     hrefRe: /apple\.com\/auth/i,                          textRe: /apple/i },
  { provider: 'Microsoft', hrefRe: /microsoft\.com|live\.com\/oauth|azure\.com/i,textRe: /microsoft|office\s*365/i },
  { provider: 'GitHub',    hrefRe: /github\.com\/login\/oauth/i,                 textRe: /github/i },
  { provider: 'Twitter',   hrefRe: /twitter\.com\/oauth|x\.com\/i\/oauth/i,      textRe: /twitter|\bX\b/i },
  { provider: 'LinkedIn',  hrefRe: /linkedin\.com\/(oauth|uas\/oauth)/i,         textRe: /linkedin/i },
  { provider: 'Slack',     hrefRe: /slack\.com\/oauth/i,                         textRe: /slack/i },
  { provider: 'SSO',       hrefRe: /\/oauth\/|\/sso\/|\/auth\/|\/saml\//i,       textRe: /single.?sign.?on|sso\b/i },
];

async function _findOAuthButton(page, providerHint) {
  const patterns = providerHint
    ? _OAUTH_PATTERNS.filter(p => p.provider.toLowerCase().includes(providerHint.toLowerCase()))
    : _OAUTH_PATTERNS;

  let candidates;
  try {
    candidates = await page.$$('a, button, [role="button"], [type="submit"]');
  } catch { candidates = []; }
  for (const pat of patterns) {
    for (const el of candidates) {
      try {
        if (!await el.isVisible().catch(() => false)) continue;
        const text = ((await el.textContent().catch(() => '')) || (await el.getAttribute('value').catch(() => '')) || '').trim();
        const href = await el.getAttribute('href').catch(() => '') || '';
        if (pat.hrefRe.test(href) || pat.textRe.test(text)) {
          return { element: el, provider: pat.provider, text };
        }
      } catch {}
    }
  }
  return null;
}

async function _handleOAuth(page, context, providerHint, log) {
  const match = await _findOAuthButton(page, providerHint);
  if (!match) {
    log('No OAuth buttons detected on page', 'warn');
    return false;
  }

  log(`Found OAuth provider: ${match.provider} ("${match.text}") — clicking...`, 'info');
  const originUrl = new URL(page.url()).origin;

  // Set up popup watcher before clicking
  let oauthPopup = null;
  const popupHandler = (p) => { oauthPopup = p; };
  if (context) context.on('page', popupHandler);

  try {
    await match.element.click({ timeout: 5000 });
  } catch (err) {
    if (context) context.off('page', popupHandler);
    log(`OAuth click failed: ${err.message}`, 'warn');
    return false;
  }

  // Wait 2s to see if a popup opened
  await new Promise(r => setTimeout(r, 2000));
  if (context) context.off('page', popupHandler);

  if (oauthPopup) {
    // Popup-based OAuth (e.g. "Sign in with Google" desktop flow)
    log(`OAuth popup opened: ${oauthPopup.url().slice(0, 60)}`, 'info');
    try {
      await oauthPopup.waitForEvent('close', { timeout: 120000 });
      log('OAuth popup closed', 'info');
    } catch {
      log('OAuth popup timed out — user may need to complete sign-in manually', 'warn');
    }
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const success = new URL(page.url()).origin === originUrl;
    log(success ? 'OAuth popup flow completed' : 'OAuth popup flow: page did not return to origin', success ? 'success' : 'warn');
    return success;
  } else {
    // Redirect-based OAuth (page navigates away and back)
    log('OAuth redirect flow — waiting for callback to original origin...', 'info');
    try {
      await page.waitForFunction(
        (origin) => window.location.origin === origin,
        originUrl,
        { timeout: 120000 }
      );
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      log(`OAuth redirect flow completed — landed at: ${page.url()}`, 'success');
      return true;
    } catch {
      log('OAuth redirect did not return to origin within 120s', 'warn');
      return false;
    }
  }
}

async function handleAuth(page, options) {
  const { username, password, verificationCode, waitForVerification, totpSecret, context, ssoProvider, log } = options;

  // Fill a field reliably with React/Vue/Angular synthetic events
  async function fill(sel, value) {
    await page.focus(sel);
    await page.fill(sel, value);
    await page.evaluate(([s, v]) => {
      const el = document.querySelector(s);
      if (!el) return;
      const nv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      nv.set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, [sel, value]);
  }

  // Find the first visible matching selector
  async function findVisible(selectors) {
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el && await el.isVisible()) return sel;
      } catch {}
    }
    return null;
  }

  // Click submit — skip Forgot Password / Cancel / Register / Back
  async function clickSubmit() {
    const candidates = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button[id*="login" i]',
      'button[id*="signin" i]',
      'button[id*="sign-in" i]',
      'button[id*="continue" i]',
      'button[id*="next" i]',
      '[data-testid*="submit" i]',
      '[data-testid*="login" i]',
      'form button',
    ];
    for (const sel of candidates) {
      try {
        const els = await page.$$(sel);
        for (const el of els) {
          if (!await el.isVisible()) continue;
          const text = (await el.textContent() || '').toLowerCase().trim();
          if (/forgot|reset|cancel|back|register|sign.?up|create/i.test(text)) continue;
          await el.click();
          log(`Submitted via "${text}" (${sel})`);
          return;
        }
      } catch {}
    }
    await page.keyboard.press('Enter');
    log('Submitted via Enter key');
  }

  // ── Fill email ──────────────────────────────────────────────────────────────
  const emailSel = await findVisible([
    'input[type="email"]',
    'input[name="email"]',
    'input[autocomplete="email"]',
    'input[autocomplete="username"]',
    'input[name="username"]',
    'input[id*="email" i]',
    'input[id*="username" i]',
    'input[placeholder*="email" i]',
    'input[placeholder*="username" i]',
    'input[type="text"]',
  ]);

  if (emailSel) {
    await fill(emailSel, username);
    log(`Filled email: ${emailSel}`);
  } else {
    log('Could not find email field', 'warn');
  }

  // ── Fill password ───────────────────────────────────────────────────────────
  const passSel = await findVisible([
    'input[type="password"]',
    'input[name="password"]',
    'input[id*="password" i]',
  ]);

  if (passSel) {
    await fill(passSel, password);
    log(`Filled password: ${passSel}`);
  } else {
    log('Could not find password field — trying OAuth/SSO fallback...', 'warn');
    await _handleOAuth(page, context, ssoProvider || null, log);
    return;
  }

  // ── Solve CAPTCHA on login form (if present) ─────────────────────────────────
  const loginCaptcha = await _detectCaptcha(page);
  if (loginCaptcha) {
    const captchaToken = await _solveCaptchaExternal(loginCaptcha, page.url(), log);
    if (captchaToken) await _injectCaptchaToken(page, loginCaptcha, captchaToken, log);
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  const preSubmitUrl = page.url();
  log('Submitting login form...');
  await clickSubmit();

  // Wait for the page to navigate AWAY from the login page
  log('Waiting for navigation after login...');
  try {
    await page.waitForFunction(
      (url) => window.location.href !== url,
      preSubmitUrl,
      { timeout: 15000 }
    );
  } catch {
    log('URL did not change after submit — login may have failed', 'warn');
  }
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
  log(`Post-login URL: ${page.url()}`);

  // ── Forgot-password failsafe ─────────────────────────────────────────────────
  if (/forgot|reset.?password|password.?reset/i.test(page.url())) {
    log('Landed on forgot-password page — going back and retrying...', 'warn');
    await page.goBack().catch(() => {});
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
    if (emailSel) await fill(emailSel, username);
    if (passSel) await fill(passSel, password);
    const preRetryUrl = page.url();
    await clickSubmit();
    try {
      await page.waitForFunction(
        (url) => window.location.href !== url,
        preRetryUrl,
        { timeout: 15000 }
      );
    } catch {}
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
    log(`Retry post-login URL: ${page.url()}`);
  }

  // ── Handle "Continue" confirmation page ──────────────────────────────────────
  log('Checking for continue/confirmation page...');
  await clickContinueIfPresent(page, log);
  log(`Final URL after auth: ${page.url()}`);

  // ── Auto-detect 2FA ─────────────────────────────────────────────────────────
  const twoFA = await detectVerificationType(page);
  if (twoFA !== 'none') {
    log(`Auto-detected 2FA: ${twoFA}`);
    await handleVerification(page, { verificationType: twoFA, verificationCode, waitForVerification, totpSecret, log });
  }
}

async function clickContinueIfPresent(page, log) {
  const continueRe = /^(continue|proceed|allow|accept|yes|ok|confirm)$/i;
  const skipRe = /forgot|reset|cancel|back|sign.?up|register|someone else|log.?in.?as/i;

  try {
    // Wait up to 5s for any button to appear
    await page.waitForSelector('button, input[type="submit"]', { timeout: 5000, state: 'visible' }).catch(() => {});

    const clickables = await page.$$('button, input[type="submit"], input[type="button"]');
    log(`Continue scan: found ${clickables.length} button(s) on page`);

    for (const el of clickables) {
      try {
        if (!await el.isVisible()) continue;
        const text = ((await el.textContent()) || '').trim();
        const val  = ((await el.getAttribute('value')) || '').trim();
        const label = (text || val);
        log(`  button: "${label}"`);
        if (skipRe.test(label)) { log(`  → skipped`); continue; }
        if (continueRe.test(label.toLowerCase())) {
          log(`  → clicking: "${label}"`);
          const preClickUrl = page.url();
          await el.click();
          try {
            await page.waitForFunction(
              (url) => window.location.href !== url,
              preClickUrl,
              { timeout: 10000 }
            );
          } catch {}
          await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(800);
          log(`After continue — URL: ${page.url()}`);
          await clickContinueIfPresent(page, log);
          return;
        }
      } catch {}
    }
    log('No continue button found.');
  } catch {}
}

async function detectVerificationType(page) {
  try {
    return await page.evaluate(() => {
      const body = document.body?.innerText?.toLowerCase() || '';
      const hasCodeInput = [...document.querySelectorAll('input')].some(el =>
        el.offsetParent !== null && (
          /otp|code|token|verify|2fa/i.test(el.name + el.id + el.placeholder + (el.autocomplete || '')) ||
          el.autocomplete === 'one-time-code' ||
          (el.type === 'number' && el.maxLength <= 8)
        )
      );
      // CAPTCHA detection is independent of code input presence
      const hasCaptchaWidget = !!(document.querySelector(
        '.g-recaptcha, .h-captcha, .cf-turnstile, [data-sitekey], iframe[src*="recaptcha"], iframe[src*="hcaptcha"]'
      ));
      if (hasCaptchaWidget || /captcha/i.test(body)) return 'captcha';
      if (!hasCodeInput) return 'none';
      if (/authenticator|totp|google auth/i.test(body)) return 'totp';
      if (/sent.*email|email.*code|check your email/i.test(body)) return 'email';
      if (/sms|text message/i.test(body)) return 'sms';
      return 'totp';
    });
  } catch { return 'none'; }
}

async function handleVerification(page, options) {
  const { verificationType, verificationCode, waitForVerification, totpSecret, log } = options;
  if (verificationType === 'captcha') {
    const captchaInfo = await _detectCaptcha(page);
    const token = captchaInfo ? await _solveCaptchaExternal(captchaInfo, page.url(), log) : null;
    if (token) {
      await _injectCaptchaToken(page, captchaInfo, token, log);
      await page.keyboard.press('Enter');
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      log('CAPTCHA solved and submitted', 'success');
    } else {
      log('CAPTCHA — manual intervention required (set CAPTCHA_API_KEY env var for auto-solve)', 'warn');
    }
    return;
  }

  let code = verificationCode;
  // Auto-generate TOTP if a secret is available — no manual code entry needed
  if (!code && verificationType === 'totp' && totpSecret) {
    try {
      code = _generateTotp(totpSecret);
      log(`Auto-generated TOTP code: ${code}`);
    } catch (err) {
      log(`TOTP generation failed: ${err.message} — falling back to manual entry`, 'warn');
    }
  }
  if (!code) { code = await waitForVerification(); }
  if (!code) { log('No verification code — skipping', 'warn'); return; }

  const selectors = [
    'input[autocomplete="one-time-code"]',
    'input[name*="code" i]', 'input[name*="otp" i]',
    'input[placeholder*="code" i]',
    'input[type="number"][maxlength="6"]',
    'input[type="tel"][maxlength="6"]',
  ];

  let filled = false;
  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel, { timeout: 5000 });
      await page.fill(sel, code.toString());
      filled = true;
      break;
    } catch {}
  }
  if (!filled) {
    await page.evaluate((c) => {
      const el = [...document.querySelectorAll('input')].find(i => i.offsetParent !== null);
      if (el) { el.value = c; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }, code.toString());
  }

  await page.keyboard.press('Enter');
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  log('Verification submitted');
}

module.exports = {
  handleAuth,
  handleOAuth: _handleOAuth,
  _detectCaptcha,
  _solveCaptchaExternal,
  _injectCaptchaToken,
  _findOAuthButton,
  _handleOAuth,
  handleVerification,
  detectVerificationType,
  _generateTotp,
};
