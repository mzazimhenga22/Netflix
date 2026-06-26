#!/usr/bin/env node
/**
 * NetMirror End-to-End Test Script (MITM-verified flow)
 * 
 * Tests the full mobile API flow matching the real NetMirror app:
 *   1. GET /mobile/home?app=1 → addhash cookie (x-requested-with: empty)
 *   2. GET userver → monetag trigger
 *   3. Dwell 38s
 *   4. POST verify2.php → t_hash_t
 *   5. GET /mobile/home?app=1 → returning-session refresh (x-requested-with: app.netmirror...)
 *   6. Search for content → showId
 *   7. GET /mobile/post.php?id={showId} → episodes (TV) → contentId
 *   8. GET /mobile/playlist.php?id={contentId} → server-generated HLS URL with ?in=
 *   9. POST recentplay (body: recentplay=SE{showId})
 *  10. GET HLS manifest (using server URL from step 8)
 *  11. Validate manifest + test variant URL
 *
 * Usage:
 *   node scripts/test-netmirror-flow.js "Cobra Kai" 1 1       # TV: title, season, episode
 *   node scripts/test-netmirror-flow.js "Inception"            # Movie
 *   node scripts/test-netmirror-flow.js "" "" "" 81635392      # Direct content ID
 */

const axios = require('axios');

// ─── Config ─────────────────────────────────────────────────────────────────

const DOMAIN = 'net52.cc';
const SEARCH_TITLE = process.argv[2] || 'Stranger Things';
const SEASON = parseInt(process.argv[3] || '1', 10);
const EPISODE = parseInt(process.argv[4] || '1', 10);
const DIRECT_CONTENT_ID = process.argv[5] || '';

const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 16; sdk_gphone64_x86_64 Build/BE2A.250530.026.D1; wv) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.6943.137 ' +
  'Mobile Safari/537.36 /OS.Gatu v3.0';

const SEC_CH_UA = '"Not(A:Brand";v="99", "Android WebView";v="133", "Chromium";v="133"';
const X_REQUESTED_WITH = 'app.netmirror.netmirrornew';

// ─── Helpers ────────────────────────────────────────────────────────────────

function randomHex(bytes) {
  return Array.from({ length: bytes * 2 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

function extractSetCookie(headers, name) {
  const setCookies = headers?.['set-cookie'];
  if (!setCookies) return '';
  const list = Array.isArray(setCookies) ? setCookies : [setCookies];
  for (const h of list) {
    const trimmed = h.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return trimmed.substring(name.length + 1).split(';')[0].trim();
    }
  }
  return '';
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Steps ──────────────────────────────────────────────────────────────────

/**
 * Step 1: GET /mobile/home?app=1 → addhash
 * MITM: x-requested-with is EMPTY on first request
 */
async function step1_fetchAddhash() {
  console.log('\n═══ STEP 1: GET /mobile/home?app=1 → addhash ═══');
  const url = `https://${DOMAIN}/mobile/home?app=1`;

  const res = await axios.get(url, {
    headers: {
      'User-Agent': MOBILE_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'sec-ch-ua': SEC_CH_UA,
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      // MITM line 116: x-requested-with is EMPTY on first home request
      'x-requested-with': '',
    },
    timeout: 15000,
    maxRedirects: 5,
    validateStatus: (s) => s >= 200 && s < 400,
  });

  let encoded = extractSetCookie(res.headers, 'addhash');
  let raw = '';

  if (encoded) {
    raw = decodeURIComponent(encoded);
  } else {
    const body = typeof res.data === 'string' ? res.data : '';
    const m = body.match(/data-hash=["']([^"']+)["']/i) || body.match(/data-addhash=["']([^"']+)["']/i);
    if (m) {
      raw = m[1];
      encoded = encodeURIComponent(raw);
      console.log('  → addhash from HTML body');
    }
  }

  if (!raw) {
    console.error('  ✗ No addhash found!');
    console.log('  Set-Cookie headers:', res.headers['set-cookie']);
    process.exit(1);
  }

  const parts = raw.split('::');
  const flag = parts[parts.length - 1];
  console.log(`  ✓ addhash: ${parts[0].substring(0, 12)}...::${flag} (${parts.length} parts)`);
  console.log(`  ✓ Flag: ${flag} ${flag === 'eb' ? '✅ PLAYBACK' : '⚠️ NOT PLAYBACK'}`);
  return { raw, encoded };
}

/**
 * Step 2: Trigger userver monetag chain
 */
async function step2_triggerUserver(addhashRaw) {
  console.log('\n═══ STEP 2: GET userver → monetag trigger ═══');
  const ffr = encodeURIComponent(addhashRaw);
  const t = Math.random().toString();
  const url = `https://userver.${DOMAIN}/?ffr455=${ffr}&a=y&t=${t}`;
  console.log(`  → ${url.substring(0, 80)}...`);

  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
        'Referer': `https://${DOMAIN}/`,
      },
      timeout: 15000,
      maxRedirects: 10,
      validateStatus: () => true,
    });
    console.log(`  ✓ userver responded: HTTP ${res.status}`);
  } catch (err) {
    console.log(`  ⚠ userver error (non-fatal): ${err.message}`);
  }
}

