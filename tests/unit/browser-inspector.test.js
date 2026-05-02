const { TestRunner } = require('../runner');
const { buildStableElementId, hashToken, shortText } = require('../../src/browser-inspector');

async function main() {
  const runner = new TestRunner('unit');

  await runner.run('browser inspector hashes are stable and compact', ({ setOutput }) => {
    const first = hashToken('browser-fixture');
    const second = hashToken('browser-fixture');
    if (first !== second) throw new Error('Expected hashToken to be stable for the same input');
    if (first.length !== 16) throw new Error(`Expected 16-char token, got ${first.length}`);

    setOutput({ token: first });
  });

  await runner.run('browser inspector element IDs derive deterministically from element metadata', ({ setOutput }) => {
    const element = {
      preferredSelector: '#search-box',
      selectorCandidates: ['#search-box'],
      tag: 'input',
      role: '',
      label: 'Search Query',
      text: '',
      placeholder: 'Type a query',
    };
    const first = buildStableElementId(element, 0);
    const second = buildStableElementId({ ...element }, 0);
    const changed = buildStableElementId({ ...element, label: 'Different Label' }, 0);

    if (first !== second) throw new Error('Expected stable element ID generation');
    if (first === changed) throw new Error('Expected element ID to change when identifying metadata changes');

    setOutput({ first, changed });
  });

  await runner.run('browser inspector text summaries clip without losing short strings', ({ setOutput }) => {
    const short = shortText('short text', 40);
    const long = shortText('a'.repeat(80), 24);

    if (short !== 'short text') throw new Error('Expected shortText to preserve short strings');
    if (long.length !== 24) throw new Error(`Expected clipped string length 24, got ${long.length}`);
    if (!long.endsWith('...')) throw new Error('Expected clipped string to end with ellipsis');

    setOutput({ short, long });
  });

  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test runner crashed:', err.message);
  process.exit(1);
});
