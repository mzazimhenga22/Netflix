/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NetMirror Mobile API Test Script v2
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Findings from v1:
 *  - /mobile/ API path works, returns valid m3u8
 *  - BUT we get in=unknown placeholder because t_hash_t cookie is set by JS
 *  - We DO get an `addhash` cookie with the same format as t_hash_t
 *  - CDN rejects `in=unknown` with "Only Valid Users Allowed"
 *
 * This v2 tries:
 *  1. Use `addhash` cookie value as the `in` token
 *  2. Parse home page HTML for JS that generates t_hash_t
 *  3. Manually construct the token from the addhash cookie
 *  4. Try adding `::m` suffix (mobile flag seen in captured traffic)
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const BASE = 'https://net52.cc';
const SHOW_ID = process.argv[2] || '80186863';
const EPISODE_ID = process.argv[3] || '';

const USER_AGENT = 'Mozilla/5.0 (Linux; Android 16; sdk_gphone64_x86_64 Build/BE2A.250530.026.D1; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.6943.137 Mobile Safari/537.36 /OS.Gatu v3.0';

function request(urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const headers = {
      'User-Agent': USER_AGENT,
      'Accept': opts.accept || '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity',  // No compression so we get raw text
      'sec-ch-ua': '"Not(A:Brand";v="99", "Android WebView";v="133", "Chromium";v="133"',
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
      'Sec-Fetch-Site': opts.fetchSite || 'same-origin',
      'Sec-Fetch-Mode': opts.fetchMode || 'cors',
      'Sec-Fetch-Dest': opts.fetchDest || 'empty',
      ...(opts.headers || {}),
    };
    if (opts.cookie) headers['Cookie'] = opts.cookie;
    if (opts.referer) headers['Referer'] = opts.referer;
    if (opts.origin) headers['Origin'] = opts.origin;
    if (opts.xhr) headers['X-Requested-With'] = 'XMLHttpRequest';
    if (opts.appMarker) headers['X-Requested-With'] = 'app.netmirror.netmirrornew';

    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: opts.method || 'GET',
      headers,
    }, (res) => {
      let data = '';
      const setCookies = res.headers['set-cookie'] || [];
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, setCookies, body: data, contentType: res.headers['content-type'] || '' }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function parseCookies(setCookieHeaders, existing = '') {
  const jar = {};
  if (existing) existing.split(';').forEach(c => { const [k,...v] = c.trim().split('='); if(k) jar[k.trim()] = v.join('='); });
  for (const h of setCookieHeaders) { const [k,...v] = h.split(';')[0].split('='); if(k) jar[k.trim()] = v.join('='); }
  return Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; ');
}

function div(title) { console.log(`\n${'═'.repeat(70)}\n  ${title}\n${'═'.repeat(70)}`); }