/**
 * Step 3: Dwell 38s
 */
async function step3_dwell() {
  const seconds = 38;
  console.log(`\n═══ STEP 3: Dwelling ${seconds}s for monetag postback ═══`);
  const start = Date.now();
  for (let i = seconds; i > 0; i -= 5) {
    const chunk = Math.min(i, 5);
    await sleep(chunk * 1000);
    const elapsed = Math.round((Date.now() - start) / 1000);
    process.stdout.write(`  ⏳ ${elapsed}s / ${seconds}s\r`);
  }
  console.log(`  ✓ Dwell complete (${Math.round((Date.now() - start) / 1000)}s)   `);
}

/**
 * Step 4: POST verify2.php → t_hash_t
 * MITM line 12773: body is verify={addhash_url_encoded}, content-length confirms encoding
 */
async function step4_pollVerify2(addhashEncoded) {
  console.log('\n═══ STEP 4: POST verify2.php → t_hash_t ═══');
  const maxAttempts = 60;
  const delayMs = 2500;

  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const res = await axios.post(
        `https://${DOMAIN}/mobile/verify2.php`,
        `verify=${addhashEncoded}`,
        {
          headers: {
            'User-Agent': MOBILE_UA,
            'sec-ch-ua': SEC_CH_UA,
            'sec-ch-ua-mobile': '?1',
            'sec-ch-ua-platform': '"Android"',
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Origin': `https://${DOMAIN}`,
            'Referer': `https://${DOMAIN}/mobile/home?app=1`,
            'Cookie': `addhash=${addhashEncoded}`,
          },
          timeout: 10000,
          validateStatus: () => true,
        }
      );

      const bodyText = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      console.log(`  → verify2 #${i}: HTTP ${res.status} [${bodyText.substring(0, 60)}]`);

      const tHashT = extractSetCookie(res.headers, 't_hash_t');
      if (tHashT) {
        const decoded = decodeURIComponent(tHashT);
        const parts = decoded.split('::');
        console.log(`  ✓ t_hash_t: ${decoded.substring(0, 40)}... (${parts.length} parts)`);
        console.log(`  ✓ Flag: ${parts[3] || '?'} ${parts[3] === 'eb' ? '✅ PLAYBACK' : '⚠️'}`);
        return { encoded: tHashT, raw: decoded };
      }

      if (i < maxAttempts) await sleep(delayMs);
    } catch (err) {
      console.log(`  ⚠ verify2 #${i} error: ${err.message}`);
      if (i < maxAttempts) await sleep(delayMs);
    }
  }
  console.error('  ✗ No t_hash_t after all attempts!');
  process.exit(1);
}

