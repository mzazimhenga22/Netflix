#!/usr/bin/env node
/**
 * MoviesAPI Stream Test — Puppeteer Edition
 * 
 * Uses headless Chrome (like the TV serverless) to fully render the
 * flixcdn.cyou embed page and capture the actual .m3u8/.mp4 stream URL.
 * 
 * Usage:
 *   node test-moviesapi-puppeteer.js [tmdbId] [type] [season] [episode]
 * 
 * Examples:
 *   node test-moviesapi-puppeteer.js 1339713          # Obsession
 *   node test-moviesapi-puppeteer.js 550              # Fight Club
 *   node test-moviesapi-puppeteer.js 124364 tv 4 1    # FROM S4E1
 */

const puppeteer = require('puppeteer');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
const TIMEOUT_MS = 15000;

// ─── Args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const TMDB_ID = args[0] || '550';
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
        'Accept': 'application/json, text/plain, */*',
        ...(options.headers || {}),
      },
      timeout: TIMEOUT_MS,
    };
    const req = lib.request(reqOptions, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const redir = res.headers.location.startsWith('http')
          ? res.headers.location
          : `${parsed.protocol}//${parsed.host}${res.headers.location}`;
        return resolve(fetchUrl(redir, options));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function getLocalChrome() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  return candidates.find(c => { try { return fs.existsSync(c); } catch { return false; } });
}

// ─── STEP 1: Fetch JSON API ──────────────────────────────────────
async function step1_fetchApi() {
  const apiUrl = TYPE === 'tv' && SEASON && EPISODE
    ? `https://ww2.moviesapi.to/api/tv/${TMDB_ID}/${SEASON}/${EPISODE}`
    : `https://ww2.moviesapi.to/api/movie/${TMDB_ID}`;

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`📡 STEP 1: Fetch MoviesAPI JSON`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`   URL: ${apiUrl}`);

  try {
    const res = await fetchUrl(apiUrl, {
      headers: { 'Referer': 'https://moviesapi.to/' }
    });
    console.log(`   HTTP: ${res.status} | ${res.body.length} bytes`);

    const json = JSON.parse(res.body);
    console.log(`   Keys: [${Object.keys(json).join(', ')}]`);
    console.log(`   video_url: ${json.video_url || '❌ MISSING'}`);
    console.log(`   subtitles: ${Array.isArray(json.subtitles) ? json.subtitles.length : 0}`);
    if (json.upn_url) console.log(`   upn_url: ${json.upn_url}`);
    return json;
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    return null;
  }
}

