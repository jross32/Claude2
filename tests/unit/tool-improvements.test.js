'use strict';

/**
 * tests/unit/tool-improvements.test.js
 *
 * Before/after benchmark for 13 tool improvement items.
 * Each section tests the specific capability and scores it 0–100.
 * Run before and after implementing fixes to see numeric improvement.
 */

const { TestRunner } = require('../runner');
const path = require('path');
const fs   = require('fs');

// ── Inline stubs so tests run without a live server ──────────────────────────

const { extractEntities }  = require('../../src/entity-extractor');
const { inferSchema }      = require('../../src/schema-inferrer');
const { diffScrapes }      = require('../../src/diff');
const { exportHAR }        = require('../../src/har-exporter');
const { createSchedule, deleteSchedule, listSchedules } = require('../../src/scheduler');

// ── Helpers ───────────────────────────────────────────────────────────────────

function score(label, actual, max) {
  return { label, actual, max, pct: Math.round((actual / max) * 100) };
}

function countFields(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  return Object.keys(obj).length;
}

function hasField(obj, ...path) {
  let cur = obj;
  for (const k of path) {
    if (!cur || typeof cur !== 'object') return false;
    cur = cur[k];
  }
  return cur !== undefined && cur !== null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const runner = new TestRunner('unit-tool-improvements');
  const scores = [];

  // ── 1. pause/resume/submit description quality ─────────────────────────────
  runner.run('fix-1: pause/resume/submit — description quality', ({ setOutput }) => {
    // Check if tool descriptions explain auth flow context and when to call
    let mcpSrc = '';
    try { mcpSrc = fs.readFileSync(path.join(__dirname, '../../mcp-server.js'), 'utf8'); } catch {}

    const pauseDesc    = mcpSrc.match(/name:\s*'pause_scrape'[\s\S]{0,500}?description:\s*'([^']+)'/)?.[1] || '';
    const resumeDesc   = mcpSrc.match(/name:\s*'resume_scrape'[\s\S]{0,500}?description:\s*'([^']+)'/)?.[1] || '';
    const verifyDesc   = mcpSrc.match(/name:\s*'submit_verification_code'[\s\S]{0,500}?description:\s*'([^']+)'/)?.[1] || '';
    const credDesc     = mcpSrc.match(/name:\s*'submit_scrape_credentials'[\s\S]{0,500}?description:\s*'([^']+)'/)?.[1] || '';

    // Score: 1pt each for mentioning key concepts
    let pts = 0;
    if (/list_active_scrapes|get_scrape_status|sessionId/i.test(pauseDesc)) pts++;
    if (/paused|current page|after/i.test(pauseDesc)) pts++;
    if (/status.*paused|paused.*status/i.test(resumeDesc)) pts++;
    if (/awaiting|waiting|2FA|OTP/i.test(verifyDesc)) pts++;
    if (/get_scrape_status|status.*await/i.test(verifyDesc)) pts++;
    if (/login wall|awaiting_cred|login.*detect/i.test(credDesc)) pts++;

    const s = score('description_quality', pts, 6);
    scores.push(s);
    setOutput({ pts, max: 6, pct: s.pct, pauseDesc: pauseDesc.slice(0, 80), verifyDesc: verifyDesc.slice(0, 80) });
    if (s.pct < 80) throw new Error(`Score ${s.pct}% — needs improvement`);
  });

  // ── 2. openWorld flags ─────────────────────────────────────────────────────
  runner.run('fix-2: openWorld flags for extract_entities, find_graphql_endpoints, find_site_issues', ({ setOutput }) => {
    let mcpSrc = '';
    try { mcpSrc = fs.readFileSync(path.join(__dirname, '../../mcp-server.js'), 'utf8'); } catch {}

    const owBlock = mcpSrc.match(/OPEN_WORLD_TOOL_NAMES\s*=\s*new Set\(\[([\s\S]*?)\]\)/)?.[1] || '';
    const hasEntities  = owBlock.includes("'extract_entities'");
    const hasGraphql   = owBlock.includes("'find_graphql_endpoints'");
    const hasSiteIssues = owBlock.includes("'find_site_issues'");
    const pts = [hasEntities, hasGraphql, hasSiteIssues].filter(Boolean).length;

    const s = score('openworld_flags', pts, 3);
    scores.push(s);
    setOutput({ hasEntities, hasGraphql, hasSiteIssues, pct: s.pct });
    if (pts < 3) throw new Error(`Missing openWorld flags: ${[!hasEntities && 'extract_entities', !hasGraphql && 'find_graphql_endpoints', !hasSiteIssues && 'find_site_issues'].filter(Boolean).join(', ')}`);
  });

  // ── 3. Schedule persistence ────────────────────────────────────────────────
  await runner.run('fix-3: schedule persistence survives module reload', async ({ setOutput }) => {
    const schedFile = path.join(__dirname, '../../data/schedules.json');
    // Create a schedule
    const id = `test-sched-${Date.now()}`;
    try {
      createSchedule(id, '*/5 * * * *', { url: 'http://example.com', maxPages: 1 }, null);
    } catch (e) {
      setOutput({ error: e.message });
      throw new Error('createSchedule threw: ' + e.message);
    }

    // Check if the schedule file was written
    const fileExists = fs.existsSync(schedFile);
    let fileHasEntry = false;
    if (fileExists) {
      try {
        const saved = JSON.parse(fs.readFileSync(schedFile, 'utf8'));
        fileHasEntry = Array.isArray(saved) && saved.some(s => s.id === id);
      } catch {}
    }

    // Cleanup
    deleteSchedule(id);

    const pts = [fileExists, fileHasEntry].filter(Boolean).length;
    const s = score('schedule_persistence', pts, 2);
    scores.push(s);
    setOutput({ fileExists, fileHasEntry, schedFile, pct: s.pct });
    if (pts < 2) throw new Error(`Schedule not persisted to disk (fileExists=${fileExists}, hasEntry=${fileHasEntry})`);
  });

  // ── 4. http_fetch — method + body + session cookies ───────────────────────
  runner.run('fix-4: http_fetch — POST method + body + sessionId cookie jar in schema', ({ setOutput }) => {
    let mcpSrc = '';
    try { mcpSrc = fs.readFileSync(path.join(__dirname, '../../mcp-server.js'), 'utf8'); } catch {}

    // Use simple includes() to avoid line-ending regex issues
    const hasMethod    = mcpSrc.includes("name: 'http_fetch'") && mcpSrc.includes("'method'") || mcpSrc.includes('"method"');
    const hasBody      = mcpSrc.includes("name: 'http_fetch'") && (mcpSrc.includes("'body'") || mcpSrc.includes('"body"'));
    const hasSessionId = mcpSrc.includes("name: 'http_fetch'") && mcpSrc.includes("'sessionId'");
    const handlerHasMethod  = mcpSrc.includes("case 'http_fetch'") && mcpSrc.includes('input.method');
    const handlerHasBody    = mcpSrc.includes("case 'http_fetch'") && (mcpSrc.includes('input.body') || mcpSrc.includes('postData'));
    const handlerHasCookies = mcpSrc.includes("case 'http_fetch'") && (mcpSrc.includes('Cookie') || mcpSrc.includes('cookieHeader'));

    const pts = [hasMethod, hasBody, hasSessionId, handlerHasMethod, handlerHasBody, handlerHasCookies].filter(Boolean).length;
    const s = score('http_fetch_capabilities', pts, 6);
    scores.push(s);
    setOutput({ hasMethod, hasBody, hasSessionId, handlerHasMethod, handlerHasBody, handlerHasCookies, pct: s.pct });
    if (pts < 5) throw new Error(`Score ${s.pct}% — http_fetch missing capabilities`);
  });

  // ── 5. export_har real timings ─────────────────────────────────────────────
  runner.run('fix-5: export_har — real timing fields when duration available', ({ setOutput }) => {
    const callWithTiming = {
      url: 'https://example.com/api/data',
      method: 'GET',
      headers: {},
      timestamp: new Date().toISOString(),
      duration: 342,
      response: { status: 200, body: '{"ok":true}', headers: {} },
    };
    const callWithoutTiming = {
      url: 'https://example.com/api/other',
      method: 'POST',
      headers: {},
      timestamp: new Date().toISOString(),
      response: { status: 200, body: '{}', headers: {} },
    };

    const har = exportHAR({ apiCalls: { graphql: [], rest: [callWithTiming, callWithoutTiming] } });
    const entries = har.log?.entries || [];
    const timedEntry   = entries.find(e => e.request.url.includes('data'));
    const untimedEntry = entries.find(e => e.request.url.includes('other'));

    const hasRealTime    = timedEntry && timedEntry.time > 0;
    const hasWaitTiming  = timedEntry && timedEntry.timings?.wait > 0;
    const hasFallback    = untimedEntry && untimedEntry.time === -1;

    const pts = [hasRealTime, hasWaitTiming, hasFallback].filter(Boolean).length;
    const s = score('har_real_timings', pts, 3);
    scores.push(s);
    setOutput({ timedEntry: { time: timedEntry?.time, wait: timedEntry?.timings?.wait }, pct: s.pct });
    if (pts < 3) throw new Error(`HAR timings not using duration field (time=${timedEntry?.time}, wait=${timedEntry?.timings?.wait})`);
  });

  // ── 6. extract_entities — international phones ─────────────────────────────
  runner.run('fix-6: extract_entities — international phone formats', ({ setOutput }) => {
    const text = `
      US: (555) 867-5309 and 1-800-555-0199
      UK: +44 20 7946 0958
      Germany: +49 30 12345678
      France: +33 1 23 45 67 89
      International: +1-416-555-0123
      E.164: +14165550123
    `;
    const result = extractEntities(text);
    const phones = result.phones || [];

    // Score: found US phones + found international
    const hasUS    = phones.some(p => p.includes('555') || p.includes('800'));
    const hasUK    = phones.some(p => p.includes('44'));
    const hasDE    = phones.some(p => p.includes('49'));
    const hasE164  = phones.some(p => /^\+\d{7,15}$/.test(p.replace(/\s/g, '')));

    const pts = [hasUS, hasUK, hasDE, hasE164].filter(Boolean).length;
    const s = score('international_phones', pts, 4);
    scores.push(s);
    setOutput({ phones, hasUS, hasUK, hasDE, hasE164, pct: s.pct });
    if (pts < 3) throw new Error(`Only ${pts}/4 phone formats detected: ${JSON.stringify(phones)}`);
  });

  // ── 7. batch_scrape — per-URL error isolation ─────────────────────────────
  runner.run('fix-7: batch_scrape — schema has errorStrategy param', ({ setOutput }) => {
    let mcpSrc = '';
    try { mcpSrc = fs.readFileSync(path.join(__dirname, '../../mcp-server.js'), 'utf8'); } catch {}

    const hasParallelFlag = /individually|each URL.*independent|per.?URL/i.test(mcpSrc.slice(mcpSrc.indexOf("name: 'batch_scrape'"), mcpSrc.indexOf("name: 'batch_scrape'") + 1000));
    const hasAllSettled   = mcpSrc.includes('Promise.allSettled') || (mcpSrc.includes("case 'batch_scrape'") && mcpSrc.includes('Promise.all(urls'));
    const hasPerUrlResult = mcpSrc.includes("case 'batch_scrape'") && mcpSrc.includes('results');
    const hasErrorCount   = mcpSrc.includes("case 'batch_scrape'") && (mcpSrc.includes('failedCount') || mcpSrc.includes('failed.length') || mcpSrc.includes('failed.map'));

    const pts = [hasParallelFlag || hasAllSettled, hasAllSettled || mcpSrc.includes('Promise.all(urls'), hasPerUrlResult, hasErrorCount].filter(Boolean).length;
    const s = score('batch_error_isolation', pts, 4);
    scores.push(s);
    setOutput({ hasParallelFlag, hasAllSettled, hasPerUrlResult, hasErrorCount, pct: s.pct });
    if (pts < 3) throw new Error(`batch_scrape missing per-URL isolation (score ${s.pct}%)`);
  });

  // ── 8. get_api_calls — filter params ──────────────────────────────────────
  runner.run('fix-8: get_api_calls — filter by method, domain, status, keyword', ({ setOutput }) => {
    let mcpSrc = '';
    try { mcpSrc = fs.readFileSync(path.join(__dirname, '../../mcp-server.js'), 'utf8'); } catch {}

    const schemaBlock = mcpSrc.match(/name:\s*'get_api_calls'[\s\S]{0,2000}?(?=\n  \}[,\n])/)?.[0] || '';
    const handlerBlock = mcpSrc.match(/case 'get_api_calls'[\s\S]{0,2000}?(?=\n    \})/)?.[0] || '';

    const hasMethodFilter  = /method.*filter|filterMethod|method.*param/i.test(schemaBlock) || /method.*filter|filterMethod/i.test(handlerBlock);
    const hasDomainFilter  = /domain.*filter|filterDomain/i.test(schemaBlock) || /domain/i.test(handlerBlock);
    const hasStatusFilter  = /status.*filter|statusMin|statusMax|statusCode/i.test(schemaBlock);
    const hasKeywordFilter = /urlContains|keyword|search.*url|url.*search/i.test(schemaBlock);

    const pts = [hasMethodFilter, hasDomainFilter, hasStatusFilter, hasKeywordFilter].filter(Boolean).length;
    const s = score('api_calls_filters', pts, 4);
    scores.push(s);
    setOutput({ hasMethodFilter, hasDomainFilter, hasStatusFilter, hasKeywordFilter, pct: s.pct });
    if (pts < 3) throw new Error(`get_api_calls missing filter params (score ${s.pct}%)`);
  });

  // ── 9. map_site_for_goal — maxRounds cap ──────────────────────────────────
  runner.run('fix-9: map_site_for_goal — maxRounds param in schema and handler', ({ setOutput }) => {
    let mcpSrc = '';
    try { mcpSrc = fs.readFileSync(path.join(__dirname, '../../mcp-server.js'), 'utf8'); } catch {}

    const schemaBlock = mcpSrc.match(/name:\s*'map_site_for_goal'[\s\S]{0,2000}?(?=\n  \}[,\n])/)?.[0] || '';
    const handlerBlock = mcpSrc.match(/case 'map_site_for_goal'[\s\S]{0,500}/)?.[0] || '';
    const mapFnBlock   = mcpSrc.match(/function mapSiteForGoal[\s\S]{0,3000}?(?=\n\})/)?.[0] || '';

    const schemaHasMaxRounds  = /maxRounds/.test(schemaBlock);
    const handlerPassesIt     = /maxRounds/.test(handlerBlock);
    const fnUsesIt            = /maxRounds/.test(mapFnBlock);

    const pts = [schemaHasMaxRounds, handlerPassesIt, fnUsesIt].filter(Boolean).length;
    const s = score('map_site_maxrounds', pts, 3);
    scores.push(s);
    setOutput({ schemaHasMaxRounds, handlerPassesIt, fnUsesIt, pct: s.pct });
    if (pts < 3) throw new Error(`map_site_for_goal missing maxRounds (score ${s.pct}%)`);
  });

  // ── 10. infer_schema — union types ────────────────────────────────────────
  runner.run('fix-10: infer_schema — union types across multiple calls', ({ setOutput }) => {
    // Call 1: field "value" is a string
    const calls = [
      { url: '/graphql', body: '{"query":"query GetA { item { value } }"}', response: { body: { data: { item: { value: 'hello', count: 1 } } } } },
      { url: '/graphql', body: '{"query":"query GetB { item { value } }"}', response: { body: { data: { item: { value: 42, count: null } } } } },
    ];
    const result = inferSchema(calls);
    const ts = result.typescript || '';
    const schemaStr = JSON.stringify(result.jsonSchema || {});

    // For union types: "value" appears as string in call 1, number in call 2
    const hasAnyOf   = schemaStr.includes('anyOf') || schemaStr.includes('oneOf') || ts.includes(' | ');
    const hasNull    = schemaStr.includes('null') || ts.includes('null');
    const hasBothOps = (ts.match(/interface\s+\w+/g) || []).length >= 2;

    const pts = [hasAnyOf, hasNull, hasBothOps].filter(Boolean).length;
    const s = score('schema_union_types', pts, 3);
    scores.push(s);
    setOutput({ hasAnyOf, hasNull, hasBothOps, tsExcerpt: ts.slice(0, 200), pct: s.pct });
    if (pts < 3) throw new Error(`infer_schema missing union types (score ${s.pct}%)`);
  });

  // ── 11. compare_scrapes — semantic diff ───────────────────────────────────
  runner.run('fix-11: compare_scrapes — semantic diff (price change, similarity)', ({ setOutput }) => {
    const scrapeA = {
      pages: [{ meta: { url: 'https://ex.com/', title: 'Ex' }, fullText: 'Widget $19.99 in stock', textBlocks: [], links: [], images: [], headings: { h1: ['Widget'] } }],
      apiCalls: { graphql: [], rest: [] },
    };
    const scrapeB = {
      pages: [{ meta: { url: 'https://ex.com/', title: 'Ex' }, fullText: 'Widget $24.99 in stock', textBlocks: [], links: [], images: [], headings: { h1: ['Widget'] } }],
      apiCalls: { graphql: [], rest: [] },
    };
    const diff = diffScrapes(scrapeA, scrapeB);

    const hasSemanticKey  = hasField(diff, 'semantic') || hasField(diff, 'priceChanges') || hasField(diff, 'contentSimilarity');
    const hasPriceChange  = JSON.stringify(diff).includes('24.99') || JSON.stringify(diff).includes('price');
    const hasSimilarity   = typeof diff.semantic?.similarity === 'number' || typeof diff.contentSimilarity === 'number';
    const hasSummary      = hasField(diff, 'summary');

    const pts = [hasSemanticKey, hasPriceChange, hasSimilarity, hasSummary].filter(Boolean).length;
    const s = score('semantic_diff', pts, 4);
    scores.push(s);
    setOutput({ hasSummary, hasSemanticKey, hasPriceChange, hasSimilarity, diffKeys: Object.keys(diff), pct: s.pct });
    if (pts < 3) throw new Error(`compare_scrapes missing semantic diff (score ${s.pct}%)`);
  });

  // ── 12. get_save_overview — top endpoints ─────────────────────────────────
  runner.run('fix-12: get_save_overview — topActiveEndpoints with frequency', ({ setOutput }) => {
    let mcpSrc = '';
    try { mcpSrc = fs.readFileSync(path.join(__dirname, '../../mcp-server.js'), 'utf8'); } catch {}

    // Use includes() to avoid line-ending regex issues
    const hasTopEndpoints = mcpSrc.includes('topActiveEndpoints');
    const hasFrequency    = mcpSrc.includes('callCount') || mcpSrc.includes('freq[key]') || mcpSrc.includes('frequency');
    const hasRestAndGql   = mcpSrc.includes('restEndpoints') && mcpSrc.includes('graphqlEndpoints');

    const pts = [hasTopEndpoints, hasFrequency, hasRestAndGql].filter(Boolean).length;
    const s = score('overview_top_endpoints', pts, 3);
    scores.push(s);
    setOutput({ hasTopEndpoints, hasFrequency, hasRestAndGql, pct: s.pct });
    if (pts < 3) throw new Error(`buildSaveOverview missing topActiveEndpoints (score ${s.pct}%)`);
  });

  // ── 13. test_oidc_security — auth_code_replay ─────────────────────────────
  runner.run('fix-13: test_oidc_security — auth_code_replay test type', ({ setOutput }) => {
    let oidcSrc = '';
    try { oidcSrc = fs.readFileSync(path.join(__dirname, '../../src/oidc-tester.js'), 'utf8'); } catch {}
    let mcpSrc = '';
    try { mcpSrc = fs.readFileSync(path.join(__dirname, '../../mcp-server.js'), 'utf8'); } catch {}

    const hasFunctionDef  = /testAuthCodeReplay|auth_code_replay|authCodeReplay/i.test(oidcSrc);
    const hasInOrchestrator = /auth_code_replay/.test(oidcSrc);
    const hasInMcpSchema  = /auth_code_replay/.test(mcpSrc);
    const hasMockSupport  = fs.existsSync(path.join(__dirname, '../security/mock_idp.js'))
      && /replayRejected|used:.*true|REPLAY/i.test(fs.readFileSync(path.join(__dirname, '../security/mock_idp.js'), 'utf8'));

    const pts = [hasFunctionDef, hasInOrchestrator, hasInMcpSchema, hasMockSupport].filter(Boolean).length;
    const s = score('auth_code_replay', pts, 4);
    scores.push(s);
    setOutput({ hasFunctionDef, hasInOrchestrator, hasInMcpSchema, hasMockSupport, pct: s.pct });
    if (pts < 4) throw new Error(`auth_code_replay not fully implemented (score ${s.pct}%)`);
  });

  // ── Final score ────────────────────────────────────────────────────────────
  runner.run('OVERALL SCORE', ({ setOutput }) => {
    const totalActual = scores.reduce((a, s) => a + s.actual, 0);
    const totalMax    = scores.reduce((a, s) => a + s.max, 0);
    const overall     = Math.round((totalActual / totalMax) * 100);
    setOutput({ scores, totalActual, totalMax, overall: `${overall}%` });
    // Don't throw — this is informational
  });

  runner.finish();
}

main().catch(err => { console.error('Crash:', err); process.exit(1); });
