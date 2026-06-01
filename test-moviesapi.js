#!/usr/bin/env node
/**
 * MoviesAPI Stream Test Script
 * 
 * Tests the full MoviesAPI pipeline:
 *   Step 1: Fetch the JSON API to get embed URL + subtitles
 *   Step 2: Load the embed page and extract .m3u8 / .mp4 stream URLs
 * 
 * Usage:
 *   node test-moviesapi.js [tmdbId] [type] [season] [episode]
 * 
 * Examples:
 *   node test-moviesapi.js 1339713          # Movie: "Obsession"
 *   node test-moviesapi.js 1523145          # Movie: "Your Heart Will Be Broken"
 *   node test-moviesapi.js 124364 tv 4 1    # TV: FROM S4E1
 *   node test-moviesapi.js 550              # Movie: Fight Club (known-good classic)
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// ─── Config ──────────────────────────────────────────────────────
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const TIMEOUT_MS = 15000;

// ─── Args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const TMDB_ID = args[0] || '550';          // Default: Fight Club
const TYPE = args[1] || 'movie';
const SEASON = args[2] ? parseInt(args[2]) : undefined;
const EPISODE = args[3] ? parseInt(args[3]) : undefined;

// ─── Helpers ─────────────────────────────────────────────────────
function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(options.headers || {}),
      },
      timeout: TIMEOUT_MS,
    };

    const req = lib.request(reqOptions, (res) => {
      // Follow redirects (up to 5)
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http') 
          ? res.headers.location 
          : `${parsed.protocol}//${parsed.host}${res.headers.location}`;
        const depth = (options._redirectDepth || 0) + 1;
        if (depth > 5) return reject(new Error('Too many redirects'));
        return resolve(fetchUrl(redirectUrl, { ...options, _redirectDepth: depth }));
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: data,
        url: url,
        finalUrl: url,
      }));
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${TIMEOUT_MS}ms`));
    });
    req.end();
  });
}

function extractUrls(html, patterns) {
  const found = [];
  for (const pattern of patterns) {
    let match;
    const regex = new RegExp(pattern, 'gi');
    while ((match = regex.exec(html)) !== null) {
      found.push(match[1] || match[0]);
    }
  }
  return [...new Set(found)];
}

// ─── Step 1: Fetch JSON API ──────────────────────────────────────
async function step1_fetchApi() {
  const apiUrl = TYPE === 'tv' && SEASON && EPISODE
    ? `https://ww2.moviesapi.to/api/tv/${TMDB_ID}/${SEASON}/${EPISODE}`
    : `https://ww2.moviesapi.to/api/movie/${TMDB_ID}`;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📡 STEP 1: Fetch MoviesAPI JSON`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`   URL: ${apiUrl}`);
  console.log(`   TMDB: ${TMDB_ID} | Type: ${TYPE}${SEASON ? ` | S${SEASON}E${EPISODE}` : ''}`);
  console.log();

  try {
    const res = await fetchUrl(apiUrl, {
      headers: {
        'Referer': 'https://moviesapi.to/',
        'Accept': 'application/json, text/plain, */*',
      }
    });

    console.log(`   HTTP Status: ${res.status}`);
    console.log(`   Response Length: ${res.body.length} bytes`);
    
    // Try to parse as JSON
    let json;
    try {
      json = JSON.parse(res.body);
    } catch (e) {
      console.log(`   ❌ Response is NOT valid JSON`);
      console.log(`   First 500 chars: ${res.body.substring(0, 500)}`);
      return null;
    }

    console.log(`   Response keys: [${Object.keys(json).join(', ')}]`);
    
    if (json.video_url) {
      console.log(`   ✅ video_url: ${json.video_url}`);
    } else {
      console.log(`   ❌ No video_url in response!`);
      console.log(`   Full response: ${JSON.stringify(json, null, 2).substring(0, 1000)}`);
    }

    if (json.subtitles) {
      console.log(`   📝 Subtitles: ${Array.isArray(json.subtitles) ? json.subtitles.length : 'not an array'}`);
      if (Array.isArray(json.subtitles) && json.subtitles.length > 0) {
        json.subtitles.forEach((s, i) => {
          console.log(`      [${i}] ${s.label || 'unlabeled'} → ${(s.url || '').substring(0, 80)}...`);
        });
      }
    }

    return json;
  } catch (err) {
    console.log(`   ❌ API Fetch Error: ${err.message}`);
    return null;
  }
}

