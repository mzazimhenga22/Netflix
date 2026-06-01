const functions = require('@google-cloud/functions-framework');
const puppeteer = require('puppeteer');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Netflix Stream Resolver - Google Cloud Function
 *
 * Accepts POST with { tmdbId, type, season?, episode?, forceSource? }
 * Returns JSON: { url, headers, captions, markers, sourceId }
 */

let USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

let browserWSEndpoint = null;
let net52PlaybackSession = null;

const NET52_SESSION_TTL_MS = 5 * 60 * 1000;
const NET52_CAPTURE_LIMIT = 32;

function getLocalChromeExecutablePath() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);

  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch (_) {
      return false;
    }
  }) || null;
}

function getChromeUserDataDir() {
  const configured =
    process.env.CHROME_USER_DATA_DIR ||
    process.env.PUPPETEER_USER_DATA_DIR;

  if (configured) {
    return configured;
  }

  return path.join(os.tmpdir(), 'netflixtv-chrome-profile');
}

async function applyStealth(page) {
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    Object.defineProperty(Navigator.prototype, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'Win32' });
    Object.defineProperty(Navigator.prototype, 'vendor', { get: () => 'Google Inc.' });
    window.chrome = { runtime: {}, app: {}, csi: () => { }, loadTimes: () => ({}) };
    const getParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (p) {
      if (p === 37445) return 'Intel Inc.';
      if (p === 37446) return 'Intel Iris OpenGL Engine';
      return getParam.call(this, p);
    };
  });
}

async function getBrowser() {
  if (browserWSEndpoint) {
    try {
      const browser = await puppeteer.connect({ browserWSEndpoint });
      await browser.version();
      return browser;
    } catch (_) {
      browserWSEndpoint = null;
    }
  }

  const browser = await puppeteer.launch({
    executablePath: getLocalChromeExecutablePath() || undefined,
    userDataDir: getChromeUserDataDir(),
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--mute-audio',
      '--hide-scrollbars',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-popup-blocking',
    ],
  });

  browserWSEndpoint = browser.wsEndpoint();
  return browser;
}

async function resolveVidLink(page, tmdbId, type, season, episode) {
  const embedUrl =
    type === 'tv' && season && episode
      ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`
      : `https://vidlink.pro/movie/${tmdbId}`;

  console.log(`[VidLink] Loading: ${embedUrl}`);

  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('VidLink timeout (12s)'));
    }, 12000);

    page.on('response', async (response) => {
      const url = response.url();
      if (!url.includes('/api/b/')) return;

      try {
        const text = await response.text();
        if (!text) return;

        const json = JSON.parse(text);
        if (json?.stream?.playlist) {
          clearTimeout(timeout);
          console.log(`[VidLink] Playlist found: ${json.stream.playlist.substring(0, 80)}`);
          resolve(parseVidLinkResponse(json));
        }
      } catch (e) {
        console.log(`[VidLink] Parse error on /api/b/: ${e.message}`);
      }
    });

    try {
      await page.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      console.log('[VidLink] Page loaded, waiting for /api/b/ response...');
      await delay(1000);
      await autoClickPlay(page);
      await delay(1500);
      await autoClickPlay(page);
    } catch (e) {
      clearTimeout(timeout);
      reject(new Error(`VidLink navigation error: ${e.message}`));
    }
  });
}

function parseVidLinkResponse(data) {
  const stream = data.stream;
  const playlistUrl = stream.playlist.replace(/%2F/gi, '/');

  const headers = {};
  if (stream.headers && typeof stream.headers === 'object') {
    Object.assign(headers, stream.headers);
  }

  const isFileProxy = /\/proxy\/file\d+\//i.test(playlistUrl);
  if (isFileProxy && !headers.Referer) {
    headers.Referer = 'https://vidlink.pro/';
    headers.Origin = 'https://vidlink.pro';
  }
  if (!headers['User-Agent']) {
    headers['User-Agent'] = USER_AGENT;
  }

  const captions = (stream.captions || []).map((caption) => ({
    id: caption.id || caption.url,
    url: caption.url,
    language: caption.language || 'Unknown',
    type: caption.type || 'vtt',
  }));

  const markers = [];
  if (stream.intro) {
    markers.push({
      type: 'intro',
      start: stream.intro.start || 0,
      end: stream.intro.end || 0,
    });
  }
  if (stream.outro) {
    markers.push({
      type: 'outro',
      start: stream.outro.start || 0,
      end: stream.outro.end || 0,
    });
  }
  if (Array.isArray(stream.skips)) {
    stream.skips.forEach((skip) => {
      let skipType = 'outro';
      if (skip.type === 'intro' || skip.type === 1) skipType = 'intro';
      else if (skip.type === 'outro' || skip.type === 2) skipType = 'outro';
      markers.push({
        type: skipType,
        start: skip.start || 0,
        end: skip.end || 0,
      });
    });
  }

  return {
    url: playlistUrl,
    headers,
    captions,
    markers,
    sourceId: data.sourceId || 'vidlink',
    expiresAt: extractExpiryTimestamp(playlistUrl),
  };
}

function isLikelyEphemeralStream(result) {
  const url = result?.url || '';
  const lower = url.toLowerCase();

  if (!url) return true;
  if (/\/proxy\/file\d+\//i.test(url)) return true;
  if (/[?&](token|expires|expiry|signature|sig|auth|hdnts|hdntl|md5|policy)=/i.test(url)) {
    return true;
  }

  return ['vidlink', 'moviesapi'].includes((result?.sourceId || '').toLowerCase()) &&
    (lower.includes('/proxy/') || lower.includes('token=') || lower.includes('expires='));
}

function parseEpochLike(value) {
  if (!value) return null;
  const digits = String(value).match(/\d{10,13}/);
  if (!digits) return null;
  const raw = Number(digits[0]);
  if (!Number.isFinite(raw)) return null;
  return raw > 1e12 ? raw : raw * 1000;
}

function extractExpiryTimestamp(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;
    const directKeys = ['expires', 'expiry', 'exp', 'e', 'expiresAt', 'v'];
    for (const key of directKeys) {
      const value = params.get(key);
      const timestamp = parseEpochLike(value);
      if (timestamp) {
        // Subtract 10 minutes (600,000 ms) as a safety buffer
        return Math.max(Date.now() + 5000, timestamp - 600000);
      }
    }

    const packedKeys = ['hdntl', 'hdnts', 'token', 'auth'];
    for (const key of packedKeys) {
      const value = params.get(key);
      if (!value) continue;
      const nestedMatch = value.match(/(?:^|[~&])exp=(\d{10,13})(?:[~&]|$)/i);
      if (nestedMatch) {
        const timestamp = parseEpochLike(nestedMatch[1]);
        if (timestamp) {
          return Math.max(Date.now() + 5000, timestamp - 600000);
        }
      }
    }
  } catch (_) { }

  return null;
}

function parseM3u8Lines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isM3u8Text(text) {
  return parseM3u8Lines(text)[0] === '#EXTM3U';
}

function parseHlsVariants(masterText, baseUrl) {
  const lines = parseM3u8Lines(masterText);
  const variants = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;

    const uriLine = lines[i + 1];
    if (!uriLine || uriLine.startsWith('#')) continue;

    const attrs = line.slice('#EXT-X-STREAM-INF:'.length);
    const bandwidthMatch = attrs.match(/BANDWIDTH=(\d+)/i);
    const resolutionMatch = attrs.match(/RESOLUTION=(\d+)x(\d+)/i);

    variants.push({
      url: resolvePlaylistUrl(uriLine, baseUrl),
      bandwidth: bandwidthMatch ? Number(bandwidthMatch[1]) : 0,
      width: resolutionMatch ? Number(resolutionMatch[1]) : 0,
      height: resolutionMatch ? Number(resolutionMatch[2]) : 0,
    });
  }

  return variants.sort((a, b) => {
    const pixelDelta = (b.width * b.height) - (a.width * a.height);
    if (pixelDelta !== 0) return pixelDelta;
    return b.bandwidth - a.bandwidth;
  });
}

async function fetchPlaylistText(url, headers) {
  const response = await fetch(url, { headers });
  const text = await response.text();
  return { response, text };
}

function getHeaderHost(url) {
  try {
    return new URL(url).origin;
  } catch (_) {
    return 'https://net52.cc';
  }
}

function getGatewayHeadersForUrl(url, cookie = '') {
  const origin = getHeaderHost(url);
  const headers = {
    'User-Agent': USER_AGENT,
    'Referer': `${origin}/`,
    'Origin': origin,
    'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
  };
  if (cookie) headers.Cookie = cookie;
  return headers;
}

function extractMediaUriMap(masterText) {
  const map = new Map();
  for (const line of String(masterText || '').split(/\r?\n/)) {
    const match = line.match(/URI="([^"]+)"/);
    if (!match) continue;

    try {
      const parsed = new URL(match[1]);
      map.set(parsed.pathname, match[1]);
    } catch (_) { }
  }
  return map;
}

