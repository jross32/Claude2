'use strict';

/**
 * Job Listing Extractor — structured careers/job data from any job or careers page.
 * Combines JSON-LD JobPosting schema, microdata, and DOM heuristics.
 */

// ── JSON-LD extraction ────────────────────────────────────────────────────

function _extractFromJsonLD(pageData) {
  const jsonLD = pageData.meta?.jsonLD || [];
  const jobs = [];

  for (const ld of jsonLD) {
    const items = Array.isArray(ld['@graph']) ? ld['@graph'] : [ld];
    for (const item of items) {
      if (!/JobPosting/i.test(item['@type'] || '')) continue;

      const baseSalary = item.baseSalary;
      let salaryMin = null, salaryMax = null, salaryCurrency = null;

      if (baseSalary) {
        const val = baseSalary.value || baseSalary;
        if (val?.minValue) salaryMin = parseFloat(val.minValue);
        if (val?.maxValue) salaryMax = parseFloat(val.maxValue);
        if (val?.value) { salaryMin = salaryMax = parseFloat(val.value); }
        salaryCurrency = baseSalary.currency || (val?.currency) || null;
      }

      const location = item.jobLocation;
      const locationStr = location
        ? [location.address?.streetAddress, location.address?.addressLocality,
           location.address?.addressRegion, location.address?.addressCountry].filter(Boolean).join(', ')
        : null;

      const remote = /remote|work from home|wfh|anywhere/i.test(
        [item.jobLocationType, item.title, item.description].join(' ')
      );

      // Extract skills from description text
      const descText = item.description?.replace(/<[^>]+>/g, ' ') || '';
      const skills = _extractSkills(descText);

      jobs.push({
        title: item.title || item.name || null,
        department: item.department || null,
        location: locationStr,
        remote,
        employmentType: item.employmentType || null,
        salaryMin,
        salaryMax,
        salaryCurrency,
        salaryUnit: item.baseSalary?.value?.unitText || null,
        description: descText.substring(0, 1000),
        skills,
        postedAt: item.datePosted || null,
        validThrough: item.validThrough || null,
        applyUrl: item.url || item.sameAs || null,
        hiringOrganization: item.hiringOrganization?.name || null,
        identifier: item.identifier?.value || null,
        source: 'json-ld',
      });
    }
  }

  return jobs;
}

// ── Skill extraction from text ────────────────────────────────────────────

const COMMON_SKILLS = [
  // Languages
  'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Golang', 'Rust', 'C\\+\\+', 'C#', 'Ruby',
  'PHP', 'Swift', 'Kotlin', 'Scala', 'R', 'MATLAB', 'Perl', 'Shell', 'Bash', 'PowerShell',
  // Frontend
  'React', 'Vue', 'Angular', 'Svelte', 'Next\\.js', 'Nuxt', 'HTML', 'CSS', 'Sass', 'Tailwind',
  // Backend
  'Node\\.js', 'Express', 'Django', 'Flask', 'FastAPI', 'Rails', 'Spring', 'Laravel',
  // Databases
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'DynamoDB', 'SQLite', 'Cassandra',
  // Cloud
  'AWS', 'Azure', 'GCP', 'Google Cloud', 'Kubernetes', 'Docker', 'Terraform', 'Ansible',
  // Data
  'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'Spark', 'Kafka', 'Airflow', 'dbt',
  // Tools
  'Git', 'GitHub', 'GitLab', 'CI/CD', 'Jenkins', 'GitHub Actions', 'GraphQL', 'REST API',
  'Agile', 'Scrum', 'Jira', 'Figma', 'Sketch',
];

const SKILL_REGEX = new RegExp(`\\b(${COMMON_SKILLS.join('|')})\\b`, 'gi');

function _extractSkills(text) {
  const matches = [...new Set((text.match(SKILL_REGEX) || []).map(s => s.trim()))];
  return matches.slice(0, 30);
}

// ── DOM heuristic extraction ──────────────────────────────────────────────

