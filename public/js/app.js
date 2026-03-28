/* =====================================================
   WebScraper Pro — Frontend Application
   ===================================================== */

// Inject URL input dynamically so Chrome's autofill scanner never registers it
(function () {
  const slot = document.getElementById('url-input-slot');
  if (!slot) return;
  const inp = document.createElement('input');
  inp.id = 'url';
  inp.type = 'text';
  inp.placeholder = 'https://example.com';
  inp.style.width = '100%';
  // All known autofill-blocking attributes
  inp.setAttribute('autocomplete', 'off');
  inp.setAttribute('data-lpignore', 'true');
  inp.setAttribute('data-form-type', 'other');
  inp.setAttribute('data-1p-ignore', 'true');
  inp.setAttribute('autocorrect', 'off');
  inp.setAttribute('autocapitalize', 'off');
  inp.setAttribute('spellcheck', 'false');
  slot.appendChild(inp);
})();

let ws = null;
let currentSessionId = null;
let scrapedData = null;

// ---- WebSocket ----
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.sessionId !== currentSessionId) return;
      handleWSMessage(msg);
    } catch {}
  };

  ws.onclose = () => setTimeout(connectWS, 2000);
  ws.onerror = () => ws.close();
}

function handleWSMessage(msg) {
  switch (msg.type) {
    case 'log':
      appendLog(msg.message, msg.level);
      break;
    case 'progress':
      updateProgress(msg.step, msg.percent);
      break;
    case 'siteInfo':
      updateSitePreview(msg.data);
      break;
    case 'needsAuth':
      showMidAuthPrompt();
      break;
    case 'needVerification':
      showVerificationPrompt();
      break;
    case 'liveFrame':
      updateLiveFrame(msg.dataUrl);
      break;
    case 'sessionSaved':
      document.getElementById('session-badge').style.display = 'flex';
      showToast(`Session saved for ${msg.hostname}`);
      break;
    case 'complete':
      onScrapeComplete(msg.data);
      break;
    case 'error':
      onScrapeError(msg.message);
      break;
  }
}

// ---- Navigation ----
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    const panelId = `panel-${btn.dataset.panel}`;
    document.getElementById(panelId)?.classList.add('active');
  });
});

// ---- Auth toggle ----
// Auth section is shown automatically when a login form is detected — no manual toggle

// ---- Presets ----
const PRESETS_KEY = 'wsp_presets';

function getPresets() {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]'); } catch { return []; }
}
function savePresets(list) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(list));
}

function renderPresets() {
  const list = getPresets();
  const container = document.getElementById('presets-list');
  const empty = document.getElementById('presets-empty');
  if (list.length === 0) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  // Remove existing preset cards (not the empty msg)
  container.querySelectorAll('.preset-item').forEach(el => el.remove());
  list.forEach((preset, idx) => {
    const card = document.createElement('div');
    card.className = 'preset-item';
    card.dataset.idx = idx;
    const faviconUrl = preset.url ? `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(new URL(preset.url).hostname)}` : '';
    card.innerHTML = `
      <div class="preset-item-main" data-idx="${idx}">
        ${faviconUrl ? `<img class="preset-favicon" src="${escapeHTML(faviconUrl)}" alt="" onerror="this.style.display='none'" />` : '<span class="preset-favicon-placeholder">&#127760;</span>'}
        <div class="preset-item-info">
          <span class="preset-item-name">${escapeHTML(preset.name)}</span>
          <span class="preset-item-url">${escapeHTML(preset.url || '')}</span>
        </div>
        <div class="preset-item-badges">
          ${preset.fullCrawl ? '<span class="preset-badge">Full Crawl</span>' : `<span class="preset-badge">Depth ${preset.scrapeDepth || 1}</span>`}
          ${preset.liveView !== false ? '<span class="preset-badge">Live</span>' : ''}
        </div>
      </div>
      <div class="preset-item-actions">
        <button class="btn-xs preset-edit-btn" data-idx="${idx}" title="Edit">&#9998;</button>
        <button class="btn-xs preset-delete-btn" data-idx="${idx}" title="Delete">&#128465;</button>
      </div>
    `;
    container.appendChild(card);
  });

  // Run on click (main area)
  container.querySelectorAll('.preset-item-main').forEach(el => {
    el.addEventListener('click', () => showPresetConfirm(parseInt(el.dataset.idx)));
  });
  // Edit
  container.querySelectorAll('.preset-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openPresetModal(parseInt(btn.dataset.idx)); });
  });
  // Delete
  container.querySelectorAll('.preset-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const list = getPresets();
      list.splice(parseInt(btn.dataset.idx), 1);
      savePresets(list);
      renderPresets();
    });
  });
}

function openPresetModal(editIdx = -1) {
  const modal = document.getElementById('preset-modal-backdrop');
  const title = document.getElementById('preset-modal-title');
  if (editIdx >= 0) {
    const p = getPresets()[editIdx];
    title.textContent = '✎ Edit Preset';
    document.getElementById('preset-name').value = p.name || '';
    document.getElementById('preset-url').value = p.url || '';
    document.getElementById('preset-depth').value = p.scrapeDepth || 1;
    document.getElementById('preset-graphql').checked = p.captureGraphQL !== false;
    document.getElementById('preset-rest').checked = p.captureREST !== false;
    document.getElementById('preset-assets').checked = p.captureAssets !== false;
    document.getElementById('preset-scroll').checked = p.autoScroll !== false;
    document.getElementById('preset-fullcrawl').checked = !!p.fullCrawl;
    document.getElementById('preset-liveview').checked = p.liveView !== false;
    document.getElementById('preset-maxpages').value = p.maxPages || 100;
    document.getElementById('preset-maxpages-field').style.display = p.fullCrawl ? 'block' : 'none';
    document.getElementById('btn-preset-save').dataset.editIdx = editIdx;
  } else {
    title.textContent = '★ Save Scrape Preset';
    // Pre-fill from current form values
    document.getElementById('preset-name').value = '';
    document.getElementById('preset-url').value = document.getElementById('url').value || '';
    document.getElementById('preset-depth').value = document.getElementById('scrape-depth').value;
    document.getElementById('preset-graphql').checked = document.getElementById('capture-graphql').checked;
    document.getElementById('preset-rest').checked = document.getElementById('capture-rest').checked;
    document.getElementById('preset-assets').checked = document.getElementById('capture-assets').checked;
    document.getElementById('preset-scroll').checked = document.getElementById('auto-scroll').checked;
    document.getElementById('preset-fullcrawl').checked = document.getElementById('full-crawl').checked;
    document.getElementById('preset-liveview').checked = document.getElementById('live-view').value === 'true';
    document.getElementById('preset-maxpages').value = document.getElementById('max-pages').value || 100;
    document.getElementById('preset-maxpages-field').style.display = document.getElementById('full-crawl').checked ? 'block' : 'none';
    delete document.getElementById('btn-preset-save').dataset.editIdx;
  }
  modal.style.display = 'flex';
  document.getElementById('preset-name').focus();
}

