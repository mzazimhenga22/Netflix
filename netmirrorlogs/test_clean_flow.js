/**
 * Quick test of the new clean mobile API flow
 * Mimics exactly what resolveNet22/resolveNet52 do
 */

const https = require('https');
const { URL } = require('url');

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 16; Pixel 9 Build/BP2A.250526.006; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.6943.137 Mobile Safari/537.36 /OS.Gatu v3.0';
const SEC_CH_UA = '"Not(A:Brand";v="99", "Android WebView";v="133", "Chromium";v="133"';
const DOMAIN = 'net52.cc';
const BASE = `https://${DOMAIN}`;

function request(urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const headers = {
      'User-Agent': MOBILE_UA,
      'Accept': opts.accept || '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity',
      'sec-ch-ua': SEC_CH_UA,
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
      ...(opts.headers || {}),
    };
    if (opts.cookie) headers['Cookie'] = opts.cookie;
    if (opts.referer) headers['Referer'] = opts.referer;
    if (opts.xrw) headers['X-Requested-With'] = opts.xrw;

    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        setCookies: res.headers['set-cookie'] || [],
        body: data,
      }));
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function parseCookies(setCookies, existing = '') {
  const jar = {};
  if (existing) existing.split(';').forEach(c => { const [k,...v] = c.trim().split('='); if(k) jar[k.trim()] = v.join('='); });
  for (const h of setCookies) { const [k,...v] = h.split(';')[0].split('='); if(k) jar[k.trim()] = v.join('='); }
  return Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; ');
}

