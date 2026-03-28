const axios = require('axios');
const NETMIRROR_BASE = 'https://net22.cc';
const NETMIRROR_PLAY = 'https://net52.cc';
const USER_TOKEN = '233123f803cf02184bf6c67e149cdd50';

async function bruteEp(showId, ott, start, end) {
  const timestamp = Math.floor(Date.now() / 1000);
  const sessionRes = await axios.post(`${NETMIRROR_PLAY}/tv/p.php`, `t=${timestamp}`, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', 'Referer': `${NETMIRROR_PLAY}/` }
  });
  const sessionCookies = sessionRes.headers['set-cookie'] ? sessionRes.headers['set-cookie'].map(h => h.split(';')[0]).join('; ') : '';
  const commonCookies = `user_token=${USER_TOKEN}; ott=${ott}; ${sessionCookies}`;

  const playRes = await axios.post(`${NETMIRROR_BASE}/play.php`, `id=${showId}`, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': commonCookies, 'X-Requested-With': 'XMLHttpRequest', 'Referer': `${NETMIRROR_BASE}/` }
  });
  const hToken = playRes.data.h;

  for (let ep = start; ep <= end; ep++) {
    process.stdout.write(`Testing ep=${ep}... `);
    try {
      const playlistRes = await axios.get(`${NETMIRROR_PLAY}/playlist.php`, {
        params: { id: showId, t: timestamp, h: hToken, ott, ep },
        headers: { 'Cookie': `${commonCookies}; hd=on;`, 'Referer': `${NETMIRROR_PLAY}/`, 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' }
      });

      const data = Array.isArray(playlistRes.data) ? playlistRes.data[0] : playlistRes.data;
      if (!data?.sources?.length) { console.log(`EMPTY`); continue; }

      const src = data.sources[0].file;
      const testUrl = src.startsWith('http') ? src : `${NETMIRROR_PLAY}${src}`;

      const checkRes = await axios.get(testUrl, {
        headers: { 'Cookie': `${commonCookies}; hd=on;`, 'Referer': `${NETMIRROR_PLAY}/`, 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' }
      });

      const content = checkRes.data.toString();
      if (content.includes('https:///')) {
        console.log(`DUMMY`);
      } else {
        console.log(`✅ VALID! (${src.substring(0, 50)})`);
      }
    } catch (e) {
      console.log(`ERROR - ${e.message}`);
    }
  }
}

console.log('Brute forcing Beauty in Black (NF, 81764523) episodes 1-20...\n');
bruteEp('81764523', 'nf', 1, 20).catch(console.error);
