const axios = require('axios');

const DOMAIN = 'net52.cc';
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 16; sdk_gphone64_x86_64 Build/BE2A.250530.026.D1; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.6943.137 Mobile Safari/537.36 /OS.Gatu v3.0';
const X_REQUESTED_WITH = 'app.netmirror.netmirrornew';

function extractSetCookie(headers, name) {
  const setCookies = headers?.['set-cookie'];
  if (!setCookies) return '';
  const list = Array.isArray(setCookies) ? setCookies : [setCookies];
  for (const h of list) {
    if (h.trim().startsWith(`${name}=`)) {
      return h.trim().substring(name.length + 1).split(';')[0].trim();
    }
  }
  return '';
}

async function main() {
  console.log('=== Step 1: Getting addhash ===');
  const r1 = await axios.get(`https://${DOMAIN}/mobile/home?app=1`, {
    headers: { 'User-Agent': MOBILE_UA, 'x-requested-with': '' }
  });
  const addhashCookie = extractSetCookie(r1.headers, 'addhash');
  if (!addhashCookie) {
    console.error('Failed to get addhash');
    return;
  }

  console.log('=== Step 2: Triggering userver ===');
  const addhashRaw = decodeURIComponent(addhashCookie);
  const ffr = encodeURIComponent(addhashRaw);
  const userverUrl = `https://userver.${DOMAIN}/?ffr455=${ffr}&a=y&t=${Math.random()}`;
  await axios.get(userverUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36' },
    validateStatus: () => true
  });

  console.log('=== Step 3: Dwelling 38s ===');
  await new Promise(r => setTimeout(r, 38000));

  console.log('=== Step 4: Polling verify2 ===');
  let tHashTCookie = '';
  for (let i = 1; i <= 10; i++) {
    const r4 = await axios.post(`https://${DOMAIN}/mobile/verify2.php`, `verify=${addhashCookie}`, {
      headers: {
        'User-Agent': MOBILE_UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': `addhash=${addhashCookie}`,
        'Referer': `https://${DOMAIN}/mobile/home?app=1`
      }
    });
    tHashTCookie = extractSetCookie(r4.headers, 't_hash_t');
    if (tHashTCookie) {
      break;
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  if (!tHashTCookie) {
    console.error('Failed to verify session');
    return;
  }

  const sessionCookie = `addhash=${addhashCookie}; t_hash_t=${tHashTCookie}`;

  // Refresh
  await axios.get(`https://${DOMAIN}/mobile/home?app=1`, {
    headers: { 'User-Agent': MOBILE_UA, 'X-Requested-With': X_REQUESTED_WITH, 'Cookie': sessionCookie }
  });

  const showId = '80057281'; // Stranger Things
  const ts = Math.floor(Date.now() / 1000);

  // Combos to test for Stranger Things Season 1 Episode 1
  const combos = [
    { label: 's=1, ep=1', params: { id: showId, t: 'Stranger Things', tm: ts, s: '1', ep: '1' } },
    { label: 's=1, ep=E1', params: { id: showId, t: 'Stranger Things', tm: ts, s: '1', ep: 'E1' } },
    { label: 'season=1, ep=1', params: { id: showId, t: 'Stranger Things', tm: ts, season: '1', ep: '1' } },
    { label: 'season=S1, ep=E1', params: { id: showId, t: 'Stranger Things', tm: ts, season: 'S1', ep: 'E1' } },
    { label: 'ep=1-1', params: { id: showId, t: 'Stranger Things', tm: ts, ep: '1-1' } },
    { label: 'ep=1x1', params: { id: showId, t: 'Stranger Things', tm: ts, ep: '1x1' } },
    { label: 'ep=S1E1', params: { id: showId, t: 'Stranger Things', tm: ts, ep: 'S1E1' } },
    { label: 'ep=S01E01', params: { id: showId, t: 'Stranger Things', tm: ts, ep: 'S01E01' } },
    { label: 'ep=1 (absolute ep count)', params: { id: showId, t: 'Stranger Things', tm: ts, ep: '1' } }
  ];

  for (const c of combos) {
    console.log(`\nTesting combo: ${c.label}`);
    try {
      const res = await axios.get(`https://${DOMAIN}/mobile/playlist.php`, {
        params: c.params,
        headers: {
          'User-Agent': MOBILE_UA,
          'X-Requested-With': X_REQUESTED_WITH,
          'Cookie': sessionCookie,
          'Referer': `https://${DOMAIN}/mobile/home?app=1`
        }
      });
      const data = Array.isArray(res.data) ? res.data[0] : res.data;
      if (data?.sources?.length > 0) {
        const file = data.sources[0].file;
        console.log(`  -> SUCCESS! Title: ${data.title}, File: ${file}`);
      } else {
        console.log(`  -> FAILED: No sources in response`);
        console.log(`     Response: ${JSON.stringify(res.data).substring(0, 150)}`);
      }
    } catch (e) {
      console.log(`  -> ERROR: ${e.message}`);
    }
  }
}

main().catch(console.error);