async function normalizeNet22Master(masterText, net52MasterUrl = '') {
  let normalized = String(masterText || '');

  // ── STEP 1: Resolve https:/// URLs (net22 returns hostless CDN paths) ──
  // net22.cc m3u8 uses `https:///files/...` (triple-slash, no hostname).
  // We need to discover the actual CDN hostname and inject it.
  const hasHostlessUrls =
    normalized.includes('https:///files/') ||
    normalized.includes('https:///');

  if (hasHostlessUrls) {
    let cdnHost = null;

    // Strategy A: Fetch net52's version to discover the CDN hostname
    // net52 returns full URLs like https://s22.nm-cdn11.top/files/...
    if (net52MasterUrl) {
      try {
        const reference = await fetchPlaylistText(
          net52MasterUrl,
          getGatewayHeadersForUrl(net52MasterUrl)
        );

        if (reference.response.ok && isM3u8Text(reference.text)) {
          // Extract CDN host from net52's audio URIs (always have correct IDs)
          const audioHostMatch = reference.text.match(
            /URI="https?:\/\/([^/]+)\/files\/\d+\/a\//
          );
          if (audioHostMatch) {
            cdnHost = audioHostMatch[1];
            console.log(`[NetMirror] CDN host from net52 audio: ${cdnHost}`);
          }

          // Fallback: extract from video variant URLs
          if (!cdnHost) {
            const videoHostMatch = reference.text.match(
              /https?:\/\/([^/]+)\/files\/\d+\/(1080p|720p|480p)\//
            );
            if (videoHostMatch) {
              cdnHost = videoHostMatch[1];
              console.log(`[NetMirror] CDN host from net52 video: ${cdnHost}`);
            }
          }

          // Build a full URI map from the reference for audio tracks
          const mediaUriMap = extractMediaUriMap(reference.text);

          // Replace URI="https:///..." in audio/media tags using the reference map
          if (mediaUriMap.size > 0) {
            normalized = normalized.replace(
              /URI="https:\/\/\/([^"]+)"/g,
              (match, pathWithoutSlash) => {
                const pathname = `/${pathWithoutSlash}`;
                const replacement = mediaUriMap.get(pathname);
                if (replacement) return `URI="${replacement}"`;
                // If not in map but we have a CDN host, construct the URL
                if (cdnHost) return `URI="https://${cdnHost}/${pathWithoutSlash}"`;
                return match;
              }
            );
          }
        }
      } catch (e) {
        console.log(`[NetMirror] Reference fetch failed: ${e.message}`);
      }
    }

    // Replace remaining bare https:/// URLs (variant playlist lines) with CDN host
    if (cdnHost) {
      normalized = normalized.replace(
        /https:\/\/\/(files\/)/g,
        `https://${cdnHost}/$1`
      );
      console.log(`[NetMirror] Resolved ${(normalized.match(new RegExp(cdnHost, 'g')) || []).length} CDN URLs`);
    } else {
      console.log(`[NetMirror] ⚠️ Could not resolve CDN hostname for hostless URLs`);
    }
  }

  // ── STEP 2: Detect and fix poisoned content IDs ──
  // Some m3u8 responses swap the real content ID with decoy IDs in video variants.
  // Audio URIs always contain the correct ID, so use them as reference.
  if (net52MasterUrl) {
    const realIdMatch = net52MasterUrl.match(/\/hls\/(\d+)\.m3u8/);
    if (realIdMatch) {
      const realId = realIdMatch[1];

      // Check if video variant IDs differ from the real content ID
      const videoIdMatch = normalized.match(
        /\/files\/(\d+)\/(1080p|720p|480p)\//
      );
      const videoId = videoIdMatch ? videoIdMatch[1] : null;

      if (videoId && videoId !== realId) {
        console.log(`[NetMirror] Poisoned IDs detected: video=${videoId}, real=${realId}. Un-poisoning...`);

        // Also fix the CDN host if video host differs from audio host
        const audioHostMatch = normalized.match(
          /URI="https?:\/\/([^/]+)\/files\/\d+\/a\//
        );
        const videoHostMatch = normalized.match(
          /https?:\/\/([^/]+)\/files\/\d+\/(1080p|720p|480p)\//
        );
        const audioHost = audioHostMatch?.[1];
        const videoHost = videoHostMatch?.[1];

        // Replace poisoned IDs in video variant paths
        normalized = normalized.replace(
          new RegExp(`/files/${videoId}/(1080p|720p|480p)/`, 'g'),
          `/files/${realId}/$1/`
        );

        // Replace wrong CDN host in video variants if audio host differs
        if (videoHost && audioHost && videoHost !== audioHost) {
          // Only replace the host in video variant lines, not audio URIs
          const lines = normalized.split('\n');
          normalized = lines
            .map((line) => {
              // Only replace host in non-URI-attribute lines (bare variant URLs)
              // and in lines that contain video quality paths
              if (
                !line.includes('URI="') &&
                line.includes(`/files/${realId}/`) &&
                (line.includes('/1080p/') ||
                  line.includes('/720p/') ||
                  line.includes('/480p/'))
              ) {
                return line.replace(
                  new RegExp(videoHost.replace(/\./g, '\\.'), 'g'),
                  audioHost
                );
              }
              return line;
            })
            .join('\n');
          console.log(`[NetMirror] Video host fixed: ${videoHost} → ${audioHost}`);
        }
      }
    }
  }

  // ── STEP 3: Normalize known CDN domain aliases ──
  normalized = normalized.replace(
    /https:\/\/(s\d+)\.nm-cdn4\.top\//gi,
    'https://$1.freecdn4.top/'
  );

  return normalized;
}

/**
 * Navigate to net52.cc's play page for a given content ID using the persistent
 * browser session, start the embedded player, and intercept the REAL master m3u8.
 *
 * This keeps the session alive so the HLS proxy can immediately serve the
 * variant playlists from the same captured network traffic.
 */
async function interceptMasterPlaylistViaBrowser(contentId, net52MasterUrl) {
  try {
    // This launches Puppeteer, goes to post.php, clicks play, and captures traffic
    const session = await ensureNet52PlaybackSession(contentId, '', net52MasterUrl);
    
    if (session && session.captured) {
      // Find the un-poisoned master playlist in the captured network traffic
      const capturedMaster = Array.from(session.captured.values()).find(
        c => c.url.includes('.m3u8') && 
             c.body && 
             typeof c.body === 'string' &&
             c.body.includes('#EXT-X-STREAM-INF') && 
             !c.body.includes('220884') && 
             !c.body.includes('125193')
      );

      if (capturedMaster) {
        return capturedMaster.body;
      }
      
      // If we didn't find it in the organic capture, try fetching it directly
      // within the authenticated page context
      console.log('[NetMirror] Browser interception: no organic capture, trying in-page fetch...');
      if (session.page && !session.page.isClosed()) {
        const inPageResult = await session.page.evaluate(async (id) => {
          try {
            const res = await fetch('/hls/' + id + '.m3u8?in=unknown::ek', {
              credentials: 'include',
              headers: { 'Accept': '*/*' }
            });
            if (res.ok) return await res.text();
          } catch(e) {}
          return null;
        }, contentId);

        if (inPageResult && inPageResult.includes('#EXTM3U') && 
            !inPageResult.includes('220884') && !inPageResult.includes('125193')) {
          console.log('[NetMirror] ✅ Captured master via in-page fetch!');
          return inPageResult;
        }
      }
    }
    return null;
  } catch (e) {
    console.log(`[NetMirror] Browser interception error: ${e.message}`);
    return null;
  }
}

function getFirstM3u8Entry(text, baseUrl) {
  const lines = parseM3u8Lines(text);
  const firstEntry = lines.find((line) => !line.startsWith('#'));
  return firstEntry ? resolvePlaylistUrl(firstEntry, baseUrl) : null;
}

async function validatePlayableVideoVariant(masterText, masterUrl) {
  const variants = parseHlsVariants(masterText, masterUrl);
  if (!variants.length) {
    return { ok: true, checkedUrl: masterUrl, mode: 'single-playlist' };
  }

  const headersToTry = [
    {
      'User-Agent': USER_AGENT,
      'Referer': 'https://net52.cc/',
      'Origin': 'https://net52.cc',
      'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
    },
    {
      'User-Agent': USER_AGENT,
      'Referer': 'https://net52.cc/',
      'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
    },
    {
      'User-Agent': USER_AGENT,
      'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
    },
  ];

  let lastStatus = null;
  let lastPreview = '';

  for (const variant of variants) {
    for (const headers of headersToTry) {
      try {
        const child = await fetchPlaylistText(variant.url, headers);
        lastStatus = child.response.status;
        lastPreview = child.text.slice(0, 120).replace(/\s+/g, ' ');

        if (child.response.ok && isM3u8Text(child.text)) {
          return {
            ok: true,
            checkedUrl: variant.url,
            mode: 'direct-video-child',
          };
        }
      } catch (e) {
        lastPreview = e.message;
      }
    }
  }

  return {
    ok: false,
    checkedUrl: variants[0]?.url || masterUrl,
    status: lastStatus,
    preview: lastPreview,
  };
}

async function verifyHlsChain(url, headers = {}, options = {}) {
  const { signal, maxDepth = 3 } = options;
  let currentUrl = url;
  let depth = 0;
  let lastStatus = null;

  while (currentUrl && depth <= maxDepth) {
    const response = await fetch(currentUrl, {
      method: 'GET',
      headers,
      signal,
    });
    lastStatus = response.status;

    if (!response.ok) {
      return { healthy: false, status: response.status, checkedUrl: currentUrl };
    }

    const text = await response.text();
    if (!isM3u8Text(text)) {
      const lower = text.trim().toLowerCase();
      const looksLikeHtml =
        lower.startsWith('<') ||
        lower.includes('<html') ||
        lower.includes('<!doctype') ||
        lower.includes('<body') ||
        lower.includes('<h1') ||
        lower.includes('<script') ||
        lower.includes('only valid users allowed');

      if (looksLikeHtml) {
        return {
          healthy: false,
          status: response.status,
          checkedUrl: currentUrl,
          error: 'HTML_block_page',
        };
      }
      return {
        healthy: false,
        status: response.status,
        checkedUrl: currentUrl,
        error: 'NON_M3U8_TEXT_RESPONSE',
      };
    }

    const nextUrl = getFirstM3u8Entry(text, currentUrl);
    if (!nextUrl) {
      return { healthy: false, status: response.status, checkedUrl: currentUrl };
    }

    if (!nextUrl.includes('.m3u8')) {
      const leafResponse = await fetch(nextUrl, {
        method: 'GET',
        headers,
        signal,
      });
      return {
        healthy: leafResponse.ok,
        status: leafResponse.status,
        checkedUrl: nextUrl,
      };
    }

    currentUrl = nextUrl;
    depth += 1;
  }

  return { healthy: true, status: lastStatus, checkedUrl: currentUrl || url };
}

async function resolveNet52DirectStream(masterUrl) {
  const gatewayHeaders = {
    'User-Agent': USER_AGENT,
    'Referer': 'https://net52.cc/',
    'Origin': 'https://net52.cc',
    'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
  };

  const master = await fetchPlaylistText(masterUrl, gatewayHeaders);
  if (!master.response.ok || !isM3u8Text(master.text)) {
    throw new Error(`NetMirror: master m3u8 invalid (status ${master.response.status})`);
  }

  const variants = parseHlsVariants(master.text, masterUrl);
  if (!variants.length) {
    return {
      url: masterUrl,
      headers: gatewayHeaders,
      checkedUrl: masterUrl,
      mode: 'gateway',
    };
  }

  for (const variant of variants) {
    const candidateHeaders = [
      {},
      { 'User-Agent': USER_AGENT },
      gatewayHeaders,
    ];

    for (const headers of candidateHeaders) {
      try {
        const child = await fetchPlaylistText(variant.url, headers);
        if (!child.response.ok || !isM3u8Text(child.text)) continue;

        console.log(
          `[NetMirror] Direct CDN variant OK: ${variant.height || '?'}p ${variant.url.substring(0, 120)}`
        );

        return {
          url: variant.url,
          headers,
          checkedUrl: variant.url,
          mode: 'direct-cdn',
        };
      } catch (_) { }
    }
  }

  console.log('[NetMirror] No direct CDN variant validated, keeping gateway master URL');
  return {
    url: masterUrl,
    headers: gatewayHeaders,
    checkedUrl: masterUrl,
    mode: 'gateway',
  };
}

