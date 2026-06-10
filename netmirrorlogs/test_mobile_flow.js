/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NetMirror Mobile API Diagnostic Script
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mimics the exact real NetMirror Android app flow captured via MITM:
 *
 * MITM KEY FINDINGS:
 *   - The captured session already had t_hash_t cookie with ::eb flag
 *   - No `addhash` cookie appeared in the MITM at all
 *   - No `set-cookie` header set t_hash_t — it was pre-existing
 *   - The in= token on HLS URL has a DIFFERENT hash2 than the cookie
 *   - This means in= is generated CLIENT-SIDE by JavaScript
 *
 * THIS SCRIPT TESTS:
 *   1. Fresh session (no cookies) — what do we get?
 *   2. ek token — does it work for HLS despite being "support verification"?
 *   3. Token manipulation — can we use ek token directly?
 *   4. HTML analysis — find the inline JS that generates the in= token
 *   5. playlist.php response — what does it actually return?
 *
 * Usage: node test_mobile_flow.js [episodeId]
 *        node test_mobile_flow.js 81639536
 */

const https = require('https');
const { URL } = require('url');

const DOMAIN = 'net52.cc';
const BASE = `https://${DOMAIN}`;
const EP_ID = process.argv[2] || '81639536'; // Umbrella Academy episode from MITM

// Exact UA from MITM traffic
const UA = 'Mozilla/5.0 (Linux; Android 16; sdk_gphone64_x86_64 Build/BE2A.250530.026.D1; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.6943.137 Mobile Safari/537.36 /OS.Gatu v3.0';

