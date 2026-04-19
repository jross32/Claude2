'use strict';

/**
 * tests/unit/round2-improvements.test.js
 * Verifies Round 2 improvements: Anthropic API, JSON-LD surfacing,
 * detect_site context-aware options, and 5 new tools.
 */

const { TestRunner } = require('../runner');
const path = require('path');
const fs   = require('fs');

const ROOT = path.join(__dirname, '../..');

async function main() {
  const runner = new TestRunner('unit-round2-improvements');

  let mcpSource = '';
  let serverSource = '';

  // ── Load sources ───────────────────────────────────────────────────────────
  runner.run('sources load without errors', ({ setOutput }) => {
    mcpSource    = fs.readFileSync(path.join(ROOT, 'mcp-server.js'), 'utf8');
    serverSource = fs.readFileSync(path.join(ROOT, 'src/server.js'), 'utf8');
    if (!mcpSource || mcpSource.length < 1000) throw new Error('mcp-server.js appears empty');
    setOutput({ mcpLen: mcpSource.length, serverLen: serverSource.length });
  });

  // ── r2-fix-1a: Anthropic constants ────────────────────────────────────────
  runner.run('r2-fix-1a: ANTHROPIC_API_KEY/MODEL constants present; OLLAMA_URL removed', ({ setOutput }) => {
    const hasKey   = mcpSource.includes('ANTHROPIC_API_KEY');
    const hasModel = mcpSource.includes('ANTHROPIC_MODEL');
    const noOllama = !mcpSource.includes('OLLAMA_URL');
    const noOldFn  = !mcpSource.includes('analyzeWithOllama');
    const hasNewFn = mcpSource.includes('analyzeWithAnthropic');
    setOutput({ hasKey, hasModel, noOllama, noOldFn, hasNewFn });
    if (!hasKey)   throw new Error('ANTHROPIC_API_KEY constant missing');
    if (!hasModel) throw new Error('ANTHROPIC_MODEL constant missing');
    if (!noOllama) throw new Error('OLLAMA_URL should be removed');
    if (!noOldFn)  throw new Error('analyzeWithOllama should be removed');
    if (!hasNewFn) throw new Error('analyzeWithAnthropic function missing');
  });

  // ── r2-fix-1b: analyzeWithAnthropic hits Anthropic API ────────────────────
  runner.run('r2-fix-1b: analyzeWithAnthropic calls api.anthropic.com with correct headers', ({ setOutput }) => {
    const hasEndpoint = mcpSource.includes('api.anthropic.com');
    const hasVersion  = mcpSource.includes('anthropic-version');
    const hasApiKey   = mcpSource.includes('x-api-key');
    setOutput({ hasEndpoint, hasVersion, hasApiKey });
    if (!hasEndpoint) throw new Error('Missing api.anthropic.com endpoint');
    if (!hasVersion)  throw new Error('Missing anthropic-version header');
    if (!hasApiKey)   throw new Error('Missing x-api-key header');
  });

  // ── r2-fix-1c: strategy uses useAnthropic ─────────────────────────────────
  runner.run('r2-fix-1c: determineResearchStrategy uses useAnthropic and new route names', ({ setOutput }) => {
    const noOldFlag  = !mcpSource.includes('useOllama');
    const hasNewFlag = mcpSource.includes('useAnthropic');
    const noOldRoute = !mcpSource.includes('fast-ollama') && !mcpSource.includes('deep-ollama');
    const hasNewRoute= mcpSource.includes('fast-anthropic') && mcpSource.includes('deep-anthropic');
    const hasImpl    = mcpSource.includes('analyzeWithAnthropicImpl');
    setOutput({ noOldFlag, hasNewFlag, noOldRoute, hasNewRoute, hasImpl });
    if (!noOldFlag)  throw new Error('useOllama still present');
    if (!hasNewFlag) throw new Error('useAnthropic not found');
    if (!noOldRoute) throw new Error('Old route names still present');
    if (!hasNewRoute)throw new Error('New route names missing');
    if (!hasImpl)    throw new Error('analyzeWithAnthropicImpl not found in analyzeResearchQuestion');
  });

  // ── r2-fix-2: JSON-LD in summarisePage ────────────────────────────────────
  runner.run('r2-fix-2: summarisePage includes structuredData (jsonLD, openGraph, twitterCard)', ({ setOutput }) => {
    const hasStructured = mcpSource.includes('structuredData');
    const hasJsonLD     = mcpSource.includes('jsonLD');
    const hasOG         = mcpSource.includes('openGraph');
    const hasTwitter    = mcpSource.includes('twitterCard');
    setOutput({ hasStructured, hasJsonLD, hasOG, hasTwitter });
    if (!hasStructured) throw new Error('structuredData field missing');
    if (!hasJsonLD)     throw new Error('jsonLD not included');
    if (!hasOG)         throw new Error('openGraph not included');
    if (!hasTwitter)    throw new Error('twitterCard not included');
  });

  // ── r2-fix-3: context-aware recommendedScrapeOptions ──────────────────────
  runner.run('r2-fix-3: buildRecommendedScrapeOptions handles all site type branches', ({ setOutput }) => {
    const hasFn       = mcpSource.includes('buildRecommendedScrapeOptions');
    const hasAuth     = mcpSource.includes('requiresAuth');
    const hasSpa      = mcpSource.includes("siteType === 'spa'");
    const hasEcom     = mcpSource.includes("siteType === 'ecommerce'");
    const hasStatic   = mcpSource.includes("siteType === 'static'");
    const hasBot      = mcpSource.includes("botLevel === 'high'");
    const calledRight = mcpSource.includes('buildRecommendedScrapeOptions(detection)');
    setOutput({ hasFn, hasAuth, hasSpa, hasEcom, hasStatic, hasBot, calledRight });
    if (!hasFn)       throw new Error('buildRecommendedScrapeOptions function missing');
    if (!hasAuth)     throw new Error('requiresAuth branch missing');
    if (!hasSpa)      throw new Error("siteType === 'spa' branch missing");
    if (!hasEcom)     throw new Error("siteType === 'ecommerce' branch missing");
    if (!hasStatic)   throw new Error("siteType === 'static' branch missing");
    if (!hasBot)      throw new Error("botLevel === 'high' branch missing");
    if (!calledRight) throw new Error('detect_site handler not calling buildRecommendedScrapeOptions(detection)');
  });

  // ── new tool: extract_structured_data ─────────────────────────────────────
  runner.run('new-tool: extract_structured_data — definition, handler, classification', ({ setOutput }) => {
    const inTools = mcpSource.includes("name: 'extract_structured_data'");
    const hasSchema= mcpSource.includes('schemaTypes');
    const hasSummary=mcpSource.includes('hasProduct') && mcpSource.includes('hasEvent');
    const roSection= mcpSource.slice(mcpSource.indexOf('READ_ONLY_TOOL_NAMES'), mcpSource.indexOf('DESTRUCTIVE_TOOL_NAMES'));
    const inRO     = roSection.includes('extract_structured_data');
    setOutput({ inTools, hasSchema, hasSummary, inRO });
    if (!inTools)   throw new Error('Tool definition missing from TOOLS array');
    if (!hasSchema) throw new Error('schemaTypes field missing from handler');
    if (!hasSummary)throw new Error('hasProduct/hasEvent summary fields missing');
    if (!inRO)      throw new Error('extract_structured_data not in READ_ONLY_TOOL_NAMES');
  });

  // ── new tool: crawl_sitemap ────────────────────────────────────────────────
  runner.run('new-tool: crawl_sitemap — definition, handler, classification', ({ setOutput }) => {
    const inTools     = mcpSource.includes("name: 'crawl_sitemap'");
    const hasLocParse = mcpSource.includes('<loc>');
    const hasSitemapIdx=mcpSource.includes('sitemapindex');
    const hasRobots   = mcpSource.includes('robots.txt');
    const owSection   = mcpSource.slice(mcpSource.indexOf('OPEN_WORLD_TOOL_NAMES'), mcpSource.indexOf('TOOLS.forEach'));
    const inOW        = owSection.includes('crawl_sitemap');
    setOutput({ inTools, hasLocParse, hasSitemapIdx, hasRobots, inOW });
    if (!inTools)      throw new Error('Tool definition missing');
    if (!hasLocParse)  throw new Error('<loc> parsing missing');
    if (!hasSitemapIdx)throw new Error('Sitemap index detection missing');
    if (!hasRobots)    throw new Error('robots.txt discovery missing');
    if (!inOW)         throw new Error('crawl_sitemap not in OPEN_WORLD_TOOL_NAMES');
  });

  // ── new tool: take_screenshot ─────────────────────────────────────────────
  runner.run('new-tool: take_screenshot — definition, REST endpoint, browser safety', ({ setOutput }) => {
    const inTools     = mcpSource.includes("name: 'take_screenshot'");
    const hasEndpoint = serverSource.includes('/api/screenshot');
    const hasB64      = serverSource.includes('screenshotBase64');
    const hasBrowserClose = serverSource.includes('browser.close');
    const owSection   = mcpSource.slice(mcpSource.indexOf('OPEN_WORLD_TOOL_NAMES'), mcpSource.indexOf('TOOLS.forEach'));
    const inOW        = owSection.includes('take_screenshot');
    setOutput({ inTools, hasEndpoint, hasB64, hasBrowserClose, inOW });
    if (!inTools)     throw new Error('Tool definition missing');
    if (!hasEndpoint) throw new Error('/api/screenshot endpoint missing from server.js');
    if (!hasB64)      throw new Error('screenshotBase64 response field missing');
    if (!hasBrowserClose) throw new Error('browser.close() not found — memory leak risk');
    if (!inOW)        throw new Error('take_screenshot not in OPEN_WORLD_TOOL_NAMES');
  });

  // ── new tool: fill_form ───────────────────────────────────────────────────
  runner.run('new-tool: fill_form — definition, REST endpoint, field filling', ({ setOutput }) => {
    const inTools      = mcpSource.includes("name: 'fill_form'");
    const hasEndpoint  = serverSource.includes('/api/fill-form');
    const hasPageFill  = serverSource.includes('page.fill');
    const hasSubmit    = serverSource.includes('submitSelector');
    const owSection    = mcpSource.slice(mcpSource.indexOf('OPEN_WORLD_TOOL_NAMES'), mcpSource.indexOf('TOOLS.forEach'));
    const inOW         = owSection.includes('fill_form');
    setOutput({ inTools, hasEndpoint, hasPageFill, hasSubmit, inOW });
    if (!inTools)     throw new Error('Tool definition missing');
    if (!hasEndpoint) throw new Error('/api/fill-form endpoint missing from server.js');
    if (!hasPageFill) throw new Error('page.fill() not found in server.js');
    if (!hasSubmit)   throw new Error('submitSelector not handled');
    if (!inOW)        throw new Error('fill_form not in OPEN_WORLD_TOOL_NAMES');
  });

  // ── new tool: monitor_page + delete_monitor ───────────────────────────────
  runner.run('new-tool: monitor_page — definition, state file, diff integration', ({ setOutput }) => {
    const inTools      = mcpSource.includes("name: 'monitor_page'");
    const hasMonitors  = mcpSource.includes('loadMonitors') && mcpSource.includes('saveMonitors');
    const hasBaseline  = mcpSource.includes('baseline_created');
    const hasDiff      = mcpSource.includes('diffScrapes');
    const owSection    = mcpSource.slice(mcpSource.indexOf('OPEN_WORLD_TOOL_NAMES'), mcpSource.indexOf('TOOLS.forEach'));
    const inOW         = owSection.includes('monitor_page');
    setOutput({ inTools, hasMonitors, hasBaseline, hasDiff, inOW });
    if (!inTools)     throw new Error('Tool definition missing');
    if (!hasMonitors) throw new Error('loadMonitors/saveMonitors missing');
    if (!hasBaseline) throw new Error('baseline_created status missing');
    if (!hasDiff)     throw new Error('diffScrapes call missing');
    if (!inOW)        throw new Error('monitor_page not in OPEN_WORLD_TOOL_NAMES');
  });

  runner.run('new-tool: delete_monitor — definition and DESTRUCTIVE classification', ({ setOutput }) => {
    const inTools  = mcpSource.includes("name: 'delete_monitor'");
    const destIdx  = mcpSource.indexOf('DESTRUCTIVE_TOOL_NAMES');
    const owIdx    = mcpSource.indexOf('OPEN_WORLD_TOOL_NAMES');
    const destSection = mcpSource.slice(destIdx, owIdx);
    const inDest   = destSection.includes('delete_monitor');
    setOutput({ inTools, inDest });
    if (!inTools) throw new Error('delete_monitor tool definition missing');
    if (!inDest)  throw new Error('delete_monitor not in DESTRUCTIVE_TOOL_NAMES');
  });

  runner.finish();
}

main().catch(err => { console.error('Crash:', err); process.exit(1); });
