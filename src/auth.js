/**
 * Authentication handler for web scraper.
 * Handles single-step and multi-step (email → password) login flows.
 * Supports: standard login, TOTP/2FA, email code, SMS code, captcha warning.
 */
async function handleAuth(page, options) {
  const { username, password, verificationCode, waitForVerification, log } = options;

  // Helper: fill a field reliably (works with React/Vue/Angular synthetic events)
  async function fillField(sel, value) {
    await page.waitForSelector(sel, { timeout: 5000, state: 'visible' });
    await page.focus(sel);
    await page.fill(sel, '');
    await page.fill(sel, value);
    await page.evaluate((selector, val) => {
      const el = document.querySelector(selector);
      if (!el) return;
      const nv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      nv.set.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, sel, value);
  }

  // Helper: is a selector visible right now (no waiting)
  async function isVisible(sel) {
    try {
      return await page.isVisible(sel);
    } catch { return false; }
  }

  // Helper: click the submit button, avoiding "Forgot Password" / destructive links
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
      '[data-testid*="signin" i]',
      'form button[type="submit"]',
      'form button',
    ];

    for (const sel of candidates) {
      try {
        const els = await page.$$(sel);
        for (const el of els) {
          if (!await el.isVisible()) continue;
          const text = (await el.textContent() || '').toLowerCase();
          // Skip destructive / secondary actions
          if (/forgot|reset|cancel|back|register|sign.?up|create/i.test(text)) continue;
          await el.click();
          log(`Clicked submit: ${sel} ("${text.trim()}")`);
          return true;
        }
      } catch {}
    }
    // Last resort: Enter key
    await page.keyboard.press('Enter');
    log('Submitted via Enter key');
    return true;
  }

  const usernameSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="username"]',
    'input[name="user"]',
    'input[name="login"]',
    'input[id*="email" i]',
    'input[id*="username" i]',
    'input[placeholder*="email" i]',
    'input[placeholder*="username" i]',
    'input[autocomplete="username"]',
    'input[autocomplete="email"]',
  ];

  const passwordSelectors = [
    'input[type="password"]',
    'input[name="password"]',
    'input[id*="password" i]',
  ];

  // ── Step 1: fill username ──────────────────────────────────────────────────
  if (username) {
    let filled = false;
    for (const sel of usernameSelectors) {
      try {
        await fillField(sel, username);
        log(`Filled username: ${sel}`);
        filled = true;
        break;
      } catch {}
    }
    if (!filled) {
      // DOM fallback: first visible text/email input
      try {
        const found = await page.evaluate((val) => {
          const inputs = [...document.querySelectorAll('input[type="text"],input[type="email"],input:not([type])')];
          const el = inputs.find(i => i.offsetParent !== null && !i.readOnly && !i.disabled);
          if (!el) return false;
          const nv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
          nv.set.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }, username);
        if (found) { log('Filled username via DOM fallback', 'warn'); filled = true; }
      } catch {}
    }
    if (!filled) { log('Could not find username field', 'warn'); }
  }

  await delay(400);

  // ── Check if password field is already visible (single-step form) ──────────
  let passwordVisible = false;
  for (const sel of passwordSelectors) {
    if (await isVisible(sel)) { passwordVisible = true; break; }
  }

  // ── If password not visible, this is a multi-step form — submit email first ─
  if (!passwordVisible) {
    log('Password field not visible — submitting email step first...');
    await clickSubmit();
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await delay(800);

    // Handle any "Continue to …" page that appears
    await clickContinueIfPresent(page, log);

    // Wait for password field to appear
    for (const sel of passwordSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 8000, state: 'visible' });
        passwordVisible = true;
        log('Password field appeared after email step');
        break;
      } catch {}
    }
  }

  // ── Step 2: fill password ──────────────────────────────────────────────────
  if (!passwordVisible) {
    log('Could not find password field after email step', 'warn');
    return;
  }

  let filledPassword = false;
  for (const sel of passwordSelectors) {
    try {
      await fillField(sel, password);
      log(`Filled password: ${sel}`);
      filledPassword = true;
      break;
    } catch {}
  }

  if (!filledPassword) {
    log('Could not fill password field', 'warn');
    return;
  }

  await delay(400);

  // ── Step 3: submit password ────────────────────────────────────────────────
  await clickSubmit();
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await delay(800);

  // Handle any "Continue to …" confirmation page
  await clickContinueIfPresent(page, log);

  // ── Auto-detect and handle 2FA / verification ──────────────────────────────
  const detectedType = await detectVerificationType(page);
  if (detectedType && detectedType !== 'none') {
    log(`Auto-detected verification type: ${detectedType}`, 'info');
    await handleVerification(page, { verificationType: detectedType, verificationCode, waitForVerification, log });
  }
}

