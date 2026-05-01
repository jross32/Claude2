// Script to resubmit stuck jobs from scrape_tests/2026-04-20/ to MCP backend
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const JOBS_DIR = path.join(__dirname, '../logins/scrape_tests/2026-04-20');
const MCP_API = 'http://localhost:3000/api/scrape';

async function submitJob(jobFile) {
  const jobPath = path.join(JOBS_DIR, jobFile);
  const jobData = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
  // Use the startUrl or url from the job file
  const url = jobData.startUrl || jobData.url || (jobData.options && jobData.options.url);
  if (!url) {
    console.log(`Skipping ${jobFile}: no URL found.`);
    return;
  }
  try {
    const res = await axios.post(MCP_API, { url });
    console.log(`Submitted ${jobFile}: sessionId=${res.data.sessionId}`);
  } catch (err) {
    console.error(`Failed to submit ${jobFile}:`, err.message);
  }
}

async function main() {
  const files = fs.readdirSync(JOBS_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    await submitJob(file);
  }
}

main();
