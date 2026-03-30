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
const _credsSubmitted = new Set(); // sessions that have already submitted credentials
let scrapedData = null;
let _lastScrapePayload = null; // stored for retry-failed-pages

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
    case 'progress':        updateSessionProgress(sessionId, msg.step, msg.percent, msg); break;
    case 'siteInfo':        updateSessionSitePreview(sessionId, msg.data); break;
    case 'needsAuth':       showSessionCredsPrompt(sessionId); break;
    case 'authToken':       _apaAutoFillToken(msg.token, msg.endpoint); break;
    case 'needVerification':showSessionVerifyPrompt(sessionId); break;
    case 'liveFrame':       updateSessionLiveFrame(sessionId, msg.dataUrl); break;
    case 'sessionSaved':
      document.getElementById('session-badge').style.display = 'flex';
      showToast(`Session saved for ${msg.hostname}`);
      break;
    case 'paused': {
      const pb = document.getElementById(`spb-${sessionId}`);
      if (pb) { pb.innerHTML = '&#9654; Resume'; pb.classList.add('session-pause-btn--paused'); }
      updateSessionProgress(sessionId, 'Paused', null);
      break;
    }
    case 'resumed': {
      const pb = document.getElementById(`spb-${sessionId}`);
      if (pb) { pb.innerHTML = '&#9646;&#9646; Pause'; pb.classList.remove('session-pause-btn--paused'); }
      break;
    }
    case 'partialResults':  onPartialResults(sessionId, msg); break;
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

// ---- Runs panel state ----
let activeRunId = null;
const _runDataCache = new Map(); // cache full run data keyed by run id
let _comparePickA = null; // first run selected for quick compare from Runs panel

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

  const setImagesUI = (on, limit) => {
    document.getElementById('preset-images').checked = on;
    document.getElementById('preset-images-wrap').style.display = on ? 'inline' : 'none';
    document.getElementById('preset-image-limit').value = limit || 0;
  };
  const setAvoidTags = (tags = []) => {
    document.querySelectorAll('.preset-avoid-tag').forEach(cb => {
      cb.checked = tags.includes(cb.value);
    });
    renderAvoidPills('preset-avoid-pills', '.preset-avoid-tag');
  };

  if (editIdx >= 0) {
    const p = getPresets()[editIdx];
    title.textContent = '✎ Edit Preset';
    document.getElementById('preset-name').value = p.name || '';
    document.getElementById('preset-url').value = p.url || '';
    document.getElementById('preset-icon-url').value = p.iconUrl || '';
    document.getElementById('preset-capture-urls').checked = p.capturePageUrls !== false;
    document.getElementById('preset-graphql').checked = p.captureGraphQL !== false;
    document.getElementById('preset-rest').checked = p.captureREST !== false;
    document.getElementById('preset-assets').checked = !!p.captureAssets;
    document.getElementById('preset-all-requests').checked = !!p.captureAllRequests;
    setImagesUI(!!p.captureImages, p.imageLimit);
    setAvoidTags(p.avoidTags || ['logout', 'cart']);
    document.getElementById('preset-scroll').checked = p.autoScroll !== false;
    document.getElementById('preset-dropdowns').checked = !!p.captureDropdowns;
    document.getElementById('preset-screenshots').checked = !!p.captureScreenshots;
    document.getElementById('preset-capture-speed').value = p.captureSpeed || 1;
    document.getElementById('preset-capture-speed-val').textContent = p.captureSpeed || 1;
    document.getElementById('preset-slow-motion').value = p.slowMotion || 0;
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
    document.getElementById('preset-capture-urls').checked = document.getElementById('capture-urls').checked;
    document.getElementById('preset-graphql').checked = document.getElementById('capture-graphql').checked;
    document.getElementById('preset-rest').checked = document.getElementById('capture-rest').checked;
    document.getElementById('preset-assets').checked = document.getElementById('capture-assets').checked;
    document.getElementById('preset-all-requests').checked = document.getElementById('capture-all-requests').checked;
    const captImgOn = document.getElementById('capture-images').checked;
    setImagesUI(captImgOn, document.getElementById('image-limit').value);
    setAvoidTags([...document.querySelectorAll('.avoid-tag:checked')].map(el => el.value));
    document.getElementById('preset-scroll').checked = document.getElementById('auto-scroll').checked;
    document.getElementById('preset-dropdowns').checked = document.getElementById('capture-dropdowns').checked;
    document.getElementById('preset-screenshots').checked = document.getElementById('capture-screenshots').checked;
    const csVal = document.getElementById('capture-speed').value || 1;
    document.getElementById('preset-capture-speed').value = csVal;
    document.getElementById('preset-capture-speed-val').textContent = csVal;
    document.getElementById('preset-slow-motion').value = document.getElementById('slow-motion').value || 0;
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
document.getElementById('preset-images').addEventListener('change', function () {
  document.getElementById('preset-images-wrap').style.display = this.checked ? 'inline' : 'none';
});
document.getElementById('preset-capture-speed').addEventListener('input', function () {
  document.getElementById('preset-capture-speed-val').textContent = this.value;
});
document.getElementById('preset-image-limit').addEventListener('click', e => e.stopPropagation());
document.getElementById('preset-image-limit').addEventListener('mousedown', e => e.stopPropagation());

// Preset modal avoid-tag pills update on change
document.getElementById('preset-avoid-grid').addEventListener('change', () => {
  renderAvoidPills('preset-avoid-pills', '.preset-avoid-tag');
});

document.getElementById('btn-preset-save').addEventListener('click', () => {
  const name = document.getElementById('preset-name').value.trim();
  const url  = document.getElementById('preset-url').value.trim();
  const iconUrl = document.getElementById('preset-icon-url').value.trim();
  if (!name) { document.getElementById('preset-name').focus(); return; }
  if (!url)  { document.getElementById('preset-url').focus(); return; }
  const limitDepth = document.getElementById('preset-limitdepth').checked;
  const fullCrawl  = document.getElementById('preset-fullcrawl').checked;
  const captureImages = document.getElementById('preset-images').checked;
  const preset = {
    name, url,
    iconUrl: iconUrl || '',
    limitDepth,
    scrapeDepth: limitDepth ? (parseInt(document.getElementById('preset-depth').value) || 3) : 99,
    capturePageUrls: document.getElementById('preset-capture-urls').checked,
    captureGraphQL: document.getElementById('preset-graphql').checked,
    captureREST: document.getElementById('preset-rest').checked,
    captureAssets: document.getElementById('preset-assets').checked,
    captureAllRequests: document.getElementById('preset-all-requests').checked,
    captureImages,
    imageLimit: captureImages ? (parseInt(document.getElementById('preset-image-limit').value) || 0) : 0,
    avoidTags: [...document.querySelectorAll('.preset-avoid-tag:checked')].map(el => el.value),
    autoScroll: document.getElementById('preset-scroll').checked,
    captureDropdowns: document.getElementById('preset-dropdowns').checked,
    captureScreenshots: document.getElementById('preset-screenshots').checked,
    captureSpeed: parseInt(document.getElementById('preset-capture-speed').value, 10) || 1,
    workerCount: parseInt(document.getElementById('worker-count')?.value, 10) || 0,
    slowMotion: parseInt(document.getElementById('preset-slow-motion').value, 10) || 0,
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
  document.getElementById('capture-urls').checked = preset.capturePageUrls !== false;
  document.getElementById('capture-graphql').checked = preset.captureGraphQL !== false;
  document.getElementById('capture-rest').checked = preset.captureREST !== false;
  document.getElementById('capture-assets').checked = !!preset.captureAssets;
  document.getElementById('capture-all-requests').checked = !!preset.captureAllRequests;
  // Images
  const imgOn = !!preset.captureImages;
  document.getElementById('capture-images').checked = imgOn;
  document.getElementById('images-inline-wrap').style.display = imgOn ? 'inline' : 'none';
  document.getElementById('image-limit').value = preset.imageLimit || 0;
  // Avoid tags
  const avoidTags = preset.avoidTags || ['logout', 'cart'];
  document.querySelectorAll('.avoid-tag').forEach(cb => { cb.checked = avoidTags.includes(cb.value); });
  renderAvoidPills('avoid-links-pills', '.avoid-tag');
  document.getElementById('auto-scroll').checked = preset.autoScroll !== false;
  document.getElementById('capture-dropdowns').checked = !!preset.captureDropdowns;
  document.getElementById('capture-screenshots').checked = !!preset.captureScreenshots;
  const presetCsVal = preset.captureSpeed || 1;
  document.getElementById('capture-speed').value = presetCsVal;
  const presetWc = preset.workerCount || 0;
  document.getElementById('worker-count').value = presetWc || '';
  document.getElementById('capture-speed-badge').textContent = presetWc
    ? `${presetWc} workers (custom)`
    : (_captureSpeedLabels[presetCsVal] || `${presetCsVal}`);
  document.getElementById('slow-motion').value = preset.slowMotion || 0;
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
// Render selected tag pills into a container
function renderAvoidPills(pillsContainerId, cbSelector) {
  const container = document.getElementById(pillsContainerId);
  if (!container) return;
  const checked = [...document.querySelectorAll(cbSelector + ':checked')];
  container.innerHTML = checked.map(cb => {
    const label = cb.closest('label');
    const name = (label ? label.textContent : cb.value).trim();
    return `<span class="avoid-tag-pill">${escapeHTML(name)}</span>`;
  }).join('');
}

// Wire main form avoid-tag checkboxes
document.querySelectorAll('.avoid-tag').forEach(cb => {
  cb.addEventListener('change', () => renderAvoidPills('avoid-links-pills', '.avoid-tag'));
});
// Initial render
renderAvoidPills('avoid-links-pills', '.avoid-tag');

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
    captureDropdowns: document.getElementById('capture-dropdowns').checked,
    captureScreenshots: document.getElementById('capture-screenshots').checked,
    captureSpeed: parseInt(document.getElementById('capture-speed').value, 10) || 1,
    workerCount: parseInt(document.getElementById('worker-count').value, 10) || 0,
    politeDelay: parseInt(document.getElementById('polite-delay')?.value, 10) || 0,
    showBrowser: false,
    liveView,
    slowMotion: parseInt(document.getElementById('slow-motion').value, 10),
    fullCrawl: document.getElementById('full-crawl').checked,
    maxPages: document.getElementById('full-crawl').checked ? 0 : (parseInt(document.getElementById('max-pages').value, 10) || 100),
  };

  _lastScrapePayload = payload;
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
      <span class="session-hdr-counts" id="shc-${sid}"></span>
      <span class="session-hdr-pct" id="shp-${sid}">0%</span>
      <button class="btn-xs session-log-toggle" id="slt-${sid}" title="Hide/show console">&#128221; Console</button>
      <button class="btn-xs session-collapse-btn" id="scb-${sid}" title="Collapse">&#9650;</button>
      <button class="btn-xs session-pause-btn" id="spb-${sid}" title="Pause scrape">&#9646;&#9646; Pause</button>
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
      <div class="log-box-wrap">
        <div class="log-box session-log-box" id="slb-${sid}"></div>
        <button class="btn-copy-log" id="scl-${sid}" title="Copy all log text">&#128203;</button>
      </div>
      <div class="live-browser-panel" id="slp-${sid}" style="${liveView ? 'display:block' : 'display:none'}">
        <div class="live-browser-header">
          <span>&#128247; Live Browser View</span>
        </div>
        <div class="live-browser-body">
          <img class="live-frame-img" id="slf-${sid}" src="" alt="Live view" />
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

  // Copy log button + right-click → Copy all
  const _copyLog = (btn) => {
    const box = document.getElementById(`slb-${sid}`);
    if (!box) return;
    const text = [...box.querySelectorAll('.log-entry')].map(el => el.textContent).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      if (btn) { const prev = btn.textContent; btn.textContent = '✓'; setTimeout(() => { btn.textContent = prev; }, 1200); }
    }).catch(() => {});
  };
  panel.querySelector(`#scl-${sid}`).addEventListener('click', (e) => { e.stopPropagation(); _copyLog(e.currentTarget); });
  panel.querySelector(`#slb-${sid}`).addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.innerHTML = '<div class="ctx-item">&#128203; Copy all log text</div>';
    menu.style.cssText = `left:${e.clientX}px;top:${e.clientY}px`;
    document.body.appendChild(menu);
    menu.querySelector('.ctx-item').addEventListener('click', () => { _copyLog(null); menu.remove(); });
    const dismiss = () => { menu.remove(); document.removeEventListener('click', dismiss); };
    setTimeout(() => document.addEventListener('click', dismiss), 0);
  });

  // Collapse toggle
  panel.querySelector(`#scb-${sid}`).addEventListener('click', () => {
    const body = document.getElementById(`sbody-${sid}`);
    const btn  = document.getElementById(`scb-${sid}`);
    const collapsed = body.style.display === 'none';
    body.style.display = collapsed ? 'block' : 'none';
    btn.innerHTML = collapsed ? '&#9650;' : '&#9660;';
  });

  // Pause / Resume
  let _sessionPaused = false;
  panel.querySelector(`#spb-${sid}`).addEventListener('click', async () => {
    const btn = document.getElementById(`spb-${sid}`);
    if (!_sessionPaused) {
      await fetch(`/api/scrape/${sid}/pause`, { method: 'POST' }).catch(() => {});
      _sessionPaused = true;
      btn.innerHTML = '&#9654; Resume';
      btn.classList.add('session-pause-btn--paused');
    } else {
      await fetch(`/api/scrape/${sid}/resume`, { method: 'POST' }).catch(() => {});
      _sessionPaused = false;
      btn.innerHTML = '&#9646;&#9646; Pause';
      btn.classList.remove('session-pause-btn--paused');
    }
  });

  // Stop
  panel.querySelector(`#ssb-${sid}`).addEventListener('click', async () => {
    await fetch(`/api/scrape/${sid}/stop`, { method: 'POST' }).catch(() => {});
    appendSessionLog(sid, 'Scrape stopped by user.', 'warn');
    finalizeSession(sid, false);
  });

  // Credentials
  const submitCreds = async () => {
    const user = document.getElementById(`scu-${sid}`).value.trim();
    const pass = document.getElementById(`scpw-${sid}`).value;
    if (!user || !pass) return;
    await fetch(`/api/scrape/${sid}/credentials`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass }),
    });
    document.getElementById(`scp-${sid}`).style.display = 'none';
    _credsSubmitted.add(sid);
    appendSessionLog(sid, 'Credentials submitted — continuing scrape...', 'info');
  };
  panel.querySelector('.session-submit-creds').addEventListener('click', submitCreds);
  panel.querySelector(`#scpw-${sid}`).addEventListener('keydown', (e) => { if (e.key === 'Enter') submitCreds(); });
  panel.querySelector(`#scu-${sid}`).addEventListener('keydown', (e) => { if (e.key === 'Enter') panel.querySelector(`#scpw-${sid}`).focus(); });

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