/**
 * Step 5: GET /mobile/home?app=1 — returning-session refresh
 * MITM line 12858: sends BOTH cookies + x-requested-with: app.netmirror.netmirrornew
 */
async function step5_refreshSession(addhashEncoded, tHashTEncoded) {
  console.log('\n═══ STEP 5: GET /mobile/home (returning-session refresh) ═══');
  try {
    const res = await axios.get(`https://${DOMAIN}/mobile/home?app=1`, {
      headers: {
        'Cache-Control': 'max-age=0',
        'User-Agent': MOBILE_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'sec-ch-ua': SEC_CH_UA,
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'Upgrade-Insecure-Requests': '1',
        'X-Requested-With': X_REQUESTED_WITH,
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Dest': 'document',
        'Referer': `https://${DOMAIN}/mobile/home?app=1`,
        'Cookie': `addhash=${addhashEncoded}; t_hash_t=${tHashTEncoded}`,
      },
      timeout: 15000,
      validateStatus: () => true,
    });

    // Check for data-hash in the returned body (3-part hash with ::eb)
    const body = typeof res.data === 'string' ? res.data : '';
    const hashMatch = body.match(/data-hash=["']([^"']+)["']/i);
    if (hashMatch) {
      console.log(`  ✓ data-hash: ${hashMatch[1].substring(0, 40)}...`);
    }
    console.log(`  ✓ Session refresh done (HTTP ${res.status})`);
  } catch (err) {
    console.log(`  ⚠ Session refresh error (non-fatal): ${err.message}`);
  }
}

/**
 * Step 6: Search for content → showId
 */
async function step6_search(sessionCookie) {
  if (DIRECT_CONTENT_ID) {
    console.log(`\n═══ STEP 6: SKIP search — using direct content ID: ${DIRECT_CONTENT_ID} ═══`);
    return { showId: DIRECT_CONTENT_ID, contentId: DIRECT_CONTENT_ID, title: SEARCH_TITLE };
  }

  console.log(`\n═══ STEP 6: Search "${SEARCH_TITLE}" ═══`);
  const ts = Math.floor(Date.now() / 1000);
  const searchCookie = `user_token=${randomHex(16)}; ott=nf`;

  const approaches = [
    { label: 'A) /search.php + user_token', url: `https://${DOMAIN}/search.php`, cookie: searchCookie },
    { label: 'B) /search.php + session', url: `https://${DOMAIN}/search.php`, cookie: sessionCookie },
    { label: 'C) /mobile/search.php + user_token', url: `https://${DOMAIN}/mobile/search.php`, cookie: searchCookie },
  ];

  for (const approach of approaches) {
    try {
      console.log(`\n  → ${approach.label}`);
      const res = await axios.get(approach.url, {
        params: { s: SEARCH_TITLE, t: ts },
        headers: {
          'User-Agent': MOBILE_UA,
          'Cookie': approach.cookie,
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `https://${DOMAIN}/`,
          'sec-ch-ua': SEC_CH_UA,
          'sec-ch-ua-mobile': '?1',
          'sec-ch-ua-platform': '"Android"',
        },
        timeout: 10000,
        validateStatus: () => true,
      });

      const raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      console.log(`    HTTP ${res.status} | ${raw.substring(0, 120)}`);

      const results = res.data?.searchResult || (Array.isArray(res.data) ? res.data : null);
      if (Array.isArray(results) && results.length > 0) {
        console.log(`    ✓ ${results.length} results:`);
        results.slice(0, 5).forEach((r, i) => {
          console.log(`      ${i + 1}. "${r.t || r.title}" (${r.y || r.year}) ID: ${r.id}`);
        });
        const match = results[0];
        const showId = match.id;
        console.log(`    ✓ Using showId: ${showId}`);
        return { showId, contentId: showId, title: match.t || match.title || SEARCH_TITLE };
      } else {
        console.log(`    ✗ No array results`);
      }
    } catch (err) {
      console.log(`    ✗ Error: ${err.message}`);
    }
  }

  console.error('  ✗ All search approaches failed!');
  process.exit(1);
}