// ─── Step 2: Load embed page and extract streams ─────────────────
async function step2_loadEmbed(embedUrl) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🌐 STEP 2: Load Embed Page`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`   URL: ${embedUrl}`);
  console.log();

  try {
    // Parse the embed URL to determine the domain
    const parsed = new URL(embedUrl);
    console.log(`   Domain: ${parsed.hostname}`);
    console.log(`   Path: ${parsed.pathname}`);

    const res = await fetchUrl(embedUrl, {
      headers: {
        'Referer': 'https://ww2.moviesapi.to/',
        'Origin': 'https://ww2.moviesapi.to',
      }
    });

    console.log(`   HTTP Status: ${res.status}`);
    console.log(`   Content-Type: ${res.headers['content-type'] || 'unknown'}`);
    console.log(`   Response Length: ${res.body.length} bytes`);
    console.log();

    const body = res.body;

    // ─── Extract m3u8 URLs ─────────
    const m3u8Urls = extractUrls(body, [
      /['"]([^'"]*\.m3u8[^'"]*)['"]/,
      /(?:file|src|source|url)\s*[:=]\s*['"]([^'"]*\.m3u8[^'"]*)['"]/,
      /(https?:\/\/[^\s'"<>]*\.m3u8[^\s'"<>]*)/,
    ]);
    
    // ─── Extract mp4 URLs ──────────
    const mp4Urls = extractUrls(body, [
      /['"]([^'"]*\.mp4[^'"]*)['"]/,
      /(?:file|src|source|url)\s*[:=]\s*['"]([^'"]*\.mp4[^'"]*)['"]/,
      /(https?:\/\/[^\s'"<>]*\.mp4[^\s'"<>]*)/,
    ]);

    // ─── Extract iframe URLs ───────
    const iframeUrls = extractUrls(body, [
      /<iframe[^>]+src\s*=\s*['"]([^'"]+)['"]/,
    ]);

    // ─── Extract jwplayer setup ────
    const jwSetup = extractUrls(body, [
      /jwplayer\([^)]*\)\.setup\(\s*(\{[\s\S]*?\})\s*\)/,
      /sources\s*:\s*\[([^\]]+)\]/,
      /file\s*:\s*['"]([^'"]+)['"]/,
    ]);

    // ─── Extract any streaming patterns ────
    const apiPatterns = extractUrls(body, [
      /['"]([^'"]*\/api\/[^'"]*)['"]/,
      /['"]([^'"]*\/embed[^'"]*)['"]/,
      /['"]([^'"]*\/stream[^'"]*)['"]/,
      /['"]([^'"]*\/playlist[^'"]*)['"]/,
    ]);

    console.log(`   🔍 EXTRACTION RESULTS:`);
    console.log(`   ${'─'.repeat(40)}`);
    
    if (m3u8Urls.length > 0) {
      console.log(`   ✅ M3U8 URLs found: ${m3u8Urls.length}`);
      m3u8Urls.forEach((u, i) => console.log(`      [${i}] ${u.substring(0, 150)}`));
    } else {
      console.log(`   ❌ No .m3u8 URLs found`);
    }

    if (mp4Urls.length > 0) {
      console.log(`   ✅ MP4 URLs found: ${mp4Urls.length}`);
      mp4Urls.forEach((u, i) => console.log(`      [${i}] ${u.substring(0, 150)}`));
    } else {
      console.log(`   ❌ No .mp4 URLs found`);
    }

    if (iframeUrls.length > 0) {
      console.log(`   📺 Iframe URLs found: ${iframeUrls.length}`);
      iframeUrls.forEach((u, i) => console.log(`      [${i}] ${u.substring(0, 150)}`));
    }

    if (jwSetup.length > 0) {
      console.log(`   🎬 JWPlayer sources: ${jwSetup.length}`);
      jwSetup.forEach((u, i) => console.log(`      [${i}] ${u.substring(0, 150)}`));
    }

    if (apiPatterns.length > 0) {
      console.log(`   🔗 API/Stream/Embed paths: ${apiPatterns.length}`);
      apiPatterns.forEach((u, i) => console.log(`      [${i}] ${u.substring(0, 150)}`));
    }

    // Show script tags for debugging
    const scripts = body.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
    console.log(`\n   📜 Script tags found: ${scripts.length}`);
    scripts.forEach((s, i) => {
      const src = s.match(/src\s*=\s*['"]([^'"]+)['"]/);
      const inline = s.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
      if (src) {
        console.log(`      [${i}] External: ${src[1].substring(0, 100)}`);
      } else if (inline.length > 0) {
        console.log(`      [${i}] Inline (${inline.length} chars): ${inline.substring(0, 150).replace(/\n/g, ' ')}...`);
      }
    });

    // If we found iframes, recursively load them
    if (m3u8Urls.length === 0 && mp4Urls.length === 0 && iframeUrls.length > 0) {
      console.log(`\n   ↳ No direct streams found, following iframes...`);
      for (const iframeUrl of iframeUrls) {
        const absUrl = iframeUrl.startsWith('http') ? iframeUrl : `${parsed.protocol}//${parsed.host}${iframeUrl}`;
        await step2_loadEmbed(absUrl);
      }
    }

    // Show raw HTML for debugging if no streams found
    if (m3u8Urls.length === 0 && mp4Urls.length === 0 && jwSetup.length === 0) {
      console.log(`\n   📄 RAW HTML (first 3000 chars):`);
      console.log(`   ${'─'.repeat(40)}`);
      console.log(body.substring(0, 3000));
      console.log(`   ${'─'.repeat(40)}`);
    }

    return { m3u8Urls, mp4Urls, iframeUrls, jwSetup, apiPatterns };
  } catch (err) {
    console.log(`   ❌ Embed Fetch Error: ${err.message}`);
    return null;
  }
}