function updateSessionProgress(sessionId, step, percent, extra = {}) {
  const stepEl   = document.getElementById(`shs-${sessionId}`);
  const pctEl    = document.getElementById(`shp-${sessionId}`);
  const barEl    = document.getElementById(`smb-${sessionId}`);
  const countEl  = document.getElementById(`shc-${sessionId}`);
  if (stepEl) stepEl.textContent = step;
  if (percent !== null && percent !== undefined) {
    if (pctEl) pctEl.textContent = `${percent}%`;
    if (barEl) barEl.style.width = `${percent}%`;
  }
  if (countEl && extra.visited !== undefined) {
    const visited = extra.visited;
    const total   = extra.total;
    const failed  = extra.failed || 0;
    const queued  = extra.queued || 0;
    let txt = `${visited}/${total} pages`;
    if (queued > 0) txt += ` · ${queued} queued`;
    if (failed > 0) txt += ` · ${failed} failed`;
    countEl.textContent = txt;
  }
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
  if (_credsSubmitted.has(sessionId)) return;
  const el = document.getElementById(`scp-${sessionId}`);
  if (el) {
    el.style.display = 'block';
    document.getElementById(`scu-${sessionId}`)?.focus();
  }
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
  const pauseBtn = document.getElementById(`spb-${sessionId}`);
  if (pauseBtn) { pauseBtn.style.display = 'none'; }
  activeSessions.delete(sessionId);
  _credsSubmitted.delete(sessionId);
  // Mark panel as done
  const panel = document.getElementById(`sp-${sessionId}`);
  if (panel) {
    panel.classList.add(success ? 'session-done' : 'session-stopped');
    // Add a dismiss button so the user can close completed/stopped sessions
    const header = panel.querySelector('.session-header');
    if (header && !header.querySelector('.btn-dismiss-session')) {
      const dismissBtn = document.createElement('button');
      dismissBtn.className = 'btn-xs btn-dismiss-session';
      dismissBtn.title = 'Dismiss this session';
      dismissBtn.textContent = '✕';
      dismissBtn.addEventListener('click', () => panel.remove());
      header.appendChild(dismissBtn);
    }
  }
}

function onPartialResults(sessionId, msg) {
  // Update the results badge with live count while scraping
  const badge = document.getElementById('results-badge');
  badge.textContent = msg.pageCount;
  badge.style.display = 'inline-block';
  // Show live count in the session header
  appendSessionLog(sessionId, `Pages captured so far: ${msg.pageCount} (${msg.queueSize} in queue)`, 'info');
}

