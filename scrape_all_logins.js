// Script to submit all /logins/ app URLs to the MCP server for scraping
const axios = require('axios');

const jobs = [
  { url: 'http://localhost:3001', name: 'app1-b2b-vendor-portal' },
  { url: 'http://localhost:3002', name: 'app2-flash-drop' },
  { url: 'http://localhost:3003', name: 'app3-legacy-auth' },
  { url: 'http://localhost:3004', name: 'app4-session-hog' },
  { url: 'http://localhost:3005', name: 'app5-header-gateway' },
  { url: 'http://localhost:3006', name: 'app5-header-gateway-backend' }
];

(async () => {
  for (const job of jobs) {
    try {
      const res = await axios.post('http://localhost:3000/api/scrape', { url: job.url });
      console.log(`Submitted ${job.name}: sessionId=${res.data.sessionId}`);
    } catch (err) {
      console.error(`Failed to submit ${job.name}:`, err.message);
    }
  }
})();
