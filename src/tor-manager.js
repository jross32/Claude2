'use strict';

/**
 * tor-manager.js
 *
 * Manages Tor SOCKS5 proxy integration for Playwright scrapes.
 *
 *  - Probes the Tor SOCKS5 port before use (non-blocking, cached).
 *  - Returns a ready-made Playwright proxy config object.
 *  - Rotates Tor circuits via the control port (SIGNAL NEWNYM).
 *    Respects Tor's built-in 10-second minimum between rotations.
 *
 * Configuration (via .env or environment variables):
 *   TOR_SOCKS_HOST         SOCKS5 host  (default: 127.0.0.1)
 *   TOR_SOCKS_PORT         SOCKS5 port  (default: 9050)
 *   TOR_CONTROL_HOST       Control host (default: 127.0.0.1)
 *   TOR_CONTROL_PORT       Control port (default: 9051)
 *   TOR_CONTROL_PASSWORD   Control password (default: empty — no auth)
 *   TOR_ROTATE_EVERY       Pages between circuit rotations (default: 10)
 *
 * Usage:
 *   const torManager = require('./tor-manager');
 *
 *   if (await torManager.isAvailable()) {
 *     launchOpts.proxy = torManager.getProxyConfig();
 *   }
 *   // After every N pages:
 *   await torManager.rotateCircuit();
 */

const net = require('net');

const TOR_SOCKS_HOST   = process.env.TOR_SOCKS_HOST       || '127.0.0.1';
const TOR_SOCKS_PORT   = parseInt(process.env.TOR_SOCKS_PORT,    10) || 9050;
const TOR_CONTROL_HOST = process.env.TOR_CONTROL_HOST     || '127.0.0.1';
const TOR_CONTROL_PORT = parseInt(process.env.TOR_CONTROL_PORT,  10) || 9051;
const TOR_CONTROL_PASS = process.env.TOR_CONTROL_PASSWORD || '';

// Exposed so callers can read without importing process.env directly
const TOR_ROTATE_EVERY = parseInt(process.env.TOR_ROTATE_EVERY, 10) || 10;

// ── TCP probe ─────────────────────────────────────────────────────────────────

/**
 * Resolve true if the given TCP port is accepting connections within timeoutMs.
 */
function tcpPing(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;
    const finish = (ok) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
    socket.connect(port, host);
  });
}

// ── Tor control port ──────────────────────────────────────────────────────────

/**
 * Open a raw TCP connection to the Tor control port, authenticate, send a
 * single command, then close.  Resolves with the raw response text, or
 * rejects on timeout / auth failure.
 */
function torControlCommand(cmd, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buf = '';
    let resolved = false;

    const finish = (err, data) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(data);
    };

    socket.setTimeout(timeoutMs);
    socket.once('timeout', () => finish(new Error('Tor control port timed out')));
    socket.once('error', (err) => finish(err));

    socket.on('data', (chunk) => {
      buf += chunk.toString();
      // Terminal response line: 3-digit code + space at start of a line
      const lines = buf.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (/^\d{3} /.test(last)) finish(null, buf.trim());
    });

    socket.connect(TOR_CONTROL_PORT, TOR_CONTROL_HOST, () => {
      // Authenticate then send command then quit
      const auth = TOR_CONTROL_PASS
        ? `AUTHENTICATE "${TOR_CONTROL_PASS}"\r\n`
        : 'AUTHENTICATE ""\r\n';
      socket.write(`${auth}${cmd}\r\nQUIT\r\n`);
    });
  });
}

// ── TorManager class ──────────────────────────────────────────────────────────

class TorManager {
  constructor() {
    this._available     = null; // null = unchecked; true/false = cached after first probe
    this._lastRotate    = 0;    // ms timestamp of last NEWNYM signal
    this._pagesSinceNew = 0;    // pages scraped since last circuit rotation
  }

  /** The configured SOCKS5 address, useful for log messages. */
  get address() {
    return `${TOR_SOCKS_HOST}:${TOR_SOCKS_PORT}`;
  }

  /** Pages between automatic circuit rotations. */
  get rotateEvery() {
    return TOR_ROTATE_EVERY;
  }

  /**
   * Returns the Playwright proxy config object for this Tor SOCKS5 proxy.
   * Pass directly to chromium.launch({ proxy: torManager.getProxyConfig() }).
   */
  getProxyConfig() {
    return { server: `socks5://${TOR_SOCKS_HOST}:${TOR_SOCKS_PORT}` };
  }

  /**
   * Non-blocking probe — checks whether the Tor SOCKS5 port is reachable.
   * The result is cached for the lifetime of the process so repeated calls
   * are essentially free after the first check.
   */
  async isAvailable() {
    if (this._available !== null) return this._available;
    this._available = await tcpPing(TOR_SOCKS_HOST, TOR_SOCKS_PORT, 2000);
    return this._available;
  }

  /**
   * Request a fresh Tor circuit via the control port (SIGNAL NEWNYM).
   * Silently no-ops if:
   *   - Tor's own 10-second cooldown has not elapsed yet
   *   - The control port is unreachable (non-fatal — IP just stays the same)
   *
   * Safe to call with `.catch(() => {})` — never throws.
   */
  async rotateCircuit() {
    const now = Date.now();
    if (now - this._lastRotate < 10_000) return; // Tor enforces ≥10 s between NEWNYM
    this._lastRotate = now;
    this._pagesSinceNew = 0;
    try {
      await torControlCommand('SIGNAL NEWNYM');
    } catch {
      // Control port unreachable or auth failed — not fatal
    }
  }

  /**
   * Call after each successfully scraped page.
   * Automatically calls rotateCircuit() when TOR_ROTATE_EVERY pages have been
   * scraped since the last rotation.
   * Returns true if a rotation was triggered.
   */
  async tickPage() {
    this._pagesSinceNew++;
    if (this._pagesSinceNew >= TOR_ROTATE_EVERY) {
      await this.rotateCircuit();
      return true;
    }
    return false;
  }
}

module.exports = new TorManager();