/* ═══════════════════════════════════════════════════════════════════════
 * HLS PROXY — rewrites m3u8 playlists so all sub-requests route through
 * this Cloud Function.  The CDN (freecdn4.top) gates video variant URLs
 * by IP allowlist; only GCP data-center IPs pass.  By proxying every
 * playlist and segment request through this function we bypass the gate
 * completely — ExoPlayer never contacts the CDN directly.
 *
 * GET /resolveStream?hlsProxy=<encoded-url>
 *   → fetches <url> from GCP, rewrites m3u8 URLs, pipes segments.
 * ═══════════════════════════════════════════════════════════════════════ */

const PROXY_SELF_URL =
  'https://us-central1-my-new-app-493307.cloudfunctions.net/resolveStream';

function getProxyBaseUrl(req) {
  // On localhost/dev, build from request so the proxy URLs point back to local server
  const host = req.get('host') || '';
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    return `${req.protocol}://${host}${req.path}`;
  }

  // On GCP, req.path is '/' (not '/resolveStream'), so always use the
  // hardcoded constant which has the correct full function path.
  return PROXY_SELF_URL;
}

function getProxyAcceptHeader(targetUrl) {
  return targetUrl.includes('.m3u8')
    ? 'application/vnd.apple.mpegurl, application/x-mpegURL, */*'
    : '*/*';
}

function isNet52VideoVariantUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    const host = parsed.host.toLowerCase();
    return (
      (host.includes('freecdn4.top') || host.includes('nm-cdn')) &&
      targetUrl.includes('.m3u8') &&
      /\/(?:1080p|720p|480p)\//i.test(parsed.pathname)
    );
  } catch (_) {
    return false;
  }
}

function isLikelyBinaryMediaUrl(targetUrl, contentType = '') {
  const lowerUrl = String(targetUrl || '').toLowerCase();
  const lowerType = String(contentType || '').toLowerCase();

  return (
    /\.(ts|m4s|mp4|aac)(?:$|\?)/i.test(lowerUrl) ||
    lowerType.includes('video/') ||
    lowerType.includes('audio/') ||
    lowerType.includes('mp2t') ||
    lowerType.includes('iso.segment')
  );
}

function buildProxyUrl(proxyBaseUrl, targetUrl, passthroughParams = {}) {
  const params = new URLSearchParams();
  params.set('hlsProxy', targetUrl);

  Object.entries(passthroughParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });

  return `${proxyBaseUrl}?${params.toString()}`;
}

function resolvePlaylistUrl(uri, baseUrl) {
  const raw = String(uri || '').trim();
  if (!raw) return raw;

  if (/^https?:\/\/\//i.test(raw)) {
    const parsedBase = new URL(baseUrl);
    return `${parsedBase.protocol}//${parsedBase.host}/${raw.replace(/^https?:\/\/\/+/i, '')}`;
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  if (raw.startsWith('//')) {
    const parsedBase = new URL(baseUrl);
    const withoutExtraSlashes = raw.replace(/^\/+/, '');
    if (withoutExtraSlashes.startsWith('files/')) {
      return `${parsedBase.protocol}//${parsedBase.host}/${withoutExtraSlashes}`;
    }
    return `${parsedBase.protocol}//${withoutExtraSlashes}`;
  }

  return new URL(raw, baseUrl).toString();
}

function pruneNet52CaptureCache(session) {
  while (session.captured.size > NET52_CAPTURE_LIMIT) {
    const oldestKey = session.captured.keys().next().value;
    if (!oldestKey) break;
    session.captured.delete(oldestKey);
  }
}

function cacheNet52Resource(session, entry) {
  if (!session || !entry?.url) return;

  session.captured.delete(entry.url);
  session.captured.set(entry.url, {
    ...entry,
    capturedAt: Date.now(),
  });
  session.lastUsedAt = Date.now();
  pruneNet52CaptureCache(session);
}

function responseFromCachedNet52Entry(entry) {
  if (!entry) return null;

  const headers = new Headers(entry.headers || {});
  const body =
    entry.encoding === 'base64'
      ? Buffer.from(entry.body || '', 'base64')
      : entry.body || '';

  return new Response(body, {
    status: entry.status || 200,
    headers,
  });
}

async function closeNet52PlaybackSession() {
  if (!net52PlaybackSession) return;

  const session = net52PlaybackSession;
  net52PlaybackSession = null;

  if (session.page) {
    try {
      if (!session.page.isClosed()) {
        await session.page.close();
      }
    } catch (_) { }
  }
}

async function clickNet52PlayerSurface(page) {
  const frames = page.frames().filter((frame) => frame.url() !== 'about:blank');

  for (const frame of frames) {
    try {
      await frame.evaluate(() => {
        const selectors = [
          '#btn-play',
          '.play-btn',
          '#player_overlay',
          '.play-button',
          '.jw-display-icon-display',
          '.jw-icon-playback',
          '.jw-display-icon-container',
          '.vjs-big-play-button',
          '[class*="play"]',
          'button',
          'video',
        ];

        document.querySelectorAll('div').forEach((el) => {
          const style = window.getComputedStyle(el);
          if (Number(style.zIndex || 0) > 100) {
            try { el.click(); } catch (_) { }
          }
        });

        selectors.forEach((selector) => {
          document.querySelectorAll(selector).forEach((el) => {
            if (el.tagName === 'VIDEO') {
              try {
                el.muted = true;
                const maybePromise = el.play?.();
                if (maybePromise && typeof maybePromise.catch === 'function') {
                  maybePromise.catch(() => { });
                }
              } catch (_) { }
              return;
            }

            if (el.offsetParent !== null) {
              try { el.click(); } catch (_) { }
            }
          });
        });
      });
    } catch (_) { }
  }
}

async function attachNet52PlaybackCapture(session) {
  if (!session?.page || session.captureAttached) return;

  session.captureAttached = true;
  session.page.on('response', async (response) => {
    const url = response.url();

    if (
      !url.includes('freecdn4.top') && !url.includes('nm-cdn') ||
      (!url.includes('.m3u8') && !isLikelyBinaryMediaUrl(url, response.headers()['content-type']))
    ) {
      return;
    }

    try {
      const headersObject = response.headers();
      const contentType = headersObject['content-type'] || '';
      const isTextual =
        url.includes('.m3u8') ||
        contentType.toLowerCase().includes('mpegurl') ||
        contentType.toLowerCase().includes('apple') ||
        contentType.toLowerCase().includes('text/');

      let body;
      let encoding = 'text';

      if (isTextual) {
        body = await response.text();
      } else {
        body = Buffer.from(await response.arrayBuffer()).toString('base64');
        encoding = 'base64';
      }

      cacheNet52Resource(session, {
        url,
        status: response.status(),
        headers: headersObject,
        contentType,
        body,
        encoding,
      });

      if (isNet52VideoVariantUrl(url) && typeof body === 'string' && body.trim().startsWith('#EXTM3U')) {
        session.ready = true;
        session.lastPlayableUrl = url;
        session.lastPlayableAt = Date.now();
        console.log(`[Net52Session] Captured playable video playlist: ${url.substring(0, 120)}`);
      }
    } catch (e) {
      console.log(`[Net52Session] Capture miss for ${url.substring(0, 120)}: ${e.message}`);
    }
  });
}

async function createNet52PlaybackSession(contentId, contentTitle, masterUrl) {
  if (!contentId) {
    return null;
  }

  const browser = await getBrowser();
  const page = await browser.newPage();
  const startedAt = Date.now();

  await applyStealth(page);
  await page.setViewport({ width: 1365, height: 768 });
  await page.setUserAgent(USER_AGENT);
  await page.setCacheEnabled(false);
  await page.setExtraHTTPHeaders({
    'Referer': 'https://net52.cc/',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  });

  const session = {
    browser,
    page,
    contentId: String(contentId),
    contentTitle: contentTitle || '',
    masterUrl: masterUrl || '',
    createdAt: startedAt,
    lastUsedAt: startedAt,
    expiresAt: startedAt + NET52_SESSION_TTL_MS,
    captured: new Map(),
    ready: false,
    captureAttached: false,
  };

  await attachNet52PlaybackCapture(session);

  const tm = Math.floor(Date.now() / 1000).toString();
  const landingUrl = `https://net52.cc/pv/?id=${encodeURIComponent(contentId)}`;

  console.log(`[Net52Session] Bootstrapping browser session via ${landingUrl}`);
  await page.goto(landingUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });

  for (let attempt = 0; attempt < 8; attempt++) {
    await clickNet52PlayerSurface(page);
    await delay(1200);
    if (session.ready) break;
  }

  if (!session.ready && masterUrl) {
    try {
      await page.evaluate(async (url) => {
        await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
          },
          credentials: 'include',
        }).catch(() => null);
      }, masterUrl);
    } catch (_) { }
  }

  session.lastUsedAt = Date.now();
  return session;
}

async function ensureNet52PlaybackSession(contentId, contentTitle, masterUrl) {
  const now = Date.now();

  if (
    net52PlaybackSession &&
    net52PlaybackSession.contentId === String(contentId) &&
    net52PlaybackSession.expiresAt > now &&
    net52PlaybackSession.page &&
    !net52PlaybackSession.page.isClosed()
  ) {
    net52PlaybackSession.lastUsedAt = now;
    return net52PlaybackSession;
  }

  await closeNet52PlaybackSession();
  net52PlaybackSession = await createNet52PlaybackSession(contentId, contentTitle, masterUrl);
  return net52PlaybackSession;
}