/**
 * Step 7: GET /mobile/post.php?id={showId} → episodes (TV)
 * MITM line 16800-16870: returns { episodes: [{ id, s, ep, t, time }] }
 */
async function step7_postDetail(showId, sessionCookie) {
  if (SEASON <= 0 || EPISODE <= 0) {
    console.log('\n═══ STEP 7: SKIP post.php (movie or no S/E specified) ═══');
    return null;
  }

  console.log(`\n═══ STEP 7: GET post.php?id=${showId} → episodes ═══`);
  const ts = Math.floor(Date.now() / 1000);

  try {
    const res = await axios.get(`https://${DOMAIN}/mobile/post.php`, {
      params: { id: showId, t: ts },
      headers: {
        'User-Agent': MOBILE_UA,
        'sec-ch-ua': SEC_CH_UA,
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'X-Requested-With': 'XMLHttpRequest',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
        'Referer': `https://${DOMAIN}/mobile/home?app=1`,
        'Cookie': sessionCookie,
      },
      timeout: 10000,
      validateStatus: () => true,
    });

    const data = res.data;
    console.log(`  → HTTP ${res.status}`);

    if (data?.episodes && Array.isArray(data.episodes)) {
      console.log(`  ✓ ${data.episodes.length} episodes found`);

      // Find target episode
      const targetS = `S${SEASON}`;
      const targetE = `E${EPISODE}`;

      for (const ep of data.episodes) {
        if (ep.s === targetS && ep.ep === targetE) {
          console.log(`  ✓ Found: ${ep.s}${ep.ep} "${ep.t}" → contentId: ${ep.id}`);
          return ep.id;
        }
      }

      // List available episodes for debugging
      console.log(`  ⚠ ${targetS}${targetE} not found. Available:`);
      const seasons = [...new Set(data.episodes.map(e => e.s))];
      for (const s of seasons.slice(0, 5)) {
        const eps = data.episodes.filter(e => e.s === s);
        console.log(`    ${s}: ${eps.map(e => `${e.ep}(${e.id})`).join(', ')}`);
      }
      if (seasons.length > 5) console.log(`    ...and ${seasons.length - 5} more seasons`);
    } else {
      console.log(`  ✗ No episodes array in response`);
      if (data) console.log(`  → Keys: ${Object.keys(data).join(', ')}`);
    }

    return null;
  } catch (err) {
    console.log(`  ✗ post.php error: ${err.message}`);
    return null;
  }
}

/**
 * Step 8: GET /mobile/playlist.php?id={contentId} → server-generated HLS URL
 * MITM line 18079-18131: response has sources[].file with server-generated ?in= hash
 * THIS IS THE KEY STEP — the ?in= hash MUST come from the server, NOT be built client-side
 */
