/**
 * Compare research_url latency and output across auto / fast / deep modes.
 *
 * Usage:
 *   node scripts/research-benchmark.js "https://example.com" "What is on this page?"
 */

const { handleTool } = require('../mcp-server');

async function main() {
  const [url, question] = process.argv.slice(2);
  if (!url || !question) {
    console.error('Usage: node scripts/research-benchmark.js "<url>" "<question>"');
    process.exit(1);
  }

  const modes = ['auto', 'fast', 'deep'];
  const results = [];

  for (const mode of modes) {
    const startedAt = Date.now();
    const result = await handleTool('research_url', {
      url,
      question,
      mode,
      maxPages: 1,
      scrapeDepth: 1,
      autoScroll: false,
      includeEvidence: false,
    });

    results.push({
      mode,
      elapsedMs: Date.now() - startedAt,
      routeUsed: result.routeUsed,
      modelUsed: result.modelUsed,
      analysisMethod: result.analysisMethod,
      confidence: result.confidence,
      timings: result.timings,
      answerPreview: String(result.answer || '').slice(0, 180),
    });
  }

  console.log(JSON.stringify({ url, question, results }, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