async function fetchResourceThroughNet52Session(session, targetUrl) {
  if (!session?.page || session.page.isClosed()) {
    return null;
  }

  const cached = session.captured.get(targetUrl);
  if (cached) {
    return responseFromCachedNet52Entry(cached);
  }

  const browserFetchResult = await session.page.evaluate(async (url) => {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': url.includes('.m3u8')
          ? 'application/vnd.apple.mpegurl, application/x-mpegURL, */*'
          : '*/*',
      },
      credentials: 'include',
    });

    const headerEntries = Array.from(response.headers.entries());
    const contentType = response.headers.get('content-type') || '';
    const isTextual =
      url.includes('.m3u8') ||
      contentType.toLowerCase().includes('mpegurl') ||
      contentType.toLowerCase().includes('apple') ||
      contentType.toLowerCase().includes('text/');

    let body;
    let encoding = 'text';

    if (isTextual) {
      body = await response.text();
    } else {
      const blob = new Blob([await response.arrayBuffer()]);
      body = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = typeof reader.result === 'string' ? reader.result : '';
          resolve((result.split(',')[1] || ''));
        };
        reader.onerror = () => reject(new Error('FileReader failed'));
        reader.readAsDataURL(blob);
      });
      encoding = 'base64';
    }

    return {
      ok: response.ok,
      status: response.status,
      contentType,
      headers: Object.fromEntries(headerEntries),
      body,
      encoding,
    };
  }, targetUrl);

  if (!browserFetchResult) {
    return null;
  }

  const entry = {
    url: targetUrl,
    status: browserFetchResult.status || 200,
    headers: browserFetchResult.headers || {},
    contentType: browserFetchResult.contentType || '',
    body: browserFetchResult.body || '',
    encoding: browserFetchResult.encoding || 'text',
  };

  cacheNet52Resource(session, entry);
  return responseFromCachedNet52Entry(entry);
}

function buildUpstreamHeaderProfiles(targetUrl, req) {
  const parsed = new URL(targetUrl);
  const host = parsed.host.toLowerCase();
  const origin = parsed.origin;
  const baseHeaders = {
    'User-Agent': USER_AGENT,
    'Accept': getProxyAcceptHeader(targetUrl),
  };

  const profiles = [];
  const pushProfile = (headers) => {
    const key = JSON.stringify(headers);
    if (!profiles.some((profile) => JSON.stringify(profile) === key)) {
      profiles.push(headers);
    }
  };

  if (host.includes('net52.cc')) {
    pushProfile({
      ...baseHeaders,
      'Referer': 'https://net52.cc/',
      'Origin': 'https://net52.cc',
    });
  } else if (host.includes('freecdn4.top') || host.includes('nm-cdn')) {
    pushProfile({
      ...baseHeaders,
      'Referer': 'https://net52.cc/',
    });
    pushProfile({
      ...baseHeaders,
      'Referer': `${origin}/`,
      'Origin': origin,
    });
    pushProfile(baseHeaders);
  } else {
    pushProfile({
      ...baseHeaders,
      'Referer': `${origin}/`,
      'Origin': origin,
    });
    pushProfile(baseHeaders);
  }

  const range = req.get('range');
  const ifRange = req.get('if-range');
  return profiles.map((headers) => {
    const next = { ...headers };
    if (range) next.Range = range;
    if (ifRange) next['If-Range'] = ifRange;
    return next;
  });
}

async function isBlockedUpstreamResponse(response, targetUrl) {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const looksLikePlaylist = targetUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('apple');
  const looksTextual =
    looksLikePlaylist ||
    contentType.includes('text/') ||
    contentType.includes('json') ||
    contentType.includes('html') ||
    !contentType;

  if (!looksTextual) {
    return false;
  }

  const text = await response.clone().text();
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (looksLikePlaylist && trimmed.startsWith('#EXTM3U')) {
    return false;
  }

  return (
    lower.startsWith('<') ||
    lower.includes('<html') ||
    lower.includes('<!doctype') ||
    lower.includes('only valid users allowed')
  );
}

async function fetchBlockedVideoPlaylistWithBrowser(targetUrl) {
  let browser;
  let page;

  try {
    console.log(`[HLS-Proxy] Browser fallback for ${targetUrl.substring(0, 120)}`);
    browser = await getBrowser();
    page = await browser.newPage();
    await applyStealth(page);
    await page.setViewport({ width: 1365, height: 768 });
    await page.setUserAgent(USER_AGENT);
    await page.setExtraHTTPHeaders({
      'Referer': 'https://net52.cc/',
      'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
    });

    await page.goto('https://net52.cc/', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    const browserFetchResult = await page.evaluate(async (url) => {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
        },
        credentials: 'include',
      });

      return {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get('content-type') || '',
        text: await response.text(),
      };
    }, targetUrl);

    if (!browserFetchResult) {
      return null;
    }

    if (!browserFetchResult.ok) {
      console.log(`[HLS-Proxy] Browser fetch returned ${browserFetchResult.status} for ${targetUrl.substring(0, 120)}`);
      return null;
    }

    const text = browserFetchResult.text || '';
    if (!text.trim().startsWith('#EXTM3U')) {
      console.log(`[HLS-Proxy] Browser fallback still blocked for ${targetUrl.substring(0, 120)}`);
      return null;
    }

    console.log(`[HLS-Proxy] Browser fallback succeeded for ${targetUrl.substring(0, 120)}`);
    return new Response(text, {
      status: browserFetchResult.status || 200,
      headers: {
        'content-type': browserFetchResult.contentType || 'application/vnd.apple.mpegurl',
      },
    });
  } catch (e) {
    console.log(`[HLS-Proxy] Browser fallback failed: ${e.message}`);
    return null;
  } finally {
    if (page) {
      try {
        if (!page.isClosed()) await page.close();
      } catch (_) { }
    }
    if (browser) {
      try {
        await browser.disconnect();
      } catch (_) { }
    }
  }
}

async function fetchNet52ProtectedResourceWithBrowser(targetUrl, req) {
  const contentId = req.query.net52id || req.query.net52Id;
  const contentTitle = req.query.net52title || req.query.net52Title || '';
  const masterUrl = req.query.net52master || req.query.net52Master || '';

  if (!contentId) {
    return fetchBlockedVideoPlaylistWithBrowser(targetUrl);
  }

  try {
    const session = await ensureNet52PlaybackSession(contentId, contentTitle, masterUrl);
    const response = await fetchResourceThroughNet52Session(session, targetUrl);

    if (response) {
      console.log(`[HLS-Proxy] Session fetch succeeded for ${targetUrl.substring(0, 120)}`);
      return response;
    }
  } catch (e) {
    console.log(`[HLS-Proxy] Session fetch failed: ${e.message}`);
  }

  return fetchBlockedVideoPlaylistWithBrowser(targetUrl);
}

async function buildSyntheticVariantPlaylist(targetUrl, req) {
  try {
    const masterUrl = req.query.net52master || req.query.net52Master;
    if (!masterUrl) {
      console.log('[HLS-Proxy] Synthetic build: No masterUrl in query');
      return null;
    }

    const urlObj = new URL(targetUrl);
    let host = urlObj.host;
    
    // Extract fileId and quality from variant URL (e.g. /files/220884/720p/720p.m3u8)
    const match = urlObj.pathname.match(/\/files\/(\d+)\/([^\/]+)\//);
    if (!match) {
      console.log(`[HLS-Proxy] Synthetic build: Target URL ${targetUrl} doesn't match /files/id/quality/`);
      return null;
    }
    let fileId = match[1];
    const quality = match[2];

    // Extract the REAL content ID from the master URL (the variant fileId may be poisoned)
    const realIdMatch = masterUrl.match(/\/hls\/(\d+)\.m3u8/);
    const realId = realIdMatch ? realIdMatch[1] : fileId;
    if (realId !== fileId) {
      console.log(`[HLS-Proxy] Synthetic build: Overriding poisoned fileId ${fileId} → ${realId}`);
      fileId = realId;
    }

    let durations = [];
    let targetDuration = 10;
    let firstSegmentNum = null;
    let ext = 'js';
    const prefixes = ['2560', '1920', '1280', '854', '640', '480', '320', fileId, 'video'];

    const got = await getGotScraping();

    // Helper: got-scraping HEAD probe for segments
    async function probeUrl(url) {
      try {
        const r = await got.head(url, {
          ...GOT_OPTS,
          headers: { 'Referer': 'https://net52.cc/' },
          followRedirect: true,
        });
        return r.statusCode >= 200 && r.statusCode < 400;
      } catch (e) {
        return false;
      }
    }

    // Helper: got-scraping GET for playlists
    async function gotFetch(url) {
      try {
        const r = await got.get(url, {
          ...GOT_OPTS,
          headers: { 'Referer': 'https://net52.cc/' },
        });
        return { ok: r.statusCode >= 200 && r.statusCode < 400, text: r.body, status: r.statusCode };
      } catch (e) {
        return { ok: false, text: '', status: 0 };
      }
    }

    // 1. Fetch master playlist to discover audio URI and real CDN host
    try {
      const masterFetch = await gotFetch(masterUrl);
      if (masterFetch.ok) {
        const masterText = masterFetch.text;
        
        // Extract audio URI from master
        const audioMatch = masterText.match(/URI="([^"]+a\/0\/0\.m3u8[^"]*)"/i) || masterText.match(/URI="([^"]+)"/);
        let audioUri = audioMatch ? audioMatch[1] : null;
        
        if (audioUri) {
          if (audioUri.startsWith('https:///')) {
            audioUri = `https://${host}${audioUri.replace('https:///', '/')}`;
          } else if (audioUri.startsWith('/')) {
            audioUri = `https://${host}${audioUri}`;
          }

          // Override host with audio host (audio always has correct CDN)
          try {
            const audioUrlObj = new URL(audioUri);
            host = audioUrlObj.host;
            console.log(`[HLS-Proxy] Synthetic build: CDN host from audio: ${host}`);
          } catch (e) { }

          // Fetch audio playlist for segment timing data
          console.log(`[HLS-Proxy] Synthetic build: Fetching audio playlist...`);
          const audioFetch = await gotFetch(audioUri);
          
          if (audioFetch.ok && audioFetch.text.includes('#EXTINF')) {
            const lines = audioFetch.text.split(/\r?\n/);
            for (const line of lines) {
              const trimmedLine = line.trim();
              if (trimmedLine.startsWith('#EXT-X-TARGETDURATION:')) {
                targetDuration = parseInt(trimmedLine.split(':')[1], 10) || 10;
              } else if (trimmedLine.startsWith('#EXTINF:')) {
                durations.push(trimmedLine);
              } else if (trimmedLine && !trimmedLine.startsWith('#')) {
                const segMatch = trimmedLine.match(/([^_/]+)_(\d+)\./);
                if (segMatch) {
                  const pfx = segMatch[1];
                  const num = segMatch[2];
                  if (firstSegmentNum === null) {
                    firstSegmentNum = parseInt(num, 10);
                    console.log(`[HLS-Proxy] Synthetic build: First segment is ${firstSegmentNum}`);
                  }
                  if (!prefixes.includes(pfx)) {
                    console.log(`[HLS-Proxy] Synthetic build: Found prefix ${pfx} from audio`);
                    prefixes.unshift(pfx);
                  }
                  
                  // Also record the file extension used in the audio playlist
                  const extMatch = trimmedLine.match(/\.([a-z0-9]+)$/i);
                  if (extMatch && extMatch[1]) {
                    ext = extMatch[1];
                  }
                }
              }
            }
            console.log(`[HLS-Proxy] Synthetic build: Got ${durations.length} segments from audio (ext: ${ext})`);
          } else {
            console.log(`[HLS-Proxy] Synthetic build: Audio fetch status=${audioFetch.status}`);
          }
        }
      }
    } catch (e) {
      console.log(`[HLS-Proxy] Synthetic build: Audio probe error: ${e.message}`);
    }

    const startNumStr = String(firstSegmentNum || 0).padStart(3, '0');

    // 2. Probe video segment prefix (use REAL fileId, correct host)
    const baseUrl = `https://${host}/files/${fileId}/${quality}/`;
    console.log(`[HLS-Proxy] Synthetic build: Probing ${baseUrl} with prefixes: ${prefixes.join(', ')}`);
    
    let workingPrefix = null;
    let workingExt = ext;

    // We prioritize the extension found in the audio playlist, then fallback
    const extensionsToTry = [ext, 'js', 'jpg', 'ts'].filter((v, i, a) => a.indexOf(v) === i);

    probeLoop:
    for (const prefix of prefixes) {
      for (const testExt of extensionsToTry) {
        const testUrl = `${baseUrl}${prefix}_${startNumStr}.${testExt}`;
        if (await probeUrl(testUrl)) {
          workingPrefix = prefix;
          workingExt = testExt;
          break probeLoop;
        }
      }
    }
    
    if (!workingPrefix) {
      console.log(`[HLS-Proxy] Synthetic build: No working prefix found at ${startNumStr}`);
      return null;
    }

    console.log(`[HLS-Proxy] Synthetic build: Using prefix ${workingPrefix} with ext ${workingExt}`);

    // 3. If audio didn't give us durations, binary search for segment count
    if (durations.length === 0) {
      console.log('[HLS-Proxy] Synthetic build: Binary searching segment count...');
      let maxSeg = firstSegmentNum || 0;
      let step = 10;
      
      while (true) {
        const testUrl = `${baseUrl}${workingPrefix}_${String(maxSeg + step).padStart(3, '0')}.${workingExt}`;
        if (await probeUrl(testUrl)) {
          maxSeg += step;
          step *= 2;
        } else {
          break;
        }
      }
      
      let low = maxSeg;
      let high = maxSeg + step;
      let result = maxSeg;
      
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const testUrl = `${baseUrl}${workingPrefix}_${String(mid).padStart(3, '0')}.${workingExt}`;
        if (await probeUrl(testUrl)) {
          result = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      
      const totalSegments = (result - (firstSegmentNum || 0)) + 1;
      console.log(`[HLS-Proxy] Synthetic build: Found ${totalSegments} segments`);
      for (let i = 0; i < totalSegments; i++) {
        durations.push('#EXTINF:10.005333,');
      }
    }

    // 4. Build synthetic m3u8
    let syntheticM3u8 = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:${targetDuration}\n#EXT-X-MEDIA-SEQUENCE:${firstSegmentNum || 0}\n`;
    for (let i = 0; i < durations.length; i++) {
      syntheticM3u8 += `${durations[i]}\n`;
      syntheticM3u8 += `${baseUrl}${workingPrefix}_${String((firstSegmentNum || 0) + i).padStart(3, '0')}.${workingExt}\n`;
    }
    syntheticM3u8 += `#EXT-X-ENDLIST\n`;

    console.log(`[HLS-Proxy] Synthetic build: ✅ Built ${durations.length}-segment playlist`);

    return {
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/vnd.apple.mpegurl',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=3600'
      }),
      text: async () => syntheticM3u8,
      arrayBuffer: async () => Buffer.from(syntheticM3u8)
    };
  } catch (e) {
    console.log(`[HLS-Proxy] Synthetic build failed: ${e.message}`);
    return null;
  }
}

