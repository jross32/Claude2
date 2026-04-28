'use strict';

/**
 * SSL Certificate Inspector — connect via TLS and extract full certificate details.
 * Discovers SANs (potential subdomains), checks expiry, flags self-signed and weak configs.
 */

const tls = require('tls');
const { X509Certificate } = require('crypto');

const DEFAULT_PORT = 443;
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Extract the key size from the certificate's public key info.
 * Returns size in bits, or null if not determinable.
 */
function _getKeySize(cert) {
  try {
    // Node's tls.getPeerCertificate() exposes bits in raw cert details
    if (cert.bits) return cert.bits;
    if (cert.pubkey) {
      // Heuristic from key length
      const len = cert.pubkey.length;
      if (len > 400) return 4096;
      if (len > 300) return 2048;
      if (len > 100) return 1024;
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Parse a certificate's Subject Alternative Names into an array of strings.
 */
function _parseSANs(cert) {
  try {
    const san = cert.subjectaltname || '';
    return san.split(',')
      .map(s => s.trim())
      .filter(s => s.startsWith('DNS:'))
      .map(s => s.slice(4).trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Determine if the certificate is self-signed (issuer === subject).
 */
function _isSelfSigned(cert) {
  try {
    const subjectCN = cert.subject?.CN || '';
    const issuerCN = cert.issuer?.CN || '';
    const subjectO = cert.subject?.O || '';
    const issuerO = cert.issuer?.O || '';
    return subjectCN === issuerCN && subjectO === issuerO;
  } catch {
    return false;
  }
}

/**
 * Compute days remaining until certificate expiry.
 */
function _daysRemaining(validTo) {
  try {
    const expiry = new Date(validTo);
    const now = new Date();
    return Math.floor((expiry - now) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

/**
 * Parse certificate fingerprint to SHA-256 hex.
 */
function _formatFingerprint(raw) {
  if (!raw) return null;
  // Node returns colon-separated hex: AA:BB:CC...
  return raw.replace(/:/g, '').toLowerCase();
}

/**
 * Inspect the SSL/TLS certificate for the given hostname and port.
 * @param {string} hostnameOrUrl
 * @param {number} [port=443]
 * @returns {Promise<object>}
 */
function inspectSSL(hostnameOrUrl, port = DEFAULT_PORT) {
  let hostname;
  try {
    const u = new URL(hostnameOrUrl.startsWith('http') ? hostnameOrUrl : `https://${hostnameOrUrl}`);
    hostname = u.hostname;
    if (u.port) port = parseInt(u.port, 10);
  } catch {
    hostname = hostnameOrUrl.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  }

  return new Promise((resolve) => {
    const startTime = Date.now();

    const socket = tls.connect(
      { host: hostname, port, servername: hostname, rejectUnauthorized: false, timeout: DEFAULT_TIMEOUT_MS },
      () => {
        try {
          const cert = socket.getPeerCertificate(true); // true = chain
          socket.destroy();

          if (!cert || !cert.subject) {
            resolve({
              hostname, port, status: 'no-cert',
              error: 'No certificate returned',
              durationMs: Date.now() - startTime,
            });
            return;
          }

          const sans = _parseSANs(cert);
          const selfSigned = _isSelfSigned(cert);
          const days = _daysRemaining(cert.valid_to);
          const isExpired = days !== null && days < 0;
          const isExpiringSoon = !isExpired && days !== null && days <= 30;

          // Discover subdomains from SANs (entries that are not wildcards)
          const subdomainSANs = sans.filter(s => !s.startsWith('*'));
          const wildcardSANs = sans.filter(s => s.startsWith('*'));

          // Issuer chain — walk up the chain
          const chain = [];
          let current = cert;
          const seen = new Set();
          while (current && !seen.has(current.fingerprint256)) {
            seen.add(current.fingerprint256);
            chain.push({
              subject: current.subject,
              issuer: current.issuer,
              validFrom: current.valid_from,
              validTo: current.valid_to,
            });
            current = current.issuerCertificate;
            if (current && current.fingerprint256 === cert.fingerprint256) break; // root loop guard
          }

          const flags = [];
          if (selfSigned) flags.push({ severity: 'warn', code: 'SELF_SIGNED', message: 'Certificate is self-signed' });
          if (isExpired) flags.push({ severity: 'critical', code: 'EXPIRED', message: `Certificate expired ${Math.abs(days)} days ago` });
          if (isExpiringSoon) flags.push({ severity: 'warn', code: 'EXPIRING_SOON', message: `Certificate expires in ${days} days` });

          const keySize = _getKeySize(cert);
          if (keySize && keySize < 2048) flags.push({ severity: 'warn', code: 'WEAK_KEY', message: `Key size ${keySize} bits is below recommended 2048` });

          const sigAlg = cert.sigalg || cert.signatureAlgorithm || '';
          if (/sha1/i.test(sigAlg)) flags.push({ severity: 'warn', code: 'WEAK_SIG_ALG', message: 'SHA-1 signature algorithm is deprecated' });
          if (/md5/i.test(sigAlg)) flags.push({ severity: 'critical', code: 'WEAK_SIG_ALG', message: 'MD5 signature algorithm is broken' });

          resolve({
            hostname,
            port,
            status: 'ok',
            durationMs: Date.now() - startTime,
            subject: cert.subject,
            issuer: cert.issuer,
            validFrom: cert.valid_from,
            validTo: cert.valid_to,
            daysRemaining: days,
            isExpired,
            isExpiringSoon,
            isSelfSigned: selfSigned,
            fingerprint256: _formatFingerprint(cert.fingerprint256),
            keySize,
            signatureAlgorithm: sigAlg,
            serialNumber: cert.serialNumber,
            sans,
            subdomainSANs,
            wildcardSANs,
            sanCount: sans.length,
            chain,
            protocol: socket.getProtocol?.() || null,
            cipher: socket.getCipher?.() || null,
            flags,
            securityScore: _scoreSSL(flags, days, keySize, sigAlg),
          });
        } catch (err) {
          socket.destroy();
          resolve({ hostname, port, status: 'parse-error', error: err.message, durationMs: Date.now() - startTime });
        }
      }
    );

    socket.on('error', (err) => {
      resolve({ hostname, port, status: 'error', error: err.message, durationMs: Date.now() - startTime });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ hostname, port, status: 'timeout', error: `TLS connect timed out after ${DEFAULT_TIMEOUT_MS}ms`, durationMs: Date.now() - startTime });
    });
  });
}

function _scoreSSL(flags, days, keySize, sigAlg) {
  let score = 100;
  for (const f of flags) {
    if (f.severity === 'critical') score -= 40;
    else if (f.severity === 'warn') score -= 15;
  }
  // Bonus/penalties not covered by flags
  if (days !== null && days > 365) score += 5;   // long-lived cert (CA-managed)
  if (keySize && keySize >= 4096) score += 5;
  return Math.max(0, Math.min(100, score));
}

module.exports = { inspectSSL };
