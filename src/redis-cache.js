'use strict';

/**
 * redis-cache.js
 *
 * Optional Redis integration for the web scraper.
 * Provides two independent features, both with graceful no-op fallback:
 *
 *  1. Per-domain rate limiting  (enforceDomainRate)
 *     Coordinates the minimum gap between HTTP requests to the same domain
 *     across ALL parallel workers and sessions.  When Redis is unavailable,
 *     falls back to a plain setTimeout so existing politeDelay behaviour is
 *     preserved exactly.
 *
 *  2. Cross-session URL deduplication  (isVisitedCrossSession / markVisitedCrossSession)
 *     Persists the set of scraped URLs per domain in Redis.  Subsequent scrapes
 *     of the same domain with redisDedupe:true skip pages that were already
 *     captured in a previous session.  TTL defaults to 7 days so stale records
 *     expire automatically.
 *
 * Configuration (via .env or environment variables):
 *   REDIS_URL                Full Redis connection string (default: disabled)
 *                            Examples:
 *                              redis://127.0.0.1:6379
 *                              redis://:password@127.0.0.1:6379
 *                              rediss://user:password@host:6380   (TLS)
 *   REDIS_VISITED_TTL_SEC    TTL for visited-URL sets, in seconds (default: 604800 = 7 days)
 *
 * Usage:
 *   const redisCache = require('./redis-cache');
 *
 *   // Domain-aware rate limiting (replaces flat setTimeout):
 *   await redisCache.enforceDomainRate('example.com', 1000);
 *
 *   // Cross-session URL dedup:
 *   if (await redisCache.isVisitedCrossSession('example.com', url)) continue;
 *   await redisCache.markVisitedCrossSession('example.com', url);
 */

const REDIS_URL       = process.env.REDIS_URL || null;
const KEY_TTL_SEC     = parseInt(process.env.REDIS_VISITED_TTL_SEC, 10) || 7 * 24 * 3600; // 7 days
const CONNECT_TIMEOUT = 3000; // ms — fail fast on startup so server boots regardless

// Lazy-require ioredis so missing the npm package is handled gracefully
let Redis = null;
try {
  Redis = require('ioredis');
} catch {
  // ioredis not installed — all Redis features disabled silently
}

// ── RedisCache ────────────────────────────────────────────────────────────────

class RedisCache {
  constructor() {
    this._client    = null;
    this._connected = false;
    this._init();
  }

  _init() {
    if (!Redis || !REDIS_URL) return; // nothing to do — operate in no-op mode

    try {
      this._client = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 1,    // fail fast per-command rather than hanging
        connectTimeout:       CONNECT_TIMEOUT,
        lazyConnect:          true, // don't connect until .connect() is called
        enableOfflineQueue:   false, // drop commands while disconnected — never block the scraper
        retryStrategy:        (times) => {
          // Retry up to 3 times with exponential back-off, then give up permanently
          if (times > 3) return null; // null = stop retrying
          return Math.min(times * 200, 1000);
        },
      });

      this._client.once('ready', () => {
        this._connected = true;
        console.log('[redis] Connected — domain rate-limiting and cross-session URL dedup active');
      });

      this._client.on('error', (err) => {
        if (!this._connected) {
          // Pre-connection error: disable permanently and release resources
          console.warn(`[redis] Could not connect (${err.message}) — falling back to in-memory mode`);
          this._client.disconnect();
          this._client = null;
        }
        // Post-connection errors are handled by ioredis internally with retryStrategy
      });

      this._client.connect().catch((err) => {
        console.warn(`[redis] Connection failed (${err.message}) — falling back to in-memory mode`);
        this._client = null;
      });

    } catch (err) {
      console.warn(`[redis] Init error (${err.message}) — falling back to in-memory mode`);
      this._client = null;
    }
  }

  /** True if Redis is connected and commands will be executed. */
  get connected() {
    return this._connected && this._client !== null;
  }

  // ── Per-domain rate limiting ────────────────────────────────────────────────

  /**
   * Enforce a minimum gap of `minIntervalMs` milliseconds between consecutive
   * requests to the same `domain`.
   *
   * When Redis is available:
   *   Uses a `ratelast:{domain}` key (last-request timestamp in ms) so ALL
   *   concurrent workers coordinate on the same domain clock — far more
   *   accurate than a per-process flat sleep when numWorkers > 1.
   *
   * When Redis is unavailable:
   *   Falls back to a plain setTimeout(minIntervalMs) — identical to the
   *   previous flat politeDelay behaviour so nothing regresses.
   *
   * @param {string} domain       e.g. 'example.com'
   * @param {number} minIntervalMs  minimum ms between requests (0 = no-op)
   */
  async enforceDomainRate(domain, minIntervalMs) {
    if (!minIntervalMs || minIntervalMs <= 0) return;

    if (!this._client) {
      // Fallback: plain sleep — preserves existing politeDelay behaviour
      await new Promise((r) => setTimeout(r, minIntervalMs));
      return;
    }

    try {
      const key = `ratelast:${domain}`;
      const lastStr = await this._client.get(key);
      const last    = lastStr ? parseInt(lastStr, 10) : 0;
      const now     = Date.now();
      const elapsed = now - last;

      if (elapsed < minIntervalMs) {
        await new Promise((r) => setTimeout(r, minIntervalMs - elapsed));
      }

      // Store current timestamp with a TTL of politeDelay + 5 s so stale keys auto-expire
      const ttlSec = Math.ceil(minIntervalMs / 1000) + 5;
      await this._client.set(key, String(Date.now()), 'EX', ttlSec);

    } catch {
      // Redis error mid-flight — fall back to plain sleep
      await new Promise((r) => setTimeout(r, minIntervalMs));
    }
  }

  // ── Cross-session URL deduplication ────────────────────────────────────────

  /**
   * Check whether `url` has been scraped in any previous session for `domain`.
   * Returns false (= re-scrape) when Redis is unavailable.
   *
   * @param {string} domain  e.g. 'example.com'
   * @param {string} url     normalised URL string
   */
  async isVisitedCrossSession(domain, url) {
    if (!this._client) return false;
    try {
      return (await this._client.sismember(`xvisited:${domain}`, url)) === 1;
    } catch {
      return false;
    }
  }

  /**
   * Record `url` as scraped for `domain`.  The Redis SET expires after
   * REDIS_VISITED_TTL_SEC so old records are garbage-collected automatically.
   *
   * Fire-and-forget — call without await or with .catch(() => {}).
   *
   * @param {string} domain
   * @param {string} url
   */
  async markVisitedCrossSession(domain, url) {
    if (!this._client) return;
    try {
      const key = `xvisited:${domain}`;
      // SADD + EXPIRE in a pipeline — both sent in one round trip
      await this._client
        .multi()
        .sadd(key, url)
        .expire(key, KEY_TTL_SEC)
        .exec();
    } catch {
      // Non-fatal — URL just won't be persisted this time
    }
  }

  /**
   * Delete the cross-session visited set for a domain.
   * Useful when you want to force a full re-scrape.
   *
   * @param {string} domain
   */
  async clearVisitedCrossSession(domain) {
    if (!this._client) return;
    try {
      await this._client.del(`xvisited:${domain}`);
    } catch {}
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /**
   * Gracefully close the Redis connection.
   * Called on process exit — not normally needed in application code.
   */
  async quit() {
    if (this._client) {
      try { await this._client.quit(); } catch {}
      this._client    = null;
      this._connected = false;
    }
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────
const instance = new RedisCache();

// Clean up on process exit
process.once('exit', () => { instance.quit().catch(() => {}); });

module.exports = instance;
