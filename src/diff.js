/**
 * Compare two scrape results and return a structured diff.
 */
function diffScrapes(scrapeA, scrapeB) {
  const result = {};

  // Diff pages
  const pagesA = scrapeA.pages || [];
  const pagesB = scrapeB.pages || [];
  const urlsA = new Set(pagesA.map((p) => p.meta?.url));
  const urlsB = new Set(pagesB.map((p) => p.meta?.url));

  result.pages = {
    added: pagesB.filter((p) => !urlsA.has(p.meta?.url)).map((p) => p.meta?.url),
    removed: pagesA.filter((p) => !urlsB.has(p.meta?.url)).map((p) => p.meta?.url),
    changed: [],
  };

  // Compare first page text content
  const firstA = pagesA[0];
  const firstB = pagesB[0];

  if (firstA && firstB) {
    // Diff text blocks
    const textA = new Set((firstA.textBlocks || []).map((t) => t.text));
    const textB = new Set((firstB.textBlocks || []).map((t) => t.text));

    result.textContent = {
      added: [...textB].filter((t) => !textA.has(t)).slice(0, 50),
      removed: [...textA].filter((t) => !textB.has(t)).slice(0, 50),
    };

    // Diff links
    const linksA = new Set((firstA.links || []).map((l) => l.href));
    const linksB = new Set((firstB.links || []).map((l) => l.href));

    result.links = {
      added: [...linksB].filter((l) => !linksA.has(l)),
      removed: [...linksA].filter((l) => !linksB.has(l)),
    };

    // Diff images
    const imgsA = new Set((firstA.images || []).map((i) => i.src).filter(Boolean));
    const imgsB = new Set((firstB.images || []).map((i) => i.src).filter(Boolean));

    result.images = {
      added: [...imgsB].filter((i) => !imgsA.has(i)),
      removed: [...imgsA].filter((i) => !imgsB.has(i)),
    };

    // Diff headings
    const h1A = (firstA.headings?.h1 || []).map((h) => h.text);
    const h1B = (firstB.headings?.h1 || []).map((h) => h.text);
    const setH1A = new Set(h1A);
    const setH1B = new Set(h1B);
    result.headings = {
      added: h1B.filter((h) => !setH1A.has(h)),
      removed: h1A.filter((h) => !setH1B.has(h)),
    };

    // Title change
    if (firstA.meta?.title !== firstB.meta?.title) {
      result.title = { from: firstA.meta?.title, to: firstB.meta?.title };
    }
  }

  // Diff API calls
  const gqlUrlsA = new Set((scrapeA.apiCalls?.graphql || []).map((c) => c.url));
  const gqlUrlsB = new Set((scrapeB.apiCalls?.graphql || []).map((c) => c.url));
  const restUrlsA = new Set((scrapeA.apiCalls?.rest || []).map((c) => c.url));
  const restUrlsB = new Set((scrapeB.apiCalls?.rest || []).map((c) => c.url));

  result.apiCalls = {
    graphql: {
      added: [...gqlUrlsB].filter((u) => !gqlUrlsA.has(u)),
      removed: [...gqlUrlsA].filter((u) => !gqlUrlsB.has(u)),
    },
    rest: {
      added: [...restUrlsB].filter((u) => !restUrlsA.has(u)),
      removed: [...restUrlsA].filter((u) => !restUrlsB.has(u)),
    },
  };

  // Assets diff
  const assetsA = new Set((scrapeA.assets || []).map((a) => a.url));
  const assetsB = new Set((scrapeB.assets || []).map((a) => a.url));
  result.assets = {
    added: [...assetsB].filter((a) => !assetsA.has(a)),
    removed: [...assetsA].filter((a) => !assetsB.has(a)),
  };

  return result;
}

module.exports = { diffScrapes };
