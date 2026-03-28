const axios = require('axios');

async function scan() {
  const base = 'freecdn4.top';
  for (let i = 1; i <= 21; i++) {
    const host = `s${i}.${base}`;
    try {
      await axios.head(`https://${host}`, { timeout: 2000 });
      console.log(`✅ ${host} is UP`);
    } catch (e) {
      // console.log(`❌ ${host} is DOWN`);
    }
  }
}

scan();