function _extractJobsFromDOM(pageData) {
  const text = pageData.fullText || '';
  const h1s = pageData.headings?.h1 || [];
  const h2s = pageData.headings?.h2 || [];

  // Detect if this is a job listing page vs. a careers index
  const isSingleJob = /job description|responsibilities|requirements|qualifications/i.test(text);
  if (!isSingleJob) {
    // Try to extract job cards from a job listing page
    return _extractJobListings(pageData);
  }

  // Single job page
  const title = h1s[0]?.text || null;
  const remote = /remote|work from home|wfh|anywhere/i.test(text);

  // Salary detection
  let salaryMin = null, salaryMax = null, salaryCurrency = null;
  const salaryMatch = text.match(/\$\s*(\d{2,3}(?:,\d{3})?(?:\.\d{2})?)[kK]?\s*[-–]\s*\$?\s*(\d{2,3}(?:,\d{3})?(?:\.\d{2})?)[kK]?/);
  if (salaryMatch) {
    const parse = (s) => {
      const n = parseFloat(s.replace(/,/g, ''));
      return s.toLowerCase().includes('k') || n < 999 ? n * 1000 : n;
    };
    salaryMin = parse(salaryMatch[1]);
    salaryMax = parse(salaryMatch[2]);
    salaryCurrency = 'USD';
  }

  // Employment type
  let employmentType = null;
  if (/\bfull[\s-]?time\b/i.test(text)) employmentType = 'FULL_TIME';
  else if (/\bpart[\s-]?time\b/i.test(text)) employmentType = 'PART_TIME';
  else if (/\bcontract\b|\bcontractor\b/i.test(text)) employmentType = 'CONTRACTOR';
  else if (/\bintern(ship)?\b/i.test(text)) employmentType = 'INTERN';
  else if (/\btemporary\b|\btemp\b/i.test(text)) employmentType = 'TEMPORARY';

  // Location — look for city, state patterns
  const locationMatch = text.match(/(?:location|office|based in)[:\s]+([A-Z][a-zA-Z\s]+(?:,\s*[A-Z]{2})?)/);
  const location = locationMatch ? locationMatch[1].trim().substring(0, 100) : null;

  // Apply link
  const applyLink = (pageData.links || []).find(l => /apply|application/i.test(l.text || '') || /apply/i.test(l.href));
  const applyUrl = applyLink?.href || null;

  return [{
    title,
    department: null,
    location,
    remote,
    employmentType,
    salaryMin,
    salaryMax,
    salaryCurrency,
    description: text.substring(0, 1000),
    skills: _extractSkills(text),
    applyUrl,
    source: 'dom-heuristic',
  }];
}

function _extractJobListings(pageData) {
  // Extract individual job cards from an index page
  const cards = [];
  const links = pageData.links || [];

  // Group links that look like job links
  const jobLinks = links.filter(l => /\bjob\b|\bposition\b|\brole\b|\bcareer\b|\bopening\b/i.test(l.href + l.text));
  for (const link of jobLinks.slice(0, 50)) {
    cards.push({
      title: link.text?.trim() || null,
      applyUrl: link.href,
      source: 'listing-index',
    });
  }

  return cards;
}

// ── Main extractor ────────────────────────────────────────────────────────

/**
 * Extract structured job listing data from a scrape page result.
 * @param {object} pageData - Single page from a scrape result
 * @returns {object} { isJobPage, jobs }
 */
function extractJobData(pageData) {
  if (!pageData) return { isJobPage: false, jobs: [] };

  const text = pageData.fullText || '';
  const url = pageData.url || '';

  // Detect job/careers page
  const signals = {
    hasJobUrl: /\/job|\/career|\/position|\/opening|\/vacancy|\/hiring/i.test(url),
    hasJobKeywords: /\b(job description|responsibilities|qualifications|requirements|we are hiring|join our team|apply now)\b/i.test(text),
    hasJobPosting: (pageData.meta?.jsonLD || []).some(ld => {
      const items = Array.isArray(ld['@graph']) ? ld['@graph'] : [ld];
      return items.some(i => /JobPosting/i.test(i['@type'] || ''));
    }),
  };

  const isJobPage = signals.hasJobUrl || signals.hasJobKeywords || signals.hasJobPosting;

  const ldJobs = _extractFromJsonLD(pageData);
  const domJobs = ldJobs.length === 0 ? _extractJobsFromDOM(pageData) : [];

  const jobs = [...ldJobs, ...domJobs].filter(j => j.title || j.applyUrl);

  return { isJobPage, jobs, signals };
}

module.exports = { extractJobData };
