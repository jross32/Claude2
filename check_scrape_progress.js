// Script to check the progress of all login app scrape sessions
const axios = require('axios');

const sessionIds = [
  'ef9bf100-6194-4a5d-891d-9cafaf63f756', // app1-b2b-vendor-portal
  'a46c2240-fcbb-49e0-b133-c5bc9c3d8f67', // app2-flash-drop
  '573a4d56-881b-4c62-854c-bc2c75955e7a', // app3-legacy-auth
  '2ad0c28f-69d3-467a-8563-a7664bc2a056', // app4-session-hog
  'b7e3d1a6-94b4-43b5-8490-2703dbbef4af', // app5-header-gateway
  '78a5ad6d-291b-49df-87db-4985f4c6ff99'  // app5-header-gateway-backend
];

(async () => {
  for (const id of sessionIds) {
    try {
      const res = await axios.get(`http://localhost:3000/api/scrape/${id}/status`);
      console.log(`Session ${id}:`, res.data);
    } catch (err) {
      console.error(`Failed to get status for ${id}:`, err.message);
    }
  }
})();
