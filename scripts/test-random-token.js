// Test script to see if a random USER_TOKEN works
const axios = require('axios');
const crypto = require('crypto');

// Generate a random 32-character hex string (MD5-like)
const randomToken = crypto.randomBytes(16).toString('hex');
console.log(`Testing with random token: ${randomToken}`);

const MIRRORS = ['https://net22.cc', 'https://net21.cc'];
const USER_TOKEN = randomToken;

async function testStream(title, ep) {
  const timestamp = Math.floor(Date.now() / 1000);
  const commonCookies = `user_token=${USER_TOKEN}; ott=nf;`;

  for (const base of MIRRORS) {
    try {
      const searchRes = await axios.get(`${base}/search.php`, {
        params: { s: title, t: timestamp },
        headers: { 'Cookie': commonCookies, 'X-Requested-With': 'XMLHttpRequest', 'Referer': `${base}/`, 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' },
        timeout: 10000
      });

      const results = searchRes.data?.searchResult || searchRes.data;
      if (!Array.isArray(results) || results.length === 0) continue;

      const movie = results[0];
      console.log(`Found: "${movie.t}" (ID: ${movie.id})`);

      let playData = `id=${movie.id}`;
      if (ep) playData += `&ep=${ep}`;

      const playRes = await axios.post(`${base}/play.php`, playData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': commonCookies, 'X-Requested-With': 'XMLHttpRequest', 'Referer': `${base}/` },
        timeout: 10000
      });

      const hToken = playRes.data.h;
      console.log(`hToken: ${hToken}`);
      if (!hToken || hToken === 'error') {
         console.log(`FAILED to get hToken with random token`);
         continue;
      }

      console.log(`SUCCESS! Random token generated a valid hToken`);
      return;
    } catch (e) {
      console.log(`  Mirror ${base} failed: ${e.message}`);
    }
  }
}

(async () => {
  await testStream('Breaking Bad', 1);
})();