async function step8_playlist(contentId, title, cookie) {
  console.log(`\n═══ STEP 8: GET playlist.php → server HLS URL ═══`);
  const ts = Math.floor(Date.now() / 1000);

  const res = await axios.get(`https://${DOMAIN}/mobile/playlist.php`, {
    params: { id: contentId, t: title, tm: ts },
    headers: {
      'User-Agent': MOBILE_UA,
      'sec-ch-ua': SEC_CH_UA,
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
      'X-Requested-With': X_REQUESTED_WITH,
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
      'Referer': `https://${DOMAIN}/mobile/home?app=1`,
      'Cookie': cookie,
    },
    timeout: 10000,
    validateStatus: () => true,
  });

  const raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  console.log(`  → HTTP ${res.status}, ${raw.length} bytes`);

  const data = Array.isArray(res.data) ? res.data[0] : res.data;
  if (!data?.sources || !Array.isArray(data.sources) || data.sources.length === 0) {
    console.error(`  ✗ No sources in playlist response!`);
    console.log(`  → Response: ${raw.substring(0, 300)}`);
    return null;
  }

  // Show all sources
  console.log(`  ✓ ${data.sources.length} source(s):`);
  data.sources.forEach((s, i) => {
    console.log(`    ${i + 1}. [${s.label}] ${s.file.substring(0, 80)}...`);
  });

  // Show captions count
  const tracks = (data.tracks || []).filter(t => t.kind === 'captions');
  console.log(`  ✓ ${tracks.length} caption track(s)`);

  // Use "Auto" source, or first available
  const autoSource = data.sources.find(s => s.label === 'Auto');
  const source = autoSource || data.sources[0];
  const hlsPath = source.file;

  console.log(`  ✓ Using: [${source.label}] ${hlsPath.substring(0, 80)}...`);

  // Verify the ?in= hash is SERVER-generated (not "unknown")
  const inMatch = hlsPath.match(/[?&]in=([^&]+)/);
  if (inMatch) {
    const inValue = decodeURIComponent(inMatch[1]);
    const inParts = inValue.split('::');
    console.log(`  ✓ Server ?in= hash: ${inParts.length} parts, flag: ${inParts[3] || '?'}`);
    if (inValue.includes('unknown')) {
      console.log(`  ⚠ WARNING: ?in= contains "unknown" — session may not be warmed!`);
    }
  }

  return {
    hlsPath,
    captions: tracks.map(t => ({ url: t.file, language: t.label })),
    title: data.title || title,
  };
}

/**
 * Step 9: POST recentplay
 * MITM line 25217-25257: body is recentplay=SE{showId}, cookie has SE{showId}={contentId}
 */
async function step9_recentplay(showId, cookie) {
  console.log(`\n═══ STEP 9: POST recentplay (SE${showId}) ═══`);
  const seKey = `SE${showId}`;

  try {
    const res = await axios.post(
      `https://${DOMAIN}/mobile/recentplay.php`,
      `recentplay=${seKey}`,
      {
        headers: {
          'User-Agent': MOBILE_UA,
          'sec-ch-ua': SEC_CH_UA,
          'sec-ch-ua-mobile': '?1',
          'sec-ch-ua-platform': '"Android"',
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Origin': `https://${DOMAIN}`,
          'Referer': `https://${DOMAIN}/mobile/home?app=1`,
          'Cookie': cookie,
        },
        timeout: 10000,
        validateStatus: () => true,
      }
    );

    const bodyText = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    console.log(`  ✓ recentplay: HTTP ${res.status} [${bodyText.substring(0, 60)}]`);

    // Check for recentplay cookie in response
    const rpCookie = extractSetCookie(res.headers, 'recentplay');
    if (rpCookie) {
      console.log(`  ✓ recentplay cookie: ${rpCookie}`);
    }
  } catch (err) {
    console.log(`  ⚠ recentplay failed (non-fatal): ${err.message}`);
  }
}

/**
 * Step 10: GET HLS manifest using server URL from playlist.php
 */
async function step10_fetchHLS(hlsPath, cookie) {
  console.log('\n═══ STEP 10: GET HLS manifest ═══');

  // Build full URL
  let hlsUrl = hlsPath;
  if (hlsPath.startsWith('/')) {
    hlsUrl = `https://${DOMAIN}${hlsPath}`;
  }
  console.log(`  → URL: ${hlsUrl.substring(0, 100)}...`);

  const res = await axios.get(hlsUrl, {
    headers: {
      'User-Agent': MOBILE_UA,
      'Accept': '*/*',
      'sec-ch-ua': SEC_CH_UA,
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
      'X-Requested-With': X_REQUESTED_WITH,
      'Origin': `https://${DOMAIN}`,
      'Referer': `https://${DOMAIN}/mobile/home?app=1`,
      'Cookie': cookie,
    },
    timeout: 15000,
    responseType: 'text',
    validateStatus: () => true,
  });

  const body = typeof res.data === 'string' ? res.data : String(res.data);
  console.log(`  → HTTP ${res.status}, ${body.length} bytes`);

  return body;
}