function request(urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const headers = {
      'User-Agent': UA,
      'Accept': opts.accept || '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity',
      'sec-ch-ua': '"Not(A:Brand";v="99", "Android WebView";v="133", "Chromium";v="133"',
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
      ...(opts.headers || {}),
    };
    if (opts.fetchSite) headers['Sec-Fetch-Site'] = opts.fetchSite;
    if (opts.fetchMode) headers['Sec-Fetch-Mode'] = opts.fetchMode;
    if (opts.fetchDest) headers['Sec-Fetch-Dest'] = opts.fetchDest;
    if (opts.cookie) headers['Cookie'] = opts.cookie;
    if (opts.referer) headers['Referer'] = opts.referer;
    if (opts.origin) headers['Origin'] = opts.origin;
    if (opts.xrw === 'xhr') headers['X-Requested-With'] = 'XMLHttpRequest';
    else if (opts.xrw === 'app') headers['X-Requested-With'] = 'app.netmirror.netmirrornew';

    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: opts.method || 'GET',
      headers,
    }, (res) => {
      let data = '';
      const setCookies = res.headers['set-cookie'] || [];
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        setCookies,
        body: data,
        finalUrl: `https://${url.hostname}${res.headers.location || (url.pathname + url.search)}`
      }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function parseCookies(setCookieHeaders, existing = '') {
  const jar = {};
  if (existing) {
    existing.split(';').forEach(c => {
      const [k, ...v] = c.trim().split('=');
      if (k) jar[k.trim()] = v.join('=');
    });
  }
  for (const h of setCookieHeaders) {
    const [k, ...v] = h.split(';')[0].split('=');
    if (k) jar[k.trim()] = v.join('=');
  }
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

function getCookieValue(cookieStr, name) {
  const m = cookieStr.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

function div(title) {
  console.log(`\n${'═'.repeat(74)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(74)}`);
}

function tokenParts(token) {
  const parts = token.split('::');
  return {
    hash1: parts[0] || '',
    hash2: parts[1] || '',
    timestamp: parts[2] || '',
    flag: parts[3] || '',
    mobile: parts[4] || '',
    count: parts.length
  };
}

async function main() {
  const tm = Math.floor(Date.now() / 1000).toString();
  console.log(`\nNetMirror Mobile API Diagnostic`);
  console.log(`Episode ID: ${EP_ID}`);
  console.log(`Timestamp:  ${tm}`);
  console.log(`Domain:     ${DOMAIN}`);

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1: Fresh session — GET /mobile/home?app=1 (NO cookies)
  // MITM: Line 145-184 — real app sent existing t_hash_t cookie
  // We send NOTHING to see what a fresh install gets
  // ═══════════════════════════════════════════════════════════════════════
  div('STEP 1: GET /mobile/home?app=1 (FRESH — no cookies)');

  const homeRes = await request(`${BASE}/mobile/home?app=1`, {
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    fetchSite: 'none',
    fetchMode: 'navigate',
    fetchDest: 'document',
    headers: {
      'Upgrade-Insecure-Requests': '1',
      'pragma': 'no-cache',
      'cache-control': 'no-cache',
      'sec-fetch-user': '?1',
    },
    // NO xrw header for initial navigation (MITM line 154 shows empty x-requested-with)
  });

  let cookies = parseCookies(homeRes.setCookies);
  const html = homeRes.body;

  console.log(`  Status:  ${homeRes.status}`);
  console.log(`  Body:    ${html.length} bytes`);
  console.log(`  Set-Cookie headers: ${homeRes.setCookies.length}`);
  homeRes.setCookies.forEach((c, i) => console.log(`    [${i}] ${c.substring(0, 120)}`));
  console.log(`  Cookies jar: ${cookies.substring(0, 200)}`);

  // Extract addhash from cookies
  const addHash = getCookieValue(cookies, 'addhash');
  const tHashT = getCookieValue(cookies, 't_hash_t');
  const tHash = getCookieValue(cookies, 't_hash');

  console.log(`\n  Tokens found in cookies:`);
  console.log(`    addhash:  ${addHash || '(none)'}`);
  console.log(`    t_hash_t: ${tHashT || '(none)'}`);
  console.log(`    t_hash:   ${tHash || '(none)'}`);

  if (addHash) {
    const p = tokenParts(addHash);
    console.log(`\n  addhash breakdown (${p.count} parts):`);
    console.log(`    hash1:     ${p.hash1}`);
    console.log(`    hash2:     ${p.hash2}`);
    console.log(`    timestamp: ${p.timestamp}`);
    console.log(`    flag:      ${p.flag} ${p.flag === 'eb' ? '✅ PLAYBACK' : p.flag === 'ek' ? '⚠️ SUPPORT/VERIFICATION' : '❓ UNKNOWN'}`);
    console.log(`    mobile:    ${p.mobile || '(none)'}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1b: Analyze HTML for inline JS that generates t_hash_t / in= token
  // ═══════════════════════════════════════════════════════════════════════
  div('STEP 1b: Analyze home page HTML for token generation');

  // Search for cookie-setting patterns
  const patterns = [
    { name: 'document.cookie =', regex: /document\.cookie\s*=\s*["']([^"']*)/g },
    { name: 't_hash_t reference', regex: /t_hash_t/g },
    { name: 'addhash reference', regex: /addhash/g },
    { name: 'data-addhash attr', regex: /data-addhash=["']([^"']+)/gi },
    { name: 'data-hash attr', regex: /data-hash=["']([^"']+)/gi },
    { name: 'data-time attr', regex: /data-time=["']([^"']+)/gi },
    { name: 'data-extra attr', regex: /data-extra=["']([^"']+)/gi },
    { name: 'playerstart call', regex: /playerstart\s*\(/g },
    { name: '/mobile/hls/', regex: /\/mobile\/hls\//g },
    { name: 'in= token ref', regex: /[?&]in=/g },
    { name: 'MD5 function', regex: /md5|MD5/g },
    { name: 'getCookie func', regex: /getCookie|get_cookie/gi },
    { name: 'JWPlayer setup', regex: /jwplayer|JWPlayer/gi },
  ];

  for (const { name, regex } of patterns) {
    const matches = [];
    let m;
    while ((m = regex.exec(html)) !== null) {
      matches.push({ pos: m.index, match: m[0], capture: m[1] || '' });
    }
    if (matches.length > 0) {
      console.log(`  ✅ ${name}: ${matches.length} occurrence(s)`);
      for (const mm of matches.slice(0, 3)) {
        const ctx = html.substring(Math.max(0, mm.pos - 40), Math.min(html.length, mm.pos + 120)).replace(/\s+/g, ' ');
        console.log(`     pos ${mm.pos}: ...${ctx}...`);
        if (mm.capture) console.log(`     captured: ${mm.capture.substring(0, 100)}`);
      }
    } else {
      console.log(`  ❌ ${name}: not found`);
    }
  }

  // Extract all <script> tags (inline and external)
  console.log(`\n  Script tags:`);
  const scriptTags = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
  scriptTags.forEach((s, i) => {
    const src = s.match(/src=["']([^"']+)/);
    const content = s.replace(/<\/?script[^>]*>/gi, '').trim();
    if (src) {
      console.log(`    [${i}] External: ${src[1]}`);
    } else if (content.length > 0) {
      console.log(`    [${i}] Inline (${content.length} chars): ${content.substring(0, 200).replace(/\n/g, '\\n')}...`);
      // Look for token/cookie generation in inline scripts
      if (content.includes('cookie') || content.includes('hash') || content.includes('token') || content.includes('playerstart')) {
        console.log(`         ⚠️ INTERESTING — contains cookie/hash/token/playerstart reference`);
        console.log(`         Full content:\n${content.substring(0, 1000)}`);
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2: Warm session — fetch CSS + JS like real app does
  // MITM: Lines 185-500 — real app loads home.css, nf-custom.js, etc.
  // ═══════════════════════════════════════════════════════════════════════
  div('STEP 2: Warm session (fetch CSS + JS like real app)');

  const warmTargets = [
    { url: `${BASE}/mobile/home.css?v1.4000000`, desc: 'CSS' },
    { url: `${BASE}/mobile/js/nf-custom.js?v=1.40000000`, desc: 'JS' },
  ];

  for (const t of warmTargets) {
    try {
      const res = await request(t.url, {
        xrw: 'app',
        cookie: cookies,
        referer: `${BASE}/mobile/home?app=1`,
        fetchSite: 'same-origin',
        fetchMode: 'no-cors',
        fetchDest: t.desc === 'CSS' ? 'style' : 'script',
      });
      // Collect any new cookies from warm-up
      if (res.setCookies.length > 0) {
        cookies = parseCookies(res.setCookies, cookies);
        console.log(`  ${t.desc}: HTTP ${res.status}, ${res.body.length} bytes, NEW COOKIES: ${res.setCookies.map(c => c.split(';')[0]).join(', ')}`);
      } else {
        console.log(`  ${t.desc}: HTTP ${res.status}, ${res.body.length} bytes, no new cookies`);
      }
    } catch (e) {
      console.log(`  ${t.desc}: ❌ ${e.message}`);
    }
  }
  console.log(`  Cookies after warm-up: ${cookies.substring(0, 200)}`);

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 3: Test post.php (episode listing)
  // MITM: Line 3056 — GET /mobile/post.php?id=80186863&t=1780228028
  // Uses X-Requested-With: XMLHttpRequest
  // ═══════════════════════════════════════════════════════════════════════
  div('STEP 3: GET /mobile/post.php (episode listing)');

  try {
    const postRes = await request(`${BASE}/mobile/post.php?id=${EP_ID}&t=${tm}`, {
      xrw: 'xhr',  // MITM line 3058: XMLHttpRequest
      cookie: cookies,
      referer: `${BASE}/mobile/home?app=1`,
      fetchSite: 'same-origin',
      fetchMode: 'cors',
      fetchDest: 'empty',
    });
    cookies = parseCookies(postRes.setCookies, cookies);
    console.log(`  Status: ${postRes.status}, Body: ${postRes.body.length} bytes`);
    console.log(`  Response: ${postRes.body.substring(0, 500)}`);
  } catch (e) {
    console.log(`  ❌ ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 4: Test playlist.php
  // MITM: Line 3656 — playlist.php?id=81639536&t=The%20Umbrella%20Academy&tm=1780228028
  // Uses X-Requested-With: app.netmirror.netmirrornew
  // ═══════════════════════════════════════════════════════════════════════
  div('STEP 4: GET /mobile/playlist.php');

  let playlistBody = '';
  try {
    const plRes = await request(`${BASE}/mobile/playlist.php?id=${EP_ID}&t=test&tm=${tm}`, {
      xrw: 'app',  // MITM line 3662: app.netmirror.netmirrornew
      cookie: cookies,
      referer: `${BASE}/mobile/home?app=1`,
      fetchSite: 'same-origin',
      fetchMode: 'cors',
      fetchDest: 'empty',
    });
    cookies = parseCookies(plRes.setCookies, cookies);
    playlistBody = plRes.body;
    console.log(`  Status: ${plRes.status}, Body: ${playlistBody.length} bytes`);
    console.log(`  Response: ${playlistBody.substring(0, 600)}`);

    // Parse and analyze
    try {
      const pl = JSON.parse(playlistBody);
      const item = Array.isArray(pl) ? pl[0] : pl;
      if (item?.sources?.[0]?.file) {
        const file = item.sources[0].file;
        console.log(`\n  Source file: ${file.substring(0, 200)}`);

        // Check for in= token in the playlist URL
        const inMatch = file.match(/[?&]in=([^&\s"']+)/);
        if (inMatch) {
          const inToken = decodeURIComponent(inMatch[1]);
          console.log(`  in= token from playlist: ${inToken}`);
          const p = tokenParts(inToken);
          console.log(`    flag: ${p.flag} | mobile: ${p.mobile} | parts: ${p.count}`);
          if (inToken === 'unknown' || inToken.includes('unknown')) {
            console.log(`  ⚠️ Playlist returned in=unknown — server didn't accept our cookies`);
          }
        } else {
          console.log(`  ℹ️ No in= token in playlist source URL`);
        }
      }
      if (item?.tracks) {
        console.log(`  Tracks: ${item.tracks.length}`);
      }
    } catch (pe) {
      console.log(`  ⚠️ Not valid JSON: ${pe.message}`);
    }
  } catch (e) {
    console.log(`  ❌ ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 5: Test HLS endpoint with different token strategies
  // MITM: Line 4056 — /mobile/hls/81639536.m3u8?in=...::eb::m&hd=off&lang=eng
  // ═══════════════════════════════════════════════════════════════════════
  div('STEP 5: Test /mobile/hls/ with different tokens');

  // Build token candidates
  const tokenCandidates = [];

  // From addhash cookie (what we actually get)
  if (addHash) {
    tokenCandidates.push({ label: 'addhash raw', token: addHash });
    if (!addHash.endsWith('::m')) {
      tokenCandidates.push({ label: 'addhash + ::m', token: addHash + '::m' });
    }
    // Strip flag and add eb flag
    const parts = addHash.split('::');
    if (parts.length >= 3) {
      const ebToken = `${parts[0]}::${parts[1]}::${parts[2]}::eb`;
      const ebMToken = `${parts[0]}::${parts[1]}::${parts[2]}::eb::m`;
      if (parts[3] !== 'eb') {
        tokenCandidates.push({ label: 'addhash with ::eb flag', token: ebToken });
        tokenCandidates.push({ label: 'addhash with ::eb::m flag', token: ebMToken });
      }
    }
  }

  // From t_hash_t cookie
  if (tHashT && tHashT !== addHash) {
    tokenCandidates.push({ label: 't_hash_t cookie', token: tHashT });
    if (!tHashT.endsWith('::m')) {
      tokenCandidates.push({ label: 't_hash_t + ::m', token: tHashT + '::m' });
    }
  }

  // If we have the data-addhash from HTML
  const htmlAddHash = html.match(/data-addhash=["']([^"']+)/i);
  if (htmlAddHash && htmlAddHash[1] !== addHash) {
    tokenCandidates.push({ label: 'HTML data-addhash', token: htmlAddHash[1] });
    if (!htmlAddHash[1].endsWith('::m')) {
      tokenCandidates.push({ label: 'HTML data-addhash + ::m', token: htmlAddHash[1] + '::m' });
    }
  }

  if (tokenCandidates.length === 0) {
    console.log('  ❌ No tokens available to test!');
    // Try with empty/dummy token
    tokenCandidates.push({ label: 'empty token', token: '' });
  }

  console.log(`\n  Testing ${tokenCandidates.length} token candidate(s):\n`);

  for (const { label, token } of tokenCandidates) {
    console.log(`  ── Token: "${label}" ──`);
    console.log(`     Value: ${token.substring(0, 80)}${token.length > 80 ? '...' : ''}`);

    // Build cookie string with t_hash_t set to our token
    let hlsCookie = cookies;
    if (token) {
      // Inject t_hash_t cookie if not already present
      if (!hlsCookie.includes('t_hash_t=')) {
        hlsCookie += `; t_hash_t=${encodeURIComponent(token)}`;
      }
    }

    try {
      const hlsUrl = `${BASE}/mobile/hls/${EP_ID}.m3u8?in=${encodeURIComponent(token)}&hd=off&lang=eng`;
      const hlsRes = await request(hlsUrl, {
        xrw: 'app',  // MITM line 4062: app.netmirror.netmirrornew
        cookie: hlsCookie,
        referer: `${BASE}/mobile/home?app=1`,
        fetchSite: 'same-origin',
        fetchMode: 'cors',
        fetchDest: 'empty',
      });

      console.log(`     HLS status: ${hlsRes.status}, size: ${hlsRes.body.length} bytes`);

      if (hlsRes.body.includes('#EXTM3U')) {
        const hasUnknown = hlsRes.body.includes('in=unknown');
        const has220884 = hlsRes.body.includes('/220884/');
        const hasRealId = hlsRes.body.includes(`/${EP_ID}/`) || hlsRes.body.match(/\/files\/\d{5,}\//);

        console.log(`     ✅ Got HLS manifest!`);
        console.log(`     in=unknown:  ${hasUnknown ? '❌ YES (bad)' : '✅ NO (good)'}`);
        console.log(`     /220884/:    ${has220884 ? '⚠️ YES (poisoned)' : '✅ NO'}`);
        console.log(`     Real file ID: ${hasRealId ? '✅ YES' : '⚠️ NO'}`);
        console.log(`     Manifest:\n${hlsRes.body.substring(0, 800)}`);

        // If we got a real manifest, try fetching a CDN stream from it
        if (!hasUnknown) {
          const cdnMatch = hlsRes.body.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/);
          if (cdnMatch) {
            console.log(`\n     🌐 Testing CDN: ${cdnMatch[1].substring(0, 120)}...`);
            try {
              const cdnRes = await request(cdnMatch[1], {
                xrw: 'app',
                origin: BASE,
                referer: `${BASE}/`,
                fetchSite: 'cross-site',
                fetchMode: 'cors',
                fetchDest: 'empty',
              });
              console.log(`     CDN status: ${cdnRes.status}, size: ${cdnRes.body.length}`);
              if (cdnRes.body.includes('#EXTINF')) {
                console.log(`     ✅✅✅ CDN RETURNED VALID SEGMENTS! Token "${label}" WORKS!`);
              } else if (cdnRes.body.includes('Only Valid')) {
                console.log(`     ❌ "Only Valid Users Allowed" — token rejected by CDN`);
              } else {
                console.log(`     ⚠️ CDN response: ${cdnRes.body.substring(0, 200)}`);
              }
            } catch (ce) {
              console.log(`     CDN error: ${ce.message}`);
            }
          }
        }
      } else {
        console.log(`     ❌ Not a valid HLS manifest`);
        console.log(`     Body: ${hlsRes.body.substring(0, 300)}`);
      }
    } catch (e) {
      console.log(`     ❌ ${e.message}`);
    }
    console.log('');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 6: Try with MITM-style cookies (t_hash_t pre-existing)
  // If our Firestore has a valid t_hash_t, simulate having it from the start
  // ═══════════════════════════════════════════════════════════════════════
  div('STEP 6: Simulate returning session (inject t_hash_t before home request)');

  // Use the addhash/ek token as a seed t_hash_t cookie
  const seedToken = addHash || tHashT;
  if (seedToken) {
    // Construct eb-flagged version of whatever we have
    const parts = seedToken.split('::');
    const ebSeedToken = parts.length >= 3
      ? `${parts[0]}::${parts[1]}::${parts[2]}::eb::m`
      : seedToken;

    console.log(`  Seed token: ${ebSeedToken.substring(0, 80)}...`);
    console.log(`  (Forced ::eb::m flag from original ${parts[3] || 'none'} flag)\n`);

    const seedCookie = `t_hash_t=${encodeURIComponent(ebSeedToken)}`;

    try {
      const homeRes2 = await request(`${BASE}/mobile/home?app=1`, {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        fetchSite: 'none',
        fetchMode: 'navigate',
        fetchDest: 'document',
        cookie: seedCookie,  // Pre-set t_hash_t like a returning session
        headers: {
          'Upgrade-Insecure-Requests': '1',
          'pragma': 'no-cache',
          'cache-control': 'no-cache',
          'sec-fetch-user': '?1',
        },
      });

      const cookies2 = parseCookies(homeRes2.setCookies, seedCookie);
      const addHash2 = getCookieValue(cookies2, 'addhash');

      console.log(`  Status: ${homeRes2.status}`);
      console.log(`  Set-Cookie: ${homeRes2.setCookies.length} header(s)`);
      homeRes2.setCookies.forEach((c, i) => console.log(`    [${i}] ${c.substring(0, 150)}`));
      console.log(`  New addhash: ${addHash2 || '(none)'}`);

      if (addHash2) {
        const p = tokenParts(addHash2);
        console.log(`  Flag: ${p.flag} ${p.flag === 'eb' ? '✅ PLAYBACK — SEEDING WORKED!' : '⚠️ Still not eb'}`);

        if (p.flag === 'eb') {
          // Try HLS with this real eb token
          const ebMToken = addHash2.endsWith('::m') ? addHash2 : addHash2 + '::m';
          const hlsUrl = `${BASE}/mobile/hls/${EP_ID}.m3u8?in=${encodeURIComponent(ebMToken)}&hd=off&lang=eng`;
          console.log(`\n  🎬 Testing HLS with eb token: ${hlsUrl.substring(0, 120)}...`);
          const hlsRes = await request(hlsUrl, {
            xrw: 'app',
            cookie: cookies2,
            referer: `${BASE}/mobile/home?app=1`,
            fetchSite: 'same-origin',
            fetchMode: 'cors',
            fetchDest: 'empty',
          });
          console.log(`  HLS: ${hlsRes.status}, ${hlsRes.body.length} bytes`);
          console.log(`  Has in=unknown: ${hlsRes.body.includes('in=unknown')}`);
          console.log(`  Body: ${hlsRes.body.substring(0, 500)}`);
        }
      }
    } catch (e) {
      console.log(`  ❌ ${e.message}`);
    }
  } else {
    console.log('  ⚠️ No seed token available');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 7: Try alternative domains
  // ═══════════════════════════════════════════════════════════════════════
  div('STEP 7: Quick probe of alternative domains');

  const altDomains = ['net11.cc', 'netfree.cc', 'netmirror.vip', 'net23.cc'];
  for (const d of altDomains) {
    try {
      const res = await request(`https://${d}/mobile/home?app=1`, {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        fetchSite: 'none',
        fetchMode: 'navigate',
        fetchDest: 'document',
        headers: {
          'Upgrade-Insecure-Requests': '1',
          'sec-fetch-user': '?1',
        },
      });
      const c = parseCookies(res.setCookies);
      const ah = getCookieValue(c, 'addhash');
      const flag = ah ? tokenParts(ah).flag : '';
      console.log(`  ${d}: HTTP ${res.status} | addhash: ${ah ? `${flag} (${ah.substring(0, 40)}...)` : 'none'} | set-cookie: ${res.setCookies.length}`);
    } catch (e) {
      console.log(`  ${d}: ❌ ${e.message}`);
    }
  }

  div('DONE');
  console.log('\nKey Questions Answered:');
  console.log('  1. What token does a fresh session get? → Check STEP 1');
  console.log('  2. Does ek token work for HLS? → Check STEP 5');
  console.log('  3. Can we seed eb via pre-existing cookie? → Check STEP 6');
  console.log('  4. Where does the in= token come from? → Check STEP 1b (inline JS)\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