async function main() {
  let cookies = '';
  const tm = Math.floor(Date.now() / 1000).toString();

  // ── STEP 1: Get session cookies ──────────────────────────────────────────
  div('STEP 1: GET /mobile/home?app=1 (get addhash cookie)');
  let addHash = '';
  let homeHtml = '';
  
  const homeRes = await request(`${BASE}/mobile/home?app=1`, {
    appMarker: true,
    fetchSite: 'none', fetchMode: 'navigate', fetchDest: 'document',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    headers: { 'Upgrade-Insecure-Requests': '1' },
  });
  cookies = parseCookies(homeRes.setCookies, cookies);
  homeHtml = homeRes.body;
  console.log(`  Status: ${homeRes.status}, Body: ${homeRes.body.length} bytes`);
  console.log(`  Cookies: ${cookies}`);

  // Extract addhash
  const addHashMatch = cookies.match(/addhash=([^;]+)/);
  if (addHashMatch) {
    addHash = decodeURIComponent(addHashMatch[1]);
    console.log(`  ✅ addhash: ${addHash}`);
  }

  // ── Analyze home page HTML for JS cookie logic ───────────────────────────
  div('STEP 1b: Analyze home page JS for t_hash_t generation');
  
  // Look for cookie-setting patterns in the HTML
  const cookiePatterns = [
    /document\.cookie\s*=\s*["']([^"']*t_hash[^"']*)/gi,
    /t_hash_t\s*[=:]\s*["']?([^"'\s;,]+)/gi,
    /addhash/gi,
    /setCookie\s*\([^)]*t_hash/gi,
    /\.cookie\s*=\s*["']t_hash/gi,
  ];

  let jsFindings = [];
  for (const pat of cookiePatterns) {
    let m;
    while ((m = pat.exec(homeHtml)) !== null) {
      jsFindings.push({ pattern: pat.source.substring(0, 40), match: m[0].substring(0, 120) });
    }
  }

  if (jsFindings.length > 0) {
    console.log(`  Found ${jsFindings.length} JS cookie patterns:`);
    jsFindings.forEach(f => console.log(`    [${f.pattern}] → ${f.match}`));
  } else {
    console.log('  No direct t_hash_t patterns found in HTML');
  }

  // Look for external JS files that might set cookies
  const scriptMatches = homeHtml.match(/<script[^>]+src=["']([^"']+)["']/gi) || [];
  console.log(`\n  External scripts found:`);
  scriptMatches.forEach(s => {
    const srcMatch = s.match(/src=["']([^"']+)/);
    if (srcMatch) console.log(`    → ${srcMatch[1]}`);
  });

  // The key JS file from captured traffic was nf-custom.js
  // Let's fetch it and analyze
  div('STEP 1c: Fetch nf-custom.js (cookie logic)');
  try {
    const jsRes = await request(`${BASE}/mobile/js/nf-custom.js?v=1.40000000`, {
      appMarker: true,
      cookie: cookies,
      referer: `${BASE}/mobile/home?app=1`,
    });
    console.log(`  Status: ${jsRes.status}, Size: ${jsRes.body.length} bytes`);

    // Search for cookie/token generation logic
    const jsBody = jsRes.body;
    
    // Find t_hash / addhash references
    const tokenPatterns = [
      { name: 't_hash_t', regex: /t_hash_t/g },
      { name: 'addhash', regex: /addhash/g },
      { name: 'cookie set', regex: /document\.cookie\s*=/g },
      { name: 'getCookie', regex: /getCookie|get_cookie/gi },
      { name: 'in= token', regex: /[?&]in=/g },
      { name: 'hls path', regex: /\/hls\//g },
      { name: 'playlist.php', regex: /playlist\.php/g },
      { name: 'play function', regex: /function\s+play/gi },
    ];

    console.log(`\n  Token patterns in nf-custom.js:`);
    for (const { name, regex } of tokenPatterns) {
      const matches = jsBody.match(regex);
      console.log(`    ${name}: ${matches ? matches.length + ' occurrences' : 'not found'}`);
    }

    // Extract the most relevant code sections
    // Find context around 'addhash' or 't_hash'
    const contextPatterns = ['addhash', 't_hash', 'hls/', 'in='];
    for (const pat of contextPatterns) {
      const idx = jsBody.indexOf(pat);
      if (idx >= 0) {
        const start = Math.max(0, idx - 100);
        const end = Math.min(jsBody.length, idx + 200);
        const context = jsBody.substring(start, end).replace(/\s+/g, ' ');
        console.log(`\n  📄 Context around '${pat}' (char ${idx}):`);
        console.log(`    ...${context}...`);
      }
    }

    // Print full JS for analysis (last resort)
    console.log(`\n  ── Full nf-custom.js (first 3000 chars) ──`);
    console.log(jsBody.substring(0, 3000));
    console.log(`\n  ── nf-custom.js (last 2000 chars) ──`);
    console.log(jsBody.substring(jsBody.length - 2000));

  } catch (err) {
    console.log(`  ❌ Failed: ${err.message}`);
  }

  // ── STEP 2: Try using addhash as the in token ────────────────────────────
  div('STEP 2: Test different token formats');

  // Format the addhash into different possible `in` token forms
  const tokenCandidates = [];
  if (addHash) {
    tokenCandidates.push({ label: 'addhash raw', token: addHash });
    tokenCandidates.push({ label: 'addhash + ::m', token: addHash + '::m' });
    // The captured t_hash_t had 5 parts: hash1::hash2::timestamp::flag::m
    // addhash has 4 parts: hash1::hash2::timestamp::flag
    // Maybe just adding ::m is enough
    const parts = addHash.split('::');
    if (parts.length >= 3) {
      // Try with just the first hash + generated second hash + timestamp
      tokenCandidates.push({ label: 'hash1 only', token: parts[0] });
      tokenCandidates.push({ label: 'first 3 parts + ::m', token: `${parts[0]}::${parts[1]}::${parts[2]}::m` });
    }
  }

  // Also try making a cookie string with t_hash_t set to addhash value
  const cookieWithTHash = addHash
    ? `${cookies}; t_hash_t=${encodeURIComponent(addHash + '::m')}`
    : cookies;

  let episodeId = EPISODE_ID || SHOW_ID;

  // ── STEP 3: Test playlist with proper cookies ────────────────────────────
  div('STEP 3: Playlist with t_hash_t cookie injected');
  try {
    const res = await request(`${BASE}/mobile/playlist.php?id=${episodeId}&t=test&tm=${tm}`, {
      appMarker: true,
      cookie: cookieWithTHash,
      referer: `${BASE}/mobile/home?app=1`,
    });
    console.log(`  Status: ${res.status}`);
    console.log(`  Body: ${res.body.substring(0, 500)}`);
    
    // Check if the `in` token is different now
    const inMatch = res.body.match(/in=([^&"'\s]+)/);
    if (inMatch) {
      console.log(`  🔑 in-token from playlist: ${inMatch[1]}`);
      if (inMatch[1] !== 'unknown::ek' && !inMatch[1].includes('unknown')) {
        console.log(`  ✅ GOT A REAL TOKEN!`);
        tokenCandidates.unshift({ label: 'from playlist response', token: inMatch[1] });
      }
    }
  } catch (err) {
    console.log(`  ❌ ${err.message}`);
  }

  // ── STEP 4: Try each token against the CDN ──────────────────────────────
  div('STEP 4: Test each token against CDN');

  for (const { label, token } of tokenCandidates) {
    console.log(`\n  🔑 Testing: "${label}" → in=${token.substring(0, 60)}...`);
    
    // First try getting the HLS manifest with this token
    try {
      const hlsUrl = `${BASE}/mobile/hls/${episodeId}.m3u8?in=${encodeURIComponent(token)}&hd=on&lang=eng`;
      const hlsRes = await request(hlsUrl, {
        appMarker: true,
        cookie: cookieWithTHash,
        referer: `${BASE}/mobile/home?app=1`,
      });
      
      console.log(`    M3U8 status: ${hlsRes.status}, size: ${hlsRes.body.length}`);
      
      if (hlsRes.body.includes('#EXTM3U')) {
        // Check if we got real file IDs or poisoned 220884
        const has220884 = hlsRes.body.includes('/220884/');
        const hasRealId = hlsRes.body.includes(`/${episodeId}/`);
        const hasUnknown = hlsRes.body.includes('in=unknown');
        
        console.log(`    Poisoned (220884): ${has220884 ? '❌ YES' : '✅ NO'}`);
        console.log(`    Real ID (${episodeId}): ${hasRealId ? '✅ YES' : '⚠️ NO'}`);
        console.log(`    Has in=unknown: ${hasUnknown ? '❌ YES' : '✅ NO'}`);

        // Extract a CDN URL to test
        const cdnMatch = hlsRes.body.match(/(https:\/\/s\d+\.freecdn\d+\.top[^\s]+\.m3u8[^\s]*)/);
        if (cdnMatch) {
          console.log(`    CDN URL: ${cdnMatch[1].substring(0, 100)}`);
          
          try {
            const cdnRes = await request(cdnMatch[1], {
              origin: BASE,
              referer: `${BASE}/`,
              fetchSite: 'cross-site',
              appMarker: true,
            });
            console.log(`    CDN status: ${cdnRes.status}, size: ${cdnRes.body.length}`);
            
            if (cdnRes.body.includes('#EXTINF')) {
              console.log(`    ✅✅✅ CDN RETURNED VALID HLS SEGMENTS!`);
              
              // Test a segment
              const segLines = cdnRes.body.split('\n').filter(l => l.trim() && !l.startsWith('#'));
              if (segLines.length > 0) {
                let segUrl = segLines[0].trim();
                if (!segUrl.startsWith('http')) {
                  const cdnBase = cdnMatch[1].substring(0, cdnMatch[1].lastIndexOf('/') + 1);
                  segUrl = cdnBase + segUrl;
                }
                
                const segRes = await request(segUrl, {
                  origin: BASE,
                  referer: `${BASE}/`,
                  fetchSite: 'cross-site',
                  appMarker: true,
                });
                console.log(`    Segment: status=${segRes.status}, size=${segRes.body.length} (${(segRes.body.length/1024).toFixed(1)}KB)`);
                if (segRes.status === 200 && segRes.body.length > 1000) {
                  console.log(`    🎉🎉🎉 SEGMENT DOWNLOADED! Token "${label}" WORKS!`);
                }
              }
            } else if (cdnRes.body.includes('Only Valid')) {
              console.log(`    ❌ "Only Valid Users Allowed" — token rejected`);
            } else {
              console.log(`    ⚠️ Unexpected: ${cdnRes.body.substring(0, 100)}`);
            }
          } catch (err) {
            console.log(`    CDN error: ${err.message}`);
          }
        }
      }
    } catch (err) {
      console.log(`    Error: ${err.message}`);
    }
  }

  // ── STEP 5: Try the desktop/non-mobile API for comparison ────────────────
  div('STEP 5: Compare with desktop API (our current approach)');
  try {
    // Generate a session token like our code does
    const sessionToken = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const desktopCookie = `user_token=${sessionToken}; ott=nf;`;

    // Desktop search
    console.log(`  Searching desktop API for show ID...`);
    const searchRes = await request(`${BASE}/search.php?s=The+Umbrella+Academy&t=${tm}`, {
      cookie: desktopCookie,
      xhr: true,
      referer: `${BASE}/home`,
    });
    console.log(`  Search: status=${searchRes.status}, size=${searchRes.body.length}`);
    console.log(`  Body: ${searchRes.body.substring(0, 300)}`);

    // Desktop play.php for H-token
    if (searchRes.body.includes('searchResult')) {
      const data = JSON.parse(searchRes.body);
      const results = data.searchResult || [];
      if (results.length > 0) {
        const firstId = results[0].id;
        console.log(`\n  Found ID: ${firstId}. Getting H-token via play.php...`);
        
        const playRes = await request(`${BASE}/play.php`, {
          method: 'POST',
          cookie: `${desktopCookie} hd=on;`,
          xhr: true,
          referer: `${BASE}/`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `id=${firstId}`,
        });
        console.log(`  play.php: status=${playRes.status}`);
        console.log(`  Body: ${playRes.body.substring(0, 200)}`);
        
        const playData = JSON.parse(playRes.body);
        if (playData.h && playData.h !== 'error') {
          console.log(`  ✅ H-token: ${playData.h.substring(0, 60)}...`);
          
          // Now try using this H-token on the MOBILE hls endpoint!
          console.log(`\n  🔄 Cross-testing: desktop H-token on /mobile/hls/ endpoint...`);
          const crossRes = await request(`${BASE}/mobile/hls/${firstId}.m3u8?in=${encodeURIComponent(playData.h)}&hd=on&lang=eng`, {
            appMarker: true,
            cookie: cookies,
            referer: `${BASE}/mobile/home?app=1`,
          });
          console.log(`  Status: ${crossRes.status}, Size: ${crossRes.body.length}`);
          if (crossRes.body.includes('#EXTM3U')) {
            const hasUnknown = crossRes.body.includes('in=unknown');
            const has220884 = crossRes.body.includes('/220884/');
            console.log(`  Has in=unknown: ${hasUnknown}`);
            console.log(`  Has 220884 (poison): ${has220884}`);
            console.log(`  Manifest:\n    ${crossRes.body.replace(/\n/g, '\n    ')}`);
            
            // Test CDN with the H-token
            const cdnMatch = crossRes.body.match(/(https:\/\/s\d+\.freecdn\d+\.top[^\s]+\.m3u8[^\s]*)/);
            if (cdnMatch) {
              // Replace in=unknown with the h-token
              let cdnUrl = cdnMatch[1];
              if (cdnUrl.includes('in=unknown')) {
                cdnUrl = cdnUrl.replace(/in=unknown[^&\s]*/g, playData.h);
              }
              console.log(`\n  Testing CDN with H-token: ${cdnUrl.substring(0, 120)}`);
              const cdnRes = await request(cdnUrl, {
                origin: BASE,
                referer: `${BASE}/`,
                fetchSite: 'cross-site',
                appMarker: true,
              });
              console.log(`  CDN: status=${cdnRes.status}, size=${cdnRes.body.length}`);
              console.log(`  Body: ${cdnRes.body.substring(0, 200)}`);
            }
          }
        }
      }
    }
  } catch (err) {
    console.log(`  ❌ Desktop API error: ${err.message}`);
  }

  div('DONE');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
