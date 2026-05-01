'use strict';

/**
 * review-extractor.js
 * Extracts review and rating data from scraped page data.
 * Sources: JSON-LD Review/AggregateRating, microdata, and DOM heuristics.
 */

const RATING_CLASS_RE = /\b(rating|stars?|score|review|feedback)\b/i;
const STAR_CHAR_RE = /[★☆✭✫✩]/;

function extractReviews(pageData) {
  const reviews = [];
  const aggregateRatings = [];

  // ── 1. JSON-LD ───────────────────────────────────────────────────────────
  const jsonLD = pageData?.meta?.jsonLD || [];
  const allSchemas = Array.isArray(jsonLD) ? jsonLD : [jsonLD];

  function walkSchema(schema) {
    if (!schema || typeof schema !== 'object') return;
    const type = schema['@type'];

    if (type === 'Review' || (Array.isArray(type) && type.includes('Review'))) {
      reviews.push({
        source: 'json-ld',
        author: schema.author?.name || schema.author || null,
        rating: parseFloat(schema.reviewRating?.ratingValue) || null,
        maxRating: parseFloat(schema.reviewRating?.bestRating) || 5,
        body: (schema.reviewBody || schema.description || '').substring(0, 500) || null,
        datePublished: schema.datePublished || null,
        itemReviewed: schema.itemReviewed?.name || null,
      });
    }

    if (type === 'AggregateRating' || (Array.isArray(type) && type.includes('AggregateRating'))) {
      aggregateRatings.push({
        source: 'json-ld',
        ratingValue: parseFloat(schema.ratingValue) || null,
        maxRating: parseFloat(schema.bestRating) || 5,
        reviewCount: parseInt(schema.reviewCount || schema.ratingCount) || null,
        ratingCount: parseInt(schema.ratingCount) || null,
      });
    }

    // Walk nested schemas (e.g. Product with aggregateRating)
    if (schema.aggregateRating) walkSchema({ '@type': 'AggregateRating', ...schema.aggregateRating });
    if (schema.review) {
      const r = schema.review;
      const arr = Array.isArray(r) ? r : [r];
      arr.forEach(item => walkSchema({ '@type': 'Review', ...item }));
    }

    // Walk @graph arrays
    if (Array.isArray(schema['@graph'])) schema['@graph'].forEach(walkSchema);
  }

  allSchemas.forEach(walkSchema);

  // ── 2. Open Graph / meta microdata ──────────────────────────────────────
  const ogRatingValue = parseFloat(pageData?.meta?.ogTags?.['product:rating:value'] || pageData?.meta?.ogTags?.['rating:value']);
  const ogRatingScale = parseFloat(pageData?.meta?.ogTags?.['product:rating:scale']) || 5;
  const ogReviewCount = parseInt(pageData?.meta?.ogTags?.['product:rating:count']);
  if (ogRatingValue) {
    aggregateRatings.push({
      source: 'opengraph',
      ratingValue: ogRatingValue,
      maxRating: ogRatingScale,
      reviewCount: ogReviewCount || null,
    });
  }

  // ── 3. DOM heuristics (from fullText + structured data) ─────────────────
  // Look for common star-rating patterns in the full text
  const text = pageData?.fullText || '';
  const starPatterns = [
    /(\d+(?:\.\d+)?)\s*out\s*of\s*(\d+)\s*stars?/gi,
    /rated?\s+(\d+(?:\.\d+)?)\s*\/\s*(\d+)/gi,
    /(\d+(?:\.\d+)?)\s*★/g,
  ];
  for (const re of starPatterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      if (aggregateRatings.length >= 5) break;
      const val = parseFloat(m[1]);
      const max = m[2] ? parseFloat(m[2]) : 5;
      if (val > 0 && val <= max) {
        aggregateRatings.push({ source: 'text-pattern', ratingValue: val, maxRating: max, reviewCount: null });
      }
    }
  }

  // ── 4. Deduplicate aggregate ratings (prefer json-ld) ───────────────────
  const seenVals = new Set();
  const dedupedAggregates = aggregateRatings.filter(r => {
    const key = `${r.ratingValue}-${r.maxRating}`;
    if (seenVals.has(key)) return false;
    seenVals.add(key);
    return true;
  });

  const hasReviewData = reviews.length > 0 || dedupedAggregates.length > 0;

  return {
    isReviewPage: hasReviewData,
    aggregateRating: dedupedAggregates[0] || null,
    allAggregateRatings: dedupedAggregates,
    reviewCount: reviews.length,
    reviews: reviews.slice(0, 50),
    url: pageData?.url || null,
  };
}

module.exports = { extractReviews };