function closePresetModal() {
  document.getElementById('preset-modal-backdrop').style.display = 'none';
}

document.getElementById('btn-new-preset').addEventListener('click', () => openPresetModal());
document.getElementById('btn-preset-modal-close').addEventListener('click', closePresetModal);
document.getElementById('btn-preset-cancel').addEventListener('click', closePresetModal);
document.getElementById('preset-modal-backdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) closePresetModal(); });

document.getElementById('preset-fullcrawl').addEventListener('change', function () {
  document.getElementById('preset-maxpages-field').style.display = this.checked ? 'block' : 'none';
});

document.getElementById('btn-preset-save').addEventListener('click', () => {
  const name = document.getElementById('preset-name').value.trim();
  const url  = document.getElementById('preset-url').value.trim();
  if (!name) { document.getElementById('preset-name').focus(); return; }
  if (!url)  { document.getElementById('preset-url').focus(); return; }
  const preset = {
    name, url,
    scrapeDepth: parseInt(document.getElementById('preset-depth').value),
    captureGraphQL: document.getElementById('preset-graphql').checked,
    captureREST: document.getElementById('preset-rest').checked,
    captureAssets: document.getElementById('preset-assets').checked,
    autoScroll: document.getElementById('preset-scroll').checked,
    fullCrawl: document.getElementById('preset-fullcrawl').checked,
    liveView: document.getElementById('preset-liveview').checked,
    maxPages: parseInt(document.getElementById('preset-maxpages').value) || 100,
    favicon: url ? `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(new URL(url).hostname)}` : '',
  };
  const list = getPresets();
  const editIdx = document.getElementById('btn-preset-save').dataset.editIdx;
  if (editIdx !== undefined) list[parseInt(editIdx)] = preset;
  else list.push(preset);
  savePresets(list);
  renderPresets();
  closePresetModal();
  showToast(`Preset "${name}" saved`);
});

let _pendingPresetIdx = -1;
function showPresetConfirm(idx) {
  const preset = getPresets()[idx];
  if (!preset) return;
  _pendingPresetIdx = idx;
  const info = document.getElementById('preset-confirm-info');
  const faviconUrl = preset.favicon || (preset.url ? `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(new URL(preset.url).hostname)}` : '');
  info.innerHTML = `
    <div class="preset-confirm-row">
      ${faviconUrl ? `<img class="preset-favicon" src="${escapeHTML(faviconUrl)}" alt="" onerror="this.style.display='none'" />` : ''}
      <div>
        <div class="preset-confirm-name">${escapeHTML(preset.name)}</div>
        <div class="preset-confirm-url">${escapeHTML(preset.url)}</div>
      </div>
    </div>
    <div class="preset-confirm-tags">
      ${preset.fullCrawl ? '<span class="preset-badge">Full Crawl</span>' : `<span class="preset-badge">Depth ${preset.scrapeDepth}</span>`}
      ${preset.captureGraphQL ? '<span class="preset-badge">GraphQL</span>' : ''}
      ${preset.captureREST ? '<span class="preset-badge">REST</span>' : ''}
      ${preset.liveView !== false ? '<span class="preset-badge">Live View</span>' : '<span class="preset-badge">Headless</span>'}
    </div>
  `;
  document.getElementById('preset-confirm-backdrop').style.display = 'flex';
}

document.getElementById('btn-confirm-close').addEventListener('click', () => { document.getElementById('preset-confirm-backdrop').style.display = 'none'; });
document.getElementById('btn-confirm-cancel').addEventListener('click', () => { document.getElementById('preset-confirm-backdrop').style.display = 'none'; });
document.getElementById('preset-confirm-backdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.style.display = 'none'; });

document.getElementById('btn-confirm-run').addEventListener('click', async () => {
  document.getElementById('preset-confirm-backdrop').style.display = 'none';
  const preset = getPresets()[_pendingPresetIdx];
  if (!preset) return;
  // Load preset settings into main form
  document.getElementById('url').value = preset.url;
  document.getElementById('scrape-depth').value = preset.scrapeDepth || 1;
  document.getElementById('capture-graphql').checked = preset.captureGraphQL !== false;
  document.getElementById('capture-rest').checked = preset.captureREST !== false;
  document.getElementById('capture-assets').checked = preset.captureAssets !== false;
  document.getElementById('auto-scroll').checked = preset.autoScroll !== false;
  document.getElementById('full-crawl').checked = !!preset.fullCrawl;
  document.getElementById('max-pages').value = preset.maxPages || 100;
  document.getElementById('max-pages-field').style.display = preset.fullCrawl ? 'block' : 'none';
  // Set live view toggle
  const liveOn = preset.liveView !== false;
  document.getElementById('live-view').value = String(liveOn);
  document.getElementById('live-view-btn').dataset.active = String(liveOn);
  document.getElementById('live-view-btn').classList.toggle('active', liveOn);
  document.getElementById('live-view-label').textContent = liveOn ? 'ON' : 'OFF';
  // Start the scrape
  document.getElementById('btn-scrape').click();
});

// Init presets on load
renderPresets();

// ---- Recent URLs ----
const RECENT_URLS_KEY = 'wsp_recent_urls';
const MAX_RECENT = 10;

function getRecentUrls() {
  try { return JSON.parse(localStorage.getItem(RECENT_URLS_KEY) || '[]'); } catch { return []; }
}

function saveRecentUrl(url) {
  if (!url || !url.startsWith('http')) return;
  let list = getRecentUrls().filter(u => u !== url);
  list.unshift(url);
  if (list.length > MAX_RECENT) list = list.slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_URLS_KEY, JSON.stringify(list));
}

function showRecentUrls(filter) {
  const dropdown = document.getElementById('url-recent-dropdown');
  let list = getRecentUrls();
  if (filter) list = list.filter(u => u.toLowerCase().includes(filter.toLowerCase()));
  if (list.length === 0) { dropdown.style.display = 'none'; return; }

  dropdown.innerHTML = list.map(u => `
    <div class="url-recent-item" data-url="${escapeHTML(u)}">
      <span class="url-recent-icon">&#128339;</span>
      <span class="url-recent-text">${escapeHTML(u)}</span>
      <button class="url-recent-delete" data-url="${escapeHTML(u)}" title="Remove">&#10005;</button>
    </div>
  `).join('');

  dropdown.querySelectorAll('.url-recent-item').forEach(item => {
    item.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('url-recent-delete')) return;
      document.getElementById('url').value = item.dataset.url;
      dropdown.style.display = 'none';
      checkSavedSession(item.dataset.url);
    });
  });
  dropdown.querySelectorAll('.url-recent-delete').forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      let list = getRecentUrls().filter(u => u !== btn.dataset.url);
      localStorage.setItem(RECENT_URLS_KEY, JSON.stringify(list));
      showRecentUrls(document.getElementById('url').value.trim());
    });
  });

  dropdown.style.display = 'block';
}

