/**
 * Extract entities (emails, phones, URLs, social handles, addresses) from text.
 */
function extractEntities(text) {
  if (!text || typeof text !== 'string') {
    return { emails: [], phones: [], urls: [], socials: { twitter: [], linkedin: [], github: [], instagram: [] }, addresses: [] };
  }

  const emails = [...new Set(text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])];

  const phones = [...new Set(text.match(/(\+?1?\s?)?(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/g) || [])];

  const urls = [...new Set(text.match(/https?:\/\/[^\s"'<>)]+/g) || [])];

  const allTwitter = text.match(/@[A-Za-z0-9_]{1,15}/g) || [];
  const linkedinUrls = urls.filter((u) => u.includes('linkedin.com'));
  const githubUrls = urls.filter((u) => u.includes('github.com'));
  const instagramUrls = urls.filter((u) => u.includes('instagram.com'));

  const socials = {
    twitter: [...new Set(allTwitter)],
    linkedin: [...new Set(linkedinUrls)],
    github: [...new Set(githubUrls)],
    instagram: [...new Set(instagramUrls)],
  };

  // Basic street address detection: look for patterns like "123 Main St" or "456 Elm Avenue"
  const addressPattern = /\d{1,5}\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3}\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Ct|Court|Pl|Place|Way|Pkwy|Parkway)\b[^,\n]*/g;
  const addresses = [...new Set(text.match(addressPattern) || [])].slice(0, 20);

  return { emails, phones, urls, socials, addresses };
}

module.exports = { extractEntities };
