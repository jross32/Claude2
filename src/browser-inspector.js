'use strict';

const crypto = require('crypto');

function shortText(value, max = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function hashToken(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 16);
}

function buildStableElementId(element, index) {
  const selector = element.preferredSelector || element.selectorCandidates?.[0] || '';
  const label = element.label || element.text || element.placeholder || '';
  return `el_${hashToken([selector, element.tag, element.role, label, index].join('|'))}`;
}

async function inspectPage(page, options = {}) {
  const maxInteractables = Number.isFinite(options.maxInteractables) ? options.maxInteractables : 80;
  const maxForms = Number.isFinite(options.maxForms) ? options.maxForms : 10;

  const raw = await page.evaluate(({ maxInteractables: limit, maxForms: formLimit }) => {
    const textCap = (value, max = 240) => {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      if (text.length <= max) return text;
      return `${text.slice(0, Math.max(0, max - 3))}...`;
    };

    const isVisible = (el) => {
      if (!el || !(el instanceof Element)) return false;
      const style = window.getComputedStyle(el);
      if (!style) return false;
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') === 0) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      return rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
    };

    const getElementLabel = (el) => {
      if (!el) return '';
      const aria = el.getAttribute('aria-label');
      if (aria) return textCap(aria, 180);

      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        if (el.labels?.length) {
          const labelText = Array.from(el.labels).map((node) => node.textContent || '').join(' ').trim();
          if (labelText) return textCap(labelText, 180);
        }
        const placeholder = el.getAttribute('placeholder');
        if (placeholder) return textCap(placeholder, 180);
        if (el.name) return textCap(el.name, 180);
      }

      const text = el.innerText || el.textContent || '';
      if (text.trim()) return textCap(text, 180);

      if (el.id) return textCap(el.id, 180);
      return '';
    };

    const pushCandidate = (arr, selector) => {
      if (!selector || arr.includes(selector)) return;
      try {
        if (document.querySelectorAll(selector).length === 1) arr.push(selector);
      } catch {}
    };

    const nthSelector = (el) => {
      const parts = [];
      let cursor = el;
      while (cursor && cursor.nodeType === Node.ELEMENT_NODE && cursor !== document.body && parts.length < 5) {
        const tag = cursor.tagName.toLowerCase();
        if (cursor.id) {
          parts.unshift(`#${CSS.escape(cursor.id)}`);
          return parts.join(' > ');
        }
        const parent = cursor.parentElement;
        if (!parent) break;
        const siblings = Array.from(parent.children).filter((node) => node.tagName === cursor.tagName);
        const index = siblings.indexOf(cursor) + 1;
        parts.unshift(`${tag}:nth-of-type(${Math.max(1, index)})`);
        cursor = parent;
      }
      return parts.join(' > ');
    };

    const selectorCandidates = (el) => {
      const list = [];
      if (!(el instanceof Element)) return list;

      const tag = el.tagName.toLowerCase();
      if (el.id) pushCandidate(list, `#${CSS.escape(el.id)}`);
      const name = el.getAttribute('name');
      if (name) pushCandidate(list, `${tag}[name="${CSS.escape(name)}"]`);
      const testId = el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-qa');
      if (testId) pushCandidate(list, `${tag}[data-testid="${CSS.escape(testId)}"]`);
      const aria = el.getAttribute('aria-label');
      if (aria) pushCandidate(list, `${tag}[aria-label="${CSS.escape(aria)}"]`);
      const placeholder = el.getAttribute('placeholder');
      if (placeholder) pushCandidate(list, `${tag}[placeholder="${CSS.escape(placeholder)}"]`);
      const role = el.getAttribute('role');
      if (role) pushCandidate(list, `${tag}[role="${CSS.escape(role)}"]`);
      const href = el.getAttribute('href');
      if (href && href.length < 160) pushCandidate(list, `${tag}[href="${CSS.escape(href)}"]`);

      const nth = nthSelector(el);
      if (nth) list.push(nth);
      return list.slice(0, 5);
    };

    const buildFormField = (field) => {
      const type = field.getAttribute('type') || field.tagName.toLowerCase();
      const value = field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement
        ? field.value
        : '';
      return {
        name: field.getAttribute('name') || '',
        type,
        label: getElementLabel(field),
        placeholder: field.getAttribute('placeholder') || '',
        selectorCandidates: selectorCandidates(field),
        preferredSelector: selectorCandidates(field)[0] || null,
        valuePreview: /password/i.test(type) ? '[redacted]' : textCap(value, 120),
      };
    };

    const forms = Array.from(document.forms)
      .filter((form) => isVisible(form))
      .slice(0, formLimit)
      .map((form, index) => {
        const fields = Array.from(form.querySelectorAll('input, select, textarea'))
          .filter((field) => isVisible(field))
          .slice(0, 12)
          .map(buildFormField);
        return {
          formId: form.id || `form-${index + 1}`,
          action: form.getAttribute('action') || '',
          method: (form.getAttribute('method') || 'GET').toUpperCase(),
          fieldCount: fields.length,
          fields,
        };
      });

    const interactableSelector = [
      'a[href]',
      'button',
      'input',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[role="option"]',
      '[tabindex]',
    ].join(',');

    const seenKeys = new Set();
    const interactables = [];
    for (const el of Array.from(document.querySelectorAll(interactableSelector))) {
      if (!isVisible(el)) continue;
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role') || '';
      const type = el.getAttribute('type') || '';
      const text = textCap(el.innerText || el.textContent || el.value || '', 200);
      const label = getElementLabel(el);
      const selectors = selectorCandidates(el);
      const preferredSelector = selectors[0] || null;
      const key = `${tag}|${role}|${preferredSelector || label || text}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const rect = el.getBoundingClientRect();
      const actions = [];
      if (tag === 'select') actions.push('select');
      else if (tag === 'input' || tag === 'textarea') {
        if (!/button|submit|checkbox|radio|file/i.test(type)) actions.push('type');
        if (/checkbox|radio|submit|button/i.test(type)) actions.push('click');
      } else {
        actions.push('click');
      }

      interactables.push({
        index: interactables.length,
        tag,
        type,
        role,
        label,
        text,
        name: el.getAttribute('name') || '',
        placeholder: el.getAttribute('placeholder') || '',
        href: el.getAttribute('href') || '',
        selectorCandidates: selectors,
        preferredSelector,
        actions,
        rect: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });

      if (interactables.length >= limit) break;
    }

    const bodyText = textCap(document.body?.innerText || '', 1200);
    const warnings = [];
    if (document.querySelector('input[type="password"]')) warnings.push('Login form detected');
    if (document.querySelector('.g-recaptcha, .h-captcha, .cf-turnstile, [data-sitekey]')) warnings.push('CAPTCHA or anti-bot challenge detected');
    if ((document.body?.innerText || '').match(/access denied|forbidden|verify you are human|checking your browser/i)) {
      warnings.push('Page content suggests an anti-bot interstitial or blocked request');
    }

    const frames = Array.from(document.querySelectorAll('iframe')).slice(0, 10).map((frame, index) => ({
      index,
      name: frame.getAttribute('name') || '',
      src: frame.getAttribute('src') || '',
      title: frame.getAttribute('title') || '',
    }));

    const resourceEntries = Array.from(performance.getEntriesByType('resource') || []);
    const recentRequests = resourceEntries.slice(-20).map((entry) => ({
      name: entry.name,
      type: entry.initiatorType || 'other',
      durationMs: Math.round(entry.duration || 0),
    }));

    return {
      url: window.location.href,
      title: document.title || '',
      visibleTextSummary: bodyText,
      textLength: (document.body?.innerText || '').trim().length,
      forms,
      interactables,
      warnings,
      frameSummary: {
        totalFrames: frames.length,
        frames,
      },
      networkSummary: {
        resourceCount: resourceEntries.length,
        recentRequests,
      },
      pageChangeBase: [
        window.location.href,
        document.title || '',
        (document.body?.innerText || '').trim().length,
        interactables.length,
        forms.length,
      ].join('|'),
    };
  }, { maxInteractables, maxForms });

  const elementMap = new Map();
  const interactables = (raw.interactables || []).map((element, index) => {
    const elementId = buildStableElementId(element, index);
    const enriched = {
      ...element,
      elementId,
    };
    elementMap.set(elementId, {
      preferredSelector: element.preferredSelector || null,
      selectorCandidates: Array.isArray(element.selectorCandidates) ? element.selectorCandidates : [],
      actions: Array.isArray(element.actions) ? element.actions : [],
      rect: element.rect || null,
      label: element.label || element.text || '',
    });
    return enriched;
  });

  return {
    snapshot: {
      browserSessionId: null,
      url: raw.url,
      title: raw.title,
      visibleTextSummary: raw.visibleTextSummary,
      forms: raw.forms || [],
      interactables,
      warnings: raw.warnings || [],
      frameSummary: raw.frameSummary || { totalFrames: 0, frames: [] },
      networkSummary: raw.networkSummary || { resourceCount: 0, recentRequests: [] },
      pageChangeToken: hashToken(raw.pageChangeBase || `${raw.url}|${raw.title}`),
    },
    elementMap,
  };
}

module.exports = {
  buildStableElementId,
  hashToken,
  inspectPage,
  shortText,
};
