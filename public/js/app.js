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
const activeSessions = new Map(); // sessionId -> { name, faviconUrl, liveView, expanded }
let scrapedData = null;

// ---- WebSocket ----
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (!activeSessions.has(msg.sessionId)) return;
      handleSessionMessage(msg.sessionId, msg);
    } catch {}
  };

  ws.onclose = () => setTimeout(connectWS, 2000);
  ws.onerror = () => ws.close();
}

function handleSessionMessage(sessionId, msg) {
  switch (msg.type) {
    case 'log':             appendSessionLog(sessionId, msg.message, msg.level); break;
    case 'progress':        updateSessionProgress(sessionId, msg.step, msg.percent); break;
    case 'siteInfo':        updateSessionSitePreview(sessionId, msg.data); break;
    case 'needsAuth':       showSessionCredsPrompt(sessionId); break;
    case 'needVerification':showSessionVerifyPrompt(sessionId); break;
    case 'liveFrame':       updateSessionLiveFrame(sessionId, msg.dataUrl); break;
    case 'sessionSaved':
      document.getElementById('session-badge').style.display = 'flex';
      showToast(`Session saved for ${msg.hostname}`);
      break;
    case 'complete':        onSessionComplete(sessionId, msg.data); break;
    case 'error':           onSessionError(sessionId, msg.message); break;
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
    const faviconSrc = preset.iconUrl || preset.url || '';
    const faviconUrl = faviconSrc ? `/api/favicon?url=${encodeURIComponent(faviconSrc)}` : '';
    card.innerHTML = `
      <div class="preset-item-main" data-idx="${idx}">
        ${faviconUrl ? `<img class="preset-favicon" src="${escapeHTML(faviconUrl)}" alt="" onerror="this.style.display='none'" />` : '<span class="preset-favicon-placeholder">&#127760;</span>'}
        <div class="preset-item-info">
          <span class="preset-item-name">${escapeHTML(preset.name)}</span>
          <span class="preset-item-url">${escapeHTML(preset.url || '')}</span>
        </div>
        <div class="preset-item-badges">
          ${preset.limitDepth ? `<span class="preset-badge">Depth ${preset.scrapeDepth}</span>` : '<span class="preset-badge">Depth ∞</span>'}
          ${preset.fullCrawl ? '<span class="preset-badge">🌐 Full Crawl</span>' : `<span class="preset-badge">${preset.maxPages ? preset.maxPages + ' pages' : '∞ pages'}</span>`}
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
  const setDepthUI = (limitDepth, depth) => {
    document.getElementById('preset-limitdepth').checked = !!limitDepth;
    document.getElementById('preset-depth-wrap').style.display = limitDepth ? 'inline' : 'none';
    document.getElementById('preset-depth').value = depth || 3;
  };
  const setFullCrawlUI = (on) => {
    document.getElementById('preset-fullcrawl').checked = on;
    const mp = document.getElementById('preset-maxpages');
    mp.disabled = on; mp.placeholder = on ? 'Unlimited' : ''; if (on) mp.value = '';
  };

  if (editIdx >= 0) {
    const p = getPresets()[editIdx];
    title.textContent = '✎ Edit Preset';
    document.getElementById('preset-name').value = p.name || '';
    document.getElementById('preset-url').value = p.url || '';
    document.getElementById('preset-icon-url').value = p.iconUrl || '';
    document.getElementById('preset-graphql').checked = p.captureGraphQL !== false;
    document.getElementById('preset-rest').checked = p.captureREST !== false;
    document.getElementById('preset-assets').checked = !!p.captureAssets;
    document.getElementById('preset-scroll').checked = p.autoScroll !== false;
    document.getElementById('preset-liveview').checked = p.liveView !== false;
    document.getElementById('preset-maxpages').value = p.maxPages || 100;
    setFullCrawlUI(!!p.fullCrawl);
    setDepthUI(!!p.limitDepth, p.scrapeDepth);
    document.getElementById('btn-preset-save').dataset.editIdx = editIdx;
  } else {
    title.textContent = '★ Save Scrape Preset';
    document.getElementById('preset-name').value = '';
    document.getElementById('preset-url').value = document.getElementById('url').value || '';
    document.getElementById('preset-icon-url').value = '';
    document.getElementById('preset-graphql').checked = document.getElementById('capture-graphql').checked;
    document.getElementById('preset-rest').checked = document.getElementById('capture-rest').checked;
    document.getElementById('preset-assets').checked = document.getElementById('capture-assets').checked;
    document.getElementById('preset-scroll').checked = document.getElementById('auto-scroll').checked;
    document.getElementById('preset-liveview').checked = document.getElementById('live-view').value === 'true';
    document.getElementById('preset-maxpages').value = document.getElementById('max-pages').value || 100;
    setFullCrawlUI(document.getElementById('full-crawl').checked);
    setDepthUI(document.getElementById('limit-depth').checked, document.getElementById('scrape-depth').value);
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
  const mp = document.getElementById('preset-maxpages');
  mp.disabled = this.checked; mp.placeholder = this.checked ? 'Unlimited' : ''; if (this.checked) mp.value = '';
  else { mp.value = 100; }
});
document.getElementById('preset-limitdepth').addEventListener('change', function () {
  document.getElementById('preset-depth-wrap').style.display = this.checked ? 'inline' : 'none';
  if (this.checked) document.getElementById('preset-depth').click();
});
document.getElementById('preset-depth').addEventListener('click', e => e.stopPropagation());
document.getElementById('preset-depth').addEventListener('mousedown', e => e.stopPropagation());

document.getElementById('btn-preset-save').addEventListener('click', () => {
  const name = document.getElementById('preset-name').value.trim();
  const url  = document.getElementById('preset-url').value.trim();
  const iconUrl = document.getElementById('preset-icon-url').value.trim();
  if (!name) { document.getElementById('preset-name').focus(); return; }
  if (!url)  { document.getElementById('preset-url').focus(); return; }
  const limitDepth = document.getElementById('preset-limitdepth').checked;
  const fullCrawl  = document.getElementById('preset-fullcrawl').checked;
  const preset = {
    name, url,
    iconUrl: iconUrl || '',
    limitDepth,
    scrapeDepth: limitDepth ? (parseInt(document.getElementById('preset-depth').value) || 3) : 99,
    captureGraphQL: document.getElementById('preset-graphql').checked,
    captureREST: document.getElementById('preset-rest').checked,
    captureAssets: document.getElementById('preset-assets').checked,
    autoScroll: document.getElementById('preset-scroll').checked,
    fullCrawl,
    liveView: document.getElementById('preset-liveview').checked,
    maxPages: fullCrawl ? 0 : (parseInt(document.getElementById('preset-maxpages').value) || 100),
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
  const faviconSrc = preset.iconUrl || preset.url || '';
  const faviconUrl = faviconSrc ? `/api/favicon?url=${encodeURIComponent(faviconSrc)}` : '';
  info.innerHTML = `
    <div class="preset-confirm-row">
      ${faviconUrl ? `<img class="preset-favicon" src="${escapeHTML(faviconUrl)}" alt="" onerror="this.style.display='none'" />` : ''}
      <div>
        <div class="preset-confirm-name">${escapeHTML(preset.name)}</div>
        <div class="preset-confirm-url">${escapeHTML(preset.url)}</div>
      </div>
    </div>
    <div class="preset-confirm-tags">
      ${preset.limitDepth ? `<span class="preset-badge">Depth ${preset.scrapeDepth}</span>` : '<span class="preset-badge">Depth ∞</span>'}
      ${preset.fullCrawl ? '<span class="preset-badge">🌐 Full Crawl</span>' : `<span class="preset-badge">${preset.maxPages ? preset.maxPages + ' pages' : '∞ pages'}</span>`}
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
  document.getElementById('capture-graphql').checked = preset.captureGraphQL !== false;
  document.getElementById('capture-rest').checked = preset.captureREST !== false;
  document.getElementById('capture-assets').checked = !!preset.captureAssets;
  document.getElementById('auto-scroll').checked = preset.autoScroll !== false;
  // Full crawl + max pages
  const fc = !!preset.fullCrawl;
  document.getElementById('full-crawl').checked = fc;
  const mp = document.getElementById('max-pages');
  mp.disabled = fc; mp.placeholder = fc ? 'Unlimited' : ''; mp.value = fc ? '' : (preset.maxPages || 100);
  // Limit depth
  const ld = !!preset.limitDepth;
  document.getElementById('limit-depth').checked = ld;
  document.getElementById('depth-inline-wrap').style.display = ld ? 'inline' : 'none';
  document.getElementById('scrape-depth').value = preset.scrapeDepth || 3;
  // Set live view toggle
  const liveOn = preset.liveView !== false;
  document.getElementById('live-view').value = String(liveOn);
  document.getElementById('live-view-btn').dataset.active = String(liveOn);
  document.getElementById('live-view-btn').classList.toggle('active', liveOn);
  document.getElementById('live-view-label').textContent = liveOn ? 'ON' : 'OFF';
  // Start the scrape
  const faviconSrc = preset.iconUrl || preset.url || '';
  const faviconUrl = faviconSrc ? `/api/favicon?url=${encodeURIComponent(faviconSrc)}` : '';
  startScrapeSession(preset.name, faviconUrl);
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

// ---- Limit depth toggle ----
document.getElementById('limit-depth').addEventListener('change', function () {
  document.getElementById('depth-inline-wrap').style.display = this.checked ? 'inline' : 'none';
  if (this.checked) document.getElementById('scrape-depth').focus();
});

// Stop the depth number input click from toggling the checkbox
document.getElementById('scrape-depth').addEventListener('click', e => e.stopPropagation());
document.getElementById('scrape-depth').addEventListener('mousedown', e => e.stopPropagation());

// ---- Image limit toggle ----
document.getElementById('capture-images').addEventListener('change', function () {
  document.getElementById('images-inline-wrap').style.display = this.checked ? 'inline' : 'none';
});
document.getElementById('image-limit').addEventListener('click', e => e.stopPropagation());
document.getElementById('image-limit').addEventListener('mousedown', e => e.stopPropagation());

// ---- Avoid Links toggle ----
document.getElementById('avoid-links-toggle').addEventListener('click', () => {
  const panel = document.getElementById('avoid-links-panel');
  const chevron = document.getElementById('avoid-links-chevron');
  const open = panel.style.display === 'none';
  panel.style.display = open ? 'block' : 'none';
  chevron.innerHTML = open ? '&#9650;' : '&#9660;';
});
// Update badge count on change
document.querySelectorAll('.avoid-tag').forEach(cb => {
  cb.addEventListener('change', () => {
    const count = document.querySelectorAll('.avoid-tag:checked').length;
    document.getElementById('avoid-links-count').textContent = count;
    document.getElementById('avoid-links-count').style.display = count ? 'inline-block' : 'none';
  });
});

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
async function startScrapeSession(name, faviconUrl) {
  const url = document.getElementById('url').value.trim();
  if (!url) { alert('Please enter a URL to scrape.'); return; }

  const liveView = document.getElementById('live-view').value === 'true';
  const payload = {
    url,
    scrapeDepth: document.getElementById('limit-depth').checked ? parseInt(document.getElementById('scrape-depth').value, 10) : 99,
    avoidTags: [...document.querySelectorAll('.avoid-tag:checked')].map(el => el.value),
    capturePageUrls: document.getElementById('capture-urls').checked,
    captureGraphQL: document.getElementById('capture-graphql').checked,
    captureREST: document.getElementById('capture-rest').checked,
    captureAssets: document.getElementById('capture-assets').checked,
    captureAllRequests: document.getElementById('capture-all-requests').checked,
    captureImages: document.getElementById('capture-images').checked,
    imageLimit: parseInt(document.getElementById('image-limit').value, 10) || 0,
    autoScroll: document.getElementById('auto-scroll').checked,
    showBrowser: false,
    liveView,
    slowMotion: parseInt(document.getElementById('slow-motion').value, 10),
    fullCrawl: document.getElementById('full-crawl').checked,
    maxPages: document.getElementById('full-crawl').checked ? 0 : (parseInt(document.getElementById('max-pages').value, 10) || 100),
  };

  try {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    const { sessionId } = await res.json();
    saveRecentUrl(url);
    const displayName = name || (() => { try { return new URL(url).hostname; } catch { return url; } })();
    const favicon = faviconUrl || `/api/favicon?url=${encodeURIComponent(url)}`;
    createSessionPanel(sessionId, displayName, favicon, liveView);
    activeSessions.set(sessionId, { name: displayName, faviconUrl: favicon, liveView, expanded: true });
    appendSessionLog(sessionId, `Session started: ${sessionId}`, 'info');
  } catch (err) {
    alert(`Failed to start scrape: ${err.message}`);
  }
}

document.getElementById('btn-scrape').addEventListener('click', () => startScrapeSession());


// ======= MULTI-SESSION PANEL MANAGEMENT =======

function createSessionPanel(sessionId, name, faviconUrl, liveView) {
  const sid = sessionId;
  const panel = document.createElement('div');
  panel.className = 'session-panel';
  panel.id = `sp-${sid}`;
  panel.innerHTML = `
    <div class="session-header">
      <img class="session-hdr-icon" src="${escapeHTML(faviconUrl)}" alt="" onerror="this.style.display='none'" />
      <div class="session-hdr-main">
        <span class="session-hdr-name">${escapeHTML(name)}</span>
        <div class="session-mini-bar-wrap"><div class="session-mini-bar" id="smb-${sid}" style="width:0%"></div></div>
      </div>
      <span class="session-hdr-step" id="shs-${sid}">Starting...</span>
      <span class="session-hdr-pct" id="shp-${sid}">0%</span>
      <button class="btn-xs session-log-toggle" id="slt-${sid}" title="Hide/show console">&#128221; Console</button>
      <button class="btn-xs session-collapse-btn" id="scb-${sid}" title="Collapse">&#9650;</button>
      <button class="btn-xs session-stop-btn" id="ssb-${sid}">&#9632; Stop</button>
    </div>
    <div class="session-body" id="sbody-${sid}">
      <div class="session-site-preview" id="ssp-${sid}" style="display:none">
        <img class="session-site-favicon" id="ssf-${sid}" src="" alt="" onerror="this.style.display='none'" />
        <div>
          <span class="session-site-title" id="sst-${sid}"></span>
          <span class="session-site-url" id="ssu-${sid}"></span>
          <div class="session-site-badges" id="ssbd-${sid}"></div>
        </div>
      </div>
      <div class="log-box session-log-box" id="slb-${sid}"></div>
      <div class="live-browser-panel" id="slp-${sid}" style="${liveView ? 'display:block' : 'display:none'}">
        <div class="live-browser-header">
          <span>&#128247; Live Browser View</span>
        </div>
        <div class="live-browser-body">
          <img class="live-frame-img" id="slf-${sid}" src="" alt="Live view" />
        </div>
        <div class="live-creds-prompt" id="scp-${sid}" style="display:none">
          <span class="live-creds-icon">&#128274;</span>
          <strong>Login required</strong>
          <div class="live-creds-fields">
            <input type="text" id="scu-${sid}" placeholder="Username / Email" autocomplete="new-password" data-lpignore="true" />
            <input type="password" id="scpw-${sid}" placeholder="Password" autocomplete="new-password" data-lpignore="true" />
            <button class="btn-primary session-submit-creds">Continue</button>
          </div>
        </div>
        <div class="live-creds-prompt" id="svp-${sid}" style="display:none">
          <span class="live-creds-icon">&#128273;</span>
          <strong>Verification code required</strong>
          <div class="live-creds-fields">
            <input type="text" id="svc-${sid}" placeholder="Enter code..." maxlength="10" />
            <button class="btn-primary session-submit-verify">Submit</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Console toggle
  panel.querySelector(`#slt-${sid}`).addEventListener('click', () => {
    const log = document.getElementById(`slb-${sid}`);
    const btn = document.getElementById(`slt-${sid}`);
    if (!log) return;
    const hidden = log.style.display === 'none';
    log.style.display = hidden ? 'block' : 'none';
    btn.style.opacity = hidden ? '1' : '0.45';
  });

  // Collapse toggle
  panel.querySelector(`#scb-${sid}`).addEventListener('click', () => {
    const body = document.getElementById(`sbody-${sid}`);
    const btn  = document.getElementById(`scb-${sid}`);
    const collapsed = body.style.display === 'none';
    body.style.display = collapsed ? 'block' : 'none';
    btn.innerHTML = collapsed ? '&#9650;' : '&#9660;';
  });

  // Stop
  panel.querySelector(`#ssb-${sid}`).addEventListener('click', async () => {
    await fetch(`/api/scrape/${sid}/stop`, { method: 'POST' }).catch(() => {});
    appendSessionLog(sid, 'Scrape stopped by user.', 'warn');
    finalizeSession(sid, false);
  });

  // Credentials
  panel.querySelector('.session-submit-creds').addEventListener('click', async () => {
    const user = document.getElementById(`scu-${sid}`).value.trim();
    const pass = document.getElementById(`scpw-${sid}`).value;
    if (!user || !pass) return;
    await fetch(`/api/scrape/${sid}/credentials`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass }),
    });
    document.getElementById(`scp-${sid}`).style.display = 'none';
    appendSessionLog(sid, 'Credentials submitted — continuing scrape...', 'info');
  });

  // Verification
  panel.querySelector('.session-submit-verify').addEventListener('click', async () => {
    const code = document.getElementById(`svc-${sid}`).value.trim();
    if (!code) return;
    await fetch(`/api/scrape/${sid}/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    document.getElementById(`svp-${sid}`).style.display = 'none';
    appendSessionLog(sid, 'Verification code submitted.', 'info');
  });

  document.getElementById('sessions-container').prepend(panel);
}

function appendSessionLog(sessionId, message, level = 'info') {
  const box = document.getElementById(`slb-${sessionId}`);
  if (!box) return;
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  const line = document.createElement('div');
  line.className = 'log-entry';
  line.innerHTML = `<span class="log-time">${time}</span><span class="log-msg ${level}">${escapeHTML(message)}</span>`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

// Keep legacy appendLog for Detect button
function appendLog(message, level = 'info') {
  // Find the most recent active session to log to, or do nothing
  const ids = [...activeSessions.keys()];
  if (ids.length > 0) appendSessionLog(ids[ids.length - 1], message, level);
}

function updateSessionProgress(sessionId, step, percent) {
  const stepEl = document.getElementById(`shs-${sessionId}`);
  const pctEl  = document.getElementById(`shp-${sessionId}`);
  const barEl  = document.getElementById(`smb-${sessionId}`);
  if (stepEl) stepEl.textContent = step;
  if (pctEl)  pctEl.textContent = `${percent}%`;
  if (barEl)  barEl.style.width = `${percent}%`;
}

function updateSessionSitePreview(sessionId, info) {
  const preview = document.getElementById(`ssp-${sessionId}`);
  if (!preview) return;
  document.getElementById(`ssf-${sessionId}`).src = info.favicon || info.logoUrl || '';
  document.getElementById(`sst-${sessionId}`).textContent = info.title || info.origin;
  document.getElementById(`ssu-${sessionId}`).textContent = info.origin;
  const badges = document.getElementById(`ssbd-${sessionId}`);
  badges.innerHTML = '';
  if (info.hasLoginForm) badges.innerHTML += `<span class="site-badge login">Login Required</span>`;
  if (info.has2FA) badges.innerHTML += `<span class="site-badge fa">2FA</span>`;
  if (info.hasCaptcha) badges.innerHTML += `<span class="site-badge captcha">CAPTCHA</span>`;
  preview.style.display = 'flex';
  if (info.hasLoginForm) appendSessionLog(sessionId, 'Login form detected — will authenticate automatically.', 'info');
}

function showSessionCredsPrompt(sessionId) {
  const el = document.getElementById(`scp-${sessionId}`);
  if (el) { el.style.display = 'block'; document.getElementById(`scu-${sessionId}`)?.focus(); }
  // Expand session if collapsed
  const body = document.getElementById(`sbody-${sessionId}`);
  if (body && body.style.display === 'none') {
    body.style.display = 'block';
    const btn = document.getElementById(`scb-${sessionId}`);
    if (btn) btn.innerHTML = '&#9650;';
  }
}

function showSessionVerifyPrompt(sessionId) {
  const el = document.getElementById(`svp-${sessionId}`);
  if (el) { el.style.display = 'block'; document.getElementById(`svc-${sessionId}`)?.focus(); }
  const body = document.getElementById(`sbody-${sessionId}`);
  if (body && body.style.display === 'none') {
    body.style.display = 'block';
    const btn = document.getElementById(`scb-${sessionId}`);
    if (btn) btn.innerHTML = '&#9650;';
  }
}

function updateSessionLiveFrame(sessionId, dataUrl) {
  const sess = activeSessions.get(sessionId);
  if (sess && !sess.liveView) return;
  const panel = document.getElementById(`slp-${sessionId}`);
  if (panel && panel.style.display === 'none') panel.style.display = 'block';
  const frame = document.getElementById(`slf-${sessionId}`);
  if (frame) frame.src = dataUrl;
}

function finalizeSession(sessionId, success) {
  const stopBtn = document.getElementById(`ssb-${sessionId}`);
  if (stopBtn) { stopBtn.style.display = 'none'; }
  activeSessions.delete(sessionId);
  // Mark panel as done
  const panel = document.getElementById(`sp-${sessionId}`);
  if (panel) panel.classList.add(success ? 'session-done' : 'session-stopped');
}

function onSessionComplete(sessionId, data) {
  scrapedData = data;
  updateSessionProgress(sessionId, 'Complete ✓', 100);
  appendSessionLog(sessionId, 'Scraping complete!', 'success');
  finalizeSession(sessionId, true);

  renderResults(data);
  renderAPICalls(data.apiCalls);
  renderAssets(data.assets);
  enableRefactor(data);

  const totalAPIs = (data.apiCalls?.graphql?.length || 0) + (data.apiCalls?.rest?.length || 0);
  if (totalAPIs > 0) {
    const badge = document.getElementById('api-badge');
    badge.textContent = totalAPIs;
    badge.style.display = 'inline-block';
  }
  const resultsBadge = document.getElementById('results-badge');
  resultsBadge.textContent = data.pages?.length || 1;
  resultsBadge.style.display = 'inline-block';

  document.querySelector('[data-panel="results"]').click();
}

function onSessionError(sessionId, message) {
  appendSessionLog(sessionId, `Error: ${message}`, 'error');
  updateSessionProgress(sessionId, 'Error', 0);
  finalizeSession(sessionId, false);

  // Show error box inside the session
  const body = document.getElementById(`sbody-${sessionId}`);
  if (!body) return;
  const logLines = [...body.querySelectorAll('.log-entry')].map(el => el.textContent).join('\n');
  const full = `=== ERROR ===\n${message}\n\n=== FULL LOG ===\n${logLines}`;
  const box = document.createElement('div');
  box.className = 'scrape-error-box';
  box.innerHTML = `
    <div class="scrape-error-header">
      <span>&#9888; Error — copy log and send to support</span>
      <button class="btn-xs btn-copy-err">&#128203; Copy</button>
    </div>
    <pre class="scrape-error-pre">${escapeHTML(full)}</pre>
  `;
  box.querySelector('.btn-copy-err').addEventListener('click', () => {
    navigator.clipboard.writeText(full).then(() => showToast('Copied!'));
  });
  body.appendChild(box);
}

// ============================================

// ---- Site preview (used by Detect button) ----
function updateSitePreview(info) {
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
    ...(data.authRedirectedPages?.length ? [{ label: 'Auth Redirects', value: data.authRedirectedPages.length, warn: true }] : []),
    ...(data.failedPages?.length ? [{ label: 'Failed Pages', value: data.failedPages.length, err: true }] : []),
  ];

  cards.forEach((c) => {
    const card = document.createElement('div');
    card.className = 'summary-card' + (c.warn ? ' s-warn' : '') + (c.err ? ' s-err' : '');
    card.innerHTML = `<span class="s-label">${c.label}</span><span class="s-value">${c.value}</span>`;
    grid.appendChild(card);
  });

  // ── Visited URLs ──
  const vuSection = document.getElementById('visited-urls-section');
  if (vuSection) {
    if (data.visitedUrls?.length) {
      vuSection.style.display = 'block';
      document.getElementById('visited-urls-badge').textContent = data.visitedUrls.length;
      const list = document.getElementById('visited-urls-list');
      list.innerHTML = data.visitedUrls.map((u, i) =>
        `<div class="visited-url-row"><span class="visited-url-num">${i + 1}</span><a class="visited-url-link" href="${escapeHTML(u)}" target="_blank" rel="noopener">${escapeHTML(u)}</a></div>`
      ).join('');
    } else {
      vuSection.style.display = 'none';
    }
  }

  // ── Auth-Redirected Pages ──
  const arSection = document.getElementById('auth-redirects-section');
  if (arSection) {
    if (data.authRedirectedPages?.length) {
      arSection.style.display = 'block';
      document.getElementById('auth-redirects-badge').textContent = data.authRedirectedPages.length;
      document.getElementById('auth-redirects-list').innerHTML = data.authRedirectedPages.map((u, i) =>
        `<div class="visited-url-row"><span class="visited-url-num">${i + 1}</span><a class="visited-url-link" href="${escapeHTML(u)}" target="_blank" rel="noopener">${escapeHTML(u)}</a></div>`
      ).join('');
    } else {
      arSection.style.display = 'none';
    }
  }

  // ── Failed Pages ──
  const fpSection = document.getElementById('failed-pages-section');
  if (fpSection) {
    if (data.failedPages?.length) {
      fpSection.style.display = 'block';
      document.getElementById('failed-pages-badge').textContent = data.failedPages.length;
      document.getElementById('failed-pages-list').innerHTML = data.failedPages.map((p, i) =>
        `<div class="visited-url-row"><span class="visited-url-num">${i + 1}</span><a class="visited-url-link" href="${escapeHTML(p.url)}" target="_blank" rel="noopener">${escapeHTML(p.url)}</a><span class="failed-reason">${escapeHTML(p.reason || '')}</span></div>`
      ).join('');
    } else {
      fpSection.style.display = 'none';
    }
  }

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
function extractGQLName(call) {
  // 1. Use operationName from the request body
  if (call.body?.operationName) return call.body.operationName;
  // 2. Parse "query FooName {" or "mutation FooName {" from the query string
  const q = call.body?.query || '';
  const m = q.match(/^\s*(query|mutation|subscription)\s+(\w+)/i);
  if (m) return m[2];
  // 3. Derive from first field in the selection set
  const field = q.match(/\{\s*(\w+)/);
  if (field) return field[1];
  return 'GraphQL Call';
}

function renderEndpointBanner(bannerId, urls) {
  const banner = document.getElementById(bannerId);
  if (!banner) return;
  if (!urls.length) { banner.style.display = 'none'; return; }
  banner.style.display = 'flex';
  banner.innerHTML = `<span class="endpoint-banner-label">Captured via</span>` +
    urls.map(u => `<span class="endpoint-banner-url">${escapeHTML(u)}</span>`).join('');
}

function renderAPICalls(apiCalls) {
  if (!apiCalls) return;

  const hasData = (apiCalls.graphql?.length || 0) + (apiCalls.rest?.length || 0) > 0;
  document.getElementById('api-empty').style.display = hasData ? 'none' : 'flex';
  document.getElementById('api-content').style.display = hasData ? 'block' : 'none';

  document.getElementById('gql-count').textContent = apiCalls.graphql?.length || 0;
  document.getElementById('rest-count').textContent = apiCalls.rest?.length || 0;

  // Endpoint banners
  const gqlEndpoints = [...new Set((apiCalls.graphql || []).map(c => c.url))];
  const restOrigins  = [...new Set((apiCalls.rest   || []).map(c => { try { const u = new URL(c.url); return u.origin; } catch { return c.url; } }))];
  renderEndpointBanner('gql-endpoint-banner', gqlEndpoints);
  renderEndpointBanner('rest-endpoint-banner', restOrigins);

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

    const displayName = isGraphQL
      ? extractGQLName(call)
      : (() => { try { const u = new URL(call.url); return u.pathname + (u.search ? u.search.substring(0, 40) : ''); } catch { return call.url; } })();

    card.innerHTML = `
      <div class="call-header" data-i="${i}">
        <span class="call-method ${methodClass}">${call.method || 'GET'}</span>
        ${isGraphQL ? `<span class="call-graphql-badge">GraphQL</span>` : ''}
        <span class="call-name">${escapeHTML(displayName)}</span>
        ${status ? `<span class="call-status ${statusClass}">${status}</span>` : ''}
        <span class="call-time">${formatTime(call.timestamp)}</span>
        <span>&#9660;</span>
      </div>
      <div class="call-body" style="display:none">
        <div class="call-section-label">URL</div><div class="call-full-url">${escapeHTML(call.url)}</div>
        ${call.body ? `<div class="call-section-label" style="margin-top:10px">Request Body</div><pre class="call-json">${escapeHTML(JSON.stringify(call.body, null, 2))}</pre>` : ''}
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