async function clickContinueIfPresent(page, log) {
  const selectors = [
    'button:has-text("Continue")',
    'button:has-text("Proceed")',
    'button:has-text("Accept")',
    'button:has-text("Allow")',
    'a:has-text("Continue")',
    'input[value*="Continue" i]',
  ];
  for (const sel of selectors) {
    try {
      const el = await page.waitForSelector(sel, { timeout: 3000, state: 'visible' });
      if (el) {
        await el.click();
        log(`Clicked confirmation: ${sel}`);
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        await delay(500);
        await clickContinueIfPresent(page, log); // handle chained steps
        return;
      }
    } catch {}
  }
}

async function detectVerificationType(page) {
  try {
    return await page.evaluate(() => {
      const body = document.body?.innerText?.toLowerCase() || '';
      const inputs = [...document.querySelectorAll('input')];
      const hasCodeInput = inputs.some(el =>
        el.offsetParent !== null && (
          /otp|code|token|verify|2fa/i.test(el.name + el.id + el.placeholder + (el.autocomplete || '')) ||
          (el.type === 'number' && el.maxLength <= 8) ||
          el.autocomplete === 'one-time-code'
        )
      );
      if (!hasCodeInput) return 'none';
      if (/captcha/i.test(body)) return 'captcha';
      if (/authenticator|totp|google auth|authy/i.test(body)) return 'totp';
      if (/sent.*email|email.*code|check your email/i.test(body)) return 'email';
      if (/text message|sms|phone number/i.test(body)) return 'sms';
      return 'totp';
    });
  } catch { return 'none'; }
}

async function handleVerification(page, options) {
  const { verificationType, verificationCode, waitForVerification, log } = options;
  log(`Handling verification: ${verificationType}`);

  if (verificationType === 'captcha') {
    log('CAPTCHA detected — manual intervention required', 'warn');
    return;
  }

  let code = verificationCode;
  if (!code) {
    log('Waiting for verification code from user...', 'info');
    code = await waitForVerification();
  }
  if (!code) { log('No verification code provided — skipping', 'warn'); return; }

  await delay(1000);

  const codeSelectors = [
    'input[autocomplete="one-time-code"]',
    'input[name*="code" i]',
    'input[name*="otp" i]',
    'input[name*="token" i]',
    'input[placeholder*="code" i]',
    'input[type="number"][maxlength="6"]',
    'input[type="tel"][maxlength="6"]',
  ];

  let filled = false;
  for (const sel of codeSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 5000 });
      await page.fill(sel, code.toString());
      log(`Entered code in: ${sel}`);
      filled = true;
      break;
    } catch {}
  }

  if (!filled) {
    await page.evaluate((c) => {
      const inputs = [...document.querySelectorAll('input[type="text"],input[type="number"],input[type="tel"]')];
      const el = inputs.find(i => i.offsetParent !== null);
      if (el) { el.value = c; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }, code.toString());
  }

  await page.keyboard.press('Enter');
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  log('Verification submitted');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { handleAuth };
