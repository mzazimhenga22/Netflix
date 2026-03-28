const axios = require('axios');

// Test different play domains and see if any work
const NETMIRROR_BASE = 'https://net22.cc';
const PLAY_DOMAINS = [
  'https://net52.cc',
  'https://net51.cc',
  'https://net50.cc',
  'https://net53.cc',
  'https://net54.cc',
  'https://play.net22.cc', 
  'https://play.net52.cc',
];
const USER_TOKEN = '233123f803cf02184bf6c67e149cdd50';

async function testDomain(playDomain) {
  const timestamp = Math.floor(Date.now() / 1000);
  const ott = 'nf';
  const showId = '81764523'; // Beauty in Black

  try {
    const sessionRes = await axios.post(`${playDomain}/tv/p.php`, `t=${timestamp}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', 'Referer': `${playDomain}/` },
      timeout: 5000
    });
    const setCookie = sessionRes.headers['set-cookie'];
    const sessionCookies = setCookie ? (Array.isArray(setCookie) ? setCookie : [setCookie]).map(h => h.split(';')[0]).join('; ') : '';
    const commonCookies = `user_token=${USER_TOKEN}; ott=${ott}; ${sessionCookies}`;

    const playRes = await axios.post(`${NETMIRROR_BASE}/play.php`, `id=${showId}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': commonCookies, 'X-Requested-With': 'XMLHttpRequest', 'Referer': `${NETMIRROR_BASE}/` },
      timeout: 5000
    });
    const hToken = playRes.data.h;
    if (!hToken || hToken === 'error') { console.log(`${playDomain}: No H-Token`); return; }

    const playlistRes = await axios.get(`${playDomain}/playlist.php`, {
      params: { id: showId, t: timestamp, h: hToken, ott, ep: 1 },
      headers: { 'Cookie': `${commonCookies}; hd=on;`, 'Referer': `${playDomain}/`, 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' },
      timeout: 5000
    });

    const data = Array.isArray(playlistRes.data) ? playlistRes.data[0] : playlistRes.data;
    if (data?.sources?.length) {
      const src = data.sources[0].file;
      const testUrl = src.startsWith('http') ? src : `${playDomain}${src}`;
      
      const checkRes = await axios.get(testUrl, {
        headers: { 'Cookie': `${commonCookies}; hd=on;`, 'Referer': `${playDomain}/`, 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' },
        timeout: 5000
      });
      const content = checkRes.data.toString();
      const isDummy = content.includes('https:///');
      const hasVideo = content.includes('#EXT-X-STREAM-INF') || content.includes('#EXTINF');

      if (isDummy || !hasVideo) {
        console.log(`${playDomain}: DUMMY (src: ${src.substring(0, 60)})`);
      } else {
        console.log(`${playDomain}: ✅ VALID STREAM!`);
        console.log(`  Content preview: ${content.substring(0, 150)}`);
      }
    } else {
      console.log(`${playDomain}: No sources in playlist`);
    }
  } catch (e) {
    console.log(`${playDomain}: ERROR - ${e.message?.substring(0, 80)}`);
  }
}

(async () => {
  console.log('Testing Squid Game (NF, 81040344) ep=1 across play domains...\n');
  for (const domain of PLAY_DOMAINS) {
    await testDomain(domain);
  }
  console.log('\nDone.');
})();