async function fetchHlsProxyUpstream(targetUrl, req) {
  const parsed = new URL(targetUrl);
  const host = parsed.host.toLowerCase();
  const isCdnUrl = host.includes('freecdn4.top') || host.includes('freecdn1.top') ||
                   host.includes('nm-cdn') || host.includes('net52.cc') || host.includes('net22.cc');

  // ── PRIMARY: Use got-scraping for CDN/net52/net22 URLs (TLS impersonation) ──
  if (isCdnUrl) {
    try {
      const got = await getGotScraping();
      const gotRes = await got.get(targetUrl, {
        ...GOT_OPTS,
        headers: {
          'Referer': 'https://net52.cc/',
          'Accept': getProxyAcceptHeader(targetUrl),
        },
        responseType: targetUrl.includes('.m3u8') ? 'text' : 'buffer',
      });

      // Check if response is a block page
      if (targetUrl.includes('.m3u8') && typeof gotRes.body === 'string') {
        if (gotRes.body.trim().startsWith('#EXTM3U')) {
          console.log(`[HLS-Proxy] got-scraping success for ${targetUrl.substring(0, 80)}`);
          return new Response(gotRes.body, {
            status: gotRes.statusCode,
            headers: { 'content-type': 'application/vnd.apple.mpegurl' },
          });
        } else if (gotRes.body.includes('Only Valid Users') || gotRes.body.includes('<html')) {
          console.log(`[HLS-Proxy] got-scraping got block page for ${targetUrl.substring(0, 80)}`);
          // Fall through to other strategies
        } else {
          return new Response(gotRes.body, {
            status: gotRes.statusCode,
            headers: { 'content-type': gotRes.headers['content-type'] || 'application/octet-stream' },
          });
        }
      } else if (gotRes.statusCode >= 200 && gotRes.statusCode < 400) {
        // Binary segment
        const buf = Buffer.isBuffer(gotRes.body) ? gotRes.body : Buffer.from(gotRes.body);
        return new Response(buf, {
          status: gotRes.statusCode,
          headers: {
            'content-type': gotRes.headers['content-type'] || 'video/mp2t',
            'content-length': String(buf.length),
          },
        });
      }
    } catch (e) {
      console.log(`[HLS-Proxy] got-scraping failed for ${targetUrl.substring(0, 80)}: ${e.message}`);
    }
  }

  // ── FALLBACK: Standard fetch with multiple header profiles ──
  const headerProfiles = buildUpstreamHeaderProfiles(targetUrl, req);
  let lastResponse = null;

  for (const headers of headerProfiles) {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
    });
    lastResponse = upstream;

    if (!upstream.ok) {
      continue;
    }

    if (await isBlockedUpstreamResponse(upstream, targetUrl)) {
      console.log(
        `[HLS-Proxy] Blocked profile for ${new URL(targetUrl).host} with Referer=${headers.Referer || '-'} Origin=${headers.Origin || '-'}`
      );
      continue;
    }

    return upstream;
  }

  const isNet52ProtectedVariant =
    (host.includes('freecdn4.top') || host.includes('nm-cdn')) &&
    targetUrl.includes('.m3u8');

  if (isNet52ProtectedVariant) {
    // Try browser session fallback
    const browserResponse = await fetchNet52ProtectedResourceWithBrowser(targetUrl, req);
    if (browserResponse) {
      return browserResponse;
    }

    // Final fallback: construct a synthetic m3u8 from probing accessible segments
    console.log(`[HLS-Proxy] Attempting synthetic m3u8 construction for ${targetUrl.substring(0, 100)}`);
    const synthetic = await buildSyntheticVariantPlaylist(targetUrl, req);
    if (synthetic) {
      console.log(`[HLS-Proxy] Synthetic m3u8 built successfully`);
      return synthetic;
    }
  }

  // For non-m3u8 binary segments on the CDN, try direct fetch (segments are open)
  const isNet52Segment =
    (host.includes('freecdn4.top') || host.includes('nm-cdn')) &&
    !targetUrl.includes('.m3u8') &&
    isLikelyBinaryMediaUrl(targetUrl);

  if (isNet52Segment && lastResponse && !lastResponse.ok) {
    const directFetch = await fetch(targetUrl, {
      method: req.method,
      headers: { 'User-Agent': USER_AGENT },
    });
    if (directFetch.ok) return directFetch;
  }

  return lastResponse;
}

/**
 * Rewrite every URL inside an m3u8 manifest so it routes through our proxy.
 */
function rewriteM3u8ForProxy(m3u8Text, baseUrl, proxyBaseUrl, passthroughParams = {}) {
  const lines = m3u8Text.split(/\r?\n/);
  return lines
    .map((line) => {
      const trimmed = line.trim();

      // Rewrite URI="..." attributes in #EXT-X-MEDIA / #EXT-X-I-FRAME tags
      if (trimmed.startsWith('#') && trimmed.includes('URI="')) {
        return trimmed.replace(/URI="([^"]+)"/g, (_match, uri) => {
          const abs = resolvePlaylistUrl(uri, baseUrl);
          // Do not proxy direct binary segments (.jpg, .ts, .js), let user fetch directly
          if (!abs.includes('.m3u8')) {
            return `URI="${abs}"`;
          }
          return `URI="${buildProxyUrl(proxyBaseUrl, abs, passthroughParams)}"`;
        });
      }

      // Rewrite bare URLs (variant playlists / segment filenames)
      if (trimmed && !trimmed.startsWith('#')) {
        const abs = resolvePlaylistUrl(trimmed, baseUrl);
        // Do not proxy direct binary segments (.jpg, .ts, .js), let user fetch directly
        if (!abs.includes('.m3u8')) {
          return abs;
        }
        return buildProxyUrl(proxyBaseUrl, abs, passthroughParams);
      }

      return line;
    })
    .join('\n');
}

/**
 * Handle a GET ?hlsProxy=<url> request.
 * - If target is m3u8: fetch, rewrite URLs, return as application/vnd.apple.mpegurl
 * - Otherwise (segment): pipe the binary body straight through
 */
function copyProxyResponseHeaders(upstream, res) {
  const passthroughHeaders = [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'cache-control',
    'etag',
    'last-modified',
  ];

  for (const header of passthroughHeaders) {
    const value = upstream.headers.get(header);
    if (value) {
      res.set(header, value);
    }
  }
}