function onSessionComplete(sessionId, data) {
  scrapedData = data;
  saveToHistory(data);
  loadRuns(); // refresh runs badge + card list
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

// ---- Card detail builder ----
function buildCardDetail(key, data) {
  const esc = escapeHTML;
  const allPages = data.pages || [];
  const firstPage = allPages[0];

  const urlRow = (u, i) =>
    `<div class="cd-row"><span class="cd-num">${i + 1}</span><a class="cd-url" href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a></div>`;

  switch (key) {
    case 'pages': {
      if (!allPages.length) return '<p class="cd-empty">No pages scraped.</p>';
      const dropdownCount = allPages.filter(p => p._dropdownState).length;
      const dropdownSummary = dropdownCount > 0
        ? `<div class="cd-dropdown-summary">&#9660; ${dropdownCount} dropdown state${dropdownCount !== 1 ? 's' : ''} captured</div>`
        : '';
      const pagesExportBtn = `<div class="cd-export-row"><button class="btn-xs" id="cd-export-pages-csv">&#8659; Export CSV</button></div>`;
      setTimeout(() => {
        const btn = document.getElementById('cd-export-pages-csv');
        if (btn) btn.addEventListener('click', () => {
          downloadCSV(allPages.map(p => ({
            url: p.meta?.url || '',
            title: p.meta?.title || '',
            statusCode: p.meta?.statusCode || '',
            responseTime: p.meta?.responseTime || '',
            domElements: p.domStats?.totalElements || '',
            links: p.links?.length || 0,
            images: p.images?.length || 0,
          })), ['url','title','statusCode','responseTime','domElements','links','images'], 'pages.csv');
        });
      }, 0);
      return pagesExportBtn + dropdownSummary + allPages.map((p, i) =>
        `<div class="cd-row">
          <span class="cd-num">${i + 1}</span>
          <div class="cd-main">
            <div class="cd-title">${esc(p.meta?.title || '(no title)')}</div>
            <a class="cd-url" href="${esc(p.meta?.url || '')}" target="_blank" rel="noopener">${esc(p.meta?.url || '')}</a>
            ${p._dropdownState ? `<div class="cd-dropdown-badge">&#9660; Dropdown: <strong>${esc(p._dropdownState.label)}</strong> &rarr; ${esc(p._dropdownState.option)}</div>` : ''}
          </div>
          <div class="cd-chips">
            <span class="cd-chip">${p.links?.length || 0} links</span>
            <span class="cd-chip">${p.images?.length || 0} imgs</span>
            <span class="cd-chip">${p.forms?.length || 0} forms</span>
          </div>
        </div>`).join('');
    }

    case 'dom': {
      const s = firstPage?.domStats || {};
      const entries = Object.entries(s);
      if (!entries.length) return '<p class="cd-empty">No DOM stats available.</p>';
      return `<div class="cd-kv-grid">${entries.map(([k, v]) =>
        `<div class="cd-kv-row"><span class="cd-kv-key">${esc(k)}</span><span class="cd-kv-val">${v}</span></div>`).join('')}</div>`;
    }

    case 'images': {
      const imgs = allPages.flatMap(p => p.images || []);
      if (!imgs.length) return '<p class="cd-empty">No images found.</p>';
      return `<div class="cd-img-grid">${imgs.slice(0, 120).map(img =>
        `<div class="cd-img-card">
          <img src="${esc(img.src)}" alt="${esc(img.alt || '')}" loading="lazy" onerror="this.style.display='none'">
          <div class="cd-img-info">
            <span class="cd-img-alt">${esc(img.alt || '(no alt)')}</span>
            ${img.width ? `<span class="cd-chip">${img.width}×${img.height}</span>` : ''}
          </div>
        </div>`).join('')}</div>`;
    }

    case 'links': {
      const links = allPages.flatMap(p => p.links || []);
      if (!links.length) return '<p class="cd-empty">No links found.</p>';
      return links.slice(0, 300).map(l =>
        `<div class="cd-row">
          <span class="cd-chip ${l.isInternal ? 'chip-int' : 'chip-ext'}">${l.isInternal ? 'INT' : 'EXT'}</span>
          <div class="cd-main">
            ${l.text ? `<div class="cd-title">${esc(l.text)}</div>` : ''}
            <a class="cd-url" href="${esc(l.href || '')}" target="_blank" rel="noopener">${esc(l.href || '')}</a>
          </div>
        </div>`).join('');
    }

    case 'graphql': {
      const calls = data.apiCalls?.graphql || [];
      if (!calls.length) return '<p class="cd-empty">No GraphQL calls captured.</p>';
      const gqlExportBtn = `<div class="cd-export-row"><button class="btn-xs" id="cd-export-gql-csv">&#8659; Export CSV</button></div>`;
      setTimeout(() => {
        const btn = document.getElementById('cd-export-gql-csv');
        if (btn) btn.addEventListener('click', () => {
          downloadCSV(calls.map(c => ({
            url: c.url, method: c.method, type: 'graphql',
            operationName: c.body?.operationName || '',
            statusCode: c.response?.status || '',
          })), ['url','method','type','operationName','statusCode'], 'graphql-calls.csv');
        });
      }, 0);
      return gqlExportBtn + calls.map((c, i) => {
        const opName = c.body?.operationName ||
          (typeof c.body?.query === 'string' ? (c.body.query.match(/(?:query|mutation|subscription)\s+(\w+)/)?.[1]) : null) ||
          `Call ${i + 1}`;
        const st = c.response?.status;
        return `<div class="cd-row">
          <span class="cd-chip chip-gql">${c.method}</span>
          <div class="cd-main">
            <div class="cd-title">${esc(opName)}</div>
            <span class="cd-url">${esc(c.url)}</span>
          </div>
          ${st ? `<span class="cd-chip ${st < 300 ? 'chip-ok' : 'chip-err'}">${st}</span>` : ''}
        </div>`;
      }).join('');
    }

    case 'rest': {
      const calls = data.apiCalls?.rest || [];
      if (!calls.length) return '<p class="cd-empty">No REST calls captured.</p>';
      const restExportBtn = `<div class="cd-export-row"><button class="btn-xs" id="cd-export-rest-csv">&#8659; Export CSV</button></div>`;
      setTimeout(() => {
        const btn = document.getElementById('cd-export-rest-csv');
        if (btn) btn.addEventListener('click', () => {
          downloadCSV(calls.map(c => ({
            url: c.url, method: c.method, type: 'rest', statusCode: c.response?.status || '',
          })), ['url','method','type','statusCode'], 'rest-calls.csv');
        });
      }, 0);
      return restExportBtn + calls.map(c => {
        const path = (() => { try { return new URL(c.url).pathname; } catch { return c.url; } })();
        const st = c.response?.status;
        return `<div class="cd-row">
          <span class="cd-chip chip-method">${c.method}</span>
          <div class="cd-main">
            <div class="cd-title">${esc(path)}</div>
            <span class="cd-url">${esc(c.url)}</span>
          </div>
          ${st ? `<span class="cd-chip ${st < 300 ? 'chip-ok' : 'chip-err'}">${st}</span>` : ''}
        </div>`;
      }).join('');
    }

    case 'all': {
      const reqs = data.apiCalls?.all || [];
      if (!reqs.length) return '<p class="cd-empty">No requests captured. Enable "Capture All Requests" in options.</p>';
      const allExportBtn = `<div class="cd-export-row"><button class="btn-xs" id="cd-export-all-csv">&#8659; Export CSV</button></div>`;
      setTimeout(() => {
        const btn = document.getElementById('cd-export-all-csv');
        if (btn) btn.addEventListener('click', () => {
          downloadCSV(reqs.map(c => ({
            url: c.url, method: c.method, resourceType: c.resourceType, statusCode: c.response?.status || '',
          })), ['url','method','resourceType','statusCode'], 'all-requests.csv');
        });
      }, 0);
      return allExportBtn + reqs.slice(0, 500).map(c => {
        const st = c.response?.status;
        return `<div class="cd-row">
          <span class="cd-chip chip-method">${c.method}</span>
          <span class="cd-chip">${c.resourceType}</span>
          <a class="cd-url" href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.url)}</a>
          ${st ? `<span class="cd-chip ${st < 300 ? 'chip-ok' : 'chip-err'}">${st}</span>` : ''}
        </div>`;
      }).join('');
    }

    case 'websockets': {
      const ws = data.websockets || [];
      if (!ws.length) return '<p class="cd-empty">No WebSockets captured.</p>';
      return ws.map((w, i) =>
        `<div class="cd-row">
          <span class="cd-chip chip-ws">WS</span>
          <div class="cd-main">
            <span class="cd-url">${esc(w.url)}</span>
            <div class="cd-chips">
              <span class="cd-chip">${w.frames?.length || 0} frames</span>
              ${(w.frames || []).slice(0, 2).map(f =>
                `<span class="cd-frame-preview">${esc(String(f.payload).substring(0, 100))}</span>`).join('')}
            </div>
          </div>
        </div>`).join('');
    }

    case 'assets': {
      const assets = data.assets || [];
      if (!assets.length) return '<p class="cd-empty">No assets captured.</p>';
      return assets.slice(0, 300).map(a =>
        `<div class="cd-row">
          <span class="cd-chip">${esc(a.type)}</span>
          <a class="cd-url" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.url)}</a>
        </div>`).join('');
    }

    case 'dl-images': {
      const imgs = data.downloadedImages || [];
      if (!imgs.length) return '<p class="cd-empty">No images downloaded.</p>';
      return `<div class="cd-img-grid">${imgs.map(img =>
        `<div class="cd-img-card">
          <img src="${img.dataUrl}" alt="${esc(img.alt || '')}" loading="lazy">
          <div class="cd-img-info">
            <span class="cd-img-alt">${esc(img.alt || '(no alt)')}</span>
            ${img.width ? `<span class="cd-chip">${img.width}×${img.height}</span>` : ''}
            <span class="cd-chip">${formatBytes(img.size || 0)}</span>
          </div>
        </div>`).join('')}</div>`;
    }

    case 'cookies': {
      const c = data.cookies || [];
      if (!c.length) return '<p class="cd-empty">No cookies captured.</p>';
      return `<table class="cd-table"><thead><tr><th>Name</th><th>Domain</th><th>Value</th><th>Secure</th><th>HttpOnly</th><th>SameSite</th></tr></thead><tbody>
        ${c.map(ck => `<tr>
          <td class="cd-name">${esc(ck.name)}</td>
          <td>${esc(ck.domain || '')}</td>
          <td class="cd-val">${esc(String(ck.value || '').substring(0, 80))}</td>
          <td class="${ck.secure ? 'flag-yes' : 'flag-no'}">${ck.secure ? '✓' : '✗'}</td>
          <td class="${ck.httpOnly ? 'flag-yes' : 'flag-no'}">${ck.httpOnly ? '✓' : '✗'}</td>
          <td>${esc(ck.sameSite || '-')}</td>
        </tr>`).join('')}</tbody></table>`;
    }

    case 'consolelogs': {
      const logs = data.consoleLogs || [];
      if (!logs.length) return '<p class="cd-empty">No console logs captured.</p>';
      const typeColor = { error: 'chip-err', warning: 'chip-warn', warn: 'chip-warn', log: 'chip-log', info: 'chip-info' };
      return logs.slice(0, 500).map(l =>
        `<div class="cd-row">
          <span class="cd-chip ${typeColor[l.type] || 'chip-log'}">${esc(l.type)}</span>
          <span class="cd-log-msg">${esc(l.text)}</span>
        </div>`).join('');
    }

    case 'scripts': {
      const scripts = allPages.flatMap(p => p.scripts || []);
      if (!scripts.length) return '<p class="cd-empty">No scripts found.</p>';
      return scripts.map((s, i) =>
        `<div class="cd-row">
          <span class="cd-num">${i + 1}</span>
          ${s.src
            ? `<a class="cd-url" href="${esc(s.src)}" target="_blank" rel="noopener">${esc(s.src)}</a>`
            : `<span class="cd-url cd-inline">(inline, ${s.content?.length || 0} chars)</span>`}
        </div>`).join('');
    }

    case 'forms': {
      const forms = allPages.flatMap(p => p.forms || []);
      if (!forms.length) return '<p class="cd-empty">No forms found.</p>';
      return forms.map((f, i) =>
        `<div class="cd-row">
          <span class="cd-num">${i + 1}</span>
          <div class="cd-main">
            <div class="cd-title">${esc(f.action || '(no action)')}</div>
            <div class="cd-chips">${(f.inputs || []).map(inp =>
              `<span class="cd-chip">${esc(inp.type || 'text')}:${esc(inp.name || inp.id || '?')}</span>`).join('')}</div>
          </div>
        </div>`).join('');
    }

    case 'errors': {
      const errs = data.errors || [];
      if (!errs.length) return '<p class="cd-empty">No errors.</p>';
      return errs.slice(0, 300).map(e =>
        `<div class="cd-row">
          <span class="cd-chip chip-err">${esc(e.type || 'error')}</span>
          <div class="cd-main">
            ${e.url ? `<a class="cd-url" href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.url)}</a>` : ''}
            <div class="cd-error-msg">${esc(e.message || e.failure || '')}</div>
          </div>
        </div>`).join('');
    }

    case 'auth-redirects':
      return (data.authRedirectedPages || []).map(urlRow).join('') || '<p class="cd-empty">No auth redirects.</p>';

    case 'failed-pages': {
      const failed = data.failedPages || [];
      if (!failed.length) return '<p class="cd-empty">No failed pages.</p>';
      const retryBtn = `<div class="cd-export-row"><button class="btn-xs" id="cd-retry-failed">&#8635; Retry Failed Pages</button></div>`;
      setTimeout(() => {
        const btn = document.getElementById('cd-retry-failed');
        if (btn) btn.addEventListener('click', async () => {
          if (!_lastScrapePayload) return showToast('No scrape options available');
          btn.disabled = true; btn.textContent = 'Retrying...';
          for (const p of failed) {
            try {
              await fetch('/api/scrape', { method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ ..._lastScrapePayload, url: p.url, maxPages: 1, fullCrawl: false }) });
            } catch {}
          }
          btn.textContent = `Started ${failed.length} retry session${failed.length !== 1 ? 's' : ''}`;
          showToast(`Retrying ${failed.length} failed page${failed.length !== 1 ? 's' : ''}`);
        });
      }, 0);
      return retryBtn + failed.map((p, i) =>
        `<div class="cd-row">
          <span class="cd-num">${i + 1}</span>
          <div class="cd-main">
            <a class="cd-url" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url)}</a>
            <span class="cd-error-msg">${esc(p.reason || '')}</span>
          </div>
        </div>`).join('');
    }

    default:
      return '<p class="cd-empty">No details available.</p>';
  }
}

