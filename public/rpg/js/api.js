/* ============================================================
   Life RPG — API Fetch Wrapper
   ============================================================ */

const BASE = '/api/rpg';

async function _req(method, path, body, params) {
  let url = BASE + path;
  if (params && Object.keys(params).length > 0) {
    const qs = new URLSearchParams(params);
    url += '?' + qs.toString();
  }
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), data);
  return data;
}

function apiGet(path, params)    { return _req('GET',    path, undefined, params); }
function apiPost(path, body)     { return _req('POST',   path, body || {}); }
function apiPatch(path, body)    { return _req('PATCH',  path, body || {}); }
function apiDelete(path)         { return _req('DELETE', path); }
