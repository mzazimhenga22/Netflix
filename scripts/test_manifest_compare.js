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

async function fetchManifest(playlistUrl, cookie) {
  try {
    const res = await axios.get(playlistUrl, {
      headers: {
        'User-Agent': MOBILE_UA,
        'X-Requested-With': X_REQUESTED_WITH,
        'Cookie': cookie,
        'Referer': `https://${DOMAIN}/mobile/home?app=1`
      }
    });
    const data = Array.isArray(res.data) ? res.data[0] : res.data;
    if (!data?.sources?.[0]?.file) return { error: 'No source' };
    
    let hlsUrl = data.sources[0].file;
    if (hlsUrl.startsWith('/')) hlsUrl = `https://${DOMAIN}${hlsUrl}`;
    
    const manifestRes = await axios.get(hlsUrl, {
      headers: {
        'User-Agent': MOBILE_UA,
        'X-Requested-With': X_REQUESTED_WITH,
        'Cookie': cookie,
        'Referer': `https://${DOMAIN}/mobile/home?app=1`
      }
    });
    return { title: data.title, file: hlsUrl, body: manifestRes.data };
  } catch (e) {
    return { error: e.message };
  }
}

async function main() {
  console.log('=== Step 1: Getting addhash ===');
  const r1 = await axios.get(`https://${DOMAIN}/mobile/home?app=1`, {
    headers: { 'User-Agent': MOBILE_UA, 'x-requested-with': '' }
  });
  const addhashCookie = extractSetCookie(r1.headers, 'addhash');
  if (!addhashCookie) return;

  console.log('=== Step 2: Triggering userver ===');
  const addhashRaw = decodeURIComponent(addhashCookie);
  const ffr = encodeURIComponent(addhashRaw);
  await axios.get(`https://userver.${DOMAIN}/?ffr455=${ffr}&a=y&t=${Math.random()}`, {
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
    if (tHashTCookie) break;
    await new Promise(r => setTimeout(r, 2000));
  }
  if (!tHashTCookie) return;

  const cookie = `addhash=${addhashCookie}; t_hash_t=${tHashTCookie}`;

  // Refresh
  await axios.get(`https://${DOMAIN}/mobile/home?app=1`, {
    headers: { 'User-Agent': MOBILE_UA, 'X-Requested-With': X_REQUESTED_WITH, 'Cookie': cookie }
  });

  const showId = '80057281'; // Stranger Things
  const ts = Math.floor(Date.now() / 1000);

  // Fetch S1E1 manifest (using s=1, ep=1)
  console.log('\n=== Fetching S1E1 (s=1, ep=1) ===');
  const s1e1 = await fetchManifest(`https://${DOMAIN}/mobile/playlist.php?id=${showId}&t=Stranger+Things&tm=${ts}&s=1&ep=1`, cookie);
  if (s1e1.error) {
    console.error('S1E1 Error:', s1e1.error);
    return;
  }
  console.log(`Title: ${s1e1.title}`);
  console.log(`File: ${s1e1.file}`);
  console.log(`Manifest (first 5 lines):\n${s1e1.body.split('\n').slice(0, 5).join('\n')}`);

  // Fetch S1E2 manifest (using s=1, ep=2)
  console.log('\n=== Fetching S1E2 (s=1, ep=2) ===');
  const s1e2 = await fetchManifest(`https://${DOMAIN}/mobile/playlist.php?id=${showId}&t=Stranger+Things&tm=${ts}&s=1&ep=2`, cookie);
  if (s1e2.error) {
    console.error('S1E2 Error:', s1e2.error);
    return;
  }
  console.log(`Title: ${s1e2.title}`);
  console.log(`File: ${s1e2.file}`);
  console.log(`Manifest (first 5 lines):\n${s1e2.body.split('\n').slice(0, 5).join('\n')}`);
}

main().catch(console.error);
