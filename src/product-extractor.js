'use strict';

/**
 * Product Data Extractor — structured e-commerce data from any product page.
 * Combines JSON-LD schema.org, microdata, and DOM heuristics.
 */

// ── Price parsing helpers ──────────────────────────────────────────────────

function _parsePrice(raw) {
  if (!raw && raw !== 0) return null;
  const str = String(raw).replace(/[^\d.,]/g, '').replace(/,(\d{2})$/, '.$1').replace(/,/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function _detectCurrency(text) {
  if (!text) return null;
  if (/\$/.test(text)) return 'USD';
  if (/€/.test(text)) return 'EUR';
  if (/£/.test(text)) return 'GBP';
  if (/¥/.test(text)) return 'JPY';
  if (/₹/.test(text)) return 'INR';
  if (/A\$/i.test(text)) return 'AUD';
  if (/C\$/i.test(text)) return 'CAD';
  const iso = text.match(/\b(USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR|BRL|MXN|KRW|SEK|NOK|DKK|NZD)\b/i);
  return iso ? iso[1].toUpperCase() : null;
}

// ── JSON-LD extraction ────────────────────────────────────────────────────

function _extractFromJsonLD(pageData) {
  const jsonLD = pageData.meta?.jsonLD || [];
  let product = null;

  for (const ld of jsonLD) {
    const items = Array.isArray(ld['@graph']) ? ld['@graph'] : [ld];
    for (const item of items) {
      const type = item['@type'] || '';
      if (/Product/i.test(type)) {
        product = item;
        break;
      }
    }
    if (product) break;
  }

  if (!product) return null;

  // Offers can be a single object or an array
  const offers = product.offers
    ? (Array.isArray(product.offers) ? product.offers : [product.offers])
    : [];

  const bestOffer = offers[0] || {};
  const price = _parsePrice(bestOffer.price || product.price);
  const currency = bestOffer.priceCurrency || _detectCurrency(String(bestOffer.price || ''));

  const rating = product.aggregateRating;
  const brand = product.brand?.name || (typeof product.brand === 'string' ? product.brand : null);

  return {
    name: product.name || null,
    description: product.description?.substring(0, 500) || null,
    sku: product.sku || product.productID || null,
    gtin: product.gtin14 || product.gtin13 || product.gtin12 || product.gtin8 || product.gtin || null,
    mpn: product.mpn || null,
    brand,
    price,
    currency,
    availability: bestOffer.availability?.replace(/^.*\//, '') || null,
    condition: bestOffer.itemCondition?.replace(/^.*\//, '') || null,
    rating: rating ? {
      value: parseFloat(rating.ratingValue) || null,
      count: parseInt(rating.reviewCount || rating.ratingCount, 10) || null,
      max: parseFloat(rating.bestRating) || 5,
    } : null,
    images: [product.image].flat().filter(Boolean).map(img => (typeof img === 'string' ? img : img.url)).filter(Boolean),
    priceRange: offers.length > 1 ? {
      min: Math.min(...offers.map(o => _parsePrice(o.price)).filter(Boolean)),
      max: Math.max(...offers.map(o => _parsePrice(o.price)).filter(Boolean)),
    } : null,
    source: 'json-ld',
  };
}

// ── DOM heuristic extraction ──────────────────────────────────────────────

function _extractFromDOM(pageData) {
  const text = pageData.fullText || '';
  const links = pageData.links || [];

  // Try to find price from text blocks — look for $X.XX patterns
  const pricePatterns = [
    /(?:price|now|sale|was|from)[:\s]*[$€£¥]?\s*(\d{1,6}(?:[.,]\d{2,3})?)/i,
    /[$€£¥]\s*(\d{1,6}(?:[.,]\d{2,3})?)/,
  ];
  let price = null;
  let currency = null;
  for (const p of pricePatterns) {
    const m = text.match(p);
    if (m) {
      price = _parsePrice(m[1]);
      currency = _detectCurrency(m[0]);
      break;
    }
  }

  // Product name — typically the first H1
  const h1s = pageData.headings?.h1 || [];
  const name = h1s[0]?.text || null;

  // Availability
  let availability = null;
  if (/in stock|add to cart|add to bag/i.test(text)) availability = 'InStock';
  else if (/out of stock|unavailable|sold out/i.test(text)) availability = 'OutOfStock';
  else if (/pre-?order/i.test(text)) availability = 'PreOrder';

  // Rating — look for common patterns
  let rating = null;
  const ratingMatch = text.match(/(\d(?:\.\d)?)\s*(?:out\s*of\s*5|\/\s*5|stars?)\s*(?:[\(\[](\d+)[\)\]])?/i);
  if (ratingMatch) {
    rating = {
      value: parseFloat(ratingMatch[1]),
      count: ratingMatch[2] ? parseInt(ratingMatch[2], 10) : null,
      max: 5,
    };
  }

  // Images — first product-looking image
  const images = (pageData.images || [])
    .filter(img => img.src && !/(logo|icon|avatar|badge|sprite)/i.test(img.src))
    .slice(0, 5)
    .map(img => img.src);

  return { name, price, currency, availability, rating, images, source: 'dom-heuristic' };
}

// ── Variant detection ─────────────────────────────────────────────────────

function _extractVariants(pageData) {
  const variants = [];
  // Look for color/size selectors in forms
  for (const form of (pageData.forms || [])) {
    for (const field of (form.fields || [])) {
      if (field.tag === 'select' && field.options?.length > 0) {
        const label = (field.label || field.name || '').toLowerCase();
        if (/color|colour|size|variant|option/i.test(label)) {
          variants.push({
            type: /color|colour/i.test(label) ? 'color' : /size/i.test(label) ? 'size' : 'variant',
            options: field.options.map(o => ({ value: o.value, label: o.text })),
          });
        }
      }
    }
  }
  return variants;
}

// ── Main extractor ────────────────────────────────────────────────────────

/**
 * Extract structured product data from a scrape page result.
 * @param {object} pageData - Single page from a scrape result
 * @returns {object} { isProductPage, product }
 */
function extractProductData(pageData) {
  if (!pageData) return { isProductPage: false, product: null };

  // Signals that indicate this is a product page
  const signals = {
    hasAddToCart: /add\s+to\s+(cart|bag|basket)/i.test(pageData.fullText || ''),
    hasPrice: /[$€£¥]\s*\d/.test(pageData.fullText || ''),
    hasProductJsonLD: (pageData.meta?.jsonLD || []).some(ld => {
      const items = Array.isArray(ld['@graph']) ? ld['@graph'] : [ld];
      return items.some(i => /Product/i.test(i['@type'] || ''));
    }),
    hasSkuPattern: /\b(sku|model|part|item)\s*[:# ]\s*\w+/i.test(pageData.fullText || ''),
  };

  const isProductPage = signals.hasAddToCart || signals.hasProductJsonLD || (signals.hasPrice && signals.hasSkuPattern);

  // Try JSON-LD first (most structured), fall back to DOM
  const ldData = _extractFromJsonLD(pageData);
  const domData = _extractFromDOM(pageData);

  // Merge: prefer JSON-LD fields, fill gaps from DOM
  const product = {
    name: ldData?.name || domData.name,
    description: ldData?.description || null,
    sku: ldData?.sku || null,
    gtin: ldData?.gtin || null,
    mpn: ldData?.mpn || null,
    brand: ldData?.brand || null,
    price: ldData?.price ?? domData.price,
    currency: ldData?.currency || domData.currency,
    availability: ldData?.availability || domData.availability,
    condition: ldData?.condition || null,
    rating: ldData?.rating || domData.rating,
    reviewCount: ldData?.rating?.count || null,
    images: ldData?.images?.length ? ldData.images : domData.images,
    variants: _extractVariants(pageData),
    priceRange: ldData?.priceRange || null,
    signals,
    extractedVia: ldData ? 'json-ld' : 'dom-heuristic',
  };

  return { isProductPage, product };
}

module.exports = { extractProductData };
