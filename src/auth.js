/**
 * Authentication handler for web scraper.
 * Supports: standard login, TOTP/2FA, email code, SMS code, captcha warning.
 */
async function handleAuth(page, options) {
  const { username, password, verificationType, verificationCode, waitForVerification, log } = options;

  // Common login field selectors
  const usernameSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="username"]',
    'input[name="user"]',
    'input[name="login"]',
    'input[id*="email" i]',
    'input[id*="username" i]',
    'input[id*="user" i]',
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

  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button[id*="login" i]',
    'button[id*="signin" i]',
    'button[id*="sign-in" i]',
    'button[class*="login" i]',
    'button[class*="signin" i]',
    '[data-testid*="login" i]',
    '[data-testid*="signin" i]',
    'form button',
  ];

  // Helper: fill a field reliably (works with React/Vue/Angular)
  async function fillField(sel, value) {
    await page.waitForSelector(sel, { timeout: 5000, state: 'visible' });
    await page.click(sel, { clickCount: 3 });
    await page.fill(sel, value);
    // Trigger React synthetic events
    await page.evaluate((selector, val) => {
      const el = document.querySelector(selector);
      if (!el) return;
      const nativeInput = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      nativeInput.set.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, sel, value);
  }

  // Fill username
  if (username) {
    let filledUser = false;
    for (const sel of usernameSelectors) {
      try {
        await fillField(sel, username);
        log(`Filled username field: ${sel}`);
        filledUser = true;
        break;
      } catch {}
    }
    if (!filledUser) {
      // Last resort: find any visible text/email input
      try {
        await page.evaluate((val) => {
          const inputs = [...document.querySelectorAll('input[type="text"], input[type="email"]')];
          const visible = inputs.find(el => el.offsetParent !== null && !el.readOnly);
          if (visible) {
            const nv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
            nv.set.call(visible, val);
            visible.dispatchEvent(new Event('input', { bubbles: true }));
            visible.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, username);
        log('Filled username via DOM fallback', 'warn');
        filledUser = true;
      } catch {}
    }
    if (!filledUser) log('Could not find username field', 'warn');
  }

  await delay(300);

  // Fill password
  let filledPassword = false;
  for (const sel of passwordSelectors) {
    try {
      await fillField(sel, password);
      log(`Filled password field: ${sel}`);
      filledPassword = true;
      break;
    } catch {}
  }

  if (!filledPassword) {
    log('Could not find password field', 'warn');
    return;
  }

  await delay(300);

  // Submit form
  let submitted = false;
  for (const sel of submitSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 2000, state: 'visible' });
      await page.click(sel);
      log(`Clicked submit: ${sel}`);
      submitted = true;
      break;
    } catch {}
  }

  if (!submitted) {
    await page.keyboard.press('Enter');
    log('Submitted via Enter key');
  }

  // Wait for navigation/response
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await delay(1000);

  // Handle intermediate "Continue" / account-confirmation pages (e.g. APA SSO)
  await clickContinueIfPresent(page, log);

  // Auto-detect and handle verification / 2FA if it appeared after login
  const detectedType = await detectVerificationType(page);
  if (detectedType && detectedType !== 'none') {
    log(`Auto-detected verification type: ${detectedType}`, 'info');
    await handleVerification(page, { verificationType: detectedType, verificationCode, waitForVerification, log });
  } else if (verificationType && verificationType !== 'none' && verificationType !== 'auto') {
    // Fallback: use explicitly passed type if provided
    await handleVerification(page, { verificationType, verificationCode, waitForVerification, log });
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
      if (hasCodeInput) return 'totp'; // generic code input — treat as TOTP/code
      return 'none';
    });
  } catch { return 'none'; }
}

async function clickContinueIfPresent(page, log) {
  // Selectors that match "Continue", "Proceed", "Accept" style confirmation buttons
  const continueSelectors = [
    'button:has-text("Continue")',
    'button:has-text("Proceed")',
    'button:has-text("Accept")',
    'button:has-text("Allow")',
    'a:has-text("Continue")',
    'input[value*="Continue" i]',
    'input[value*="Proceed" i]',
    '[type="submit"][value*="Continue" i]',
  ];

  for (const sel of continueSelectors) {
    try {
      const el = await page.waitForSelector(sel, { timeout: 3000, state: 'visible' });
      if (el) {
        await el.click();
        log(`Clicked intermediate continue button: ${sel}`);
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        await delay(500);
        // Check again in case there are multiple confirmation steps
        await clickContinueIfPresent(page, log);
        return;
      }
    } catch {}
  }
}

async function handleVerification(page, options) {
  const { verificationType, verificationCode, waitForVerification, log } = options;

  log(`Handling verification type: ${verificationType}`);

  const codeInputSelectors = [
    'input[name*="code" i]',
    'input[name*="otp" i]',
    'input[name*="token" i]',
    'input[name*="verify" i]',
    'input[placeholder*="code" i]',
    'input[placeholder*="otp" i]',
    'input[type="number"][maxlength="6"]',
    'input[type="tel"][maxlength="6"]',
    'input[autocomplete="one-time-code"]',
    'input[data-testid*="otp" i]',
    'input[data-testid*="code" i]',
  ];

  if (verificationType === 'captcha') {
    log('CAPTCHA detected. Automated CAPTCHA solving is not supported - manual intervention required.', 'warn');
    return;
  }

  let code = verificationCode;
  if (!code) {
    log('Waiting for verification code from user...', 'info');
    code = await waitForVerification();
  }

  if (!code) {
    log('No verification code provided - skipping', 'warn');
    return;
  }

  await delay(1500);

  let filledCode = false;
  for (const sel of codeInputSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 5000 });
      await page.fill(sel, code.toString());
      log(`Entered verification code in: ${sel}`);
      filledCode = true;
      break;
    } catch {}
  }

  if (!filledCode) {
    try {
      await page.evaluate((codeStr) => {
        const inputs = document.querySelectorAll('input[type="text"], input[type="number"], input[type="tel"]');
        for (const input of inputs) {
          if (input.offsetParent !== null) {
            const nv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
            nv.set.call(input, codeStr);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
        return false;
      }, code.toString());
      log('Entered verification code via DOM evaluation');
      filledCode = true;
    } catch {}
  }

  if (filledCode) {
    const submitSelectors = [
      'button[type="submit"]',
      'button[id*="verify" i]',
      'button[class*="verify" i]',
      'button[id*="confirm" i]',
      'form button',
    ];

    for (const sel of submitSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 2000 });
        await page.click(sel);
        log(`Submitted verification via: ${sel}`);
        break;
      } catch {}
    }

    await page.keyboard.press('Enter');
    await delay(2000);
    log('Verification submitted');
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { handleAuth };