// ---- Results rendering ----
function renderResults(data) {
  document.getElementById('results-empty').style.display = 'none';
  document.getElementById('results-content').style.display = 'block';

  // Summary cards
  const grid = document.getElementById('summary-grid');
  const firstPage = data.pages?.[0];
  grid.innerHTML = '';

  // Store for card detail popups
  window._scraperResult = data;

  const cards = [
    { label: 'Pages Scraped', key: 'pages', value: data.pages?.length || 0 },
    { label: 'DOM Elements', key: 'dom', value: firstPage?.domStats?.totalElements || 0 },
    { label: 'Images', key: 'images', value: (data.pages?.flatMap(p => p.images || []).length) || 0 },
    { label: 'Links', key: 'links', value: (data.pages?.flatMap(p => p.links || []).length) || 0 },
    { label: 'GraphQL Calls', key: 'graphql', value: data.apiCalls?.graphql?.length || 0 },
    { label: 'REST Calls', key: 'rest', value: data.apiCalls?.rest?.length || 0 },
    { label: 'All Requests', key: 'all', value: data.apiCalls?.all?.length || 0 },
    { label: 'WebSockets', key: 'websockets', value: data.websockets?.length || 0 },
    { label: 'Assets', key: 'assets', value: data.assets?.length || 0 },
    { label: 'Dl. Images', key: 'dl-images', value: data.downloadedImages?.length || 0 },
    { label: 'Cookies', key: 'cookies', value: data.cookies?.length || 0 },
    { label: 'Console Logs', key: 'consolelogs', value: data.consoleLogs?.length || 0 },
    { label: 'Scripts', key: 'scripts', value: (data.pages?.flatMap(p => p.scripts || []).length) || 0 },
    { label: 'Forms', key: 'forms', value: (data.pages?.flatMap(p => p.forms || []).length) || 0 },
    { label: 'Errors', key: 'errors', value: data.errors?.length || 0, err: (data.errors?.length > 0) },
    ...(data.authRedirectedPages?.length ? [{ label: 'Auth Redirects', key: 'auth-redirects', value: data.authRedirectedPages.length, warn: true }] : []),
    ...(data.failedPages?.length ? [{ label: 'Failed Pages', key: 'failed-pages', value: data.failedPages.length, err: true }] : []),
  ];

  let activeCardKey = null;
  const detailPanel = document.getElementById('card-detail-panel');
  const detailTitle = document.getElementById('card-detail-title');
  const detailBody = document.getElementById('card-detail-body');
  document.getElementById('card-detail-close').onclick = () => {
    detailPanel.style.display = 'none';
    activeCardKey = null;
    grid.querySelectorAll('.summary-card.active').forEach(el => el.classList.remove('active'));
  };

  cards.forEach((c) => {
    const card = document.createElement('div');
    card.className = 'summary-card' + (c.warn ? ' s-warn' : '') + (c.err ? ' s-err' : '');
    if (c.value > 0 || c.key === 'dom') card.classList.add('s-clickable');
    card.dataset.key = c.key;
    card.innerHTML = `<span class="s-label">${c.label}</span><span class="s-value">${c.value}</span>${(c.value > 0 || c.key === 'dom') ? '<span class="s-expand-hint">▾</span>' : ''}`;
    if (c.value > 0 || c.key === 'dom') {
      card.addEventListener('click', () => {
        if (activeCardKey === c.key) {
          detailPanel.style.display = 'none';
          activeCardKey = null;
          card.classList.remove('active');
          return;
        }
        grid.querySelectorAll('.summary-card.active').forEach(el => el.classList.remove('active'));
        card.classList.add('active');
        activeCardKey = c.key;
        detailTitle.textContent = c.label;
        detailBody.innerHTML = buildCardDetail(c.key, window._scraperResult);
        // Show search filter for filterable card types
        const filterRow = document.getElementById('card-detail-filter-row');
        const searchInput = document.getElementById('card-detail-search');
        const filterableTypes = ['pages', 'graphql', 'rest', 'all', 'links', 'assets', 'scripts', 'errors'];
        if (filterRow) {
          filterRow.style.display = filterableTypes.includes(c.key) ? 'block' : 'none';
          if (searchInput) {
            searchInput.value = '';
            searchInput.oninput = () => {
              const q = searchInput.value.toLowerCase();
              detailBody.querySelectorAll('.cd-row').forEach(row => {
                row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
              });
            };
          }
        }
        detailPanel.style.display = 'block';
        detailPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
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
    const errors = data.consoleLogs.filter(l => l.type === 'error');
    const warnings = data.consoleLogs.filter(l => l.type === 'warning' || l.type === 'warn');
    const badge = document.getElementById('console-badge');
    badge.textContent = data.consoleLogs.length;
    if (errors.length) badge.style.background = 'var(--error)';
    const box = document.getElementById('console-log-box');
    box.innerHTML = '';
    // Show errors first, then warnings, sorted by severity
    const sorted = [...errors, ...warnings,
      ...data.consoleLogs.filter(l => l.type !== 'error' && l.type !== 'warning' && l.type !== 'warn')];
    sorted.slice(0, 200).forEach(log => {
      const el = document.createElement('div');
      el.className = 'log-entry';
      const level = log.type === 'error' ? 'error' : log.type === 'warning' || log.type === 'warn' ? 'warn' : 'info';
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

// ============================================================
// ---- History (localStorage persistence) ----
// ============================================================
const HISTORY_KEY = 'scraper_history';
const HISTORY_HEAVY = ['htmlSource', 'layoutTree', 'stylesheetContents', 'screenshot', 'viewportScreenshot'];

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}

function saveToHistory(data) {
  const entry = {
    id: Date.now().toString(),
    url: data.pages?.[0]?.meta?.url || data.startUrl || '',
    ts: new Date().toISOString(),
    pageCount: data.pages?.length || 0,
    apiCount: (data.apiCalls?.graphql?.length || 0) + (data.apiCalls?.rest?.length || 0),
    data: JSON.parse(JSON.stringify(data, (key, val) =>
      HISTORY_HEAVY.includes(key) ? undefined : val
    )),
  };
  const history = getHistory();
  history.unshift(entry);
  if (history.length > 20) history.length = 20;
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch {}
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  if (!list || !empty) return;
  const history = getHistory();
  if (!history.length) {
    empty.style.display = 'block';
    list.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  list.style.display = 'block';
  list.innerHTML = history.map(e => `
    <div class="history-card" data-id="${escapeAttr(e.id)}">
      <div class="history-card-info">
        <div class="history-card-url">${escapeHTML(e.url || '(unknown)')}</div>
        <div class="history-card-meta">${new Date(e.ts).toLocaleString()} — ${e.pageCount} pages, ${e.apiCount} API calls</div>
      </div>
      <div class="history-card-actions">
        <button class="btn-xs btn-primary hc-load" data-id="${escapeAttr(e.id)}">Load</button>
        <button class="btn-xs btn-danger hc-del" data-id="${escapeAttr(e.id)}">Delete</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('.hc-load').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = getHistory().find(e => e.id === btn.dataset.id);
      if (!entry) return;
      window._scraperResult = entry.data;
      scrapedData = entry.data;
      renderResults(entry.data);
      renderAPICalls(entry.data.apiCalls);
      renderAssets(entry.data.assets);
      enableRefactor(entry.data);
      document.querySelector('[data-panel="results"]').click();
    });
  });
  list.querySelectorAll('.hc-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const history = getHistory().filter(e => e.id !== btn.dataset.id);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch {}
      renderHistory();
    });
  });
}

document.getElementById('btn-clear-history')?.addEventListener('click', () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
  showToast('History cleared');
});

document.querySelector('[data-panel="history"]')?.addEventListener('click', renderHistory);

// ============================================================
// ---- Runs Panel (unified history + server saves) ----
// ============================================================

document.querySelector('[data-panel="runs"]')?.addEventListener('click', loadRuns);
document.getElementById('btn-refresh-runs')?.addEventListener('click', loadRuns);
document.getElementById('btn-runs-clear')?.addEventListener('click', () => {
  activeRunId = null;
  const banner = document.getElementById('runs-active-banner');
  if (banner) banner.style.display = 'none';
  document.querySelectorAll('.run-card').forEach(c => c.classList.remove('run-card--active'));
});

async function loadRuns() {
  const list = document.getElementById('runs-list');
  if (!list) return;

  let serverSaves = [];
  try {
    const res = await fetch('/api/saves');
    if (res.ok) serverSaves = await res.json();
  } catch (_) {}

  // Merge with localStorage history, deduplicating by sessionId
  const localHistory = getHistory();
  const serverIds = new Set(serverSaves.map(s => s.sessionId));
  const localOnly = localHistory.filter(e => !serverIds.has(e.id));

  const runs = [
    ...serverSaves.map(s => ({
      id: s.sessionId, source: 'server',
      url: s.startUrl || '(unknown)',
      ts: s.lastSavedAt || s.startedAt,
      pageCount: s.pageCount || 0,
      apiCount: 0,
      assetCount: 0,
      status: s.status || 'complete',
      options: s.options || {},
    })),
    ...localOnly.map(e => ({
      id: e.id, source: 'local',
      url: e.url || '(unknown)',
      ts: e.ts,
      pageCount: e.pageCount || 0,
      apiCount: e.apiCount || 0,
      assetCount: e.data?.assets?.length || 0,
      status: 'complete',
      options: {},
    })),
  ].sort((a, b) => new Date(b.ts) - new Date(a.ts));

  const badge = document.getElementById('runs-badge');
  if (badge) { badge.textContent = runs.length; badge.style.display = runs.length ? 'inline-block' : 'none'; }

  renderRunCards(runs);
}

function renderRunCards(runs) {
  _comparePickA = null; // reset pending compare selection on each re-render
  const list = document.getElementById('runs-list');
  if (!list) return;
  if (!runs.length) {
    list.innerHTML = '<p class="empty-hint" style="padding:32px 0;text-align:center">No runs yet. Complete a scrape to see it here.</p>';
    return;
  }

  const statusClass = { complete: 'chip-ok', stopped: 'chip-warn', running: 'chip-info' };

  list.innerHTML = `<div class="runs-grid">${runs.map(r => {
    const hostname = (() => { try { return new URL(r.url).hostname; } catch { return r.url; } })();
    const initial = hostname.replace(/^www\./, '')[0]?.toUpperCase() || '?';
    const dateStr = new Date(r.ts).toLocaleString();
    const isActive = r.id === activeRunId;
    return `
      <div class="run-card${isActive ? ' run-card--active' : ''}" data-id="${escapeAttr(r.id)}" data-source="${r.source}">
        <div class="run-card-top">
          <div class="run-avatar">${escapeHTML(initial)}</div>
          <div class="run-card-meta">
            <div class="run-card-hostname">${escapeHTML(hostname)}</div>
            <div class="run-card-fullurl" title="${escapeAttr(r.url)}">${escapeHTML(r.url)}</div>
          </div>
          <span class="cd-chip ${statusClass[r.status] || 'chip-log'}">${escapeHTML(r.status)}</span>
        </div>
        <div class="run-stats">
          <div class="run-stat"><span class="run-stat-val">${r.pageCount}</span><span class="run-stat-lbl">pages</span></div>
          ${r.apiCount > 0 ? `<div class="run-stat"><span class="run-stat-val">${r.apiCount}</span><span class="run-stat-lbl">api calls</span></div>` : ''}
          ${r.assetCount > 0 ? `<div class="run-stat"><span class="run-stat-val">${r.assetCount}</span><span class="run-stat-lbl">assets</span></div>` : ''}
        </div>
        <div class="run-card-footer">
          <span class="run-date">${escapeHTML(dateStr)}</span>
          <div class="run-actions">
            ${r.source === 'server' && r.status !== 'complete'
              ? `<button class="btn-xs btn-success rc-resume" data-id="${escapeAttr(r.id)}" data-source="${r.source}">&#9654; Resume</button>`
              : ''}
            <button class="btn-xs rc-compare" data-id="${escapeAttr(r.id)}" data-source="${r.source}">&#9870; Compare</button>
            <button class="btn-xs rc-expand" data-id="${escapeAttr(r.id)}" data-source="${r.source}">&#9660; URLs</button>
            <button class="btn-xs btn-danger rc-del" data-id="${escapeAttr(r.id)}" data-source="${r.source}">Delete</button>
          </div>
        </div>
        <div class="run-url-list" id="run-urls-${escapeAttr(r.id)}" style="display:none"></div>
      </div>`;
  }).join('')}</div>`;

  // Click card body → load run into all tabs
  list.querySelectorAll('.run-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      openRun(card.dataset.id, card.dataset.source);
    });
  });

  // Expand/collapse URL list
  list.querySelectorAll('.rc-expand').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleRunUrls(btn.dataset.id, btn.dataset.source, btn);
    });
  });

  // Delete
  list.querySelectorAll('.rc-del').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this run?')) return;
      if (btn.dataset.source === 'server') {
        try { await fetch(`/api/saves/${encodeURIComponent(btn.dataset.id)}`, { method: 'DELETE' }); }
        catch (err) { showToast('Delete failed: ' + err.message); return; }
      } else {
        const h = getHistory().filter(en => en.id !== btn.dataset.id);
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch {}
      }
      if (activeRunId === btn.dataset.id) activeRunId = null;
      _runDataCache.delete(btn.dataset.id);
      loadRuns();
    });
  });

  // Resume
  list.querySelectorAll('.rc-resume').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      btn.disabled = true; btn.textContent = '...';
      try { await resumeRunById(btn.dataset.id); }
      catch (err) { showToast('Resume failed: ' + err.message); btn.disabled = false; btn.innerHTML = '&#9654; Resume'; }
    });
  });

  // Quick compare — two-click pattern
  list.querySelectorAll('.rc-compare').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = btn.dataset.id;

      if (!_comparePickA) {
        // First selection
        _comparePickA = id;
        btn.textContent = '✓ Picked A';
        btn.classList.add('btn-active');
        showToast('Now click Compare on a second run');
        return;
      }

      if (_comparePickA === id) {
        // Cancel selection
        _comparePickA = null;
        btn.textContent = '⊷ Compare';
        btn.classList.remove('btn-active');
        showToast('Compare selection cleared');
        return;
      }

      // Second selection — run the diff
      const idA = _comparePickA;
      const idB = id;
      _comparePickA = null;
      list.querySelectorAll('.rc-compare').forEach(b => {
        b.innerHTML = '&#9870; Compare';
        b.classList.remove('btn-active');
      });

      document.querySelector('[data-panel="diff"]').click();
      await populateDiffDropdowns(idA, idB);
      document.getElementById('btn-run-diff')?.click();
    });
  });
}