async function handleHlsProxy(req, targetUrl, res) {
  console.log(`[HLS-Proxy] Fetching: ${targetUrl.substring(0, 120)}`);
  const proxyBaseUrl = getProxyBaseUrl(req);
  const passthroughParams = {
    net52id: req.query.net52id || req.query.net52Id,
    net52title: req.query.net52title || req.query.net52Title,
    net52master: req.query.net52master || req.query.net52Master,
  };
  const upstream = await fetchHlsProxyUpstream(targetUrl, req);

  if (!upstream || !upstream.ok) {
    const status = upstream?.status || 502;
    console.log(`[HLS-Proxy] Upstream ${status} for ${targetUrl.substring(0, 80)}`);
    return res.status(status).send('Upstream error');
  }

  const ct = upstream.headers.get('content-type') || '';
  const isM3u8 =
    ct.includes('mpegurl') ||
    ct.includes('apple') ||
    targetUrl.includes('.m3u8');

  if (isM3u8) {
    let text = await upstream.text();
    if (targetUrl.includes('net22.cc/hls/') || targetUrl.includes('net52.cc/hls/')) {
      text = await normalizeNet22Master(text, passthroughParams.net52master || targetUrl);
    }
    if (text.trim().startsWith('#EXTM3U')) {
      const rewritten = rewriteM3u8ForProxy(text, targetUrl, proxyBaseUrl, passthroughParams);
      res.set('Access-Control-Allow-Origin', '*');
      copyProxyResponseHeaders(upstream, res);
      res.set('Content-Type', 'application/vnd.apple.mpegurl');
      return res.status(upstream.status).send(rewritten);
    }
    // CDN returned HTML block page — pass error through
    console.log(`[HLS-Proxy] Got HTML block page for ${targetUrl.substring(0, 80)}`);
    return res.status(403).send('CDN blocked');
  }

  // Binary segment — pipe through
  const buffer = Buffer.from(await upstream.arrayBuffer());
  res.set('Access-Control-Allow-Origin', '*');
  copyProxyResponseHeaders(upstream, res);
  if (!upstream.headers.get('content-type')) {
    res.set('Content-Type', 'video/mp2t');
  }
  return res.status(upstream.status).send(buffer);
}


async function resolveMoviesAPI(page, tmdbId, type, season, episode) {
  const apiUrl =
    type === 'tv' && season && episode
      ? `https://ww2.moviesapi.to/api/tv/${tmdbId}/${season}/${episode}`
      : `https://ww2.moviesapi.to/api/movie/${tmdbId}`;

  console.log(`[MoviesAPI] Fetching API: ${apiUrl}`);

  let embedUrl;
  try {
    const apiRes = await fetch(apiUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': 'https://moviesapi.to/'
      }
    });
    const apiJson = await apiRes.json();
    embedUrl = apiJson.video_url;

    // Extract English subtitles from API response
    var moviesApiSubs = [];
    if (Array.isArray(apiJson.subtitles)) {
      moviesApiSubs = apiJson.subtitles
        .filter(s => s.label && (s.label.toLowerCase().includes('english') || s.default === true))
        .map(s => ({
          id: s.label || s.url,
          url: s.url,
          language: s.label || 'English',
          type: 'srt',
        }));
    }

    if (!embedUrl) throw new Error('No video_url in API response');
  } catch (e) {
    throw new Error(`MoviesAPI API fetch failed: ${e.message}`);
  }

  console.log(`[MoviesAPI] Loading direct player: ${embedUrl.substring(0, 80)}...`);
  const timeoutAt = Date.now() + 15000;

  return new Promise(async (resolve, reject) => {
    let resolved = false;

    // Fast-path: Network-level interception
    page.on('request', (request) => {
      if (resolved) return;
      const url = request.url();
      if (url.includes('.m3u8')) {
        resolved = true;
        console.log(`[MoviesAPI] Network stream found: ${url.substring(0, 100)}...`);
        resolve({
          url,
          headers: {
            'User-Agent': USER_AGENT,
            'Referer': 'https://ww2.moviesapi.to/',
            'Origin': 'https://ww2.moviesapi.to',
          },
          captions: [],
          markers: [],
          sourceId: 'moviesapi',
          expiresAt: extractExpiryTimestamp(url),
        });
      }
    });

    const extractFromJwPlayer = async (targetFrame) => {
      const data = await targetFrame.evaluate(() => {
        const result = {
          videoSrc: document.querySelector('video')?.src || null,
          playlist: null,
          playlistItem: null,
        };

        try {
          if (typeof window.jwplayer === 'function') {
            const instance = window.jwplayer();
            result.playlist = instance?.getPlaylist ? instance.getPlaylist() : null;
            result.playlistItem = instance?.getPlaylistItem ? instance.getPlaylistItem() : null;
          }
        } catch (_) { }

        return result;
      });

      const items = data.playlist || (data.playlistItem ? [data.playlistItem] : []);
      for (const item of items) {
        const sources = item?.sources || [];
        for (const source of sources) {
          const file = source?.file;
          if (typeof file === 'string' && (file.includes('.m3u8') || file.includes('.mp4'))) {
            return {
              url: file,
              captions: (item.tracks || []).map((track) => ({
                id: track.label || track.file,
                url: track.file,
                language: track.label || 'Unknown',
                type: 'vtt',
              })),
            };
          }
        }
      }

      if (typeof data.videoSrc === 'string' && (data.videoSrc.includes('.m3u8') || data.videoSrc.includes('.mp4'))) {
        return { url: data.videoSrc, captions: [] };
      }

      return null;
    };

    try {
      await page.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
      await delay(200); // Drastically reduced initial wait

      while (Date.now() < timeoutAt && !resolved) {
        // The current page is already the flixcdn iframe, we don't need to find it in frames!
        const playerFrame = page.mainFrame();

        await playerFrame.evaluate(() => {
          const overlays = Array.from(document.querySelectorAll('div')).filter((el) => {
            const style = window.getComputedStyle(el);
            return style.position === 'fixed' && style.zIndex === '2147483647';
          });
          overlays.forEach((el) => el.click());

          const btn = document.querySelector('#player-button-container, #player-button, .play-button, .play-btn, button');
          if (btn) btn.click();
        }).catch(() => { });

        const extracted = await extractFromJwPlayer(playerFrame);
        if (extracted?.url && !resolved) {
          resolved = true;
          console.log(`[MoviesAPI] JW stream found: ${extracted.url.substring(0, 120)}`);
          return resolve({
            url: extracted.url,
            headers: {
              'User-Agent': USER_AGENT,
              'Referer': 'https://ww2.moviesapi.to/',
            },
            captions: (extracted.captions && extracted.captions.length > 0)
              ? extracted.captions
              : moviesApiSubs || [],
            markers: [],
            sourceId: 'moviesapi',
            expiresAt: extractExpiryTimestamp(extracted.url),
          });
        }

        await delay(500); // Reduced polling delay
      }
    } catch (e) {
      if (!resolved) reject(new Error(`MoviesAPI navigation error: ${e.message}`));
    }

    if (!resolved) reject(new Error('MoviesAPI stream not detected'));
  });
}

/* ═══════════════════════════════════════════════════════════════════════
 * NetMirror resolver  —  PURE HTTP, ZERO PUPPETEER
 *
 * Architecture:  got-scraping (TLS impersonation) + TMDB episode lookup
 *
 * Flow (Movies):
 *   1. got-scraping → net52.cc/search.php   → find internal ID by title
 *   2. got-scraping → net52.cc/playlist.php → get stream sources + token
 *   3. got-scraping → net52.cc/hls/{id}.m3u8  → master m3u8
 *   4. normalizeNet22Master → fix CDN hosts + un-poison IDs
 *
 * Flow (TV Shows — NO COOKIES NEEDED):
 *   1-2. Same as movies (search + discover series on net52)
 *   3. TMDB API → get season/episode list → TMDB episode ID
 *   4. got-scraping → net52.cc/playlist.php?id={TMDB_EP_ID} → stream
 *   5. normalizeNet22Master → fix CDN hosts + un-poison IDs
 *
 * Key insight: net52's playlist.php accepts TMDB episode IDs directly,
 * completely bypassing the authenticated post.php/episodes.php flow.
 * ═══════════════════════════════════════════════════════════════════════ */

const TMDB_API_KEY = '3fd2be6f0c70a2a598f084ddfb75487c';

// Lazy-loaded got-scraping instance (ESM module)
let _gotScraping = null;
async function getGotScraping() {
  if (!_gotScraping) {
    const mod = await import('got-scraping');
    _gotScraping = mod.gotScraping;
  }
  return _gotScraping;
}

const GOT_OPTS = {
  headerGeneratorOptions: { browsers: ['chrome'], operatingSystems: ['windows'] },
};

/**
 * TLS-impersonated fetch for net52/net22 APIs.
 * Uses got-scraping to bypass Cloudflare's TLS fingerprint checks
 * that block standard Node.js fetch().
 */
async function netMirrorFetch(url, extraHeaders = {}) {
  const got = await getGotScraping();
  const res = await got.get(url, {
    ...GOT_OPTS,
    headers: {
      'Referer': new URL(url).origin + '/',
      ...extraHeaders,
    },
  });
  return res.body;
}

async function netMirrorSearch(query) {
  const tm = Math.floor(Date.now() / 1000).toString();
  const text = await netMirrorFetch(
    `https://net52.cc/search.php?s=${encodeURIComponent(query)}&t=${tm}`
  );
  return JSON.parse(text);
}

async function netMirrorPlaylist(contentId, title) {
  const tm = Math.floor(Date.now() / 1000).toString();
  const text = await netMirrorFetch(
    `https://net52.cc/playlist.php?id=${contentId}&t=${encodeURIComponent(title)}&tm=${tm}`
  );
  return JSON.parse(text);
}

async function netMirrorM3u8(m3u8Path) {
  const url = m3u8Path.startsWith('http')
    ? m3u8Path
    : `https://net52.cc${m3u8Path}`;
  return await netMirrorFetch(url);
}

async function getTmdbTitle(tmdbId, type) {
  try {
    const mediaType = type === 'tv' ? 'tv' : 'movie';
    const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    const data = await res.json();
    return data.title || data.name || data.original_title || data.original_name || '';
  } catch (e) {
    console.log(`[NetMirror] TMDB lookup failed: ${e.message}`);
    return '';
  }
}

/**
 * Resolve a TV episode's TMDB episode ID.
 * TMDB episode IDs work directly as net52 playlist IDs — no cookies needed.
 */