const urlInput = document.getElementById('url');
urlInput.addEventListener('focus', () => showRecentUrls(urlInput.value.trim()));
urlInput.addEventListener('input', () => showRecentUrls(urlInput.value.trim()));
urlInput.addEventListener('blur', () => setTimeout(() => {
  document.getElementById('url-recent-dropdown').style.display = 'none';
}, 150));

// Auto-fill credentials from .env + check for saved session when URL changes
document.getElementById('url').addEventListener('blur', async () => {
  const url = document.getElementById('url').value.trim();
  if (!url) return;
  try {
    const res = await fetch(`/api/site-credentials?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (data.found) showKnownSiteBadge(data.username);
    else clearKnownSiteBadge();
  } catch {}
  checkSavedSession(url);
});

async function checkSavedSession(url) {
  try {
    const res = await fetch(`/api/session/check?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    document.getElementById('session-badge').style.display = data.exists ? 'flex' : 'none';
  } catch {}
}

document.getElementById('btn-clear-session').addEventListener('click', async () => {
  const url = document.getElementById('url').value.trim();
  if (!url) return;
  await fetch(`/api/session?url=${encodeURIComponent(url)}`, { method: 'DELETE' });
  document.getElementById('session-badge').style.display = 'none';
  showToast('Saved session cleared');
});

function showKnownSiteBadge(username) {
  let badge = document.getElementById('known-creds-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'known-creds-badge';
    badge.className = 'known-creds-badge';
    document.getElementById('url').closest('.url-input-wrap').after(badge);
  }
  badge.innerHTML = `&#10003; Saved credentials found for <strong>${escapeHTML(username)}</strong> — will be used automatically.`;
  badge.style.display = 'flex';
}

function clearKnownSiteBadge() {
  const badge = document.getElementById('known-creds-badge');
  if (badge) badge.style.display = 'none';
}

// ---- Password visibility ----


// ---- Live view toggle ----
document.getElementById('live-view-btn').addEventListener('click', function () {
  const isActive = this.dataset.active === 'true';
  const next = !isActive;
  this.dataset.active = String(next);
  this.classList.toggle('active', next);
  document.getElementById('live-view-label').textContent = next ? 'ON' : 'OFF';
  document.getElementById('live-view').value = String(next);
});

// ---- Depth slider ----
// scrape-depth is now a number input — no slider listener needed

// ---- Detect site ----
document.getElementById('btn-detect').addEventListener('click', async () => {
  const url = document.getElementById('url').value.trim();
  if (!url) return;
  const btn = document.getElementById('btn-detect');
  btn.textContent = '...';
  btn.disabled = true;
  try {
    const res = await fetch(`/api/detect?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    updateSitePreview(data);
  } catch (err) {
    appendLog(`Detection failed: ${err.message}`, 'error');
  } finally {
    btn.textContent = 'Detect';
    btn.disabled = false;
  }
});

// ---- Start scrape ----
document.getElementById('btn-scrape').addEventListener('click', async () => {
  const url = document.getElementById('url').value.trim();
  if (!url) {
    alert('Please enter a URL to scrape.');
    return;
  }

  const payload = {
    url,
    scrapeDepth: parseInt(document.getElementById('scrape-depth').value, 10),
    captureGraphQL: document.getElementById('capture-graphql').checked,
    captureREST: document.getElementById('capture-rest').checked,
    captureAssets: document.getElementById('capture-assets').checked,
    captureAllRequests: document.getElementById('capture-all-requests').checked,
    captureImages: document.getElementById('capture-images').checked,
    autoScroll: document.getElementById('auto-scroll').checked,
    showBrowser: false,
    liveView: document.getElementById('live-view').value === 'true',
    slowMotion: parseInt(document.getElementById('slow-motion').value, 10),
    fullCrawl: document.getElementById('full-crawl').checked,
    maxPages: document.getElementById('full-crawl').checked ? 0 : (parseInt(document.getElementById('max-pages').value, 10) || 100),
  };

  try {
    clearLog();
    showProgress();
    document.getElementById('btn-scrape').style.display = 'none';
    document.getElementById('btn-stop').style.display = 'inline-flex';

    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(await res.text());
    const { sessionId } = await res.json();
    currentSessionId = sessionId;
    saveRecentUrl(url);
    appendLog(`Session started: ${sessionId}`, 'info');
  } catch (err) {
    onScrapeError(err.message);
  }
});

// ---- Stop ----
document.getElementById('btn-stop').addEventListener('click', async () => {
  if (!currentSessionId) return;
  await fetch(`/api/scrape/${currentSessionId}/stop`, { method: 'POST' }).catch(() => {});
  appendLog('Scrape stopped by user.', 'warn');
  resetScrapeUI();
});


// ---- Live credential submit (mid-scrape prompt) ----
document.getElementById('btn-submit-creds').addEventListener('click', async () => {
  const username = document.getElementById('live-username').value.trim();
  const password = document.getElementById('live-password').value;
  if (!username || !password || !currentSessionId) return;
  await fetch(`/api/scrape/${currentSessionId}/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  document.getElementById('live-creds-prompt').style.display = 'none';
  appendLog('Credentials submitted — continuing scrape...', 'info');
});

// ---- Verification submit ----
document.getElementById('btn-submit-code').addEventListener('click', async () => {
  const code = document.getElementById('live-code').value.trim();
  if (!code || !currentSessionId) return;
  await fetch(`/api/scrape/${currentSessionId}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  document.getElementById('verification-prompt').style.display = 'none';
  appendLog('Verification code submitted.', 'info');
});

// ---- Progress helpers ----
function showProgress() {
  document.getElementById('progress-card').style.display = 'flex';
  document.getElementById('progress-card').classList.add('scraping');
  const liveView = document.getElementById('live-view').value === 'true';
  document.getElementById('live-browser-panel').style.display = liveView ? 'block' : 'none';
}

function updateProgress(step, percent) {
  document.getElementById('progress-step').textContent = step;
  document.getElementById('progress-pct').textContent = `${percent}%`;
  document.getElementById('progress-bar').style.width = `${percent}%`;
}

function showVerificationPrompt() {
  document.getElementById('verification-prompt').style.display = 'block';
  document.getElementById('live-code').focus();
}

function appendLog(message, level = 'info') {
  const box = document.getElementById('log-box');
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  const line = document.createElement('div');
  line.className = 'log-entry';
  line.innerHTML = `<span class="log-time">${time}</span><span class="log-msg ${level}">${escapeHTML(message)}</span>`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function clearLog() {
  document.getElementById('log-box').innerHTML = '';
  document.getElementById('live-creds-prompt').style.display = 'none';
  document.getElementById('site-preview').style.display = 'none';
  const errBox = document.getElementById('scrape-error-box');
  if (errBox) errBox.style.display = 'none';
}

function resetScrapeUI() {
  document.getElementById('btn-scrape').style.display = 'inline-flex';
  document.getElementById('btn-stop').style.display = 'none';
  document.getElementById('progress-card').classList.remove('scraping');
  document.getElementById('verification-prompt').style.display = 'none';
  document.getElementById('live-browser-panel').style.display = 'none';
  document.getElementById('live-frame').src = '';
  currentSessionId = null;
}

function updateLiveFrame(dataUrl) {
  if (document.getElementById('live-view').value !== 'true') return;
  const panel = document.getElementById('live-browser-panel');
  if (panel.style.display === 'none') panel.style.display = 'block';
  document.getElementById('live-frame').src = dataUrl;
}

// ---- Site preview ----
function updateSitePreview(info) {
  // Site info strip
  const preview = document.getElementById('site-preview');
  document.getElementById('site-favicon').src = info.favicon || info.logoUrl || '';
  document.getElementById('site-title-preview').textContent = info.title || info.origin;
  document.getElementById('site-url-preview').textContent = info.origin;

  const badges = document.getElementById('site-badges');
  badges.innerHTML = '';
  if (info.hasLoginForm) badges.innerHTML += `<span class="site-badge login">Login Required</span>`;
  if (info.has2FA) badges.innerHTML += `<span class="site-badge fa">2FA</span>`;
  if (info.hasCaptcha) badges.innerHTML += `<span class="site-badge captcha">CAPTCHA</span>`;
  preview.style.display = 'flex';

  if (info.hasLoginForm) {
    appendLog('Login form detected — will authenticate automatically.', 'info');
  }
}

function showMidAuthPrompt() {
  // Shown mid-scrape when login wall is hit without pre-supplied credentials
  document.getElementById('live-creds-prompt').style.display = 'block';
  document.getElementById('live-creds-prompt').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  document.getElementById('live-username').focus();
}

// ---- Scrape complete ----
function onScrapeComplete(data) {
  scrapedData = data;
  resetScrapeUI();
  updateProgress('Complete', 100);
  appendLog('Scraping complete!', 'success');

  renderResults(data);
  renderAPICalls(data.apiCalls);
  renderAssets(data.assets);
  enableRefactor(data);

  // Update badges
  const totalAPIs = (data.apiCalls?.graphql?.length || 0) + (data.apiCalls?.rest?.length || 0);
  if (totalAPIs > 0) {
    const badge = document.getElementById('api-badge');
    badge.textContent = totalAPIs;
    badge.style.display = 'inline-block';
  }

  const resultsBadge = document.getElementById('results-badge');
  resultsBadge.textContent = data.pages?.length || 1;
  resultsBadge.style.display = 'inline-block';

  // Auto-switch to results
  document.querySelector('[data-panel="results"]').click();
}

function onScrapeError(message) {
  appendLog(`Error: ${message}`, 'error');
  resetScrapeUI();
  updateProgress('Error', 0);
  showErrorBox(message);
}

function showErrorBox(message) {
  let box = document.getElementById('scrape-error-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'scrape-error-box';
    box.className = 'scrape-error-box';
    document.getElementById('progress-card').appendChild(box);
  }
  const logLines = [...document.querySelectorAll('#log-box .log-entry')]
    .map(el => el.textContent).join('\n');
  const full = `=== ERROR ===\n${message}\n\n=== FULL LOG ===\n${logLines}`;
  box.innerHTML = `
    <div class="scrape-error-header">
      <span>&#9888; Error — copy log and send to support</span>
      <button class="btn-xs" id="btn-copy-error-log">&#128203; Copy</button>
    </div>
    <pre class="scrape-error-pre" id="scrape-error-pre">${escapeHTML(full)}</pre>
  `;
  box.style.display = 'block';
  document.getElementById('btn-copy-error-log').addEventListener('click', () => {
    navigator.clipboard.writeText(full).then(() => showToast('Copied to clipboard!'));
  });
}

// ---- Results rendering ----
function renderResults(data) {
  document.getElementById('results-empty').style.display = 'none';
  document.getElementById('results-content').style.display = 'block';

  // Summary cards
  const grid = document.getElementById('summary-grid');
  const firstPage = data.pages?.[0];
  grid.innerHTML = '';

  const cards = [
    { label: 'Pages Scraped', value: data.pages?.length || 0 },
    { label: 'DOM Elements', value: firstPage?.domStats?.totalElements || 0 },
    { label: 'Images', value: firstPage?.images?.length || 0 },
    { label: 'Links', value: firstPage?.links?.length || 0 },
    { label: 'GraphQL Calls', value: data.apiCalls?.graphql?.length || 0 },
    { label: 'REST Calls', value: data.apiCalls?.rest?.length || 0 },
    { label: 'All Requests', value: data.apiCalls?.all?.length || 0 },
    { label: 'WebSockets', value: data.websockets?.length || 0 },
    { label: 'Assets', value: data.assets?.length || 0 },
    { label: 'Dl. Images', value: data.downloadedImages?.length || 0 },
    { label: 'Cookies', value: data.cookies?.length || 0 },
    { label: 'Console Logs', value: data.consoleLogs?.length || 0 },
    { label: 'Scripts', value: firstPage?.scripts?.length || 0 },
    { label: 'Forms', value: firstPage?.forms?.length || 0 },
    { label: 'Errors', value: data.errors?.length || 0 },
  ];

  cards.forEach((c) => {
    const card = document.createElement('div');
    card.className = 'summary-card';
    card.innerHTML = `<span class="s-label">${c.label}</span><span class="s-value">${c.value}</span>`;
    grid.appendChild(card);
  });

  // ── Tech fingerprint ──
  const tech = firstPage?.tech;
  if (tech) {
    const techSec = document.getElementById('tech-section');
    const techGrid = document.getElementById('tech-grid');
    techGrid.innerHTML = '';
    const categories = { 'Frameworks': tech.frameworks, 'Analytics': tech.analytics, 'CMS': tech.cms, 'CDN': tech.cdn, 'Other': tech.other };
    let hasTech = false;
    Object.entries(categories).forEach(([cat, items]) => {
      if (!items?.length) return;
      hasTech = true;
      const group = document.createElement('div');
      group.className = 'tech-group';
      group.innerHTML = `<span class="tech-category">${cat}</span>` +
        items.map(t => `<span class="tech-badge">${escapeHTML(t)}</span>`).join('');
      techGrid.appendChild(group);
    });
    techSec.style.display = hasTech ? 'block' : 'none';
  }

  // ── Security headers ──
  if (data.securityHeaders && Object.keys(data.securityHeaders).length > 0) {
    const secSec = document.getElementById('security-section');
    const wrap = document.getElementById('security-table-wrap');
    const headers = data.securityHeaders;
    const important = ['content-security-policy','strict-transport-security','x-frame-options','x-content-type-options','referrer-policy','permissions-policy','server','x-powered-by'];
    const rows = important.map(h => {
      const val = headers[h];
      const present = !!val;
      const isGood = present && !['server','x-powered-by'].includes(h);
      return `<tr>
        <td class="header-name">${h}</td>
        <td class="header-status ${isGood ? 'hdr-good' : (present ? 'hdr-info' : 'hdr-missing')}">${present ? '✓' : '✗'}</td>
        <td class="header-value">${escapeHTML(val || 'Not set')}</td>
      </tr>`;
    }).join('');
    wrap.innerHTML = `<table class="sec-table"><thead><tr><th>Header</th><th>Set</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table>`;
    secSec.style.display = 'block';
  }

  // ── Cookies ──
  if (data.cookies?.length) {
    document.getElementById('cookies-section').style.display = 'block';
    document.getElementById('cookies-badge').textContent = data.cookies.length;
    const wrap = document.getElementById('cookies-table-wrap');
    const rows = data.cookies.map(c => `<tr>
      <td class="cookie-name">${escapeHTML(c.name)}</td>
      <td>${escapeHTML(c.domain || '')}</td>
      <td>${escapeHTML(c.path || '/')}</td>
      <td class="${c.secure ? 'flag-yes' : 'flag-no'}">${c.secure ? '✓' : '✗'}</td>
      <td class="${c.httpOnly ? 'flag-yes' : 'flag-no'}">${c.httpOnly ? '✓' : '✗'}</td>
      <td>${escapeHTML(c.sameSite || '-')}</td>
      <td class="cookie-val">${escapeHTML(String(c.value || '').substring(0, 60))}</td>
    </tr>`).join('');
    wrap.innerHTML = `<table class="sec-table"><thead><tr><th>Name</th><th>Domain</th><th>Path</th><th>Secure</th><th>HttpOnly</th><th>SameSite</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  // ── Performance ──
  const perf = firstPage?.performance;
  if (perf?.navigation) {
    document.getElementById('perf-section').style.display = 'block';
    const pg = document.getElementById('perf-grid');
    pg.innerHTML = '';
    const metrics = [
      { label: 'TTFB', value: `${perf.navigation.ttfb}ms` },
      { label: 'DOM Interactive', value: `${perf.navigation.domInteractive}ms` },
      { label: 'DOM Content Loaded', value: `${perf.navigation.domContentLoaded}ms` },
      { label: 'Load Complete', value: `${perf.navigation.loadComplete}ms` },
      { label: 'Transfer Size', value: formatBytes(perf.navigation.transferSize) },
      { label: 'Decoded Size', value: formatBytes(perf.navigation.decodedBodySize) },
      { label: 'FCP', value: perf.paint?.['first-contentful-paint'] ? `${perf.paint['first-contentful-paint']}ms` : '-' },
      { label: 'Resources', value: perf.resources?.length || 0 },
    ];
    metrics.forEach(m => {
      const card = document.createElement('div');
      card.className = 'summary-card';
      card.innerHTML = `<span class="s-label">${m.label}</span><span class="s-value" style="font-size:18px">${m.value}</span>`;
      pg.appendChild(card);
    });
  }

  // ── Console logs ──
  if (data.consoleLogs?.length) {
    document.getElementById('console-section').style.display = 'block';
    document.getElementById('console-badge').textContent = data.consoleLogs.length;
    const box = document.getElementById('console-log-box');
    box.innerHTML = '';
    data.consoleLogs.slice(0, 100).forEach(log => {
      const el = document.createElement('div');
      el.className = 'log-entry';
      const level = log.type === 'error' ? 'error' : log.type === 'warning' ? 'warn' : 'info';
      el.innerHTML = `<span class="log-time">${formatTime(log.timestamp)}</span><span class="log-msg ${level}">[${log.type}] ${escapeHTML(log.text)}</span>`;
      box.appendChild(el);
    });
  }

  // ── Downloaded images ──
  if (data.downloadedImages?.length) {
    document.getElementById('dl-images-section').style.display = 'block';
    document.getElementById('dl-images-badge').textContent = data.downloadedImages.length;
    const grid2 = document.getElementById('dl-images-grid');
    grid2.innerHTML = '';
    data.downloadedImages.forEach(img => {
      const card = document.createElement('div');
      card.className = 'dl-image-card';
      card.innerHTML = `
        <img src="${img.dataUrl}" alt="${escapeHTML(img.alt || '')}" class="dl-image-preview" loading="lazy" />
        <span class="dl-image-meta">${img.width || '?'}×${img.height || '?'} · ${formatBytes(img.size || 0)}</span>
        <a class="dl-image-link" href="${img.dataUrl}" download="${escapeHTML(img.src?.split('/').pop() || 'image')}">&#8659; Save</a>`;
      grid2.appendChild(card);
    });
  }

  // ── Screenshot ──
  if (firstPage?.screenshot) {
    document.getElementById('screenshot-wrap').style.display = 'block';
    document.getElementById('page-screenshot').src = firstPage.screenshot;
  }

  // ── JSON viewer (strip large binary fields for performance) ──
  const displayData = JSON.parse(JSON.stringify(data));
  if (displayData.pages) {
    displayData.pages.forEach(p => {
      delete p.screenshot;
      delete p.viewportScreenshot;
      delete p.htmlSource;
      delete p.headHTML;
      delete p.layoutTree;     // shown separately if needed
    });
  }
  if (displayData.downloadedImages) {
    displayData.downloadedImages = displayData.downloadedImages.map(i => ({ ...i, dataUrl: '[base64 omitted]' }));
  }

  // ── Site tree (full crawl) ──
  const siteTreeSection = document.getElementById('site-tree-section');
  if (data._siteTree && data.pages?.length) {
    siteTreeSection.style.display = 'block';
    document.getElementById('site-tree-badge').textContent = data.pages.length;
    renderCrawlTree(data, 'depth');
    // Reset active tab
    document.querySelectorAll('.sort-tab').forEach(t => t.classList.toggle('active', t.dataset.sort === 'depth'));
  } else {
    siteTreeSection.style.display = 'none';
  }

  const viewer = document.getElementById('json-viewer');
  viewer.innerHTML = '';
  viewer.appendChild(renderJSONNode(displayData));
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ---- JSON Tree Viewer ----
function renderJSONNode(value, key = null, isLast = true) {
  const frag = document.createDocumentFragment();

  if (value === null) {
    frag.appendChild(makeLine(key, `<span class="json-null">null</span>`, isLast));
  } else if (typeof value === 'boolean') {
    frag.appendChild(makeLine(key, `<span class="json-bool">${value}</span>`, isLast));
  } else if (typeof value === 'number') {
    frag.appendChild(makeLine(key, `<span class="json-number">${value}</span>`, isLast));
  } else if (typeof value === 'string') {
    const display = value.length > 300 ? escapeHTML(value.substring(0, 300)) + '...' : escapeHTML(value);
    frag.appendChild(makeLine(key, `<span class="json-string">"${display}"</span>`, isLast));
  } else if (Array.isArray(value)) {
    const container = document.createElement('div');
    const header = document.createElement('div');
    header.className = 'json-line json-node';
    const toggle = document.createElement('span');
    toggle.className = 'json-toggle';
    toggle.textContent = '▾';
    header.appendChild(toggle);
    if (key !== null) {
      const k = document.createElement('span');
      k.className = 'json-key';
      k.textContent = `"${key}"`;
      header.appendChild(k);
      header.appendChild(text(': '));
    }
    header.appendChild(text(`[  `));
    const countSpan = document.createElement('span');
    countSpan.className = 'json-null';
    countSpan.textContent = `${value.length} items`;
    header.appendChild(countSpan);
    header.appendChild(text(' ]' + (isLast ? '' : ',')));

    const children = document.createElement('div');
    children.className = 'json-children';

    value.forEach((item, i) => {
      children.appendChild(renderJSONNode(item, null, i === value.length - 1));
    });

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const collapsed = children.classList.toggle('collapsed');
      toggle.textContent = collapsed ? '▸' : '▾';
    });
    header.addEventListener('click', () => toggle.click());

    container.appendChild(header);
    container.appendChild(children);
    frag.appendChild(container);
  } else if (typeof value === 'object') {
    const keys = Object.keys(value);
    const container = document.createElement('div');
    const header = document.createElement('div');
    header.className = 'json-line json-node';
    const toggle = document.createElement('span');
    toggle.className = 'json-toggle';
    toggle.textContent = '▾';
    header.appendChild(toggle);
    if (key !== null) {
      const k = document.createElement('span');
      k.className = 'json-key';
      k.textContent = `"${key}"`;
      header.appendChild(k);
      header.appendChild(text(': '));
    }
    header.appendChild(text(`{  `));
    const countSpan = document.createElement('span');
    countSpan.className = 'json-null';
    countSpan.textContent = `${keys.length} keys`;
    header.appendChild(countSpan);
    header.appendChild(text(' }' + (isLast ? '' : ',')));

    const children = document.createElement('div');
    children.className = 'json-children';

    keys.forEach((k, i) => {
      children.appendChild(renderJSONNode(value[k], k, i === keys.length - 1));
    });

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const collapsed = children.classList.toggle('collapsed');
      toggle.textContent = collapsed ? '▸' : '▾';
    });
    header.addEventListener('click', () => toggle.click());

    container.appendChild(header);
    container.appendChild(children);
    frag.appendChild(container);
  }

  return frag;
}

function makeLine(key, valueHTML, isLast) {
  const line = document.createElement('div');
  line.className = 'json-line';
  const toggle = document.createElement('span');
  toggle.className = 'json-toggle';
  toggle.textContent = ' ';
  line.appendChild(toggle);
  if (key !== null) {
    const k = document.createElement('span');
    k.className = 'json-key';
    k.textContent = `"${key}"`;
    line.appendChild(k);
    line.appendChild(text(': '));
  }
  const val = document.createElement('span');
  val.innerHTML = valueHTML + (isLast ? '' : ',');
  line.appendChild(val);
  return line;
}

function text(str) {
  return document.createTextNode(str);
}

// ---- Expand / Collapse All ----
document.getElementById('btn-expand-all').addEventListener('click', () => {
  document.querySelectorAll('.json-children').forEach((c) => c.classList.remove('collapsed'));
  document.querySelectorAll('.json-toggle').forEach((t) => { if (t.textContent.trim() === '▸') t.textContent = '▾'; });
});
document.getElementById('btn-collapse-all').addEventListener('click', () => {
  document.querySelectorAll('.json-children').forEach((c) => c.classList.add('collapsed'));
  document.querySelectorAll('.json-toggle').forEach((t) => { if (t.textContent.trim() === '▾') t.textContent = '▸'; });
});

// ---- Download / Copy JSON ----
document.getElementById('btn-download-json').addEventListener('click', () => {
  if (!scrapedData) return;
  downloadJSON(scrapedData, 'scraped-data.json');
});

document.getElementById('btn-copy-json').addEventListener('click', () => {
  if (!scrapedData) return;
  navigator.clipboard.writeText(JSON.stringify(scrapedData, null, 2));
  showToast('JSON copied to clipboard!');
});

// ---- API Calls rendering ----
function renderAPICalls(apiCalls) {
  if (!apiCalls) return;

  const hasData = (apiCalls.graphql?.length || 0) + (apiCalls.rest?.length || 0) > 0;
  document.getElementById('api-empty').style.display = hasData ? 'none' : 'flex';
  document.getElementById('api-content').style.display = hasData ? 'block' : 'none';

  document.getElementById('gql-count').textContent = apiCalls.graphql?.length || 0;
  document.getElementById('rest-count').textContent = apiCalls.rest?.length || 0;

  renderCallList(document.getElementById('graphql-list'), apiCalls.graphql || [], true);
  renderCallList(document.getElementById('rest-list'), apiCalls.rest || [], false);
}

function renderCallList(container, calls, isGraphQL) {
  container.innerHTML = '';
  calls.forEach((call, i) => {
    const card = document.createElement('div');
    card.className = 'call-card';

    const status = call.response?.status;
    const statusClass = status && status < 400 ? 'status-ok' : 'status-err';
    const methodClass = `method-${call.method || 'GET'}`;

    card.innerHTML = `
      <div class="call-header" data-i="${i}">
        <span class="call-method ${methodClass}">${call.method || 'GET'}</span>
        ${isGraphQL ? `<span class="call-graphql-badge">GraphQL</span>` : ''}
        <span class="call-url">${escapeHTML(call.url)}</span>
        ${status ? `<span class="call-status ${statusClass}">${status}</span>` : ''}
        <span class="call-time">${formatTime(call.timestamp)}</span>
        <span>&#9660;</span>
      </div>
      <div class="call-body" style="display:none">
        ${call.body ? `<div class="call-section-label">Request Body</div><pre class="call-json">${escapeHTML(JSON.stringify(call.body, null, 2))}</pre>` : ''}
        ${call.response?.body ? `<div class="call-section-label" style="margin-top:10px">Response</div><pre class="call-json">${escapeHTML(JSON.stringify(call.response.body, null, 2)).substring(0, 3000)}</pre>` : ''}
      </div>`;

    card.querySelector('.call-header').addEventListener('click', function () {
      const body = this.nextElementSibling;
      const expanded = body.style.display !== 'none';
      body.style.display = expanded ? 'none' : 'block';
      this.classList.toggle('open', !expanded);
    });

    container.appendChild(card);
  });
}

// API tab switching
document.querySelectorAll('.api-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.api-tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.api-tab-panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

document.getElementById('btn-copy-api').addEventListener('click', () => {
  if (!scrapedData?.apiCalls) return;
  navigator.clipboard.writeText(JSON.stringify(scrapedData.apiCalls, null, 2));
  showToast('API calls copied!');
});

document.getElementById('btn-download-api').addEventListener('click', () => {
  if (!scrapedData?.apiCalls) return;
  downloadJSON(scrapedData.apiCalls, 'api-calls.json');
});

// ---- Assets rendering ----
function renderAssets(assets) {
  if (!assets || assets.length === 0) return;

  document.getElementById('assets-empty').style.display = 'none';
  document.getElementById('assets-content').style.display = 'block';

  renderAssetGrid(assets);

  document.getElementById('asset-type-filter').addEventListener('change', () => filterAssets(assets));
  document.getElementById('asset-search').addEventListener('input', () => filterAssets(assets));
}

function filterAssets(assets) {
  const type = document.getElementById('asset-type-filter').value;
  const search = document.getElementById('asset-search').value.toLowerCase();
  const filtered = assets.filter((a) =>
    (type === 'all' || a.type === type) &&
    (!search || a.url.toLowerCase().includes(search))
  );
  renderAssetGrid(filtered);
}

function renderAssetGrid(assets) {
  const grid = document.getElementById('asset-grid');
  grid.innerHTML = '';
  assets.slice(0, 200).forEach((asset) => {
    const card = document.createElement('div');
    card.className = 'asset-card';
    const isImg = asset.type === 'image';
    card.innerHTML = `
      <span class="asset-type-badge">${asset.type}</span>
      <span class="asset-url">${escapeHTML(asset.url)}</span>
      ${isImg ? `<img class="asset-preview" src="${escapeHTML(asset.url)}" alt="" loading="lazy" onerror="this.style.display='none'" />` : ''}`;
    grid.appendChild(card);
  });
}

document.getElementById('btn-download-assets').addEventListener('click', () => {
  if (!scrapedData?.assets) return;
  downloadJSON(scrapedData.assets, 'assets.json');
});

// ---- Refactor / Scaffold ----
function enableRefactor(data) {
  document.getElementById('refactor-empty').style.display = 'none';
  document.getElementById('refactor-content').style.display = 'block';
}

document.getElementById('btn-generate').addEventListener('click', () => {
  if (!scrapedData) return;
  const html = generateScaffold(scrapedData);
  document.getElementById('scaffold-editor').value = html;
});

document.getElementById('btn-download-scaffold').addEventListener('click', () => {
  const html = document.getElementById('scaffold-editor').value;
  if (!html) return;
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'scaffold.html';
  a.click();
});

function generateScaffold(data) {
  const page = data.pages?.[0];
  if (!page) return '<!-- No page data -->';

  const meta = page.meta || {};
  const includeMeta = document.getElementById('include-meta').checked;
  const includeCSSVars = document.getElementById('include-css-vars').checked;
  const includeImages = document.getElementById('include-images').checked;
  const includeScripts = document.getElementById('include-scripts').checked;

  const cssVarBlock = includeCSSVars && Object.keys(page.cssVariables || {}).length > 0
    ? `\n  :root {\n${Object.entries(page.cssVariables).map(([k, v]) => `    ${k}: ${v};`).join('\n')}\n  }`
    : '';

  const stylesheets = (page.stylesheets || [])
    .map((s) => `  <link rel="stylesheet" href="${escapeAttr(s.href)}"${s.media ? ` media="${escapeAttr(s.media)}"` : ''}>`)
    .join('\n');

  const scripts = includeScripts
    ? (page.scripts || [])
        .map((s) => `<script src="${escapeAttr(s.src)}"${s.async ? ' async' : ''}${s.defer ? ' defer' : ''}><\/script>`)
        .join('\n')
    : '';

  const navHTML = (page.navigation || [])
    .map((nav) => `<nav>\n  <ul>\n${nav.items.map((i) => `    <li><a href="${escapeAttr(i.href)}">${escapeHTML(i.text)}</a></li>`).join('\n')}\n  </ul>\n</nav>`)
    .join('\n');

  const headingsHTML = Object.entries(page.headings || {})
    .flatMap(([tag, items]) => items.map((h) => `<${tag}>${escapeHTML(h.text)}</${tag}>`))
    .slice(0, 30)
    .join('\n');

  const imagesHTML = includeImages
    ? (page.images || [])
        .filter((img) => img.src)
        .slice(0, 20)
        .map((img) => `<img src="${escapeAttr(img.src)}"${img.alt ? ` alt="${escapeAttr(img.alt)}"` : ''}>`)
        .join('\n')
    : '';

  const linksHTML = (page.links || [])
    .filter((l) => l.isInternal && l.text)
    .slice(0, 20)
    .map((l) => `<a href="${escapeAttr(l.href)}">${escapeHTML(l.text)}</a>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="${meta.lang || 'en'}">
<head>
  <meta charset="${meta.charset || 'UTF-8'}">
  <meta name="viewport" content="${meta.viewport || 'width=device-width, initial-scale=1.0'}">
  <title>${escapeHTML(meta.title || '')}</title>
${includeMeta ? `  <meta name="description" content="${escapeAttr(meta.description || '')}">
  <meta name="keywords" content="${escapeAttr(meta.keywords || '')}">
  <meta name="author" content="${escapeAttr(meta.author || '')}">` : ''}
${stylesheets}
${cssVarBlock ? `  <style>${cssVarBlock}\n  </style>` : ''}
</head>
<body>

<!-- Navigation -->
${navHTML}

<!-- Headings -->
${headingsHTML}

<!-- Images -->
${imagesHTML}

<!-- Links -->
${linksHTML}

<!-- Scripts -->
${scripts}

</body>
</html>`;
}

// ---- Utilities ----
function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function escapeHTML(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString();
  } catch { return iso; }
}

function showToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = `
    position:fixed;bottom:24px;right:24px;background:#4f8ef7;color:#fff;
    padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;
    z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.4);
    animation:fadeIn 0.2s ease;
  `;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}


// ---- Full crawl toggle ----
document.getElementById('full-crawl').addEventListener('change', function () {
  const maxPagesInput = document.getElementById('max-pages');
  if (this.checked) {
    maxPagesInput.disabled = true;
    maxPagesInput.placeholder = 'Unlimited';
    maxPagesInput.value = '';
  } else {
    maxPagesInput.disabled = false;
    maxPagesInput.placeholder = '';
    maxPagesInput.value = maxPagesInput.value || 100;
  }
  const label = this.closest('#full-crawl-label');
  if (label) label.classList.toggle('active-opt', this.checked);
});

// ---- Crawl tree / sort renderers ----
let _crawlData = null; // holds current crawl result for re-sorting

function renderCrawlTree(data, mode) {
  _crawlData = data;
  const container = document.getElementById('site-tree');
  switch (mode) {
    case 'depth':    container.innerHTML = renderTreeByDepth(data._siteTree); break;
    case 'inbound':  container.innerHTML = renderFlatByInbound(data.pages); break;
    case 'discovery':container.innerHTML = renderFlatByDiscovery(data.pages); break;
    case 'section':  container.innerHTML = renderBySection(data.pages); break;
  }
}

// Mode 1: path-depth hierarchy tree (original)
function renderTreeByDepth(node, depth = 0) {
  if (!node) return '';
  const indent = depth * 18;
  let html = '';
  (node.pages || []).forEach(p => {
    html += `<div class="site-tree-item" style="padding-left:${indent}px">
      <span class="site-tree-icon">&#128196;</span>
      <a class="site-tree-url" href="${escapeHTML(p.url)}" target="_blank">${escapeHTML(p.url)}</a>
      <span class="site-tree-title">${escapeHTML(p.title || '')}</span>
    </div>`;
  });
  Object.entries(node.children || {}).sort(([a],[b]) => a.localeCompare(b)).forEach(([seg, child]) => {
    html += `<div class="site-tree-segment" style="padding-left:${indent}px">
      <span class="site-tree-icon">&#128193;</span>
      <span class="site-tree-seg-name">/${escapeHTML(seg)}</span>
    </div>`;
    html += renderTreeByDepth(child, depth + 1);
  });
  return html;
}

// Mode 2: flat list sorted by inbound link count (most-linked first)
function renderFlatByInbound(pages) {
  if (!pages?.length) return '';
  const sorted = [...pages].sort((a, b) => (b._crawl?.inboundCount || 0) - (a._crawl?.inboundCount || 0));
  return sorted.map(p => {
    const url = p.meta?.url || '';
    const count = p._crawl?.inboundCount || 0;
    return `<div class="site-tree-item">
      <span class="site-tree-icon">&#128279;</span>
      <span class="site-tree-inbound" title="${count} page(s) link here">${count}</span>
      <a class="site-tree-url" href="${escapeHTML(url)}" target="_blank">${escapeHTML(url)}</a>
      <span class="site-tree-title">${escapeHTML(p.meta?.title || '')}</span>
    </div>`;
  }).join('');
}

// Mode 3: flat list in discovery order (order crawler first found each URL)
function renderFlatByDiscovery(pages) {
  if (!pages?.length) return '';
  const sorted = [...pages].sort((a, b) => (a._crawl?.discoveryOrder ?? 0) - (b._crawl?.discoveryOrder ?? 0));
  return sorted.map((p, i) => {
    const url = p.meta?.url || '';
    return `<div class="site-tree-item">
      <span class="site-tree-icon">&#128269;</span>
      <span class="site-tree-inbound" title="Discovery position">#${i + 1}</span>
      <a class="site-tree-url" href="${escapeHTML(url)}" target="_blank">${escapeHTML(url)}</a>
      <span class="site-tree-title">${escapeHTML(p.meta?.title || '')}</span>
    </div>`;
  }).join('');
}

// Mode 4: grouped by top-level path section (/blog, /docs, /products, etc.)
function renderBySection(pages) {
  if (!pages?.length) return '';
  const groups = new Map();
  pages.forEach(p => {
    const section = p._crawl?.section || '(root)';
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push(p);
  });
  // Sort groups alphabetically, root first
  const sorted = [...groups.entries()].sort(([a], [b]) => {
    if (a === '(root)') return -1;
    if (b === '(root)') return 1;
    return a.localeCompare(b);
  });
  return sorted.map(([section, sectionPages]) => {
    const items = sectionPages
      .sort((a, b) => (a._crawl?.depth || 0) - (b._crawl?.depth || 0))
      .map(p => {
        const url = p.meta?.url || '';
        return `<div class="site-tree-item" style="padding-left:18px">
          <span class="site-tree-icon">&#128196;</span>
          <a class="site-tree-url" href="${escapeHTML(url)}" target="_blank">${escapeHTML(url)}</a>
          <span class="site-tree-title">${escapeHTML(p.meta?.title || '')}</span>
        </div>`;
      }).join('');
    return `<div class="site-tree-segment">
      <span class="site-tree-icon">&#128193;</span>
      <span class="site-tree-seg-name">/${escapeHTML(section)}</span>
      <span class="site-tree-count">${sectionPages.length}</span>
    </div>${items}`;
  }).join('');
}

document.getElementById('slow-motion').addEventListener('input', function () {
  document.getElementById('slowmo-value').textContent = `${this.value}ms`;
});

// ---- Live browser collapse toggle ----
document.getElementById('live-browser-toggle').addEventListener('click', () => {
  const body = document.getElementById('live-browser-body');
  const chevron = document.getElementById('live-browser-chevron');
  const collapsed = body.style.display === 'none';
  body.style.display = collapsed ? 'block' : 'none';
  chevron.textContent = collapsed ? '▲' : '▼';
});

// ---- Crawl sort tabs ----
document.getElementById('crawl-sort-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.sort-tab');
  if (!btn || !_crawlData) return;
  document.querySelectorAll('.sort-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderCrawlTree(_crawlData, btn.dataset.sort);
});

// ---- Init ----
connectWS();
