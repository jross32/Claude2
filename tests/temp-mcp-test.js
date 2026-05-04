const { spawn } = require('child_process');
const proc = spawn('node', ['mcp-server.js'], { cwd: 'C:\\Users\\justi\\Claude2', env: { ...process.env, SCRAPER_URL: 'http://localhost:12345', PORT: '12345' } });

let buf = '';
proc.stdout.on('data', d => { buf += d.toString(); });
proc.stderr.on('data', d => {}); // suppress

// Send initialize
const init = JSON.stringify({ jsonrpc:'2.0', id:1, method:'initialize', params:{ protocolVersion:'2024-11-05', capabilities:{}, clientInfo:{ name:'test', version:'1.0' } } }) + '\n';
proc.stdin.write(init);

setTimeout(() => {
  // Send server_info tool call
  const call = JSON.stringify({ jsonrpc:'2.0', id:2, method:'tools/call', params:{ name:'server_info', arguments:{} } }) + '\n';
  proc.stdin.write(call);
}, 500);

setTimeout(() => {
  proc.kill();
  // Parse last result
  const lines = buf.trim().split('\n').filter(l => l.trim());
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (msg.id === 2) {
        const text = msg.result?.content?.[0]?.text;
        const info = JSON.parse(text);
        console.log('MCP server_info OK:', JSON.stringify({ port: info.port, status: info.status, version: info.version }, null, 2));
      }
    } catch(e) {}
  }
  process.exit(0);
}, 3000);
