/**
 * unit/scraper-status.test.js
 * Verifies lightweight live status snapshot behavior without launching a browser.
 */

const { TestRunner } = require('../runner');
const ScraperSession = require('../../src/scraper');

async function main() {
  const runner = new TestRunner('unit');

  await runner.run('ScraperSession exposes initial live status snapshot', ({ setOutput }) => {
    const session = new ScraperSession('session-1', () => {});
    const snapshot = session.getStatusSnapshot();
    if (snapshot.sessionId !== 'session-1') throw new Error('Missing sessionId');
    if (snapshot.state !== 'running') throw new Error(`Unexpected initial state: ${snapshot.state}`);
    if (snapshot.partialPageCount !== 0) throw new Error('Expected zero partial pages initially');
    setOutput({ state: snapshot.state });
  });

  await runner.run('progress updates live counters and step metadata', ({ setOutput }) => {
    const session = new ScraperSession('session-2', () => {});
    session.progress('Crawling /docs', 62, { visited: 3, total: 10, queued: 4, failed: 1 });
    const snapshot = session.getStatusSnapshot();
    if (snapshot.step !== 'Crawling /docs') throw new Error(`Unexpected step: ${snapshot.step}`);
    if (snapshot.percent !== 62 || snapshot.visited !== 3 || snapshot.total !== 10 || snapshot.queued !== 4 || snapshot.failed !== 1) {
      throw new Error('Progress counters did not update correctly');
    }
    setOutput({ percent: snapshot.percent, visited: snapshot.visited });
  });

  await runner.run('pause and resume update state snapshot', ({ setOutput }) => {
    const session = new ScraperSession('session-3', () => {});
    session.pause();
    const paused = session.getStatusSnapshot();
    if (paused.state !== 'paused') throw new Error(`Expected paused state, got ${paused.state}`);
    session.resume();
    const resumed = session.getStatusSnapshot();
    if (resumed.state !== 'running') throw new Error(`Expected running state, got ${resumed.state}`);
    setOutput({ paused: paused.state, resumed: resumed.state });
  });

  await runner.run('credential and verification waits toggle flags without leaking secrets', async ({ setOutput }) => {
    const session = new ScraperSession('session-4', () => {});

    const credentialsPromise = session.waitForCredentials();
    const authSnapshot = session.getStatusSnapshot();
    if (authSnapshot.state !== 'waiting_auth' || !authSnapshot.needsAuth) {
      throw new Error('Expected waiting_auth state');
    }
    session.submitCredentials('demo@example.com', 'super-secret');
    const creds = await credentialsPromise;
    if (creds.username !== 'demo@example.com' || creds.password !== 'super-secret') {
      throw new Error('Credential resolver returned unexpected payload');
    }

    const verificationPromise = session.waitForVerification();
    const verificationSnapshot = session.getStatusSnapshot();
    if (verificationSnapshot.state !== 'waiting_verification' || !verificationSnapshot.needsVerification) {
      throw new Error('Expected waiting_verification state');
    }
    await session.submitVerification('123456');
    const verificationCode = await verificationPromise;
    if (verificationCode !== '123456') throw new Error('Verification resolver returned unexpected code');

    const settled = session.getStatusSnapshot();
    if (settled.needsAuth || settled.needsVerification) throw new Error('Expected transient auth flags to be cleared');
    if (settled.lastError) throw new Error('Status snapshot should not expose credential values as errors');
    setOutput({ finalState: settled.state });
  });

  await runner.run('markComplete and markError shape terminal snapshot fields', ({ setOutput }) => {
    const session = new ScraperSession('session-5', () => {});
    session.markComplete({
      pages: [{}, {}],
      visitedUrls: ['https://example.com', 'https://example.com/about'],
    });
    const complete = session.getStatusSnapshot();
    if (complete.state !== 'complete' || complete.percent !== 100 || complete.partialPageCount !== 2) {
      throw new Error('Complete snapshot did not finalize correctly');
    }

    session.markError(new Error('Boom'));
    const failed = session.getStatusSnapshot();
    if (failed.state !== 'error' || failed.lastError !== 'Boom') {
      throw new Error('Error snapshot did not capture lastError');
    }
    setOutput({ completeState: complete.state, errorState: failed.state });
  });

  const result = runner.finish();
  process.exit(result.summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test runner crashed:', err.message);
  process.exit(1);
});
