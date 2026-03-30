/**
 * unit/entity-extractor.test.js
 * Tests for src/entity-extractor.js — extractEntities()
 */

const { TestRunner } = require('../runner');
const { extractEntities } = require('../../src/entity-extractor');

async function main() {
  const runner = new TestRunner('unit');

  // ── Emails ────────────────────────────────────────────────────────────────

  await runner.run('extracts email addresses from text', ({ setOutput }) => {
    const result = extractEntities('Contact us at hello@example.com or support@corp.org');
    if (!result.emails.includes('hello@example.com')) throw new Error('Missing hello@example.com');
    if (!result.emails.includes('support@corp.org')) throw new Error('Missing support@corp.org');
    setOutput({ emails: result.emails });
  });

  await runner.run('deduplicates repeated emails', ({ setOutput }) => {
    const result = extractEntities('Send to info@test.com and also info@test.com again');
    if (result.emails.length !== 1) throw new Error(`Expected 1, got ${result.emails.length}`);
    setOutput({ emails: result.emails });
  });

  // ── Phones ────────────────────────────────────────────────────────────────

  await runner.run('extracts US phone numbers', ({ setOutput }) => {
    const result = extractEntities('Call us at (555) 123-4567 or 800-555-0199');
    if (result.phones.length === 0) throw new Error('No phones extracted');
    setOutput({ phones: result.phones });
  });

  // ── URLs ──────────────────────────────────────────────────────────────────

  await runner.run('extracts https URLs', ({ setOutput }) => {
    const result = extractEntities('Visit https://example.com and https://docs.example.com/guide');
    if (!result.urls.includes('https://example.com')) throw new Error('Missing URL');
    if (result.urls.length < 2) throw new Error('Expected 2 URLs');
    setOutput({ urls: result.urls });
  });

  await runner.run('filters linkedin and github URLs into socials', ({ setOutput }) => {
    const result = extractEntities(
      'See https://github.com/user and https://linkedin.com/in/user'
    );
    if (result.socials.github.length === 0) throw new Error('No github URL captured');
    if (result.socials.linkedin.length === 0) throw new Error('No linkedin URL captured');
    setOutput({ github: result.socials.github, linkedin: result.socials.linkedin });
  });

  // ── Social handles ────────────────────────────────────────────────────────

  await runner.run('extracts twitter handles', ({ setOutput }) => {
    const result = extractEntities('Follow us @example and @support_team for updates');
    if (!result.socials.twitter.includes('@example')) throw new Error('Missing @example');
    setOutput({ twitter: result.socials.twitter });
  });

  // ── Addresses ─────────────────────────────────────────────────────────────

  await runner.run('extracts street addresses', ({ setOutput }) => {
    const result = extractEntities('Visit us at 123 Main Street downtown');
    if (result.addresses.length === 0) throw new Error('No address extracted');
    setOutput({ addresses: result.addresses });
  });

  // ── Return shape ──────────────────────────────────────────────────────────

  await runner.run('always returns all keys in result shape', ({ setOutput }) => {
    const result = extractEntities('no special content here');
    const keys = ['emails', 'phones', 'urls', 'socials', 'addresses'];
    for (const k of keys) {
      if (!(k in result)) throw new Error(`Missing key: ${k}`);
    }
    const socialKeys = ['twitter', 'linkedin', 'github', 'instagram'];
    for (const k of socialKeys) {
      if (!(k in result.socials)) throw new Error(`Missing socials.${k}`);
    }
    setOutput({ keys });
  });

  // ── Chaos ─────────────────────────────────────────────────────────────────

  await runner.run('[chaos] empty string → all empty arrays', ({ setOutput }) => {
    const result = extractEntities('');
    if (result.emails.length !== 0) throw new Error('Expected no emails');
    if (result.phones.length !== 0) throw new Error('Expected no phones');
    if (result.urls.length !== 0) throw new Error('Expected no urls');
    setOutput({ ok: true });
  });

  await runner.run('[chaos] null input → all empty arrays', ({ setOutput }) => {
    const result = extractEntities(null);
    if (!Array.isArray(result.emails) || result.emails.length !== 0) throw new Error('Expected empty emails');
    setOutput({ ok: true });
  });

  await runner.run('[chaos] number input → all empty arrays', ({ setOutput }) => {
    const result = extractEntities(42);
    if (!Array.isArray(result.emails)) throw new Error('Expected array for emails');
    setOutput({ ok: true });
  });

  await runner.run('[chaos] very long string with no entities → no crash', ({ setOutput }) => {
    const result = extractEntities('x'.repeat(100000));
    if (typeof result !== 'object') throw new Error('Expected object result');
    setOutput({ ok: true });
  });

  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Test runner crashed:', err.message); process.exit(1); });
