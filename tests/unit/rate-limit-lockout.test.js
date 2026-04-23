const { TestRunner } = require('../runner');
const { start, stop, post, json } = require('../api/_server');

async function hitLimit(path, body, attempts) {
  let response = null;
  for (let i = 0; i < attempts; i++) {
    response = await post(path, body);
  }
  return response;
}

async function main() {
  const runner = new TestRunner('unit');
  await start();

  await runner.run('Scrape endpoints return 429 after exceeding the per-minute limit', async ({ setOutput }) => {
    const response = await hitLimit('/api/scrape', { url: 'https://example.com' }, 31);
    const body = json(response);

    if (response.status !== 429) throw new Error(`Expected 429, got ${response.status}`);
    if (!/Rate limit exceeded/i.test(body.error || '')) throw new Error(`Unexpected error payload: ${JSON.stringify(body)}`);

    setOutput({ status: response.status, retryAfterSeconds: body.retryAfterSeconds });
  });

  await runner.run('Generate endpoints return 429 after exceeding the per-minute limit', async ({ setOutput }) => {
    const response = await hitLimit('/api/generate/react', { pageData: { meta: { title: 'Example' }, headings: { h1: [{ text: 'Example' }] }, links: [] } }, 61);
    const body = json(response);

    if (response.status !== 429) throw new Error(`Expected 429, got ${response.status}`);
    if (!/Rate limit exceeded/i.test(body.error || '')) throw new Error(`Unexpected error payload: ${JSON.stringify(body)}`);

    setOutput({ status: response.status, retryAfterSeconds: body.retryAfterSeconds });
  });

  stop();
  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  stop();
  console.error('Test runner crashed:', err.message);
  process.exit(1);
});
