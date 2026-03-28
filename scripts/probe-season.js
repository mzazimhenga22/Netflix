const axios = require('axios');

const NETMIRROR_BASE = 'https://net22.cc';
const NETMIRROR_PLAY = 'https://net52.cc';
const USER_TOKEN = '233123f803cf02184bf6c67e149cdd50';

async function probeSeason(showId, ott, season, ep) {
  const timestamp = Math.floor(Date.now() / 1000);
  const sessionRes = await axios.post(`${NETMIRROR_PLAY}/tv/p.php`, `t=${timestamp}`, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', 'Referer': `${NETMIRROR_PLAY}/` }
  });
  const sessionCookies = sessionRes.headers['set-cookie'] ? sessionRes.headers['set-cookie'].map(h => h.split(';')[0]).join('; ') : '';
  const commonCookies = `user_token=${USER_TOKEN}; ott=${ott}; ${sessionCookies}`;

  const playRes = await axios.post(`${NETMIRROR_BASE}/play.php`, `id=${showId}&ep=${ep}`, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': `user_token=${USER_TOKEN}; ott=${ott};`, 'X-Requested-With': 'XMLHttpRequest', 'Referer': `${NETMIRROR_BASE}/` }
  });
  const hToken = playRes.data.h;

  // Test various parameter combinations for season
  const combos = [
    { ep, s: season },
    { ep },
    { ep, season },
    { episode: ep, season },
    { ep: `${season}-${ep}` },
    { ep: `${season}x${ep}` }
  ];

  for (const params of combos) {
    console.log(`\nTesting params: ${JSON.stringify(params)}`);
    try {
      const playlistRes = await axios.get(`${NETMIRROR_PLAY}/playlist.php`, {
        params: { id: showId, t: timestamp, h: hToken, ott, ...params },
        headers: { 'Cookie': `${commonCookies}; hd=on;`, 'Referer': `${NETMIRROR_PLAY}/`, 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' }
      });

      const data = Array.isArray(playlistRes.data) ? playlistRes.data[0] : playlistRes.data;
      if (!data?.sources?.length) { console.log(`NO SOURCES`); continue; }

      const src = data.sources[0].file;
      const testUrl = src.startsWith('http') ? src : `${NETMIRROR_PLAY}${src}`;

      const checkRes = await axios.get(testUrl, {
        headers: { 'Cookie': `${commonCookies}; hd=on;`, 'Referer': `${NETMIRROR_PLAY}/`, 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' }
      });

      const content = checkRes.data.toString();
      const hasBrokenAudio = content.includes('https:///');
      const hasVideo = content.includes('#EXT-X-STREAM-INF');

      if (!hasVideo) {
        console.log(`DUMMY/No Video: ${content.substring(0, 300)}`);
      } else if (hasBrokenAudio) {
        console.log(`✅ VALID VIDEO (but broken audio)! (${src.substring(0, 60)})`);
      } else {
        console.log(`✅ FULLY VALID! (${src.substring(0, 60)})`);
      }
    } catch (e) {
      console.log(`ERROR - ${e.message}`);
    }
  }
}

console.log('Testing Beauty in Black (NF, 81764523) Season 2 Episode 9...\n');
probeSeason('81764523', 'nf', 2, 9).catch(console.error);
console.log('Testing Beauty in Black (NF, 81764523) Absolute Episode 17...\n');
probeSeason('81764523', 'nf', 0, 17).catch(console.error);
