const axios = require('axios');

async function testCDN() {
  const domains = ['https://s21.freecdn4.top', 'https://s20.freecdn4.top', 'https://s21.nm-cdn4.top'];
  for (const d of domains) {
    try {
      console.log(`\n--- Testing ${d} ---`);
      // Just a HEAD request to check host resolution and accessibility
      await axios.head(d, { timeout: 5000 });
      console.log(`✅ ${d} is reachable`);
    } catch (e) {
      console.log(`❌ ${d} failed: ${e.message}`);
    }
  }
}

testCDN().catch(console.error);
