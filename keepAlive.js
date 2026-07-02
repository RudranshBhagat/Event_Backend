const https = require('https');
const http = require('http');

const BACKEND_URL = process.env.BACKEND_URL || '';

if (!BACKEND_URL) {
  console.warn('⚠️  BACKEND_URL not set — keep-alive ping disabled.');
}

/**
 * Pings the /health endpoint every 5 minutes to prevent
 * Render free tier from spinning down the server.
 */
function startKeepAlive() {
  if (!BACKEND_URL) return;

  const url = `${BACKEND_URL}/health`;
  const client = url.startsWith('https') ? https : http;

  const ping = () => {
    const req = client.get(url, (res) => {
      console.log(`🏓 Keep-alive ping → ${url} [${res.statusCode}]`);
    });

    req.on('error', (err) => {
      console.error(`❌ Keep-alive ping failed: ${err.message}`);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      console.warn('⚠️  Keep-alive ping timed out.');
    });
  };

  // Ping immediately on startup
  ping();

  // Then every 5 minutes (300,000 ms)
  const interval = setInterval(ping, 5 * 60 * 1000);

  console.log(`✅ Keep-alive started — pinging ${url} every 5 minutes.`);

  return interval;
}

module.exports = { startKeepAlive };