/**
 * Step 11: Validate manifest
 */
async function step11_validate(manifest, cookie) {
  console.log('\n═══ STEP 11: Validate manifest ═══');

  if (!manifest.includes('#EXTM3U')) {
    console.error(`  ✗ NOT a valid HLS manifest!`);
    console.error(`  Preview: ${manifest.substring(0, 300)}`);
    return false;
  }
  console.log('  ✓ Contains #EXTM3U');

  // Extract CDN host
  const cdnMatch = manifest.match(/https:\/\/([^/]+)\/files\/\d+\//) ||
                   manifest.match(/URI="https:\/\/([^"/]+)\/files\//);
  const cdnHost = cdnMatch ? cdnMatch[1] : null;
  if (cdnHost) {
    console.log(`  ✓ CDN host: ${cdnHost}`);
  }

  // Fix empty audio hosts (only fix we apply)
  let rewritten = manifest;
  if (cdnHost && rewritten.includes('https:///')) {
    rewritten = rewritten.replace(/https:\/\/\//g, `https://${cdnHost}/`);
    console.log(`  ✓ Fixed empty audio hosts → https://${cdnHost}/`);
  }

  // Check for stream variants
  const variants = rewritten.split('\n').filter(l => l.trim().startsWith('https://') && l.includes('.m3u8'));
  console.log(`  ✓ ${variants.length} video variant(s)`);

  // Check for audio
  const audioLines = rewritten.split('\n').filter(l => l.includes('#EXT-X-MEDIA') && l.includes('TYPE=AUDIO'));
  console.log(`  ✓ ${audioLines.length} audio track(s)`);

  // Check for empty hosts
  const emptyHosts = (rewritten.match(/https:\/\/\//g) || []).length;
  console.log(`  ${emptyHosts > 0 ? '⚠' : '✓'} Empty audio hosts (https:///): ${emptyHosts}`);

  // Check variant ?in= hashes
  for (const v of variants.slice(0, 2)) {
    const vInMatch = v.match(/[?&]in=([^&\s]+)/);
    if (vInMatch) {
      const inVal = decodeURIComponent(vInMatch[1]);
      const parts = inVal.split('::');
      console.log(`  ✓ Variant ?in=: ${parts.length} parts, flag: ${parts[3] || '?'}`);
    }
  }

  // Test first variant URL against CDN
  if (variants.length > 0) {
    const testUrl = variants[0].trim();
    console.log(`\n  → Testing CDN variant: ${testUrl.substring(0, 80)}...`);
    try {
      const vRes = await axios.get(testUrl, {
        headers: {
          'User-Agent': MOBILE_UA,
          'Referer': `https://${DOMAIN}/`,
        },
        timeout: 8000,
        responseType: 'text',
        validateStatus: () => true,
      });
      const vBody = typeof vRes.data === 'string' ? vRes.data : String(vRes.data);

      if (vRes.status === 200 && vBody.includes('#EXTM3U')) {
        const tsSegments = (vBody.match(/\.ts/g) || []).length;
        const jpgSegments = (vBody.match(/\.jpg|\.jpeg/g) || []).length;
        
        if (tsSegments > 0 && jpgSegments === 0) {
          console.log(`  ✅ CDN ACCEPTED — real .ts segments (${tsSegments} segments)`);
        } else if (jpgSegments > 0 && tsSegments === 0) {
          console.log(`  ⚠️ RATE LIMITED — CDN serving .jpg slideshow`);
        } else {
          console.log(`  ? Variant content: ts=${tsSegments}, jpg=${jpgSegments}`);
        }
      } else if (vBody.includes('Only Valid Users Allowed')) {
        console.log(`  ✗ CDN REJECTED: "Only Valid Users Allowed"`);
      } else {
        console.log(`  → HTTP ${vRes.status}, ${vBody.length} bytes: ${vBody.substring(0, 80)}`);
      }
    } catch (err) {
      console.log(`  ⚠ Variant test failed: ${err.message}`);
    }
  }

  // Print manifest preview
  console.log('\n═══ MANIFEST PREVIEW ═══');
  console.log(rewritten.substring(0, 600));

  return true;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  NetMirror E2E Test (MITM-verified flow)                    ║');
  console.log(`║  Domain: ${DOMAIN}                                          ║`);
  console.log(`║  Search: "${SEARCH_TITLE}" S${SEASON}E${EPISODE}${' '.repeat(Math.max(0, 30 - SEARCH_TITLE.length))}║`);
  if (DIRECT_CONTENT_ID) {
    console.log(`║  Direct ID: ${DIRECT_CONTENT_ID}${' '.repeat(Math.max(0, 35 - DIRECT_CONTENT_ID.length))}║`);
  }
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Step 1: GET home → addhash
  const addhash = await step1_fetchAddhash();

  // Step 2: Trigger userver
  await step2_triggerUserver(addhash.raw);

  // Step 3: Dwell 38s
  await step3_dwell();

  // Step 4: verify2 → t_hash_t
  const tHashT = await step4_pollVerify2(addhash.encoded);

  // Step 5: Refresh session (returning-session home)
  await step5_refreshSession(addhash.encoded, tHashT.encoded);

  // Session cookie for subsequent requests
  const sessionCookie = `addhash=${addhash.encoded}; t_hash_t=${tHashT.encoded}`;

  // Step 6: Search → showId
  const searchResult = await step6_search(sessionCookie);
  let showId = searchResult.showId;
  let contentId = searchResult.contentId;
  const title = searchResult.title;

  // Step 7: post.php → resolve episode ID (TV only)
  if (SEASON > 0 && EPISODE > 0 && !DIRECT_CONTENT_ID) {
    const episodeId = await step7_postDetail(showId, sessionCookie);
    if (episodeId) {
      contentId = episodeId;
    } else {
      console.log(`  ⚠ Using showId as contentId (episode not resolved)`);
    }
  }

  console.log(`\n  📌 Final: showId=${showId}, contentId=${contentId}`);

  // Build cookie with SE{showId}={contentId}
  const cookie = [
    `addhash=${addhash.encoded}`,
    `t_hash_t=${tHashT.encoded}`,
    `SE${showId}=${contentId}`,
  ].join('; ');
  console.log(`  📌 Cookie: ${cookie.substring(0, 100)}...`);

  // Step 8: playlist.php → server-generated HLS URL
  const playlist = await step8_playlist(contentId, title, cookie);
  if (!playlist) {
    console.error('\n❌ playlist.php failed — no HLS URL returned');
    process.exit(1);
  }

  // Step 9: recentplay
  await step9_recentplay(showId, cookie);

  // Step 10: Fetch HLS manifest using server URL
  const manifest = await step10_fetchHLS(playlist.hlsPath, cookie);

  // Step 11: Validate
  const valid = await step11_validate(manifest, cookie);

  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  ${valid ? '✅ SUCCESS' : '❌ FAILED'}  (${elapsed}s total)${' '.repeat(Math.max(0, 38 - elapsed.toString().length))}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  process.exit(valid ? 0 : 1);
}

main().catch((err) => {
  console.error('\n💥 FATAL ERROR:', err.message);
  if (err.response) {
    console.error('  HTTP', err.response.status);
    console.error('  Body:', String(err.response.data).substring(0, 200));
  }
  process.exit(1);
});
