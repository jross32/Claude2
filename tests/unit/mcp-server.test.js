/**
 * unit/mcp-server.test.js
 * Verifies MCP registry metadata, prompt/resource exports, and core helper behavior.
 */

const { TestRunner } = require('../runner');
const {
  TOOLS,
  FIXED_RESOURCES,
  PROMPTS,
  RESOURCE_TEMPLATES,
  __private__,
} = require('../../mcp-server');

const NEW_TOOL_NAMES = [
  'check_saved_session',
  'clear_saved_session',
  'get_known_site_credentials',
  'pause_scrape',
  'resume_scrape',
  'submit_verification_code',
  'submit_scrape_credentials',
  'delete_save',
  'generate_css',
  'generate_sitemap',
  'list_active_scrapes',
  'get_scrape_status',
  'get_save_overview',
  'find_site_issues',
  'extract_deals',
  'list_internal_pages',
  'get_api_surface',
  'get_store_context',
  'search_scrape_text',
  'list_links',
  'list_forms',
  'list_images',
  'get_tech_stack',
  'find_graphql_endpoints',
  'preflight_url',
  'map_site_for_goal',
  'research_url',
  'http_fetch',
];

async function main() {
  const runner = new TestRunner('unit');

  await runner.run('MCP server exports 47 tools', ({ setOutput }) => {
    if (!Array.isArray(TOOLS)) throw new Error('TOOLS export missing');
    if (TOOLS.length !== 47) throw new Error(`Expected 47 tools, got ${TOOLS.length}`);
    setOutput({ count: TOOLS.length });
  });

  await runner.run('MCP tool names are unique', ({ setOutput }) => {
    const names = TOOLS.map((tool) => tool.name);
    const uniqueNames = new Set(names);
    if (uniqueNames.size !== names.length) throw new Error('Duplicate tool names found');
    setOutput({ uniqueCount: uniqueNames.size });
  });

  await runner.run('New MCP tools are present', ({ setOutput }) => {
    const names = new Set(TOOLS.map((tool) => tool.name));
    const missing = NEW_TOOL_NAMES.filter((name) => !names.has(name));
    if (missing.length) throw new Error(`Missing tools: ${missing.join(', ')}`);
    setOutput({ added: NEW_TOOL_NAMES.length });
  });

  await runner.run('All MCP tools include title and annotations', ({ setOutput }) => {
    const missing = TOOLS
      .filter((tool) => !tool.title || !tool.annotations || typeof tool.annotations.readOnlyHint !== 'boolean')
      .map((tool) => tool.name);
    if (missing.length) throw new Error(`Missing title/annotations: ${missing.join(', ')}`);
    setOutput({ annotatedTools: TOOLS.length });
  });

  await runner.run('research_url schema exposes auto/fast/deep modes', ({ setOutput }) => {
    const researchTool = TOOLS.find((tool) => tool.name === 'research_url');
    const modeEnum = researchTool?.inputSchema?.properties?.mode?.enum || [];
    const includeEvidence = researchTool?.inputSchema?.properties?.includeEvidence;

    if (!modeEnum.includes('auto') || !modeEnum.includes('fast') || !modeEnum.includes('deep')) {
      throw new Error(`Unexpected mode enum: ${JSON.stringify(modeEnum)}`);
    }
    if (!includeEvidence || includeEvidence.type !== 'boolean') {
      throw new Error('includeEvidence flag missing from research_url schema');
    }

    setOutput({ modeEnum, includeEvidenceType: includeEvidence.type });
  });

  await runner.run('Read-only MCP tools expose readOnlyHint', ({ setOutput }) => {
    const searchTool = TOOLS.find((tool) => tool.name === 'search_scrape_text');
    if (!searchTool?.annotations?.readOnlyHint) throw new Error('search_scrape_text should be read-only');
    const scrapeTool = TOOLS.find((tool) => tool.name === 'scrape_url');
    if (scrapeTool?.annotations?.readOnlyHint) throw new Error('scrape_url should not be read-only');
    const mapTool = TOOLS.find((tool) => tool.name === 'map_site_for_goal');
    if (mapTool?.annotations?.readOnlyHint) throw new Error('map_site_for_goal should not be read-only');
    setOutput({ readOnlyTool: searchTool.name });
  });

  await runner.run('map_site_for_goal schema exposes scope and exhaustive controls', ({ setOutput }) => {
    const tool = TOOLS.find((entry) => entry.name === 'map_site_for_goal');
    const properties = tool?.inputSchema?.properties || {};
    if (properties.scopeLevel?.type !== 'number') throw new Error('scopeLevel should be numeric');
    if (properties.exhaustive?.type !== 'boolean') throw new Error('exhaustive should be boolean');
    if (properties.includeApiHints?.type !== 'boolean') throw new Error('includeApiHints should be boolean');
    setOutput({ scopeLevelType: properties.scopeLevel.type, exhaustiveType: properties.exhaustive.type });
  });

  await runner.run('Fixed resources and resource templates are exported', ({ setOutput }) => {
    const fixedUris = new Set(FIXED_RESOURCES.map((resource) => resource.uri));
    const templateUris = new Set(RESOURCE_TEMPLATES.map((resource) => resource.uriTemplate));
    const promptNames = new Set(PROMPTS.map((prompt) => prompt.name));

    const expectedFixed = ['scrape://saves', 'scrape://active'];
    const expectedTemplates = [
      'scrape://save/{sessionId}/summary',
      'scrape://save/{sessionId}/overview',
      'scrape://save/{sessionId}/issues',
      'scrape://save/{sessionId}/deals',
      'scrape://save/{sessionId}/orientation',
      'scrape://save/{sessionId}/store-context',
      'scrape://save/{sessionId}/api-surface',
      'scrape://save/{sessionId}/page/{pageIndex}',
      'scrape://save/{sessionId}/api/{kind}',
      'scrape://active/{sessionId}',
    ];
    const expectedPrompts = [
      'reverse_engineer_site_api',
      'extract_contacts_from_scrape',
      'review_scrape_security',
      'compare_scrapes_workflow',
      'investigate_site_leakage',
      'extract_store_deals',
      'map_api_surface',
      'plan_site_extraction_for_goal',
    ];

    const missing = [
      ...expectedFixed.filter((uri) => !fixedUris.has(uri)),
      ...expectedTemplates.filter((uri) => !templateUris.has(uri)),
      ...expectedPrompts.filter((name) => !promptNames.has(name)),
    ];
    if (missing.length) throw new Error(`Missing resource/prompt exports: ${missing.join(', ')}`);
    setOutput({ fixed: expectedFixed.length, templates: expectedTemplates.length, prompts: expectedPrompts.length });
  });

  await runner.run('truncateText limits long strings', ({ setOutput }) => {
    const result = __private__.truncateText('abcdefghijklmnopqrstuvwxyz', 10);
    if (result !== 'abcdefghij…') throw new Error(`Unexpected truncate result: ${result}`);
    setOutput({ result });
  });

  await runner.run('searchSavedPages returns snippets and match counts', ({ setOutput }) => {
    const results = __private__.searchSavedPages([
      {
        meta: { url: 'https://example.com/a', title: 'Example Alpha', description: 'Primary example page' },
        headings: { h1: [{ text: 'Alpha heading' }], h2: [] },
        fullText: 'This example page includes alpha content and another example mention.',
      },
      {
        meta: { url: 'https://example.com/b', title: 'No match here', description: '' },
        headings: { h1: [], h2: [] },
        fullText: 'Completely unrelated content.',
      },
    ], 'example', { limit: 5, snippetChars: 80 });

    if (results.length !== 1) throw new Error(`Expected 1 matching page, got ${results.length}`);
    if (results[0].matchCount < 2) throw new Error(`Expected multiple matches, got ${results[0].matchCount}`);
    if (!results[0].snippets.length) throw new Error('Expected snippets for matching page');
    setOutput({ matches: results[0].matchCount, snippets: results[0].snippets.length });
  });

  await runner.run('research question router classifies extractive and deep prompts', ({ setOutput }) => {
    const extractive = __private__.determineResearchStrategy('When is Black Bolt & White Flare releasing?', 'auto');
    const deep = __private__.determineResearchStrategy('Compare the major upcoming releases and explain the likely trends.', 'auto');
    const forcedFast = __private__.determineResearchStrategy('Summarize the page for me.', 'fast');

    if (extractive.routeUsed !== 'extractive') throw new Error(`Expected extractive route, got ${extractive.routeUsed}`);
    if (deep.routeUsed !== 'reasoning-heavy') throw new Error(`Expected reasoning-heavy route, got ${deep.routeUsed}`);
    if (forcedFast.routeUsed !== 'fast-ollama') throw new Error(`Expected fast override, got ${forcedFast.routeUsed}`);

    setOutput({ extractive: extractive.routeUsed, deep: deep.routeUsed, forcedFast: forcedFast.routeUsed });
  });

  await runner.run('buildGoalModel expands deals and price-sensitive goals', ({ setOutput }) => {
    const deals = __private__.buildGoalModel('find all deals for this store');
    const priceSensitive = __private__.buildGoalModel('find games under $100');

    if (!deals.intents.includes('deals')) throw new Error('Expected deals intent');
    if (!deals.coverageTargets.some((target) => target.id === 'rebates')) throw new Error('Expected rebates target');
    if (priceSensitive.priceLimit !== 100) throw new Error(`Expected price limit 100, got ${priceSensitive.priceLimit}`);
    if (!priceSensitive.coverageTargets.some((target) => target.id === 'free_items')) throw new Error('Expected free_items target');

    setOutput({ dealTargets: deals.coverageTargets.map((target) => target.id), priceLimit: priceSensitive.priceLimit });
  });

  await runner.run('scoreGoalText matches retail deal sections', ({ setOutput }) => {
    const goalModel = __private__.buildGoalModel('find all deals');
    const score = __private__.scoreGoalText('Coupons & Cash Back Weekly Ads Rebates', goalModel);
    if (score.score < 12) throw new Error(`Expected strong deal score, got ${score.score}`);
    if (!score.matchedTargets.includes('coupons') || !score.matchedTargets.includes('weekly_ads') || !score.matchedTargets.includes('rebates')) {
      throw new Error(`Missing matched targets: ${JSON.stringify(score.matchedTargets)}`);
    }
    setOutput({ score: score.score, matchedTargets: score.matchedTargets });
  });

  await runner.run('buildResearchEvidence respects fast profile budget and ranks matches first', ({ setOutput }) => {
    const evidence = __private__.buildResearchEvidence([
      {
        url: 'https://example.com/releases',
        title: 'Upcoming Releases',
        fullText: 'Black Bolt releases July 18 2025. Mega Evolution releases September 26 2025.',
        headings: { h1: ['Upcoming Releases'], h2: ['Release Calendar'] },
        links: [{ href: 'https://example.com/releases/black-bolt', text: 'Black Bolt' }],
      },
      {
        url: 'https://example.com/about',
        title: 'About the site',
        fullText: 'General site information and contact details.',
        headings: { h1: ['About'], h2: [] },
        links: [],
      },
    ], 'When does Black Bolt release?', 'fast');

    if (!evidence.promptPages.length) throw new Error('Expected prompt pages');
    if (evidence.publicEvidence[0].url !== 'https://example.com/releases') {
      throw new Error(`Expected release page first, got ${evidence.publicEvidence[0].url}`);
    }
    const totalChars = evidence.promptPages.reduce((sum, page) => sum + page.fullText.length, 0);
    if (totalChars > __private__.getResearchProfile('fast').maxTotalChars) {
      throw new Error(`Fast evidence exceeded budget: ${totalChars}`);
    }

    setOutput({ rankedUrl: evidence.publicEvidence[0].url, totalChars });
  });

  await runner.run('buildSaveOverview summarizes counts, sections, and highlights', ({ setOutput }) => {
    const overview = __private__.buildSaveOverview({
      sessionId: 'save-001',
      startUrl: 'https://example.com/store',
      lastSavedAt: '2026-04-16T00:00:00.000Z',
      pages: [{
        meta: { url: 'https://example.com/store', title: 'Store Home', description: 'Store details' },
        headings: { h1: [{ text: 'Store details' }], h2: [{ text: 'Hours' }] },
        fullText: 'Store #4337 is open from 8:00 AM to 9:00 PM and has weekly deals.',
        links: [{ href: 'https://example.com/store/deals', text: 'Deals' }],
        forms: [{ fields: [{ name: 'zip' }] }],
        images: [{ src: 'https://example.com/a.jpg' }],
        tech: { frameworks: ['React'] },
      }],
      apiCalls: {
        graphql: [],
        rest: [{ url: 'https://example.com/api/store/info/4337?postal_code=78578', method: 'GET', statusCode: 200, headers: { authorization: 'Bearer x' } }],
      },
      cookies: [{ name: 'sessionToken', domain: 'example.com', secure: true, httpOnly: true, sameSite: 'Lax' }],
      securityHeaders: { 'x-frame-options': 'DENY' },
      consoleLogs: [{ type: 'error', text: 'Session timeout, please sign in again.' }],
      failedPages: [],
    });

    if (overview.counts.pages !== 1) throw new Error(`Expected 1 page, got ${overview.counts.pages}`);
    if (!overview.sections.some((section) => section.section === 'store')) throw new Error('Expected store section');
    if (!overview.highlights.length) throw new Error('Expected highlights');
    setOutput({ sections: overview.sections.length, highlights: overview.highlights.length });
  });

  await runner.run('buildApiSurface groups endpoints and operations', ({ setOutput }) => {
    const surface = __private__.buildApiSurface({
      sessionId: 'save-002',
      apiCalls: {
        graphql: [{
          url: 'https://example.com/graphql?store=4337',
          method: 'POST',
          headers: { authorization: 'Bearer abc' },
          body: { operationName: 'GetDeals', query: 'query GetDeals { deals { id } }' },
          response: { status: 200 },
        }],
        rest: [{
          url: 'https://example.com/api/store/info/4337?postal_code=78578',
          method: 'GET',
          headers: { 'x-api-key': 'redacted' },
          statusCode: 200,
        }],
      },
      cookies: [{ name: 'appSessionToken', domain: 'example.com', secure: true, httpOnly: true, sameSite: 'Lax' }],
    });

    if (!surface.graphql.operations.includes('GetDeals')) throw new Error('Expected GetDeals operation');
    if (!surface.rest.endpoints[0]?.queryParamKeys.includes('postal_code')) throw new Error('Expected postal_code query param');
    if (!surface.authHints.headerNames.includes('authorization')) throw new Error('Expected authorization auth hint');
    setOutput({ graphqlEndpoints: surface.graphql.endpoints.length, restEndpoints: surface.rest.endpoints.length });
  });

  await runner.run('collectStoreContext detects visible/API mismatches', ({ setOutput }) => {
    const context = __private__.collectStoreContext({
      sessionId: 'save-003',
      pages: [{
        meta: { url: 'https://example.com/store/4337', title: 'Store #4337' },
        headings: { h1: [{ text: 'Store #4337' }], h2: [] },
        fullText: 'Store #4337 is located at 1740 Highway 100, Port Isabel, TX 78578 and is open 8:00 AM - 9:00 PM.',
      }],
      apiCalls: {
        graphql: [],
        rest: [{
          url: 'https://example.com/api/store/info/21622?postal_code=78520',
          method: 'GET',
          response: { body: { merchant_store_code: '21622', address: '6115 FM 1732, Brownsville, TX 78520', hours: '9:00 AM - 8:00 PM' } },
        }],
      },
      cookies: [{ name: 'preferredStore', domain: 'example.com', secure: true, httpOnly: false, sameSite: 'Lax' }],
    });

    if (!context.mismatches.length) throw new Error('Expected at least one mismatch');
    if (context.pageContext.primaryStoreNumber !== '4337') throw new Error(`Unexpected page store number: ${context.pageContext.primaryStoreNumber}`);
    if (context.apiContext.primaryStoreNumber !== '21622') throw new Error(`Unexpected API store number: ${context.apiContext.primaryStoreNumber}`);
    setOutput({ mismatchTypes: context.mismatches.map((issue) => issue.type) });
  });

  await runner.run('extractDealsFromSave finds deal snippets from pages and APIs', ({ setOutput }) => {
    const deals = __private__.extractDealsFromSave({
      sessionId: 'save-004',
      pages: [{
        meta: { url: 'https://example.com/deals', title: 'Weekly Deals', description: '' },
        headings: { h1: [{ text: 'Weekly Deals' }], h2: [] },
        fullText: 'Pepsi or Mountain Dew 3 for $14. Tostitos Chips or Dairy Dips 2 for $8.',
      }],
      apiCalls: {
        graphql: [],
        rest: [{
          url: 'https://example.com/api/deals',
          method: 'GET',
          response: { body: [{ title: 'Digital coupon', description: 'Gain detergent $5.50 with digital coupon' }] },
        }],
      },
    }, { limit: 10 });

    if (deals.count < 2) throw new Error(`Expected at least 2 deals, got ${deals.count}`);
    if (!deals.deals.some((deal) => deal.text.includes('$14'))) throw new Error('Expected Pepsi/Mountain Dew deal');
    setOutput({ count: deals.count, first: deals.deals[0].text });
  });

  await runner.run('buildOrientationFromSave maps multi-section deal flows', ({ setOutput }) => {
    const save = {
      sessionId: 'orientation-001',
      startUrl: 'https://www.dollargeneral.com/store-directory/tx/port-isabel/4337',
      visitedUrls: [
        'https://www.dollargeneral.com/store-directory/tx/port-isabel/4337',
        'https://www.dollargeneral.com/deals/coupons?sort=0&sortOrder=2&type=0',
        'https://www.dollargeneral.com/deals/weekly-ads',
      ],
      pages: [{
        meta: {
          url: 'https://www.dollargeneral.com/store-directory/tx/port-isabel/4337',
          title: 'Dollar General Store # 4337 in Texas, Port Isabel, 1740 Highway 100 | Dollar General',
          description: 'Store details and services',
        },
        headings: {
          h1: [{ text: 'Dollar General Store #4337' }],
          h2: [{ text: 'Store Services' }],
        },
        fullText: 'Shopping in-store at 1740 Highway 100, Port Isabel, TX 78578-2803. Explore Deals. Coupons & Cash Back. Weekly Ads. Rebates.',
        links: [
          { href: 'https://www.dollargeneral.com/deals/coupons?sort=0&sortOrder=2&type=0', text: 'Coupons & Cash Back', isInternal: true },
          { href: 'https://www.dollargeneral.com/deals/weekly-ads', text: 'Weekly Ads', isInternal: true },
          { href: 'https://www.dollargeneral.com/deals/rebates', text: 'Rebates', isInternal: true },
        ],
        navigation: [{
          ariaLabel: 'Deals Navigation',
          items: [
            { text: 'Coupons & Cash Back', href: 'https://www.dollargeneral.com/deals/coupons?sort=0&sortOrder=2&type=0' },
            { text: 'Weekly Ads', href: 'https://www.dollargeneral.com/deals/weekly-ads' },
            { text: 'Rebates', href: 'https://www.dollargeneral.com/deals/rebates' },
          ],
        }],
        buttons: [
          { text: 'Coupons & Cash Back' },
          { text: 'Weekly Ads' },
          { text: 'Rebates' },
        ],
        forms: [],
      }],
      apiCalls: {
        graphql: [],
        rest: [{
          url: 'https://dam.flippenterprise.net/flyerkit/publications/dollargeneral?postal_code=78578&store_code=4337',
          method: 'GET',
          statusCode: 200,
        }],
      },
      cookies: [],
      securityHeaders: { 'x-frame-options': 'DENY' },
      consoleLogs: [],
      failedPages: [],
    };

    const orientation = __private__.buildOrientationFromSave(save, {
      goal: 'find all deals',
      scopeLevel: 1,
      exhaustive: false,
      includeApiHints: true,
      relatedSessionIds: [],
      roundCount: 1,
      stopReason: 'test',
    });

    const labels = orientation.relevantSections.map((section) => section.label);
    if (!labels.some((label) => /Coupons & Cash Back/i.test(label))) throw new Error('Expected Coupons & Cash Back section');
    if (!labels.some((label) => /Weekly Ads/i.test(label))) throw new Error('Expected Weekly Ads section');
    if (!labels.some((label) => /Rebates/i.test(label))) throw new Error('Expected Rebates section');
    if (!orientation.coverage.found.includes('weekly_ads')) throw new Error('Expected weekly_ads coverage');
    if (!orientation.apiHints.length) throw new Error('Expected API hints');

    setOutput({ found: orientation.coverage.found, recommendedScrapes: orientation.recommendedScrapes.length });
  });

  await runner.run('scope selection and stop logic behave as expected', ({ setOutput }) => {
    const allowedLevel1 = __private__.selectOrientationFollowUps({
      coverage: { relatedOrigins: [{ origin: 'https://dam.flippenterprise.net', reasons: ['api'], score: 9 }] },
      recommendedScrapes: [
        {
          methodHint: 'scrape_url',
          url: 'https://dam.flippenterprise.net/flyerkit/publications/dollargeneral?postal_code=78578&store_code=4337',
          priority: 'high',
          alreadyVisited: false,
        },
        {
          methodHint: 'scrape_url',
          url: 'https://example.org/deals',
          priority: 'high',
          alreadyVisited: false,
        },
      ],
    }, {
      attemptedUrls: new Set(),
      scopeLevel: 1,
      startUrl: 'https://www.dollargeneral.com/deals',
    });

    if (allowedLevel1.length !== 1) throw new Error(`Expected 1 allowed follow-up at scope 1, got ${allowedLevel1.length}`);

    const shouldStop = __private__.shouldStopOrientationRun({
      coverage: { isLikelyComplete: true },
    }, {
      exhaustive: false,
      staleRounds: 1,
      pendingFollowUps: 0,
      newRelevantSections: 0,
    });

    if (!shouldStop) throw new Error('Expected orientation stop condition to trigger');
    setOutput({ allowedLevel1: allowedLevel1.length, shouldStop });
  });

  await runner.run('findSiteIssues flags security and context problems', ({ setOutput }) => {
    const issues = __private__.findSiteIssues({
      sessionId: 'save-005',
      startUrl: 'https://example.com/store',
      pages: [{
        meta: { url: 'https://example.com/store', title: 'Store #4337' },
        headings: { h1: [{ text: 'Store #4337' }], h2: [] },
        fullText: 'Session timeout, please sign in again. Store #4337 is open 8:00 AM - 9:00 PM.',
      }],
      apiCalls: {
        graphql: [],
        rest: [{
          url: 'https://example.com/api/store/info/21622?postal_code=78520',
          method: 'GET',
          headers: { authorization: 'Bearer x' },
          response: { body: { merchant_store_code: '21622' } },
        }],
      },
      cookies: [{ name: 'appToken', domain: 'example.com', secure: false, httpOnly: false, sameSite: 'Lax' }],
      securityHeaders: {},
      consoleLogs: [{ type: 'error', text: 'TypeError: widget failed' }],
      failedPages: [{ url: 'https://example.com/weekly-ads', reason: 'auth-redirect' }],
    });

    if (!issues.count) throw new Error('Expected issues to be detected');
    if (!issues.bySeverity.medium && !issues.bySeverity.high) throw new Error('Expected medium/high issues');
    setOutput({ count: issues.count, bySeverity: issues.bySeverity });
  });

  await runner.run('analyzeResearchQuestion skips Ollama for extractive auto mode', async ({ setOutput }) => {
    let called = false;
    const result = await __private__.analyzeResearchQuestion([
      {
        url: 'https://example.com/releases',
        title: 'Upcoming Releases',
        fullText: 'Black Bolt releases July 18 2025.',
        headings: { h1: ['Upcoming Releases'], h2: [] },
        links: [{ href: 'https://example.com/releases/black-bolt', text: 'Black Bolt' }],
      },
    ], 'When does Black Bolt release?', {
      mode: 'auto',
      analyzeWithOllamaImpl: async () => {
        called = true;
        return null;
      },
    });

    if (called) throw new Error('Expected extractive auto mode to skip Ollama');
    if (result.routeUsed !== 'extractive') throw new Error(`Unexpected routeUsed: ${result.routeUsed}`);
    setOutput({ routeUsed: result.routeUsed, analysisMethod: result.analysisMethod });
  });

  await runner.run('analyzeResearchQuestion falls back cleanly when Ollama returns null', async ({ setOutput }) => {
    const result = await __private__.analyzeResearchQuestion([
      {
        url: 'https://example.com/releases',
        title: 'Upcoming Releases',
        fullText: 'Black Bolt releases July 18 2025. Mega Evolution releases September 26 2025.',
        headings: { h1: ['Upcoming Releases'], h2: ['Release Calendar'] },
        links: [],
      },
    ], 'Summarize the release page and explain the key themes.', {
      mode: 'deep',
      includeEvidence: true,
      analyzeWithOllamaImpl: async () => null,
    });

    if (result.routeUsed !== 'deep-ollama') throw new Error(`Expected deep override route, got ${result.routeUsed}`);
    if (result.analysisMethod !== 'keyword-extraction') throw new Error(`Expected keyword fallback, got ${result.analysisMethod}`);
    if (!Array.isArray(result.evidence) || !result.evidence.length) throw new Error('Expected evidence in response');
    setOutput({ routeUsed: result.routeUsed, evidenceCount: result.evidence.length });
  });

  await runner.run('normalizeCompletedScrapeResult converts saved scrapes into result shape', ({ setOutput }) => {
    const normalized = __private__.normalizeCompletedScrapeResult({
      sessionId: 'save-123',
      startUrl: 'https://example.com/docs',
      startedAt: '2026-04-15T00:00:00.000Z',
      lastSavedAt: '2026-04-15T00:00:05.000Z',
      pages: [{
        meta: { url: 'https://example.com/docs', title: 'Docs Home' },
        headings: { h1: [{ text: 'Docs' }], h2: [] },
        fullText: 'Documentation landing page',
        images: [{ src: 'https://example.com/logo.png' }],
      }],
      apiCalls: {
        graphql: [{ url: 'https://example.com/graphql' }],
        rest: [{ url: 'https://example.com/api/items' }],
      },
      assets: [{ url: 'https://example.com/app.js' }],
      cookies: [{ name: 'crumb', domain: 'example.com' }],
      securityHeaders: { server: 'Example' },
      failedPages: [],
    });

    if (normalized.meta.targetUrl !== 'https://example.com/docs') throw new Error('Expected targetUrl from save');
    if (normalized.meta.totalPages !== 1) throw new Error(`Expected totalPages 1, got ${normalized.meta.totalPages}`);
    if (normalized.siteInfo.title !== 'Docs Home') throw new Error('Expected siteInfo title from first page');
    if (normalized.pages.length !== 1) throw new Error('Expected pages to be preserved');
    setOutput({ totalPages: normalized.meta.totalPages, title: normalized.siteInfo.title });
  });

  await runner.run('toResearchPage reads saved-page meta fields', ({ setOutput }) => {
    const page = __private__.toResearchPage({
      meta: { url: 'https://example.com/about', title: 'About Example' },
      fullText: 'About page body',
      headings: { h1: [{ text: 'About' }], h2: [] },
    });

    if (page.url !== 'https://example.com/about') throw new Error('Expected URL from page.meta.url');
    if (page.title !== 'About Example') throw new Error('Expected title from page.meta.title');
    if (page.fullText !== 'About page body') throw new Error('Expected full text to be preserved');
    setOutput({ url: page.url, title: page.title });
  });

  await runner.run('createToolSuccess includes structuredContent', ({ setOutput }) => {
    const result = __private__.createToolSuccess('search_scrape_text', { ok: true });
    if (!result.structuredContent?.data?.ok) throw new Error('structuredContent missing success payload');
    setOutput({ structured: true });
  });

  await runner.run('createToolFailure includes standardized error shape', ({ setOutput }) => {
    const result = __private__.createToolFailure('search_scrape_text', new Error('Session not found'));
    const error = result.structuredContent?.error;
    if (!result.isError) throw new Error('Expected isError = true');
    if (!error?.code || typeof error.retryable !== 'boolean' || !error.suggestedNextStep) {
      throw new Error('Structured error missing required fields');
    }
    setOutput({ code: error.code, retryable: error.retryable });
  });

  await runner.run('Prompt builder references narrow MCP reads', ({ setOutput }) => {
    const text = __private__.buildPromptText('reverse_engineer_site_api', { sessionId: 'abc123' });
    if (!text.includes('get_scrape_status') || !text.includes('scrape://save/abc123/summary')) {
      throw new Error('Prompt text is missing expected MCP references');
    }
    setOutput({ preview: text.slice(0, 80) });
  });

  await runner.run('New workflow prompts reference the new narrow tools/resources', ({ setOutput }) => {
    const leakage = __private__.buildPromptText('investigate_site_leakage', { sessionId: 'save-9' });
    const deals = __private__.buildPromptText('extract_store_deals', { sessionId: 'save-9' });
    const api = __private__.buildPromptText('map_api_surface', { sessionId: 'save-9' });
    const goal = __private__.buildPromptText('plan_site_extraction_for_goal', { sessionId: 'save-9', goal: 'find all deals' });

    if (!leakage.includes('get_store_context') || !leakage.includes('scrape://save/save-9/issues')) {
      throw new Error('Leakage prompt missing expected references');
    }
    if (!deals.includes('extract_deals') || !deals.includes('scrape://save/save-9/deals')) {
      throw new Error('Deals prompt missing expected references');
    }
    if (!api.includes('get_api_surface') || !api.includes('scrape://save/save-9/api-surface')) {
      throw new Error('API-surface prompt missing expected references');
    }
    if (!goal.includes('scrape://save/save-9/orientation') || !goal.includes('Playwright MCP')) {
      throw new Error('Goal-planning prompt missing expected references');
    }
    setOutput({ leakage: leakage.slice(0, 60), deals: deals.slice(0, 60), api: api.slice(0, 60), goal: goal.slice(0, 60) });
  });

  await runner.run('Resource URI parser understands templated scrape URIs', ({ setOutput }) => {
    const summary = __private__.parseResourceUri('scrape://save/demo-session/page/2');
    const active = __private__.parseResourceUri('scrape://active/demo-session');
    const overview = __private__.parseResourceUri('scrape://save/demo-session/overview');
    const deals = __private__.parseResourceUri('scrape://save/demo-session/deals');
    const orientation = __private__.parseResourceUri('scrape://save/demo-session/orientation');
    if (summary.kind !== 'savePage' || summary.pageIndex !== 2) throw new Error('Failed to parse save page URI');
    if (active.kind !== 'activeSession' || active.sessionId !== 'demo-session') throw new Error('Failed to parse active URI');
    if (overview.kind !== 'saveOverview') throw new Error('Failed to parse save overview URI');
    if (deals.kind !== 'saveDeals') throw new Error('Failed to parse save deals URI');
    if (orientation.kind !== 'saveOrientation') throw new Error('Failed to parse save orientation URI');
    setOutput({ summaryKind: summary.kind, activeKind: active.kind, overviewKind: overview.kind, dealsKind: deals.kind, orientationKind: orientation.kind });
  });

  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test runner crashed:', err.message);
  process.exit(1);
});