async function toggleRunUrls(id, source, btn) {
  const container = document.getElementById(`run-urls-${id}`);
  if (!container) return;

  if (container.style.display !== 'none') {
    container.style.display = 'none';
    btn.innerHTML = '&#9660; URLs';
    return;
  }

  container.style.display = 'block';
  btn.innerHTML = '&#9650; URLs';

  if (_runDataCache.has(id)) {
    renderRunUrls(container, _runDataCache.get(id));
    return;
  }

  container.innerHTML = '<p class="run-url-loading">Loading…</p>';
  try {
    let fullData;
    if (source === 'server') {
      const res = await fetch(`/api/saves/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(await res.text());
      fullData = await res.json();
    } else {
      const entry = getHistory().find(e => e.id === id);
      if (!entry) throw new Error('Not found in local history');
      fullData = { pages: entry.data?.pages || [], apiCalls: entry.data?.apiCalls || {}, assets: entry.data?.assets || [] };
    }
    _runDataCache.set(id, fullData);
    renderRunUrls(container, fullData);
  } catch (err) {
    container.innerHTML = `<p class="run-url-loading" style="color:var(--danger)">Failed: ${escapeHTML(err.message)}</p>`;
  }
}

function renderRunUrls(container, data) {
  const pages = data.pages || [];
  const graphqlCalls = data.apiCalls?.graphql || [];
  const restCalls = data.apiCalls?.rest || [];
  const assets = data.assets || [];

  if (!pages.length && !graphqlCalls.length && !restCalls.length) {
    container.innerHTML = '<p class="run-url-loading">No data captured yet.</p>';
    return;
  }

  // Map API calls and assets per page URL
  const apiByUrl = new Map();
  [...graphqlCalls, ...restCalls].forEach(call => {
    const u = call.pageUrl || '';
    apiByUrl.set(u, (apiByUrl.get(u) || 0) + 1);
  });
  const assetsByUrl = new Map();
  assets.forEach(a => {
    const u = a.pageUrl || '';
    assetsByUrl.set(u, (assetsByUrl.get(u) || 0) + 1);
  });

  const rows = pages.map(p => {
    const url = p.meta?.url || p.url || '';
    const path = (() => { try { return new URL(url).pathname || '/'; } catch { return url; } })();
    const title = p.meta?.title || '';
    const apiCount = apiByUrl.get(url) || 0;
    const assetCount = assetsByUrl.get(url) || 0;
    return `<div class="run-url-row">
      <div class="run-url-path" title="${escapeAttr(url)}">${escapeHTML(path)}</div>
      <div class="run-url-caps">
        <span class="run-cap run-cap-page" title="${escapeAttr(title)}">&#128196; ${escapeHTML((title || 'page').substring(0, 28))}${(title || '').length > 28 ? '…' : ''}</span>
        ${apiCount ? `<span class="run-cap run-cap-api">&#128257; ${apiCount} API</span>` : ''}
        ${assetCount ? `<span class="run-cap run-cap-asset">&#128444; ${assetCount}</span>` : ''}
      </div>
    </div>`;
  }).join('');

  container.innerHTML = `<div class="run-url-scroll">${rows || '<p class="run-url-loading">No pages recorded.</p>'}</div>`;
}

async function openRun(id, source) {
  showToast('Loading run…');
  try {
    let fullData;
    if (_runDataCache.has(id)) {
      fullData = _runDataCache.get(id);
    } else if (source === 'server') {
      const res = await fetch(`/api/saves/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(await res.text());
      fullData = await res.json();
      _runDataCache.set(id, fullData);
    } else {
      const entry = getHistory().find(e => e.id === id);
      if (!entry) throw new Error('Run not found');
      fullData = entry.data;
      _runDataCache.set(id, fullData);
    }

    const data = {
      pages: fullData.pages || [],
      apiCalls: fullData.apiCalls || { graphql: [], rest: [] },
      assets: fullData.assets || [],
      failedPages: fullData.failedPages || [],
      meta: { scrapedAt: fullData.lastSavedAt, targetUrl: fullData.startUrl },
      visitedUrls: fullData.visitedUrls || [],
    };

    scrapedData = data;
    activeRunId = id;

    renderResults(data);
    renderAPICalls(data.apiCalls);
    renderAssets(data.assets);
    enableRefactor(data);

    const pageCount = data.pages?.length || 0;
    const apiCount = (data.apiCalls?.graphql?.length || 0) + (data.apiCalls?.rest?.length || 0);
    const rb = document.getElementById('results-badge');
    if (rb) { rb.textContent = pageCount; rb.style.display = pageCount ? 'inline-block' : 'none'; }
    const ab = document.getElementById('api-badge');
    if (ab) { ab.textContent = apiCount; ab.style.display = apiCount ? 'inline-block' : 'none'; }

    document.querySelectorAll('.run-card').forEach(c => c.classList.toggle('run-card--active', c.dataset.id === id));

    const hostname = (() => { try { return new URL(fullData.startUrl || '').hostname; } catch { return fullData.startUrl || id; } })();
    const banner = document.getElementById('runs-active-banner');
    const label = document.getElementById('runs-active-label');
    if (banner && label) { label.textContent = `Viewing: ${hostname} — ${pageCount} pages, ${apiCount} API calls`; banner.style.display = 'flex'; }

    document.querySelector('[data-panel="results"]').click();
    showToast(`Loaded — ${pageCount} pages, ${apiCount} API calls`);
  } catch (e) { showToast('Load failed: ' + e.message); }
}

async function resumeRunById(id) {
  const res = await fetch(`/api/saves/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(await res.text());
  const save = await res.json();
  const opts = save.options || {};
  const url = save.startUrl || '';
  const r = await fetch('/api/scrape', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url, fullCrawl: opts.fullCrawl !== false, maxPages: opts.maxPages || 0,
      captureSpeed: opts.captureSpeed || 3, workerCount: opts.workerCount || 0,
      autoScroll: opts.autoScroll || false, politeDelay: opts.politeDelay || 0,
      captureGraphQL: opts.captureGraphQL !== false, captureREST: opts.captureREST !== false,
      captureAssets: opts.captureAssets !== false, captureAllRequests: opts.captureAllRequests || false,
      capturePageUrls: true, resumeFrom: id,
    }),
  });
  if (!r.ok) throw new Error(await r.text());
  const { sessionId } = await r.json();
  const displayName = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  const favicon = `/api/favicon?url=${encodeURIComponent(url)}`;
  createSessionPanel(sessionId, displayName, favicon, false);
  activeSessions.set(sessionId, { name: displayName, faviconUrl: favicon, liveView: false, expanded: true });
  appendSessionLog(sessionId, `Resuming from save ${id}`, 'info');
  document.querySelector('[data-panel="scraper"]').click();
}

// ---- Diff panel ----
async function populateDiffDropdowns(preselectA, preselectB) {
  let serverSaves = [];
  try {
    const res = await fetch('/api/saves');
    if (res.ok) serverSaves = await res.json();
  } catch (_) {}
  const localHistory = getHistory();
  const serverIds = new Set(serverSaves.map(s => s.sessionId));
  const localOnly = localHistory.filter(e => !serverIds.has(e.id));
  const allEntries = [
    ...serverSaves.map(s => ({
      id: s.sessionId, source: 'server',
      label: `${s.startUrl || '(unknown)'} — ${new Date(s.lastSavedAt || s.startedAt).toLocaleString()} [${s.pageCount || 0} pages]`,
    })),
    ...localOnly.map(e => ({
      id: e.id, source: 'local',
      label: `${e.url || '(unknown)'} — ${new Date(e.ts).toLocaleString()} [${e.pageCount || 0} pages] (local)`,
    })),
  ];
  ['diff-a', 'diff-b'].forEach((elId, idx) => {
    const sel = document.getElementById(elId);
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Select a run --</option>' +
      allEntries.map(e =>
        `<option value="${escapeAttr(e.id)}" data-source="${e.source}">${escapeHTML(e.label)}</option>`
      ).join('');
    const preselect = idx === 0 ? preselectA : preselectB;
    if (preselect) sel.value = preselect;
  });
}

function renderDiffResults(diff) {
  const container = document.getElementById('diff-results');
  if (!container) return;
  container.style.display = 'block';

  const noChanges =
    !diff.pages?.added.length && !diff.pages?.removed.length &&
    !diff.apiCalls?.graphql?.added.length && !diff.apiCalls?.graphql?.removed.length &&
    !diff.apiCalls?.rest?.added.length && !diff.apiCalls?.rest?.removed.length &&
    !diff.assets?.added.length && !diff.assets?.removed.length &&
    !diff.textContent?.added.length && !diff.textContent?.removed.length;

  if (noChanges) {
    container.innerHTML = '<p style="padding:16px;color:var(--text3)">No differences found between these two runs.</p>';
    return;
  }

  const s = diff.summary || {};

  function deltaLabel(added, removed) {
    const parts = [];
    if (added)   parts.push(`<span class="diff-stat-add">+${added} added</span>`);
    if (removed) parts.push(`<span class="diff-stat-rem">&#8722;${removed} removed</span>`);
    return parts.join(' ') || '<span style="color:var(--text3)">unchanged</span>';
  }

  function buildList(items, cls, prefix) {
    if (!items?.length) return '';
    return items.map(u =>
      `<div class="diff-item ${cls}">${escapeHTML(prefix)} ${escapeHTML(typeof u === 'string' ? u : JSON.stringify(u))}</div>`
    ).join('');
  }

  function section(id, title, statsHtml, bodyHtml) {
    if (!bodyHtml) return '';
    return `<div class="diff-section">
      <div class="diff-section-header" data-toggle="${id}">
        <span class="diff-section-title">${title}</span>
        <span class="diff-section-stats">${statsHtml}</span>
        <span class="diff-toggle-icon">&#9660;</span>
      </div>
      <div class="diff-list" id="diff-sec-${id}">${bodyHtml}</div>
    </div>`;
  }

  const pagesBody   = buildList(diff.pages?.added, 'diff-added', '+') + buildList(diff.pages?.removed, 'diff-removed', '−');
  const apiBody     = buildList(diff.apiCalls?.graphql?.added, 'diff-added', '+ [GQL]') +
                      buildList(diff.apiCalls?.graphql?.removed, 'diff-removed', '− [GQL]') +
                      buildList(diff.apiCalls?.rest?.added, 'diff-added', '+ [REST]') +
                      buildList(diff.apiCalls?.rest?.removed, 'diff-removed', '− [REST]');
  const assetsBody  = buildList(diff.assets?.added, 'diff-added', '+') + buildList(diff.assets?.removed, 'diff-removed', '−');
  let contentBody   = buildList(diff.textContent?.added, 'diff-added', '+') +
                      buildList(diff.textContent?.removed, 'diff-removed', '−') +
                      buildList(diff.links?.added, 'diff-added', '+ [link]') +
                      buildList(diff.links?.removed, 'diff-removed', '− [link]') +
                      buildList(diff.headings?.added, 'diff-added', '+ [h1]') +
                      buildList(diff.headings?.removed, 'diff-removed', '− [h1]');
  if (diff.title) contentBody += `<div class="diff-item diff-changed">~ title: "${escapeHTML(diff.title.from)}" → "${escapeHTML(diff.title.to)}"</div>`;

  const summaryBar = `<div class="diff-summary-bar">
    <div class="diff-summary-stat"><span class="diff-summary-val diff-stat-add">+${s.pages?.added || 0}</span><span class="diff-summary-lbl">pages added</span></div>
    <div class="diff-summary-stat"><span class="diff-summary-val diff-stat-rem">&#8722;${s.pages?.removed || 0}</span><span class="diff-summary-lbl">pages removed</span></div>
    <div class="diff-summary-stat"><span class="diff-summary-val diff-stat-add">+${s.apiCalls?.added || 0}</span><span class="diff-summary-lbl">api added</span></div>
    <div class="diff-summary-stat"><span class="diff-summary-val diff-stat-rem">&#8722;${s.apiCalls?.removed || 0}</span><span class="diff-summary-lbl">api removed</span></div>
    <div class="diff-summary-stat"><span class="diff-summary-val diff-stat-add">+${s.assets?.added || 0}</span><span class="diff-summary-lbl">assets added</span></div>
    <div class="diff-summary-stat"><span class="diff-summary-val diff-stat-rem">&#8722;${s.assets?.removed || 0}</span><span class="diff-summary-lbl">assets removed</span></div>
  </div>`;

  container.innerHTML = summaryBar +
    section('pages',   '&#128196; Pages',     deltaLabel(s.pages?.added,    s.pages?.removed),    pagesBody)   +
    section('api',     '&#128257; API Calls',  deltaLabel(s.apiCalls?.added, s.apiCalls?.removed), apiBody)     +
    section('assets',  '&#128444; Assets',     deltaLabel(s.assets?.added,   s.assets?.removed),   assetsBody)  +
    section('content', '&#128221; Content',    deltaLabel(s.content?.added,  s.content?.removed),  contentBody);

  container.querySelectorAll('.diff-section-header').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const body = document.getElementById(`diff-sec-${hdr.dataset.toggle}`);
      const icon = hdr.querySelector('.diff-toggle-icon');
      if (!body) return;
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : '';
      if (icon) icon.innerHTML = open ? '&#9654;' : '&#9660;';
    });
  });
}

