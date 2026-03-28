const axios = require('axios');

const mirrors = [
  'https://net22.cc',
  'https://net21.cc',
  'https://net23.cc',
  'https://net24.cc',
  'https://netmirror.vip',
  'https://netfree.cc',
  'https://net52.cc'
];

async function check() {
  for (const m of mirrors) {
    try {
      const start = Date.now();
      await axios.get(m, { timeout: 5000 });
      console.log(`✅ ${m} - ${Date.now() - start}ms`);
    } catch (e) {
      console.log(`❌ ${m} - ${e.message}`);
    }
  }
}

check();
