'use strict';

/**
 * Compare two scrape results and return a structured diff,
 * including structural, content, API, and semantic (price/similarity) analysis.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractPrices(text) {
  if (!text) return [];
  const matches = text.match(/(?:USD?|€|£|¥|CAD?|\$)\s?[\d,]+(?:\.\d{2})?|\d+(?:\.\d{2})?\s*(?:USD|EUR|GBP|CAD)/gi) || [];
  return [...new Set(matches.map(m => m.replace(/\s+/g, ' ').trim()))];
}

function tokenize(text) {
  return (text || '').toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function jaccardSimilarity(textA, textB) {
  const setA = new Set(tokenize(textA));
  const setB = new Set(tokenize(textB));
  if (setA.size === 0 && setB.size === 0) return 1;
  const intersection = [...setA].filter(t => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : Math.round((intersection / union) * 100) / 100;
}

/**
 * Word-level diff between two strings.
 * Returns { added, removed, addedCount, removedCount, changeRatio }.
 * Uses a simple LCS-based approach on word tokens.
 */
function wordDiff(textA, textB, maxWords = 2000) {
  const wordsA = (textA || '').split(/\s+/).filter(Boolean).slice(0, maxWords);
  const wordsB = (textB || '').split(/\s+/).filter(Boolean).slice(0, maxWords);

  const setA = new Set(wordsA);
  const setB = new Set(wordsB);

  // Words that appear in B but not A (added) — ordered, deduped
  const addedSet = new Set(wordsB.filter(w => !setA.has(w)));
  const removedSet = new Set(wordsA.filter(w => !setB.has(w)));

  // Find contiguous runs (phrases) of added/removed words
  function findRuns(arr, targetSet) {
    const runs = [];
    let run = [];
    for (const w of arr) {
      if (targetSet.has(w)) {
        run.push(w);
      } else {
        if (run.length) { runs.push(run.join(' ')); run = []; }
      }
    }
    if (run.length) runs.push(run.join(' '));
    return runs.slice(0, 100);
  }

  const addedPhrases  = findRuns(wordsB, addedSet);
  const removedPhrases = findRuns(wordsA, removedSet);
  const total = Math.max(wordsA.length, wordsB.length, 1);

  return {
    addedPhrases,
    removedPhrases,
    addedWords:   addedSet.size,
    removedWords: removedSet.size,
    changeRatio:  Math.round(((addedSet.size + removedSet.size) / total) * 100) / 100,
    summary: `+${addedSet.size} words, -${removedSet.size} words (${Math.round(((addedSet.size + removedSet.size) / total) * 100)}% change)`,
  };
}

