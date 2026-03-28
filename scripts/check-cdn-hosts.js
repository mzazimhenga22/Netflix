const axios = require('axios');

async function check() {
  const hosts = [
    's21.freecdn.top',
    's20.freecdn.top',
    's21.freecdn4.top',
    's20.freecdn4.top',
    's21.freecdn5.top',
    's20.freecdn5.top',
    's21.nm-cdn4.top',
    's20.nm-cdn.top'
  ];
  
  for (const h of hosts) {
    try {
      await axios.head(`https://${h}`, { timeout: 3000 });
      console.log(`✅ ${h} is UP`);
    } catch (e) {
      console.log(`❌ ${h} is DOWN (${e.message})`);
    }
  }
}

check();