async function getTmdbEpisodeId(tmdbShowId, seasonNum, episodeNum) {
  try {
    const url = `https://api.themoviedb.org/3/tv/${tmdbShowId}/season/${seasonNum}?api_key=${TMDB_API_KEY}`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    const data = await res.json();
    if (!data.episodes?.length) return null;

    const ep = data.episodes.find(e => e.episode_number === parseInt(episodeNum));
    if (!ep) return null;

    console.log(`[NetMirror] TMDB episode: S${seasonNum}E${episodeNum} "${ep.name}" → ID ${ep.id}`);
    return { id: ep.id, name: ep.name };
  } catch (e) {
    console.log(`[NetMirror] TMDB episode lookup failed: ${e.message}`);
    return null;
  }
}

async function resolveNet22(_page, tmdbId, type, season, episode, title, proxyBaseUrl = PROXY_SELF_URL) {
  const t0 = Date.now();
  console.log(`[NetMirror] Starting — TMDB ${tmdbId} (${type}) [Puppeteer-free]`);

  // 1. Get title from TMDB if not provided
  let searchTitle = title;
  if (!searchTitle) {
    searchTitle = await getTmdbTitle(tmdbId, type);
    console.log(`[NetMirror] TMDB title: "${searchTitle}"`);
  }
  if (!searchTitle) throw new Error('NetMirror: no title for search');

  // 2. Search on net52.cc (no auth needed, got-scraping handles TLS)
  const search = await netMirrorSearch(searchTitle);
  if (!search.searchResult?.length) throw new Error(`NetMirror: no results for "${searchTitle}"`);

  let contentId = search.searchResult[0].id;
  let contentTitle = search.searchResult[0].t || searchTitle;
  console.log(`[NetMirror] Found: [${contentId}] ${contentTitle}`);

  // 3. For TV: resolve episode via TMDB (bypasses post.php entirely!)
  if (type === 'tv' && season && episode) {
    console.log(`[NetMirror] Resolving S${season}E${episode} via TMDB...`);

    const tmdbEp = await getTmdbEpisodeId(tmdbId, season, episode);
    if (tmdbEp) {
      contentId = tmdbEp.id;
      contentTitle = tmdbEp.name || contentTitle;
      console.log(`[NetMirror] Episode resolved: [${contentId}] ${contentTitle}`);
    } else {
      // Fallback: use the series ID (will play S1E1 or the default stream)
      console.log(`[NetMirror] TMDB episode lookup failed, using series ID fallback`);
    }
  }

  // 4. Get playlist from net52.cc (no auth needed)
  const playlist = await netMirrorPlaylist(contentId, contentTitle);
  let firstSource = playlist[0]?.sources?.[0]?.file;

  if (!firstSource) throw new Error('NetMirror: playlist returned no sources');
  console.log(`[NetMirror] Playlist source: ${firstSource}`);

  // 5. Fetch master m3u8 from net52.cc
  const m3u8Path = firstSource.startsWith('/') ? firstSource : `/${firstSource}`;
  const m3u8Url = `https://net52.cc${m3u8Path}`;

  // Reference URL for CDN hostname discovery (same URL, normalizeNet22Master uses it)
  const basePath = m3u8Path.split('?')[0];
  const net52MasterUrl = `https://net52.cc${basePath}?in=unknown::ek`;

  const rawM3u8Text = await netMirrorM3u8(m3u8Url);
  console.log(`[NetMirror] Master m3u8: ${rawM3u8Text.includes('#EXTM3U') ? 'valid' : 'INVALID'} (${rawM3u8Text.length} bytes)`);

  // 6. Normalize: fix CDN hostnames (https:/// → real host) + un-poison content IDs
  const m3u8Text = await normalizeNet22Master(rawM3u8Text, net52MasterUrl);

  if (!m3u8Text.includes('#EXTM3U')) {
    throw new Error('NetMirror: m3u8 invalid after normalization');
  }

  console.log(`[NetMirror] ✅ Master m3u8 (${m3u8Text.split('\n').length} lines) in ${Date.now() - t0}ms`);

  // 7. Build proxied URL for HLS proxy
  const proxiedMasterUrl = buildProxyUrl(proxyBaseUrl, m3u8Url, {
    net52id: contentId,
    net52title: contentTitle,
    net52master: net52MasterUrl,
  });
  console.log(`[NetMirror] Returning proxied master URL: ${proxiedMasterUrl.substring(0, 120)}`);

  // 8. Extract captions from tracks
  const captions = (playlist[0]?.tracks || [])
    .filter((t) => t.kind === 'captions')
    .map((t) => ({
      id: t.language || 'en',
      url: t.file,
      language: t.label || t.language || 'English',
      type: t.file?.endsWith('.vtt') ? 'vtt' : 'srt',
    }));

  return {
    url: proxiedMasterUrl,
    headers: {},  // No custom headers needed — proxy handles auth
    captions,
    markers: [],
    sourceId: 'net22',
    expiresAt: Date.now() + 3 * 60 * 60 * 1000,
  };
}


/**
 * VidSrc.icu resolver (Ad-Shielded)
 *
 * Chain: Puppeteer(vidsrc.icu embed) → cloudnestra iframe auto-loads → m3u8
 *
 * Strategy:
 * - Load vidsrc.icu embed page (handles Cloudflare internally via iframe chain)
 * - Block ad domains at network level to prevent compute waste
 * - Nuke ad overlays, click play in player iframes
 * - Capture m3u8 at network level (works across all frames)
 */
const VIDSRC_AD_DOMAINS = [
  'adexchangerapid.com', 'reffpa.com', 'nectsideaments.com',
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'popads.net', 'popcash.net', 'juicyads.com', 'exoclick.com',
  'trafficjunky.com', 'adnxs.com', 'adsco.re', 'adsterra.com',
  'propellerads.com', 'hilltopads.net', 'a-ads.com',
  'onclickmax.com', 'clickadu.com', 'popunder.net',
];

async function resolveVidsrcIcu(page, tmdbId, type, season, episode) {
  const embedUrl =
    type === 'tv' && season && episode
      ? `https://vidsrc.icu/embed/tv/${tmdbId}/${season}/${episode}`
      : `https://vidsrc.icu/embed/movie/${tmdbId}`;

  console.log(`[VidsrcIcu] Loading: ${embedUrl}`);

  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('VidsrcIcu timeout (40s)'));
    }, 40000);

    let resolved = false;

    // Network-level m3u8 interception — captures ALL frames
    page.on('response', (response) => {
      if (resolved) return;
      const url = response.url();

      if (url.includes('.m3u8')) {
        resolved = true;
        clearTimeout(timeout);
        console.log(`[VidsrcIcu] Stream found: ${url.substring(0, 120)}...`);

        resolve({
          url,
          headers: {
            'User-Agent': USER_AGENT,
            'Referer': 'https://cloudnestra.com/',
            'Origin': 'https://cloudnestra.com',
          },
          captions: [],
          markers: [],
          sourceId: 'vidsrcicu',
          expiresAt: extractExpiryTimestamp(url),
        });
      }
    });

    try {
      await page.evaluateOnNewDocument(() => { window.open = () => null; });

      await page.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      console.log('[VidsrcIcu] Page loaded, clicking play in player frames...');

      // Poll: nuke ads + click play across player frames
      for (let attempt = 0; attempt < 15 && !resolved; attempt++) {
        await delay(2000);
        if (resolved) break;

        for (const frame of page.frames()) {
          const frameUrl = frame.url();
          if (frameUrl === 'about:blank') continue;

          // Only interact with known player iframe domains
          if (!frameUrl.includes('cloudnestra') &&
            !frameUrl.includes('vidsrcme') &&
            !frameUrl.includes('rcp') &&
            !frameUrl.includes('prorcp')) continue;

          try {
            await frame.evaluate(() => {
              // Nuke ad overlays
              document.querySelectorAll('div').forEach(el => {
                const style = window.getComputedStyle(el);
                if (parseInt(style.zIndex) > 100) {
                  try { el.remove(); } catch (e) { }
                }
              });
              // Click play buttons
              const selectors = [
                '#btn-play', '.play-btn', '#player_overlay', '.play-button',
                '.jw-display-icon-display', '.jw-icon-playback',
                '.jw-display-icon-container', '[class*="play"]', 'button', 'video'
              ];
              for (const sel of selectors) {
                document.querySelectorAll(sel).forEach(el => {
                  if (el.offsetParent !== null || el.tagName === 'VIDEO') {
                    try { el.click(); } catch (e) { }
                  }
                });
              }
            });
          } catch (_) { }
        }
      }
    } catch (e) {
      if (!resolved) {
        clearTimeout(timeout);
        reject(new Error(`VidsrcIcu navigation error: ${e.message}`));
      }
    }
  });
}