// ── Main diff function ────────────────────────────────────────────────────────

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
    const textA = new Set((firstA.textBlocks || []).map((t) => t.text));
    const textB = new Set((firstB.textBlocks || []).map((t) => t.text));

    result.textContent = {
      added:   [...textB].filter((t) => !textA.has(t)).slice(0, 50),
      removed: [...textA].filter((t) => !textB.has(t)).slice(0, 50),
    };

    const linksA = new Set((firstA.links || []).map((l) => l.href));
    const linksB = new Set((firstB.links || []).map((l) => l.href));
    result.links = {
      added:   [...linksB].filter((l) => !linksA.has(l)),
      removed: [...linksA].filter((l) => !linksB.has(l)),
    };

    const imgsA = new Set((firstA.images || []).map((i) => i.src).filter(Boolean));
    const imgsB = new Set((firstB.images || []).map((i) => i.src).filter(Boolean));
    result.images = {
      added:   [...imgsB].filter((i) => !imgsA.has(i)),
      removed: [...imgsA].filter((i) => !imgsB.has(i)),
    };

    const h1A = (firstA.headings?.h1 || []).map((h) => h.text);
    const h1B = (firstB.headings?.h1 || []).map((h) => h.text);
    const setH1A = new Set(h1A);
    const setH1B = new Set(h1B);
    result.headings = {
      added:   h1B.filter((h) => !setH1A.has(h)),
      removed: h1A.filter((h) => !setH1B.has(h)),
    };

    if (firstA.meta?.title !== firstB.meta?.title) {
      result.title = { from: firstA.meta?.title, to: firstB.meta?.title };
    }

    // ── Semantic analysis ─────────────────────────────────────────────────────
    const fullTextA = firstA.fullText || '';
    const fullTextB = firstB.fullText || '';
    const similarity = jaccardSimilarity(fullTextA, fullTextB);

    // Word-level diff for the primary page
    const textDiff = wordDiff(fullTextA, fullTextB);

    const pricesA = extractPrices(fullTextA);
    const pricesB = extractPrices(fullTextB);
    const setPricesA = new Set(pricesA);
    const setPricesB = new Set(pricesB);

    const priceChanges = {
      added:   pricesB.filter(p => !setPricesA.has(p)),
      removed: pricesA.filter(p => !setPricesB.has(p)),
    };

    // Detect pages whose text changed significantly (across all matched pages)
    const changedPages = [];
    pagesA.forEach(pageA => {
      const matchingB = pagesB.find(p => p.meta?.url === pageA.meta?.url);
      if (!matchingB) return;
      const sim = jaccardSimilarity(pageA.fullText || '', matchingB.fullText || '');
      if (sim < 0.95) {
        const pd = wordDiff(pageA.fullText || '', matchingB.fullText || '');
        changedPages.push({
          url: pageA.meta?.url,
          similarity: sim,
          likelyChanged: sim < 0.8,
          wordDiff: {
            addedWords:   pd.addedWords,
            removedWords: pd.removedWords,
            changeRatio:  pd.changeRatio,
            summary:      pd.summary,
            addedPhrases: pd.addedPhrases.slice(0, 20),
            removedPhrases: pd.removedPhrases.slice(0, 20),
          },
        });
      }
    });

    result.semantic = {
      similarity,
      similarityLabel: similarity >= 0.95 ? 'nearly identical' : similarity >= 0.7 ? 'similar' : similarity >= 0.4 ? 'moderately changed' : 'significantly changed',
      textDiff,
      priceChanges,
      changedPages,
    };
  }

  // Diff API calls
  const gqlUrlsA = new Set((scrapeA.apiCalls?.graphql || []).map((c) => c.url));
  const gqlUrlsB = new Set((scrapeB.apiCalls?.graphql || []).map((c) => c.url));
  const restUrlsA = new Set((scrapeA.apiCalls?.rest || []).map((c) => c.url));
  const restUrlsB = new Set((scrapeB.apiCalls?.rest || []).map((c) => c.url));

  result.apiCalls = {
    graphql: {
      added:   [...gqlUrlsB].filter((u) => !gqlUrlsA.has(u)),
      removed: [...gqlUrlsA].filter((u) => !gqlUrlsB.has(u)),
    },
    rest: {
      added:   [...restUrlsB].filter((u) => !restUrlsA.has(u)),
      removed: [...restUrlsA].filter((u) => !restUrlsB.has(u)),
    },
  };

  const assetsA = new Set((scrapeA.assets || []).map((a) => a.url));
  const assetsB = new Set((scrapeB.assets || []).map((a) => a.url));
  result.assets = {
    added:   [...assetsB].filter((a) => !assetsA.has(a)),
    removed: [...assetsA].filter((a) => !assetsB.has(a)),
  };

  result.summary = {
    pages:    { added: result.pages.added.length, removed: result.pages.removed.length },
    apiCalls: {
      added:   result.apiCalls.graphql.added.length + result.apiCalls.rest.added.length,
      removed: result.apiCalls.graphql.removed.length + result.apiCalls.rest.removed.length,
    },
    assets:  { added: result.assets.added.length, removed: result.assets.removed.length },
    content: {
      added:   (result.textContent?.added.length || 0) + (result.links?.added.length || 0),
      removed: (result.textContent?.removed.length || 0) + (result.links?.removed.length || 0),
    },
    semantic: result.semantic ? {
      similarity:      result.semantic.similarity,
      similarityLabel: result.semantic.similarityLabel,
      pricesAdded:     result.semantic.priceChanges.added.length,
      pricesRemoved:   result.semantic.priceChanges.removed.length,
      changedPages:    result.semantic.changedPages.length,
    } : null,
  };

  return result;
}

module.exports = { diffScrapes, wordDiff };
