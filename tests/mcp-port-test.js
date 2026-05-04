/**
 * MCP Port Test — verifies the web-scraper MCP server connects to port 12345
 * Run: SCRAPER_URL=http://localhost:12345 node tests/mcp-port-test.js
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCRAPER_URL = process.env.SCRAPER_URL || 'http://localhost:12345';

function sendLine(proc, obj) {
  proc.stdin.write(JSON.stringify(obj) + '\n');
}

async function runTest() {
  const results = [];
  let passed = 0, failed = 0;

  const proc = spawn('node', ['mcp-server.js'], {
    cwd: ROOT,
    env: { ...process.env, SCRAPER_URL, PORT: '12345' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const lines = [];
  let lineBuf = '';
  let stderr = '';
  proc.stdout.on('data', d => {
    lineBuf += d.toString();
    const parts = lineBuf.split('\n');
    lineBuf = parts.pop(); // keep incomplete last chunk
    parts.filter(Boolean).forEach(l => lines.push(l));
  });
  proc.stderr.on('data', d => { stderr += d.toString(); });

  // Wait for proc to start
  await new Promise(r => setTimeout(r, 800));

  // 1. Initialize
  sendLine(proc, {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'port-test', version: '1.0' } }
  });
  await new Promise(r => setTimeout(r, 800));

  // Send initialized notification (required by MCP spec)
  sendLine(proc, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  await new Promise(r => setTimeout(r, 500));

  // 2. server_info tool
  sendLine(proc, {
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'server_info', arguments: {} }
  });
  await new Promise(r => setTimeout(r, 5000));

  // 3. list_saves (lightweight read)
  sendLine(proc, {
    jsonrpc: '2.0', id: 3, method: 'tools/call',
    params: { name: 'list_saves', arguments: { limit: 5 } }
  });
  await new Promise(r => setTimeout(r, 8000));

  proc.kill();
  await new Promise(r => setTimeout(r, 500));

  // Debug: show all output lines
  if (process.env.DEBUG_MCP) {
    console.log('--- RAW STDOUT LINES ---');
    lines.forEach(l => console.log('  >', l.substring(0, 120)));
    console.log('--- PARSED IDs ---');
    lines.forEach(l => {
      try {
        const m = JSON.parse(l);
        console.log(`  id=${JSON.stringify(m.id)} method=${m.method || '-'} hasResult=${!!m.result} isErr=${!!m.error}`);
      } catch(e) { console.log('  PARSE FAIL:', l.substring(0, 80)); }
    });
    console.log('--- STDERR (last 400) ---');
    console.log(stderr.slice(-400));
  }

  // Parse responses
  const responses = {};
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (msg.id) responses[msg.id] = msg;
    } catch (_) {}
  }

  // Check initialize
  if (responses[1] && responses[1].result) {
    console.log('✅ PASS  initialize — MCP server started');
    passed++;
  } else {
    console.log('❌ FAIL  initialize — no response');
    failed++;
  }

  // Check server_info
  if (responses[2]) {
    try {
      const text = responses[2].result.content[0].text;
      const info = JSON.parse(text);
      const baseUrl = info.server?.baseUrl || '';
      const portOk = baseUrl.includes('12345');
      const reachable = info.restServer?.reachable !== false; // undefined means call succeeded
      if (portOk) {
        console.log(`✅ PASS  server_info — baseUrl=${baseUrl} reachable=${info.restServer?.reachable ?? 'n/a'} tools=${info.counts?.toolsTotal}`);
        passed++;
      } else {
        console.log(`❌ FAIL  server_info — wrong baseUrl: "${baseUrl}" (expected 12345)`);
        failed++;
      }
    } catch (e) {
      if (responses[2].result?.isError) {
        console.log('❌ FAIL  server_info — scraper not reachable:', responses[2].result.content[0]?.text?.substring(0, 100));
      } else {
        console.log('❌ FAIL  server_info — parse error:', e.message);
      }
      failed++;
    }
  } else {
    console.log('❌ FAIL  server_info — no response');
    failed++;
  }

  // Check list_saves
  if (responses[3]) {
    const isErr = responses[3].result?.isError;
    if (!isErr) {
      console.log('✅ PASS  list_saves — responded OK');
      passed++;
    } else {
      console.log('❌ FAIL  list_saves — error:', responses[3].result.content[0]?.text?.substring(0, 80));
      failed++;
    }
  } else {
    console.log('❌ FAIL  list_saves — no response');
    failed++;
  }

  console.log('');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0 && stderr) {
    console.log('STDERR (last 300 chars):', stderr.slice(-300));
  }
  process.exit(failed > 0 ? 1 : 0);
}

runTest().catch(e => { console.error('Test runner error:', e); process.exit(1); });