function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withGlobalTimeout(promise, ms, label = '') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} exceeded global timeout (${ms}ms)`)),
      Math.max(ms, 1000)
    );
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

function normalizeProviderError(error) {
  const message = error?.message || 'Unknown error';
  const lower = message.toLowerCase();
  let code = 'provider_error';

  if (lower.includes('timeout')) code = 'upstream_timeout';
  else if (lower.includes('navigation error')) code = 'navigation_failed';
  else if (lower.includes('not detected') || lower.includes('no stream')) code = 'stream_not_found';

  return {
    code,
    message,
    retryable: code === 'upstream_timeout' || code === 'navigation_failed',
  };
}

async function configurePage(browser, options = {}) {
  const page = await browser.newPage();
  await applyStealth(page);
  await page.setViewport({ width: 1365, height: 768 });
  await page.setUserAgent(USER_AGENT);
  await page.setCacheEnabled(false);
  if (options.forceRefresh) {
    await page.setExtraHTTPHeaders({
      'Cache-Control': 'no-cache, no-store, max-age=0',
      Pragma: 'no-cache',
    });
  }
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const resourceType = request.resourceType();
    const url = request.url();

    if (['image', 'font', 'stylesheet', 'media'].includes(resourceType)) {
      request.abort();
      return;
    }
    if (
      url.includes('google-analytics') ||
      url.includes('googlesyndication') ||
      url.includes('googletagmanager') ||
      url.includes('doubleclick') ||
      url.includes('facebook.net') ||
      url.includes('adservice') ||
      url.includes('popads') ||
      url.includes('adexchangerapid') ||
      url.includes('reffpa.com') ||
      url.includes('nectsideaments') ||
      url.includes('exoclick') ||
      url.includes('trafficjunky') ||
      url.includes('juicyads') ||
      url.includes('popcash') ||
      url.includes('propellerads') ||
      url.includes('hilltopads') ||
      url.includes('clickadu') ||
      url.includes('adsterra') ||
      url.includes('onclickmax')
    ) {
      request.abort();
      return;
    }
    if (options.forceRefresh) {
      request.continue({
        headers: {
          ...request.headers(),
          'Cache-Control': 'no-cache, no-store, max-age=0',
          Pragma: 'no-cache',
        },
      });
      return;
    }
    request.continue();
  });
  return page;
}

async function tryProvider(browser, provider, options = {}) {
  let page;
  try {
    page = await configurePage(browser, options);
    const result = await provider.run(page);
    if (page && !page.isClosed()) await page.close();
    return { ok: true, name: provider.name, result };
  } catch (error) {
    if (page) {
      try {
        if (!page.isClosed()) await page.close();
      } catch (_) { }
    }
    return {
      ok: false,
      name: provider.name,
      error: normalizeProviderError(error),
    };
  }
}

async function autoClickPlay(page) {
  try {
    const selectors = [
      '#btn-play',
      '.play-btn',
      '[data-testid*="play"]',
      'button[aria-label*="Play"]',
      'button[title*="Play"]',
      '.vjs-big-play-button',
      '.jw-icon-playback',
      '[class*="play"]',
      'button',
    ];

    for (const selector of selectors) {
      const el = await page.$(selector);
      if (!el) continue;

      const isVisible = await el.evaluate((element) => element.offsetParent !== null);
      if (isVisible) {
        await el.click();
        console.log(`[AutoClick] Clicked: ${selector}`);
        return;
      }
    }
  } catch (_) { }
}



async function validateStreamUrl(url, headers = {}) {
  if (!url) {
    throw new Error('Missing currentUrl');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    return await verifyHlsChain(url, headers, {
      signal: controller.signal,
      maxDepth: 3,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

functions.http('resolveStream', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Range, If-Range');

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  // ── GET: HLS Proxy endpoint ──
  if (req.method === 'GET') {
    const proxyTarget = req.query.hlsProxy;
    if (!proxyTarget) {
      return res.status(400).json({ error: 'Missing hlsProxy query parameter' });
    }
    try {
      return await handleHlsProxy(req, proxyTarget, res);
    } catch (e) {
      console.error(`[HLS-Proxy] Fatal: ${e.message}`);
      return res.status(502).json({ error: 'Proxy fetch failed', detail: e.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
  }

  const {
    tmdbId,
    type = 'movie',
    season,
    episode,
    title,
    forceSource,
    forceRefresh,
    healthOnly,
    currentUrl,
    currentHeaders,
  } = req.body || {};

  if (!tmdbId) {
    return res.status(400).json({ error: 'Missing required field: tmdbId' });
  }

  if (healthOnly === true) {
    try {
      const health = await validateStreamUrl(currentUrl, currentHeaders || {});
      return res.status(200).json({
        ok: health.healthy,
        healthy: health.healthy,
        status: health.status || null,
        checkedUrl: health.checkedUrl || currentUrl || null,
        mode: 'healthOnly',
      });
    } catch (e) {
      return res.status(200).json({
        ok: false,
        healthy: false,
        status: null,
        checkedUrl: currentUrl || null,
        mode: 'healthOnly',
        error: e.message,
      });
    }
  }

  const GLOBAL_TIMEOUT_MS = 55000;
  const startTime = Date.now();

  console.log('\n========================================');
  console.log(
    `Resolving: TMDB ${tmdbId} (${type}) S${season || '-'} E${episode || '-'} [Force: ${forceSource || 'None'}]`
  );
  console.log(`Force refresh: ${forceRefresh ? 'yes' : 'no'}`);
  console.log(`Mode: TIERED RACE | Global timeout: ${GLOBAL_TIMEOUT_MS}ms`);
  console.log('========================================');

  try {
    /*
     * ═══════════════════════════════════════════════════════════════
     * TWO-TIER PROVIDER ARCHITECTURE
     *
     * TIER 1 — "Lightning" (zero/low compute):
     *   • net22   → pure HTTP fetch, NO browser page needed (~1s)
     *   • vidlink → lightweight page, fast API (~3-5s)
     *   Race these first. If either returns a stream, we're done.
     *   We never open heavy Puppeteer sessions unnecessarily.
     *
     * TIER 2 — "Heavy" (full Puppeteer, only if Tier 1 fails):
     *   • vidsrcicu  → full browser navigation (~10-15s)
     *   • moviesapi  → full browser navigation (~10-15s)
     *   Only launched after Tier 1 exhausts or times out (8s).
     * ═══════════════════════════════════════════════════════════════
     */

    const TIER1_TIMEOUT_MS = 8000; // Max time to wait for fast providers

    // Define all providers with their tier and whether they need a browser page
    const allProviders = [
      { name: 'net22', tier: 1, needsPage: false, run: (_page) => resolveNet22(null, tmdbId, type, season, episode, title, getProxyBaseUrl(req)) },
      { name: 'vidlink', tier: 2, needsPage: true, run: (page) => resolveVidLink(page, tmdbId, type, season, episode) },
      { name: 'vidsrcicu', tier: 2, needsPage: true, run: (page) => resolveVidsrcIcu(page, tmdbId, type, season, episode) },
      { name: 'moviesapi', tier: 2, needsPage: true, run: (page) => resolveMoviesAPI(page, tmdbId, type, season, episode) },
    ];

    // If forceSource is set, run only that provider (skip tiering)
    const selectedProviders = forceSource
      ? allProviders.filter((p) => p.name === forceSource)
      : allProviders;

    if (selectedProviders.length === 0) {
      return res.status(400).json({
        error: 'Invalid forceSource',
        detail: `Unknown provider: ${forceSource}`,
      });
    }

    const failures = [];
    let winner = null;
    let browserPromise = null;

    // ── Helper: race a set of providers ──
    async function raceProviders(providers, timeoutMs, tierLabel) {
      if (providers.length === 0) return null;
      console.log(`[Resolver] ⚡ ${tierLabel}: Racing ${providers.length} providers (${timeoutMs}ms budget)...`);

      const needsBrowser = providers.some((provider) => provider.needsPage);
      if (needsBrowser && !browserPromise) {
        browserPromise = getBrowser();
      }
      const browser = needsBrowser ? await browserPromise : null;

      // Allocate pages only for providers that need one
      const entries = await Promise.all(
        providers.map(async (provider) => {
          const page = provider.needsPage
            ? await configurePage(browser, { forceRefresh: forceRefresh === true })
            : null;
          return { provider, page };
        })
      );

      // Kill helper
      const killPages = async (winnerPage) => {
        for (const entry of entries) {
          if (entry.page && entry.page !== winnerPage && !entry.page.isClosed()) {
            try { await entry.page.close(); } catch (_) { }
          }
        }
      };

      // Launch all providers concurrently
      const racePromises = entries.map(({ provider, page }) =>
        (async () => {
          try {
            const result = await provider.run(page);
            return { ok: true, name: provider.name, result, page };
          } catch (error) {
            return { ok: false, name: provider.name, error: normalizeProviderError(error), page };
          }
        })()
      );

      try {
        const result = await withGlobalTimeout(
          new Promise((resolve, reject) => {
            let pending = racePromises.length;

            racePromises.forEach((p) => {
              p.then((outcome) => {
                if (outcome.ok && !winner) {
                  console.log(`[Resolver] 🏆 ${outcome.name} won! (${tierLabel})`);
                  resolve(outcome);
                } else if (!outcome.ok) {
                  console.log(`[Resolver] ❌ ${outcome.name} failed: ${outcome.error?.message || 'unknown'}`);
                  failures.push({ provider: outcome.name, ...outcome.error });
                }

                pending--;
                if (pending === 0 && !winner) {
                  reject(new Error(`${tierLabel}: all providers failed`));
                }
              });
            });
          }),
          timeoutMs,
          tierLabel
        );

        // Kill losers immediately
        await killPages(result.page);
        if (result.page && !result.page.isClosed()) {
          try { await result.page.close(); } catch (_) { }
        }
        return result;
      } catch (e) {
        console.log(`[Resolver] ${tierLabel} exhausted: ${e.message}`);
        await killPages(null);
        return null;
      }
    }

    // ── EXECUTION ──

    if (forceSource) {
      // Forced mode: run only the selected provider with full timeout
      const remainingMs = GLOBAL_TIMEOUT_MS - (Date.now() - startTime);
      winner = await raceProviders(selectedProviders, remainingMs, 'Forced');
    } else {
      // Normal mode: Tier 1 first, then Tier 2 if needed
      const tier1 = selectedProviders.filter((p) => p.tier === 1);
      const tier2 = selectedProviders.filter((p) => p.tier === 2);

      // TIER 1 — fast providers (net22 + vidlink)
      winner = await raceProviders(tier1, TIER1_TIMEOUT_MS, 'Tier1-Lightning');

      // TIER 2 — heavy providers, only if Tier 1 failed
      if (!winner && tier2.length > 0) {
        const remainingMs = GLOBAL_TIMEOUT_MS - (Date.now() - startTime);
        if (remainingMs > 5000) {
          console.log(`[Resolver] Tier 1 failed, escalating to Tier 2 (${remainingMs}ms remaining)...`);
          winner = await raceProviders(tier2, remainingMs, 'Tier2-Heavy');
        } else {
          console.log(`[Resolver] Not enough time for Tier 2 (${remainingMs}ms remaining)`);
        }
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[Resolver] Race complete: ${winner ? '1 winner' : '0 winners'}, ${failures.length} failed (${elapsed}ms)`);

    // ── RESPONSE ──

    if (forceSource && !winner && failures.length > 0) {
      return res.status(502).json({
        error: 'Forced provider failed',
        detail: failures[0].message,
        failures,
        elapsed,
      });
    }

    if (winner) {
      const isEphemeral = isLikelyEphemeralStream(winner.result);
      console.log(`[Resolver] Returning ${isEphemeral ? 'ephemeral' : 'stable'} stream from ${winner.name}`);
      return res.status(200).json({
        ...winner.result,
        ...(isEphemeral ? { warning: 'ephemeral_stream_fallback' } : {}),
      });
    }

    return res.status(404).json({
      error: 'No stream found',
      detail: 'All configured providers failed to resolve a stream.',
      failures,
      elapsed,
    });
  } catch (e) {
    console.error(`Fatal error: ${e.message}`);
    return res.status(500).json({ error: 'Internal error', detail: e.message, elapsed: Date.now() - startTime });
  }
});
