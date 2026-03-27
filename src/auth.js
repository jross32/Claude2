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
    'button[class*="login" i]',
    'button[class*="signin" i]',
    '[data-testid*="login" i]',
    '[data-testid*="signin" i]',
    'form button',
  ];

  // Fill username
  if (username) {
    let filledUser = false;
    for (const sel of usernameSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        await page.click(sel, { clickCount: 3 });
        await page.type(sel, username, { delay: 50 });
        log(`Filled username field: ${sel}`);
        filledUser = true;
        break;
      } catch {}
    }
    if (!filledUser) {
      log('Could not find username field - may already be logged in or different auth flow', 'warn');
    }
  }

  // Fill password
  let filledPassword = false;
  for (const sel of passwordSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 3000 });
      await page.click(sel, { clickCount: 3 });
      await page.type(sel, password, { delay: 50 });
      log(`Filled password field: ${sel}`);
      filledPassword = true;
      break;
    } catch {}
  }

  if (!filledPassword) {
    log('Could not find password field', 'warn');
    return;
  }

  // Submit form
  let submitted = false;
  for (const sel of submitSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 2000 });
      await page.click(sel);
      log(`Clicked submit: ${sel}`);
      submitted = true;
      break;
    } catch {}
  }

  if (!submitted) {
    // Try pressing Enter in the password field
    await page.keyboard.press('Enter');
    log('Submitted via Enter key');
  }

  // Wait briefly for page response
  await delay(2000);

  // Handle verification step
  if (verificationType && verificationType !== 'none') {
    await handleVerification(page, { verificationType, verificationCode, waitForVerification, log });
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
    log(
      'CAPTCHA detected. Automated CAPTCHA solving is not supported - manual intervention required.',
      'warn'
    );
    // Notify UI to show captcha warning
    return;
  }

  // For TOTP, email code, or SMS - get the code
  let code = verificationCode;

  if (!code) {
    // Ask user to provide code via UI
    log('Waiting for verification code from user...', 'info');
    code = await waitForVerification();
  }

  if (!code) {
    log('No verification code provided - skipping', 'warn');
    return;
  }

  // Wait for code input to appear
  await delay(1500);

  let filledCode = false;
  for (const sel of codeInputSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 5000 });
      await page.click(sel, { clickCount: 3 });
      await page.type(sel, code.toString(), { delay: 80 });
      log(`Entered verification code in: ${sel}`);
      filledCode = true;
      break;
    } catch {}
  }

  if (!filledCode) {
    // Try finding any visible text input that appeared after login
    try {
      await page.evaluate((codeStr) => {
        const inputs = document.querySelectorAll('input[type="text"], input[type="number"], input[type="tel"]');
        for (const input of inputs) {
          if (input.offsetParent !== null) {
            input.value = codeStr;
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
    // Submit verification
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