// ─── STEP 2: Puppeteer — render embed & capture streams ──────────
async function step2_puppeteerResolve(embedUrl) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🎭 STEP 2: Puppeteer — Render Embed Page & Capture Streams`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`   Embed URL: ${embedUrl}`);

  const chromePath = getLocalChrome();
  console.log(`   Chrome: ${chromePath || 'bundled'}`);

  const browser = await puppeteer.launch({
    executablePath: chromePath || undefined,
    headless: 'new',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--no-first-run', '--no-zygote', '--single-process',
      '--disable-extensions', '--autoplay-policy=no-user-gesture-required',
      '--disable-popup-blocking',
    ],
  });

  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  await page.setViewport({ width: 1280, height: 720 });

  // Stealth
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    Object.defineProperty(Navigator.prototype, 'languages', { get: () => ['en-US', 'en'] });
    window.chrome = { runtime: {}, app: {}, csi: () => {}, loadTimes: () => ({}) };
  });

  // Capture ALL network traffic
  const capturedStreams = [];
  const capturedRequests = [];
  const capturedFetches = [];
  
  page.on('response', async (response) => {
    const url = response.url();
    const status = response.status();
    const contentType = response.headers()['content-type'] || '';
    
    // Log all significant responses
    if (!url.includes('google') && !url.includes('yandex') && !url.includes('cloudflare') &&
        !url.includes('favicon') && !url.includes('.css') && !url.includes('.png') &&
        !url.includes('.jpg') && !url.includes('.svg') && !url.includes('.woff')) {
      capturedRequests.push({ url: url.substring(0, 150), status, contentType: contentType.substring(0, 50) });
    }
    
    // Capture stream URLs
    const isStream = url.includes('.m3u8') || url.includes('.mp4') ||
                     url.includes('/playlist') || url.includes('/manifest') ||
                     contentType.includes('mpegurl') || contentType.includes('mp4') ||
                     contentType.includes('video');
    
    if (isStream) {
      let body = '';
      try { body = await response.text(); } catch {}
      capturedStreams.push({
        url,
        status,
        contentType,
        bodyPreview: body.substring(0, 500),
        isM3u8: body.trimStart().startsWith('#EXTM3U'),
      });
      console.log(`   🎯 STREAM CAPTURED: [${status}] ${url.substring(0, 120)}`);
    }

    // Capture API responses that might contain stream data
    if (url.includes('/api/') || url.includes('/embed/') || url.includes('/stream') ||
        url.includes('/source') || url.includes('/video')) {
      let body = '';
      try { body = await response.text(); } catch {}
      capturedFetches.push({ url, status, body: body.substring(0, 2000) });
      console.log(`   📡 API Response: [${status}] ${url.substring(0, 120)}`);
      if (body.length > 0 && body.length < 2000) {
        console.log(`      Body: ${body.substring(0, 300)}`);
      }
    }
  });

  // Navigate
  console.log(`\n   🌐 Navigating...`);
  try {
    await page.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    console.log(`   ✅ Page loaded (domcontentloaded)`);
  } catch (e) {
    console.log(`   ⚠️ Navigation: ${e.message}`);
  }

  // Wait for JS to execute
  console.log(`   ⏳ Waiting 3s for JS initialization...`);
  await new Promise(r => setTimeout(r, 3000));

  // Try clicking play buttons
  console.log(`   🖱️ Attempting auto-click...`);
  try {
    await page.evaluate(() => {
      // Click any play buttons or overlays
      const selectors = [
        'button', '.play-button', '.play-btn', '#play', '.jw-icon-display',
        '[class*="play"]', '[id*="play"]', 'video', '.btn', '.start'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) { el.click(); console.log('Clicked: ' + sel); }
      }
      // Remove overlays
      document.querySelectorAll('div').forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' && parseInt(style.zIndex) > 999) {
          el.click();
          el.remove();
        }
      });
    });
  } catch (e) {
    console.log(`   ⚠️ Click error: ${e.message}`);
  }

  // Wait more for player to init
  console.log(`   ⏳ Waiting 5s for player initialization...`);
  await new Promise(r => setTimeout(r, 5000));

  // Try extracting from page context
  console.log(`\n   🔍 Extracting from page context...`);
  const pageData = await page.evaluate(() => {
    const result = {
      title: document.title,
      videos: [],
      iframes: [],
      jwplayer: null,
      hlsjs: null,
      sources: [],
      globalVars: [],
    };

    // Video elements
    document.querySelectorAll('video').forEach(v => {
      result.videos.push({
        src: v.src || '',
        currentSrc: v.currentSrc || '',
        readyState: v.readyState,
      });
    });

    // Iframes
    document.querySelectorAll('iframe').forEach(f => {
      result.iframes.push(f.src || '');
    });

    // JWPlayer
    try {
      if (typeof window.jwplayer === 'function') {
        const p = window.jwplayer();
        if (p) {
          const playlist = p.getPlaylist ? p.getPlaylist() : [];
          result.jwplayer = {
            state: p.getState ? p.getState() : 'unknown',
            playlist: playlist.map(item => ({
              sources: (item.sources || []).map(s => ({ file: s.file, type: s.type })),
              file: item.file,
            })),
          };
        }
      }
    } catch (e) { result.jwplayer = 'Error: ' + e.message; }

    // HLS.js
    try {
      if (window.Hls) {
        result.hlsjs = 'HLS.js detected';
        // Try to find HLS instances
        document.querySelectorAll('video').forEach(v => {
          if (v._hls || v.hlsPlayer) {
            const hls = v._hls || v.hlsPlayer;
            result.hlsjs = { url: hls.url || 'unknown', levels: hls.levels?.length || 0 };
          }
        });
      }
    } catch (e) {}

    // Source elements
    document.querySelectorAll('source').forEach(s => {
      result.sources.push({ src: s.src, type: s.type });
    });

    // Check for common global variables
    ['playerInstance', 'player', 'videoSrc', 'streamUrl', 'videoUrl', 'hlsUrl'].forEach(name => {
      try {
        if (window[name]) result.globalVars.push({ name, value: String(window[name]).substring(0, 200) });
      } catch {}
    });

    // Check body HTML for encoded data
    const bodyText = document.body?.innerText || '';
    result.bodyTextPreview = bodyText.substring(0, 500);

    return result;
  });

  console.log(`   Page title: "${pageData.title}"`);
  console.log(`   Videos: ${pageData.videos.length}`, pageData.videos);
  console.log(`   Iframes: ${pageData.iframes.length}`, pageData.iframes);
  console.log(`   JWPlayer:`, pageData.jwplayer);
  console.log(`   HLS.js:`, pageData.hlsjs);
  console.log(`   Sources:`, pageData.sources);
  console.log(`   Global vars:`, pageData.globalVars);
  console.log(`   Body text: "${pageData.bodyTextPreview.substring(0, 200)}"`);

  // If there are iframes, try loading them too
  if (pageData.iframes.length > 0 && capturedStreams.length === 0) {
    console.log(`\n   🔄 Following iframes...`);
    for (const iframeUrl of pageData.iframes) {
      if (!iframeUrl || iframeUrl === 'about:blank') continue;
      console.log(`   Loading iframe: ${iframeUrl.substring(0, 120)}`);
      try {
        await page.goto(iframeUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await new Promise(r => setTimeout(r, 3000));
        
        // Try click again
        await page.evaluate(() => {
          document.querySelectorAll('button, [class*="play"]').forEach(el => el.click());
        });
        await new Promise(r => setTimeout(r, 5000));
        
        // Extract again
        const iframeData = await page.evaluate(() => {
          const vids = [];
          document.querySelectorAll('video').forEach(v => {
            vids.push({ src: v.src, currentSrc: v.currentSrc });
          });
          return { title: document.title, videos: vids, bodyLen: document.body?.innerHTML?.length };
        });
        console.log(`   Iframe data:`, iframeData);
      } catch (e) {
        console.log(`   Iframe error: ${e.message}`);
      }
    }
  }

  // ─── Results ───────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`📊 NETWORK CAPTURE RESULTS`);
  console.log(`${'═'.repeat(70)}`);

  console.log(`\n   All requests (${capturedRequests.length}):`);
  capturedRequests.forEach((r, i) => {
    console.log(`   [${i}] [${r.status}] ${r.contentType} → ${r.url}`);
  });

  if (capturedStreams.length > 0) {
    console.log(`\n   ✅ STREAM URLs (${capturedStreams.length}):`);
    capturedStreams.forEach((s, i) => {
      console.log(`   [${i}] [${s.status}] ${s.url.substring(0, 150)}`);
      console.log(`        Type: ${s.contentType} | M3U8: ${s.isM3u8}`);
      if (s.bodyPreview) console.log(`        Preview: ${s.bodyPreview.substring(0, 200)}`);
    });
  } else {
    console.log(`\n   ❌ NO STREAM URLs CAPTURED`);
  }

  if (capturedFetches.length > 0) {
    console.log(`\n   📡 API Responses (${capturedFetches.length}):`);
    capturedFetches.forEach((f, i) => {
      console.log(`   [${i}] [${f.status}] ${f.url.substring(0, 150)}`);
      if (f.body) console.log(`        ${f.body.substring(0, 300)}`);
    });
  }

  // Take screenshot
  const screenshotPath = path.join(__dirname, 'test-moviesapi-screenshot.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`\n   📸 Screenshot: ${screenshotPath}`);

  // Dump full page HTML for analysis
  const html = await page.content();
  const htmlPath = path.join(__dirname, 'test-moviesapi-page.html');
  fs.writeFileSync(htmlPath, html);
  console.log(`   📄 Full HTML: ${htmlPath} (${html.length} bytes)`);

  await browser.close();

  return { capturedStreams, capturedFetches, capturedRequests, pageData };
}

// ─── Main ────────────────────────────────────────────────────────
async function main() {
  console.log(`${'═'.repeat(70)}`);
  console.log(`🎬 MoviesAPI Puppeteer Test — TMDB ${TMDB_ID} (${TYPE})`);
  console.log(`${'═'.repeat(70)}`);

  // Step 1: JSON API
  const apiResult = await step1_fetchApi();
  if (!apiResult?.video_url) {
    console.log(`\n❌ No video_url — stopping.`);
    process.exit(1);
  }

  // Step 2: Puppeteer
  const result = await step2_puppeteerResolve(apiResult.video_url);

  // ─── Summary ─────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`📊 FINAL SUMMARY`);
  console.log(`${'═'.repeat(70)}`);

  if (result.capturedStreams.length > 0) {
    console.log(`   ✅ SUCCESS — ${result.capturedStreams.length} streams found`);
    result.capturedStreams.forEach(s => console.log(`   🎬 ${s.url.substring(0, 150)}`));
  } else {
    console.log(`   ❌ FAILED — No streams captured`);
    console.log(`\n   🔧 DIAGNOSIS:`);
    console.log(`   - The embed page at flixcdn.cyou is a Vite SPA`);
    console.log(`   - Hash fragment: ${apiResult.video_url.split('#')[1] || 'none'}`);
    console.log(`   - The JS bundle resolves the stream dynamically`);
    console.log(`   - Videos on page: ${result.pageData.videos.length}`);
    console.log(`   - Total network requests: ${result.capturedRequests.length}`);
    console.log(`\n   📝 Check test-moviesapi-page.html and test-moviesapi-screenshot.png`);
  }

  console.log();
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
