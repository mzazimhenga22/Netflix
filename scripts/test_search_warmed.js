const axios = require('axios');

const DOMAIN = 'net52.cc';
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 16; sdk_gphone64_x86_64 Build/BE2A.250530.026.D1; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.6943.137 Mobile Safari/537.36 /OS.Gatu v3.0';
const SEC_CH_UA = '"Not(A:Brand";v="99", "Android WebView";v="133", "Chromium";v="133"';
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

async function search(title, cookie) {
  const ts = Math.floor(Date.now() / 1000);
  try {
    const res = await axios.get(`https://${DOMAIN}/mobile/search.php`, {
      params: { s: title, t: ts },
      headers: {
        'User-Agent': MOBILE_UA,
        'Cookie': cookie,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `https://${DOMAIN}/mobile/home?app=1`,
      },
      timeout: 10000,
    });
    return res.data?.searchResult || res.data;
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
  if (!addhashCookie) {
    console.error('Failed to get addhash');
    return;
  }
  const addhashRaw = decodeURIComponent(addhashCookie);
  console.log(`addhash: ${addhashRaw}`);

  console.log('\n=== Step 2: Triggering userver ===');
  const ffr = encodeURIComponent(addhashRaw);
  const userverUrl = `https://userver.${DOMAIN}/?ffr455=${ffr}&a=y&t=${Math.random()}`;
  await axios.get(userverUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36' },
    validateStatus: () => true
  });

  console.log('\n=== Step 3: Dwelling 38s ===');
  await new Promise(r => setTimeout(r, 38000));

  console.log('\n=== Step 4: Polling verify2 ===');
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
      console.log(`t_hash_t obtained: ${decodeURIComponent(tHashTCookie)}`);
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

  // Test searches
  const queries = [
    'Stranger Things',
    'Stranger Things Season 1',
    'Stranger Things Season 2',
    'Stranger Things Season 3',
    'Stranger Things Season 4',
    'Cobra Kai',
    'Cobra Kai Season 1',
    'Cobra Kai Season 5'
  ];

  for (const q of queries) {
    console.log(`\n=== Search results for: "${q}" ===`);
    const results = await search(q, sessionCookie);
    if (Array.isArray(results)) {
      results.forEach(r => {
        console.log(`  ID: ${r.id} | Title: ${r.t || r.title} | Year: ${r.y || r.year}`);
      });
    } else {
      console.log('  Result:', results);
    }
  }
}

main().catch(console.error);