async function _fetchRunForDiff(id, source) {
  if (_runDataCache.has(id)) return _runDataCache.get(id);
  if (source === 'server') {
    const res = await fetch(`/api/saves/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    _runDataCache.set(id, data);
    return data;
  }
  const entry = getHistory().find(e => e.id === id);
  if (!entry) throw new Error('Run not found in local history');
  _runDataCache.set(id, entry.data);
  return entry.data;
}

document.getElementById('btn-run-diff')?.addEventListener('click', async () => {
  const selA = document.getElementById('diff-a');
  const selB = document.getElementById('diff-b');
  const aId = selA?.value;
  const bId = selB?.value;
  if (!aId || !bId) return showToast('Select two runs to compare');
  if (aId === bId) return showToast('Select two different runs');
  const btn = document.getElementById('btn-run-diff');
  btn.disabled = true; btn.textContent = 'Comparing...';
  try {
    const sourceA = selA.querySelector(`option[value="${CSS.escape(aId)}"]`)?.dataset.source || 'local';
    const sourceB = selB.querySelector(`option[value="${CSS.escape(bId)}"]`)?.dataset.source || 'local';
    const [dataA, dataB] = await Promise.all([_fetchRunForDiff(aId, sourceA), _fetchRunForDiff(bId, sourceB)]);
    const res = await fetch('/api/diff', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resultA: dataA, resultB: dataB }) });
    if (!res.ok) throw new Error(await res.text());
    renderDiffResults(await res.json());
  } catch (e) { showToast('Diff failed: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = '⊷ Compare'; }
});

document.querySelector('[data-panel="diff"]')?.addEventListener('click', () => populateDiffDropdowns());

// ---- Code generators ----
function downloadFile(content, filename, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function runGenerator(endpoint, payload, filename) {
  if (!window._scraperResult) return showToast('Run a scrape first');
  try {
    const res = await fetch(endpoint, { method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(await res.text());
    const result = await res.json();
    downloadFile(result.code || result.sitemap || JSON.stringify(result, null, 2), filename);
  } catch(e) { showToast('Generator failed: ' + e.message); }
}

document.getElementById('btn-gen-react')?.addEventListener('click', async function() {
  this.disabled = true;
  await runGenerator('/api/generate/react', { pageData: window._scraperResult?.pages?.[0] }, 'component.jsx');
  this.disabled = false;
});
document.getElementById('btn-gen-css')?.addEventListener('click', async function() {
  this.disabled = true;
  await runGenerator('/api/generate/css', { pageData: window._scraperResult?.pages?.[0] }, 'styles.css');
  this.disabled = false;
});
document.getElementById('btn-gen-markdown')?.addEventListener('click', async function() {
  this.disabled = true;
  await runGenerator('/api/generate/markdown', { pageData: window._scraperResult?.pages?.[0] }, 'page.md');
  this.disabled = false;
});
document.getElementById('btn-gen-sitemap')?.addEventListener('click', async function() {
  this.disabled = true;
  await runGenerator('/api/generate/sitemap', { pages: window._scraperResult?.pages }, 'sitemap.xml');
  this.disabled = false;
});

// ---- Schema inferrer ----
let _schemaTabsWired = false;
function wireSchemaSubTabs() {
  if (_schemaTabsWired) return;
  _schemaTabsWired = true;
  const panels = { 'stab-typescript': 'schema-typescript', 'stab-jsonschema': 'schema-jsonschema' };
  Object.entries(panels).forEach(([tabId, panelId]) => {
    document.getElementById(tabId)?.addEventListener('click', () => {
      Object.keys(panels).forEach(t => document.getElementById(t)?.classList.remove('active'));
      Object.values(panels).forEach(p => { const el = document.getElementById(p); if (el) el.style.display = 'none'; });
      document.getElementById(tabId)?.classList.add('active');
      const panel = document.getElementById(panelId);
      if (panel) panel.style.display = 'block';
    });
  });
}

document.getElementById('btn-infer-schema')?.addEventListener('click', async function() {
  const data = window._scraperResult;
  if (!data?.apiCalls?.graphql?.length) return showToast('No GraphQL calls to infer from');
  this.disabled = true; this.textContent = '⚙ Inferring...';
  try {
    const res = await fetch('/api/schema', { method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ graphqlCalls: data.apiCalls.graphql }) });
    if (!res.ok) throw new Error(await res.text());
    const { typescript, jsonSchema } = await res.json();
    const tsEl = document.getElementById('schema-typescript');
    const jsEl = document.getElementById('schema-jsonschema');
    if (tsEl) tsEl.textContent = typescript || '';
    if (jsEl) jsEl.textContent = JSON.stringify(jsonSchema, null, 2) || '';
    document.getElementById('schema-output').style.display = 'block';
    wireSchemaSubTabs();
    // Show typescript tab by default
    document.getElementById('stab-typescript')?.click();
  } catch(e) { showToast('Schema inference failed: ' + e.message); }
  finally { this.disabled = false; this.textContent = '⚙ Infer Schema from GraphQL'; }
});

// ---- Scheduler ----
async function loadSchedules() {
  const list = document.getElementById('schedule-list');
  if (!list) return;
  try {
    const res = await fetch('/api/schedules');
    if (!res.ok) throw new Error(await res.text());
    const schedules = await res.json();
    if (!schedules.length) {
      list.innerHTML = '<p class="empty-hint">No schedules yet.</p>';
      return;
    }
    list.innerHTML = schedules.map(s => `
      <div class="schedule-card" data-id="${escapeAttr(s.id)}">
        <div class="schedule-card-info">
          <div class="schedule-card-url">${escapeHTML(s.scrapeOptions?.startUrl || s.scrapeOptions?.url || '')}</div>
          <span class="schedule-card-cron">${escapeHTML(s.cronExpr)}</span>
          <div class="schedule-card-meta">Next: ${s.nextRun ? new Date(s.nextRun).toLocaleString() : 'N/A'}</div>
        </div>
        <button class="btn-xs btn-danger sched-del" data-id="${escapeAttr(s.id)}">Delete</button>
      </div>`).join('');
    list.querySelectorAll('.sched-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await fetch(`/api/schedules/${encodeURIComponent(btn.dataset.id)}`, { method: 'DELETE' });
          loadSchedules();
        } catch(e) { showToast('Delete failed: ' + e.message); }
      });
    });
  } catch(e) { list.innerHTML = `<p class="empty-hint">Failed to load: ${escapeHTML(e.message)}</p>`; }
}

document.getElementById('btn-create-schedule')?.addEventListener('click', async () => {
  const url = document.getElementById('sched-url')?.value.trim();
  const cron = document.getElementById('sched-cron')?.value.trim();
  if (!url) return showToast('Enter a URL');
  if (!cron) return showToast('Enter a cron expression');
  try {
    const res = await fetch('/api/schedules', { method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ cronExpr: cron, scrapeOptions: { startUrl: url, url } }) });
    if (!res.ok) throw new Error(await res.text());
    showToast('Schedule created');
    loadSchedules();
  } catch(e) { showToast('Failed: ' + e.message); }
});

document.getElementById('btn-refresh-schedules')?.addEventListener('click', loadSchedules);
document.querySelector('[data-panel="schedule"]')?.addEventListener('click', loadSchedules);

// ---- CSV export utility ----
function downloadCSV(rows, headers, filename) {
  const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv = [headers.map(esc).join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n');
  downloadFile(csv, filename, 'text/csv');
}

// ============================================================
// ---- Saves (server-side autosave, resume) ----
// ============================================================
async function loadSaves() {
  const list = document.getElementById('saves-list');
  if (!list) return;
  list.innerHTML = '<p class="empty-hint">Loading...</p>';
  try {
    const res = await fetch('/api/saves');
    if (!res.ok) throw new Error(await res.text());
    const saves = await res.json();
    renderSaves(saves);
  } catch(e) {
    list.innerHTML = `<p class="empty-hint">Failed to load: ${escapeHTML(e.message)}</p>`;
  }
}

function renderSaves(saves) {
  const list = document.getElementById('saves-list');
  if (!list) return;
  if (!saves.length) {
    list.innerHTML = '<p class="empty-hint">No saved scrapes yet. Start a full crawl to see auto-saves here.</p>';
    return;
  }
  const statusClass = { complete: 'chip-ok', stopped: 'chip-warn', running: 'chip-info' };
  list.innerHTML = saves.map(s => `
    <div class="history-card" data-id="${escapeAttr(s.sessionId)}">
      <div class="history-card-info">
        <div class="history-card-url">${escapeHTML(s.startUrl || '(unknown)')}</div>
        <div class="history-card-meta">
          ${new Date(s.lastSavedAt).toLocaleString()} &mdash; ${s.pageCount} pages
          <span class="cd-chip ${statusClass[s.status] || 'chip-log'}" style="margin-left:8px">${escapeHTML(s.status)}</span>
        </div>
      </div>
      <div class="history-card-actions">
        <button class="btn-xs btn-primary sv-load" data-id="${escapeAttr(s.sessionId)}">Load</button>
        ${s.status !== 'complete' ? `<button class="btn-xs btn-success sv-resume" data-id="${escapeAttr(s.sessionId)}" data-url="${escapeAttr(s.startUrl || '')}" data-options="${escapeAttr(JSON.stringify(s.options || {}))}">Resume</button>` : ''}
        <button class="btn-xs btn-danger sv-del" data-id="${escapeAttr(s.sessionId)}">Delete</button>
      </div>
    </div>`).join('');

  list.querySelectorAll('.sv-load').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = '...';
      try {
        const res = await fetch(`/api/saves/${encodeURIComponent(btn.dataset.id)}`);
        if (!res.ok) throw new Error(await res.text());
        const save = await res.json();
        // Build a result object compatible with onSessionComplete
        const data = {
          pages: save.pages || [],
          apiCalls: save.apiCalls || { graphql: [], rest: [], all: [] },
          assets: save.assets || [],
          failedPages: save.failedPages || [],
          meta: { scrapedAt: save.lastSavedAt, targetUrl: save.startUrl, totalPages: save.pages?.length || 0 },
          visitedUrls: save.visitedUrls || [],
        };
        window._scraperResult = data;
        scrapedData = data;
        renderResults(data);
        renderAPICalls(data.apiCalls);
        renderAssets(data.assets);
        enableRefactor(data);
        document.querySelector('[data-panel="results"]').click();
      } catch(e) { showToast('Load failed: ' + e.message); }
      finally { btn.disabled = false; btn.textContent = 'Load'; }
    });
  });

  list.querySelectorAll('.sv-resume').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = '...';
      try {
        let opts = {};
        try { opts = JSON.parse(btn.dataset.options || '{}'); } catch {}
        const url = btn.dataset.url || opts.url || '';
        const payload = {
          url,
          fullCrawl: opts.fullCrawl !== false,
          maxPages: opts.maxPages || 0,
          captureSpeed: opts.captureSpeed || 3,
          workerCount: opts.workerCount || 0,
          autoScroll: opts.autoScroll || false,
          politeDelay: opts.politeDelay || 0,
          captureGraphQL: opts.captureGraphQL !== false,
          captureREST: opts.captureREST !== false,
          captureAssets: opts.captureAssets !== false,
          captureAllRequests: opts.captureAllRequests || false,
          capturePageUrls: true,
          resumeFrom: btn.dataset.id,
        };
        const res = await fetch('/api/scrape', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(await res.text());
        const { sessionId } = await res.json();
        const displayName = (() => { try { return new URL(url).hostname; } catch { return url; } })();
        const favicon = `/api/favicon?url=${encodeURIComponent(url)}`;
        createSessionPanel(sessionId, displayName, favicon, false);
        activeSessions.set(sessionId, { name: displayName, faviconUrl: favicon, liveView: false, expanded: true });
        appendSessionLog(sessionId, `Resuming from save ${btn.dataset.id}`, 'info');
        document.querySelector('[data-panel="scraper"]').click();
      } catch(e) { showToast('Resume failed: ' + e.message); }
      finally { btn.disabled = false; btn.textContent = 'Resume'; }
    });
  });

  list.querySelectorAll('.sv-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await fetch(`/api/saves/${encodeURIComponent(btn.dataset.id)}`, { method: 'DELETE' });
        loadSaves();
      } catch(e) { showToast('Delete failed: ' + e.message); }
    });
  });
}

document.querySelector('[data-panel="saves"]')?.addEventListener('click', loadSaves);
document.getElementById('btn-refresh-saves')?.addEventListener('click', loadSaves);

// ---- Initialize panels that need data on load ----
renderHistory();
loadRuns();

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
    case 'referrer': container.innerHTML = renderByReferrer(data.pages); break;
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

// Mode 5: discovery tree — which page led to which (referrer-based)
function renderByReferrer(pages) {
  if (!pages?.length) return '<p class="empty-hint">No pages.</p>';
  const pageByUrl = new Map(pages.map(p => [p.meta?.url, p]));
  const byParent = new Map();
  pages.forEach(p => {
    const par = p._crawl?.parent || '__root__';
    if (!byParent.has(par)) byParent.set(par, []);
    byParent.get(par).push(p);
  });
  const rendered = new Set();
  function renderNode(pageUrl, depth) {
    if (rendered.has(pageUrl)) return '';
    rendered.add(pageUrl);
    const p = pageByUrl.get(pageUrl);
    const children = byParent.get(pageUrl) || [];
    const icon = children.length ? '&#128193;' : '&#128196;';
    const path = (() => { try { return new URL(pageUrl).pathname || '/'; } catch { return pageUrl; } })();
    const title = p?.meta?.title ? escapeHTML(p.meta.title.substring(0, 60)) : '';
    let html = `<div class="site-tree-item" style="padding-left:${depth * 18}px">
      <span class="site-tree-icon">${icon}</span>
      <a class="site-tree-url" href="${escapeAttr(pageUrl)}" target="_blank">${escapeHTML(path)}</a>
      ${title ? `<span class="site-tree-title">— ${title}</span>` : ''}
      ${children.length ? `<span class="site-tree-count">${children.length}</span>` : ''}
    </div>`;
    children.sort((a, b) => (a._crawl?.depth || 0) - (b._crawl?.depth || 0))
      .forEach(child => { if (child.meta?.url) html += renderNode(child.meta.url, depth + 1); });
    return html;
  }
  const roots = (byParent.get('__root__') || []);
  if (!roots.length && pages.length) roots.push(pages[0]);
  return roots.map(p => renderNode(p.meta?.url, 0)).join('') || '<p class="empty-hint">No discovery relationships recorded (sequential mode).</p>';
}

document.getElementById('slow-motion').addEventListener('input', function () {
  document.getElementById('slowmo-value').textContent = `${this.value}ms`;
});

const _captureSpeedWorkers = { 1: 1, 2: 4, 3: 8, 4: 20, 5: 40 };
const _captureSpeedLabels = { 1: '1 worker', 2: '4 workers', 3: '8 workers', 4: '20 workers', 5: '40 workers' };

function _updateWorkerUI() {
  const custom = parseInt(document.getElementById('worker-count').value, 10);
  const speed = parseInt(document.getElementById('capture-speed').value, 10);
  const workers = custom || _captureSpeedWorkers[speed] || 1;
  document.getElementById('capture-speed-badge').textContent = custom
    ? `${custom} workers (custom)` : (_captureSpeedLabels[speed] || speed);
  const warn = document.getElementById('ram-warning');
  const ramEst = document.getElementById('ram-est');
  if (workers >= 16) {
    ramEst.textContent = (workers * 0.065).toFixed(1);
    warn.style.display = 'block';
  } else {
    warn.style.display = 'none';
  }
}

document.getElementById('capture-speed').addEventListener('input', _updateWorkerUI);
document.getElementById('worker-count').addEventListener('input', _updateWorkerUI);

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

// ============================================================
//  APA GraphQL API Panel
// ============================================================
(function () {
  const STORAGE_KEY = 'apa_saved_queries';
  let _apaSchema = null;

  // ── helpers ──────────────────────────────────────────────
  function _buildHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const auth = document.getElementById('apa-auth-header').value.trim();
    if (auth) {
      const colon = auth.indexOf(':');
      if (colon > 0) {
        headers[auth.slice(0, colon).trim()] = auth.slice(colon + 1).trim();
      }
    }
    const extraRaw = document.getElementById('apa-extra-headers').value.trim();
    if (extraRaw) {
      try { Object.assign(headers, JSON.parse(extraRaw)); } catch {}
    }
    return headers;
  }

  async function _runQuery(query, variables) {
    const endpoint = document.getElementById('apa-endpoint').value.trim();
    const body = JSON.stringify({ query, variables: variables || undefined });
    const res = await fetch(endpoint, { method: 'POST', headers: _buildHeaders(), body });
    return res.json();
  }

  function _setResult(text, cls) {
    const box = document.getElementById('apa-result');
    box.innerHTML = '';
    const span = document.createElement('span');
    span.className = cls || '';
    span.textContent = text;
    box.appendChild(span);
    document.getElementById('apa-btn-copy-result').style.display = 'inline';
  }

  function _setResultJSON(obj) {
    const box = document.getElementById('apa-result');
    box.textContent = JSON.stringify(obj, null, 2);
    document.getElementById('apa-btn-copy-result').style.display = 'inline';
  }

  // ── introspection ─────────────────────────────────────────
  const INTROSPECT_QUERY = `{
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      name kind description
      fields(includeDeprecated: false) {
        name description
        type { name kind ofType { name kind ofType { name kind } } }
        args { name description type { name kind ofType { name kind } } defaultValue }
      }
      inputFields { name description type { name kind ofType { name kind } } defaultValue }
    }
  }
}`;

  async function _introspect() {
    const btn = document.getElementById('apa-btn-introspect');
    btn.disabled = true; btn.textContent = '⏳ Introspecting…';
    try {
      const data = await _runQuery(INTROSPECT_QUERY);
      if (data.errors) { _setResult('Introspection error:\n' + JSON.stringify(data.errors, null, 2), 'apa-result-error'); return; }
      _apaSchema = data.data.__schema;
      _renderSchema(_apaSchema);
      _setResult('Introspection complete. Schema loaded — see Schema Explorer below.', 'apa-result-ok');
    } catch (e) {
      _setResult('Network error: ' + e.message, 'apa-result-error');
    } finally {
      btn.disabled = false; btn.innerHTML = '&#128269; Introspect Schema';
    }
  }

  function _typeName(t) {
    if (!t) return 'Unknown';
    if (t.kind === 'NON_NULL') return _typeName(t.ofType) + '!';
    if (t.kind === 'LIST') return '[' + _typeName(t.ofType) + ']';
    return t.name || '?';
  }

  function _renderSchema(schema) {
    const wrap = document.getElementById('apa-schema-wrap');
    const body = document.getElementById('apa-schema-body');
    const queryType = schema.queryType?.name || 'Query';
    const mutationType = schema.mutationType?.name;

    // Only show Query / Mutation / object types (skip scalars, built-ins)
    const interestingTypes = schema.types.filter(t =>
      !t.name.startsWith('__') &&
      (t.kind === 'OBJECT' || t.kind === 'INPUT_OBJECT' || t.kind === 'INTERFACE' || t.kind === 'UNION' || t.kind === 'ENUM') &&
      t.name !== 'Boolean' && t.name !== 'String' && t.name !== 'Int' && t.name !== 'Float' && t.name !== 'ID'
    );

    // Put Query and Mutation first
    interestingTypes.sort((a, b) => {
      const aScore = a.name === queryType ? 0 : a.name === mutationType ? 1 : 2;
      const bScore = b.name === queryType ? 0 : b.name === mutationType ? 1 : 2;
      return aScore - bScore || a.name.localeCompare(b.name);
    });

    body.innerHTML = interestingTypes.map(t => {
      const fields = t.fields || t.inputFields || [];
      const fieldsHtml = fields.map(f => {
        const typeTxt = _typeName(f.type);
        const args = (f.args || []).map(a => a.name + ': ' + _typeName(a.type)).join(', ');
        const signature = args ? `${f.name}(${args})` : f.name;
        return `<div class="apa-schema-field apa-schema-clickable" data-field="${escapeAttr(f.name)}" data-type="${escapeAttr(t.name)}">
          <span class="apa-schema-field-name">${escapeHTML(signature)}</span>
          <span class="apa-schema-field-type">${escapeHTML(typeTxt)}</span>
          ${f.description ? `<span class="apa-schema-field-desc">${escapeHTML(f.description.substring(0, 80))}</span>` : ''}
        </div>`;
      }).join('');
      return `<div class="apa-schema-type">
        <div><span class="apa-schema-type-name">${escapeHTML(t.name)}</span><span class="apa-schema-kind">${t.kind}${t.description ? ' — ' + escapeHTML(t.description.substring(0, 60)) : ''}</span></div>
        ${fieldsHtml || '<div style="padding-left:16px;color:var(--text3);font-size:11px">no fields</div>'}
      </div>`;
    }).join('');

    // Click on a query field → scaffold a query
    body.addEventListener('click', (e) => {
      const el = e.target.closest('.apa-schema-clickable');
      if (!el) return;
      const field = el.dataset.field;
      const typeName = el.dataset.type;
      if (typeName === queryType) {
        document.getElementById('apa-query').value = `{\n  ${field}\n}`;
      } else if (typeName === mutationType) {
        document.getElementById('apa-query').value = `mutation {\n  ${field}\n}`;
      }
    });

    wrap.style.display = 'block';
  }

  // ── run query ─────────────────────────────────────────────
  async function _run() {
    const query = document.getElementById('apa-query').value.trim();
    const varsRaw = document.getElementById('apa-variables').value.trim();
    if (!query) { _setResult('Enter a GraphQL query above.', 'apa-result-hint'); return; }
    let vars = null;
    if (varsRaw && varsRaw !== '{}') {
      try { vars = JSON.parse(varsRaw); } catch { _setResult('Variables JSON is invalid.', 'apa-result-error'); return; }
    }
    const btn = document.getElementById('apa-btn-run');
    btn.disabled = true; btn.textContent = '⏳ Running…';
    try {
      const data = await _runQuery(query, vars);
      _setResultJSON(data);
    } catch (e) {
      _setResult('Network error: ' + e.message, 'apa-result-error');
    } finally {
      btn.disabled = false; btn.innerHTML = '&#9654; Run';
    }
  }

  // ── prettify ──────────────────────────────────────────────
  function _prettify() {
    // Very basic prettifier: re-indent with 2 spaces
    const ta = document.getElementById('apa-query');
    const s = ta.value;
    let depth = 0, out = '', prev = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '{') { out += ' {\n' + '  '.repeat(++depth); }
      else if (ch === '}') { depth = Math.max(0, depth - 1); out = out.trimEnd() + '\n' + '  '.repeat(depth) + '}'; }
      else if (ch === '\n') { out += '\n' + '  '.repeat(depth); }
      else { out += ch; }
      prev = ch;
    }
    // collapse excessive blank lines
    ta.value = out.replace(/\n{3,}/g, '\n\n').trim();
  }

  // ── saved queries ─────────────────────────────────────────
  function _loadSaved() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
  function _persistSaved(list) { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }

  function _renderSaved() {
    const list = _loadSaved();
    const el = document.getElementById('apa-saved-list');
    if (!list.length) { el.innerHTML = '<span class="empty-hint">No saved queries yet.</span>'; return; }
    el.innerHTML = list.map((item, i) => `
      <div class="apa-saved-item" data-idx="${i}">
        <span class="apa-saved-name">${escapeHTML(item.name)}</span>
        <button class="apa-saved-del" data-del="${i}" title="Delete">&#10005;</button>
      </div>`).join('');
  }

  document.getElementById('apa-saved-list').addEventListener('click', (e) => {
    const delBtn = e.target.closest('[data-del]');
    if (delBtn) {
      const list = _loadSaved();
      list.splice(parseInt(delBtn.dataset.del), 1);
      _persistSaved(list);
      _renderSaved();
      return;
    }
    const item = e.target.closest('.apa-saved-item');
    if (item) {
      const list = _loadSaved();
      const saved = list[parseInt(item.dataset.idx)];
      if (saved) {
        document.getElementById('apa-query').value = saved.query;
        document.getElementById('apa-variables').value = saved.variables || '';
      }
    }
  });

  document.getElementById('apa-btn-save-query').addEventListener('click', () => {
    const query = document.getElementById('apa-query').value.trim();
    if (!query) return;
    const name = prompt('Name this query:', query.split('\n')[0].substring(0, 40));
    if (!name) return;
    const list = _loadSaved();
    list.unshift({ name, query, variables: document.getElementById('apa-variables').value });
    _persistSaved(list);
    _renderSaved();
  });

  // ── wire events ───────────────────────────────────────────
  document.getElementById('apa-btn-introspect').addEventListener('click', _introspect);
  document.getElementById('apa-btn-run').addEventListener('click', _run);
  document.getElementById('apa-btn-prettify').addEventListener('click', _prettify);

  document.getElementById('apa-btn-copy-result').addEventListener('click', () => {
    const txt = document.getElementById('apa-result').textContent;
    navigator.clipboard.writeText(txt).catch(() => {});
  });

  document.getElementById('apa-btn-close-schema').addEventListener('click', () => {
    document.getElementById('apa-schema-wrap').style.display = 'none';
  });

  document.getElementById('apa-btn-toggle-headers').addEventListener('click', () => {
    const row = document.getElementById('apa-extra-headers-row');
    const btn = document.getElementById('apa-btn-toggle-headers');
    if (row.style.display === 'none') {
      row.style.display = 'flex'; btn.textContent = '− Hide extra headers';
    } else {
      row.style.display = 'none'; btn.textContent = '+ Add extra headers';
    }
  });

  // Ctrl+Enter in query box → run
  document.getElementById('apa-query').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); _run(); }
  });

  _renderSaved();

  // Called from the WebSocket message handler when the scraper sniffs an
  // Authorization header from a GraphQL request during a crawl.
  // Only auto-fills if the user hasn't already typed something there.
  window._apaAutoFillToken = function (token, endpoint) {
    const authEl = document.getElementById('apa-auth-header');
    const epEl   = document.getElementById('apa-endpoint');
    if (authEl && !authEl.value.trim()) {
      authEl.value = 'Authorization: ' + token;
      authEl.style.borderColor = 'var(--success)';
      setTimeout(() => { authEl.style.borderColor = ''; }, 2000);
    }
    if (epEl && endpoint && !epEl.value.includes(new URL(endpoint).hostname)) {
      epEl.value = endpoint;
    }
    showToast('APA auth token auto-filled from active crawl session');
  };
})();