// ─── Step 3: Validate stream URLs ────────────────────────────────
async function step3_validateStreams(urls) {
  if (!urls || urls.length === 0) return;
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🏥 STEP 3: Validate Stream URLs (HEAD request)`);
  console.log(`${'═'.repeat(60)}`);

  for (const url of urls) {
    try {
      const res = await fetchUrl(url, {
        method: 'HEAD',
        headers: {
          'Referer': 'https://ww2.moviesapi.to/',
          'Origin': 'https://ww2.moviesapi.to',
        }
      });
      const contentType = res.headers['content-type'] || 'unknown';
      const contentLength = res.headers['content-length'] || 'unknown';
      console.log(`   ${res.status === 200 ? '✅' : '⚠️'} [${res.status}] ${url.substring(0, 100)}`);
      console.log(`      Content-Type: ${contentType} | Length: ${contentLength}`);
    } catch (err) {
      console.log(`   ❌ ${url.substring(0, 100)}`);
      console.log(`      Error: ${err.message}`);
    }
  }
}

// ─── Step 4: Test alternative API domains ────────────────────────
async function step4_testAlternatives() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🔄 STEP 4: Test Alternative API Domains`);
  console.log(`${'═'.repeat(60)}`);

  const domains = [
    'ww2.moviesapi.to',
    'moviesapi.to',
    'www.moviesapi.to',
    'ww1.moviesapi.to',
  ];

  const path = TYPE === 'tv' && SEASON && EPISODE
    ? `/api/tv/${TMDB_ID}/${SEASON}/${EPISODE}`
    : `/api/movie/${TMDB_ID}`;

  for (const domain of domains) {
    const url = `https://${domain}${path}`;
    try {
      const res = await fetchUrl(url, {
        headers: { 'Referer': `https://${domain}/` }
      });
      let hasVideo = false;
      try {
        const j = JSON.parse(res.body);
        hasVideo = !!j.video_url;
      } catch(e) {}
      console.log(`   ${hasVideo ? '✅' : '❌'} ${domain} → HTTP ${res.status} | video_url: ${hasVideo} | ${res.body.length} bytes`);
    } catch (err) {
      console.log(`   ❌ ${domain} → ${err.message}`);
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🎬 MoviesAPI Stream Test Script`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`   TMDB ID: ${TMDB_ID}`);
  console.log(`   Type: ${TYPE}`);
  if (SEASON) console.log(`   Season: ${SEASON}, Episode: ${EPISODE}`);
  console.log(`   Time: ${new Date().toISOString()}`);

  // Step 1: JSON API
  const apiResult = await step1_fetchApi();

  // Step 2: Load embed page (if we got a URL)
  let embedResult = null;
  if (apiResult?.video_url) {
    embedResult = await step2_loadEmbed(apiResult.video_url);
  }

  // Step 3: Validate found streams
  const allStreams = [
    ...(embedResult?.m3u8Urls || []),
    ...(embedResult?.mp4Urls || []),
  ];
  if (allStreams.length > 0) {
    await step3_validateStreams(allStreams);
  }

  // Step 4: Test alternative domains
  await step4_testAlternatives();

  // ─── Summary ─────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 SUMMARY`);
  console.log(`${'═'.repeat(60)}`);
  
  if (!apiResult) {
    console.log(`   ❌ API FAILED — ww2.moviesapi.to did not return valid data`);
    console.log(`   🔧 FIX: Check if domain is down or API structure changed`);
  } else if (!apiResult.video_url) {
    console.log(`   ❌ NO VIDEO_URL — API responded but without a playable embed`);
    console.log(`   📦 Full response: ${JSON.stringify(apiResult, null, 2).substring(0, 500)}`);
    console.log(`   🔧 FIX: TMDB ID ${TMDB_ID} may not be available on MoviesAPI`);
  } else if (allStreams.length === 0) {
    console.log(`   ⚠️ EMBED PAGE returned no direct .m3u8/.mp4 streams`);
    console.log(`   🔧 FIX: Page likely requires JavaScript execution (JWPlayer init)`);
    console.log(`   📝 This means the WebView interceptor is needed — check the interceptor JS`);
  } else {
    console.log(`   ✅ STREAMS FOUND: ${allStreams.length}`);
    allStreams.forEach((u, i) => console.log(`      [${i}] ${u.substring(0, 120)}`));
  }
  
  console.log();
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