function getCookieValue(str, name) {
  const m = str.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  CLEAN MOBILE API FLOW TEST');
  console.log('═══════════════════════════════════════════════\n');

  // Step 1: Warm session
  console.log('1️⃣ Warming session on net52.cc...');
  const homeRes = await request(`${BASE}/mobile/home?app=1`, {
    accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
    headers: { 'Sec-Fetch-Site': 'none', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document', 'Upgrade-Insecure-Requests': '1' },
  });
  const cookies = parseCookies(homeRes.setCookies);
  const addhash = getCookieValue(cookies, 'addhash');
  const parts = addhash.split('::');
  console.log(`   addhash: ${parts[0].substring(0,8)}...::${parts[3]} (${parts.length} parts)`);
  console.log(`   ✅ Session warm\n`);

  // Step 2: Search
  console.log('2️⃣ Searching for "Wednesday"...');
  const ts = Math.floor(Date.now()/1000);
  const token = Array.from({length:32}, () => Math.floor(Math.random()*16).toString(16)).join('');
  const searchRes = await request(`${BASE}/search.php?s=Wednesday&t=${ts}`, {
    cookie: `user_token=${token}; ott=nf;`,
    xrw: 'XMLHttpRequest',
    referer: `${BASE}/`,
  });
  const searchData = JSON.parse(searchRes.body);
  const results = searchData.searchResult || searchData;
  const match = results[0];
  console.log(`   Found: "${match.t}" (${match.y}) ID: ${match.id}`);
  console.log(`   ✅ Search done\n`);

  // Step 3: Episode list
  console.log('3️⃣ Fetching episode list...');
  const postRes = await request(`${BASE}/mobile/post.php?id=${match.id}&t=${ts}`, {
    xrw: 'XMLHttpRequest',
    cookie: cookies,
    referer: `${BASE}/mobile/home?app=1`,
  });
  console.log(`   post.php: HTTP ${postRes.status}, ${postRes.body.length} bytes`);
  console.log(`   Response: ${postRes.body.substring(0, 100)}...`);

  // For now, use a known episode ID (from MITM: 81639536 = Umbrella Academy)
  // In real code, we parse the episode list and find the right one
  const episodeId = '81639536'; // Known working episode
  console.log(`   Using test episode ID: ${episodeId}\n`);

  // Step 4: Fetch HLS manifest (THE KEY TEST)
  console.log('4️⃣ Fetching HLS manifest with RAW 4-part token...');
  console.log(`   Token: ${addhash.substring(0, 40)}...`);
  console.log(`   ❗ Using RAW token — NO ::m suffix\n`);

  const hlsUrl = `${BASE}/mobile/hls/${episodeId}.m3u8?in=${encodeURIComponent(addhash)}&hd=off&lang=eng`;
  const hlsRes = await request(hlsUrl, {
    xrw: 'app.netmirror.netmirrornew',
    cookie: cookies,
    referer: `${BASE}/mobile/home?app=1`,
  });

  const manifest = hlsRes.body;
  console.log(`\n   --- MANIFEST BODY ---\n${manifest}\n   ---------------------\n`);
  const hasExtm3u = manifest.includes('#EXTM3U');
  const hasUnknown = manifest.includes('in=unknown');
  const hasPoison = manifest.includes('/220884/');

  console.log(`   Status: ${hlsRes.status}`);
  console.log(`   #EXTM3U:     ${hasExtm3u ? '✅ YES' : '❌ NO'}`);
  console.log(`   in=unknown:  ${hasUnknown ? '❌ YES (BAD)' : '✅ NO (GOOD)'}`);
  console.log(`   /220884/:    ${hasPoison ? '⚠️ YES (needs unpoisoning)' : '✅ NO'}`);

  if (hasExtm3u && !hasUnknown) {
    console.log(`\n   🎉 SUCCESS! Manifest is valid!`);
    
    // Count tracks
    const audioTracks = (manifest.match(/#EXT-X-MEDIA:TYPE=AUDIO/g) || []).length;
    const videoStreams = (manifest.match(/#EXT-X-STREAM-INF/g) || []).length;
    console.log(`   Audio tracks: ${audioTracks}`);
    console.log(`   Video variants: ${videoStreams}`);

    // Test CDN
    const cdnMatch = manifest.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/);
    if (cdnMatch) {
      let cdnUrl = cdnMatch[1];
      if (cdnUrl.includes('/220884/')) {
        cdnUrl = cdnUrl.replace(/\/220884\//g, `/${episodeId}/`);
        console.log(`   🔧 Unpoisoned CDN URL: ${cdnUrl.substring(0, 100)}...`);
      }
      console.log(`\n5️⃣ Validating CDN stream...`);
      try {
        const cdnRes = await request(cdnUrl, { xrw: 'app.netmirror.netmirrornew' });
        const hasTs = cdnRes.body.includes('.ts');
        const hasJpg = cdnRes.body.includes('.jpg');
        console.log(`   CDN: HTTP ${cdnRes.status}, ${cdnRes.body.length} bytes`);
        console.log(`   .ts segments: ${hasTs ? '✅ YES' : '❌ NO'}`);
        console.log(`   .jpg (rate limited): ${hasJpg && !hasTs ? '❌ YES' : '✅ NO'}`);
        
        if (hasTs) {
          console.log(`\n   🎉🎉🎉 FULL SUCCESS! Stream is playable!`);
        }
      } catch(e) {
        console.log(`   CDN test failed: ${e.message}`);
      }
    }
  } else {
    console.log(`\n   ❌ FAILED — manifest is not valid`);
    console.log(`   Body: ${manifest.substring(0, 300)}`);
  }

  // Step 5: Captions
  console.log('\n6️⃣ Fetching captions...');
  try {
    const plRes = await request(`${BASE}/mobile/playlist.php?id=${episodeId}&t=test&tm=${ts}`, {
      xrw: 'app.netmirror.netmirrornew',
      cookie: cookies,
      referer: `${BASE}/mobile/home?app=1`,
    });
    const plData = JSON.parse(plRes.body);
    const item = Array.isArray(plData) ? plData[0] : plData;
    const tracks = (item.tracks || []).filter(t => t.kind === 'captions');
    console.log(`   Subtitle tracks: ${tracks.length}`);
    tracks.slice(0, 3).forEach(t => console.log(`   - ${t.label}: ${t.file.substring(0, 60)}...`));
  } catch(e) {
    console.log(`   Captions failed: ${e.message}`);
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('  TEST COMPLETE');
  console.log('═══════════════════════════════════════════════');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
