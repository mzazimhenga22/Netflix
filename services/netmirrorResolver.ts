import axios from 'axios';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Buffer } from 'buffer';
import { getNetMirrorDomains, refreshNetMirrorDomains } from './netmirrorDomains';

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";
const TMDB_API_KEY = "8baba8ab6b8bbe247645bcae7df63d0d";
const POISON_MARKERS = ["/files/220884/"];
const MOBILE_USER_AGENT = "Mozilla/5.0 (Linux; Android 16; Pixel 9 Build/BP2A.250526.006; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.6943.137 Mobile Safari/537.36 /OS.Gatu v3.0";

export interface NetMirrorStream {
  url: string;
  headers: Record<string, string>;
  captions: any[];
  sourceId: string;
  expiresAt: number;
  title: string;
  isRateLimited?: boolean;
}

export interface NetMirrorCookies {
  net22Cookie: string;
  net52Cookie: string;
}

/**
 * Cookie cache — shared across Net22 and Net52 to avoid duplicate Firestore reads.
 * Cached for 5 minutes to prevent stale cookies.
 */
let _cookieCache: { cookies: NetMirrorCookies; fetchedAt: number } | null = null;
const COOKIE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Mobile API addhash token cache.
 * The addhash cookie from /mobile/home is the auth token for /mobile/hls/ endpoints.
 * This is the PRIMARY auth method — more reliable than Firestore cookies or play.php H-tokens.
 */
let _addHashCache: { token: string; domain: string; fetchedAt: number } | null = null;
const ADDHASH_CACHE_TTL_MS = 25 * 60 * 1000; // 25 minutes

/**
 * Fetch NetMirror cookies dynamically from Firestore.
 * - Cached for 5 mins so Net22 + Net52 share a single read
 * - 6s timeout so a slow/offline Firestore never hangs the resolver
 */
export async function fetchNetMirrorCookies(): Promise<NetMirrorCookies> {
  // Return cached cookies if still fresh
  if (_cookieCache && (Date.now() - _cookieCache.fetchedAt) < COOKIE_CACHE_TTL_MS) {
    console.log(`[NetMirrorResolver] 🍪 Using cached cookies (age: ${Math.round((Date.now() - _cookieCache.fetchedAt) / 1000)}s)`);
    return _cookieCache.cookies;
  }

  const t0 = Date.now();
  console.log(`[NetMirrorResolver] 🍪 Fetching cookies from Firestore...`);
  try {
    const docRef = doc(db, "config/netmirror");
    console.log(`[NetMirrorResolver] 🔌 Calling getDoc() on config/netmirror...`);
    
    // Timeout: don't let Firestore hang forever (6s max)
    const docSnapPromise = getDoc(docRef);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Firestore getDoc timeout (6s)')), 6000)
    );
    const docSnap = await Promise.race([docSnapPromise, timeoutPromise]);
    
    const elapsed = Date.now() - t0;
    if (docSnap.exists()) {
      const data = docSnap.data();
      const cookies = {
        net22Cookie: data.net22Cookie || "",
        net52Cookie: data.net52Cookie || ""
      };
      console.log(`[NetMirrorResolver] 🍪 Cookies fetched in ${elapsed}ms | net22: ${cookies.net22Cookie ? cookies.net22Cookie.substring(0, 40) + '...' : '(empty)'} | net52: ${cookies.net52Cookie ? cookies.net52Cookie.substring(0, 40) + '...' : '(empty)'}`);
      _cookieCache = { cookies, fetchedAt: Date.now() };
      return cookies;
    }
    console.warn(`[NetMirrorResolver] ⚠️ No cookies found in config/netmirror (${elapsed}ms)`);
  } catch (error: any) {
    const elapsed = Date.now() - t0;
    console.error(`[NetMirrorResolver] ❌ Failed to fetch cookies from Firestore (${elapsed}ms): ${error?.message || error}`);
  }
  return { net22Cookie: "", net52Cookie: "" };
}

/**
 * Fetch the mobile API auth token (addhash cookie) from /mobile/home.
 * Discovered from MITM traffic analysis of the NetMirror Android app.
 * The addhash cookie can be used directly as the `in=` parameter for /mobile/hls/ endpoints.
 * Cached for 25 minutes per domain.
 */
async function fetchMobileAddHash(domain: string): Promise<string> {
  // Check cache — must match the same domain
  if (_addHashCache && _addHashCache.domain === domain && (Date.now() - _addHashCache.fetchedAt) < ADDHASH_CACHE_TTL_MS) {
    console.log(`[MobileAPI] \uD83C\uDF6A Using cached addhash (age: ${Math.round((Date.now() - _addHashCache.fetchedAt) / 1000)}s)`);
    return _addHashCache.token;
  }

  const t0 = Date.now();
  console.log(`[MobileAPI] \uD83C\uDF10 Fetching addhash from https://${domain}/mobile/home?app=1...`);
  try {
    const res = await axios.get(`https://${domain}/mobile/home?app=1`, {
      headers: {
        'User-Agent': MOBILE_USER_AGENT,
        'X-Requested-With': 'app.netmirror.netmirrornew',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: () => true,
    });

    const setCookies: string[] = (res.headers['set-cookie'] as string[] | undefined) || [];
    for (const cookie of setCookies) {
      const match = cookie.match(/addhash=([^;]+)/);
      if (match) {
        const token = decodeURIComponent(match[1]);
        _addHashCache = { token, domain, fetchedAt: Date.now() };
        console.log(`[MobileAPI] \u2705 addhash obtained in ${Date.now() - t0}ms: ${token.substring(0, 50)}...`);
        return token;
      }
    }
    console.warn(`[MobileAPI] \u26A0\uFE0F No addhash cookie in response (${Date.now() - t0}ms)`);
  } catch (err: any) {
    console.error(`[MobileAPI] \u274C Failed to fetch addhash (${Date.now() - t0}ms): ${err.message}`);
  }
  return '';
}

/**
 * Invalidate the cached mobile addhash token.
 * Called when CDN returns "Only Valid Users Allowed" so the next attempt fetches a fresh token.
 */
export function invalidateMobileAddHash(): void {
  _addHashCache = null;
  console.log('[MobileAPI] \uD83D\uDDD1\uFE0F addhash cache invalidated');
}

/**
 * Standard request configuration for NetMirror requests.
 */
async function netMirrorRequest(url: string, cookie: string, referer: string = "https://net52.cc/home"): Promise<string> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    "Referer": referer,
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "sec-ch-ua": '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="8"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin"
  };
  if (cookie) {
    headers["Cookie"] = cookie;
  }

  const res = await axios.get(url, {
    headers,
    timeout: 10000,
    responseType: 'text'
  });
  return res.data;
}

/**
 * CDN specific M3U8 request.
 */
async function fetchCdnM3u8(url: string, originDomain: string = "https://net52.cc"): Promise<string> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    "Origin": originDomain,
    "Referer": `${originDomain}/`,
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "sec-ch-ua": '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="8"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "cross-site"
  };
  const res = await axios.get(url, {
    headers,
    timeout: 10000,
    responseType: 'text'
  });
  return res.data;
}

function isPoisonedM3u8(body: string): boolean {
  return POISON_MARKERS.some(marker => body.toLowerCase().includes(marker.toLowerCase()));
}

/**
 * Score how well a search result title matches the expected title.
 * Higher score = better match. Used to avoid "FROM" matching "From Rock Star to Killer".
 */
function scoreTitleMatch(resultTitle: string, searchTitle: string, searchYear: string): number {
  const rt = resultTitle.toLowerCase().trim();
  const st = searchTitle.toLowerCase().trim();

  // Exact match
  if (rt === st) return 100;

  // Exact match with year suffix (e.g. "FROM (2022)")
  if (searchYear && (rt === `${st} (${searchYear})` || rt === `${st} ${searchYear}`)) return 95;

  // Title starts with search + year
  if (searchYear && rt.startsWith(`${st} `) && rt.includes(searchYear)) return 90;

  // Starts with search title as a complete word
  if (rt === st + ':' || rt.startsWith(st + ': ') || rt.startsWith(st + ' - ')) return 50;

  // Year match only
  if (searchYear && rt.includes(searchYear)) return 20;

  // Contains search title somewhere
  if (rt.includes(st)) return 10;

  return 0;
}

function fixDeadCdnDomains(content: string): string {
  return content.replace(/nm-cdn(\d+)?\.top/gi, (_match: string, p1?: string) => {
    return p1 ? `freecdn${p1}.top` : `freecdn1.top`;
  });
}

function getHostFromUrl(url: string): string {
  const match = url.match(/^https?:\/\/([^/]+)/i);
  return match ? match[1] : '';
}

function getFileIdFromUrl(url: string, fallback: string): string {
  const match = url.match(/\/files\/([^\/]+)\//i);
  return match ? match[1] : fallback;
}

async function buildSyntheticHls(masterBody: string, fallbackId: string, masterUrl: string = '', originDomain: string = ''): Promise<string> {
  try {
    const audioUriMatch = masterBody.match(/URI="([^"]*\/a\/\d+\/[^\s"]+\.m3u8[^"]*)"/i) || masterBody.match(/URI="([^"]*\/a\/0\/0\.m3u8[^"]*)"/i);
    if (!audioUriMatch) {
      console.log("[SyntheticHLS] ⚠️ No audio URI found in master manifest");
      return masterBody;
    }
    let audioUri = audioUriMatch[1];
    console.log(`[SyntheticHLS] ℹ️ Found audio URI: ${audioUri}`);

    let audioHost = getHostFromUrl(audioUri);
    
    // If audio URI has no host (https:///files/...), derive it from:
    // 1. Any full CDN URL in the manifest body
    // 2. The master manifest URL itself
    if (!audioHost) {
      console.log("[SyntheticHLS] ⚠️ Audio URI has no host — searching manifest for CDN hostname...");
      
      // Try to find any full URL with a CDN host in the manifest body
      const cdnHostMatch = masterBody.match(/https?:\/\/(s\d+\.freecdn\d+\.top|[a-z0-9-]+\.freecdn\d+\.top|[a-z0-9-]+\.nm-cdn\d+\.top)/i);
      if (cdnHostMatch) {
        audioHost = cdnHostMatch[1];
        console.log(`[SyntheticHLS] ✅ Derived CDN host from manifest body: ${audioHost}`);
      }
      
      // Fallback: extract host from the master URL (e.g. net22.cc)
      if (!audioHost && masterUrl) {
        const masterHost = getHostFromUrl(masterUrl);
        if (masterHost) {
          audioHost = masterHost;
          console.log(`[SyntheticHLS] ✅ Using master URL host as fallback: ${audioHost}`);
        }
      }
      
      // Fallback: try common CDN pattern with the manifest URL
      if (!audioHost) {
        // Last resort: try to find ANY https://hostname/files/ pattern
        const anyHostMatch = masterBody.match(/https?:\/\/([a-z0-9.-]+)\/files\//i);
        if (anyHostMatch) {
          audioHost = anyHostMatch[1];
          console.log(`[SyntheticHLS] ✅ Found CDN host from /files/ pattern: ${audioHost}`);
        }
      }
      
      if (!audioHost) {
        console.error("[SyntheticHLS] ❌ Could not determine CDN host from any source");
        return masterBody;
      }
      
      // Fix the audio URI itself with the derived host
      audioUri = audioUri.replace(/^https?:\/\/\//, `https://${audioHost}/`);
      console.log(`[SyntheticHLS] 🔧 Fixed audio URI: ${audioUri}`);
    }
    
    const realFileId = getFileIdFromUrl(audioUri, fallbackId);
    console.log(`[SyntheticHLS] ℹ️ Audio host: ${audioHost}, Real File ID: ${realFileId}, Origin: ${originDomain}`);

    console.log(`[SyntheticHLS] 🌐 Fetching audio playlist: ${audioUri}`);
    const audioRes = await axios.get(audioUri, {
      headers: {
        'User-Agent': USER_AGENT,
        'Origin': originDomain,
        'Referer': `${originDomain}/`,
      },
      timeout: 10000
    });
    const audioPlaylistText = audioRes.data.toString();
    if (!audioPlaylistText.includes('#EXTINF')) {
      console.log("[SyntheticHLS] ⚠️ Audio playlist does not contain #EXTINF");
      return masterBody;
    }

    const lines = audioPlaylistText.split(/\r?\n/);
    const targetDurationLine = lines.find(l => l.includes('#EXT-X-TARGETDURATION:')) || '#EXT-X-TARGETDURATION:10';
    
    const segments: { durationInfo: string; name: string }[] = [];
    let currentDuration = '';
    for (let line of lines) {
      line = line.trim();
      if (line.startsWith('#EXTINF:')) {
        currentDuration = line;
      } else if (line && !line.startsWith('#')) {
        segments.push({ durationInfo: currentDuration, name: line });
      }
    }

    if (segments.length === 0) {
      console.log("[SyntheticHLS] ⚠️ No segments found in audio playlist");
      return masterBody;
    }

    const masterLines = masterBody.split(/\r?\n/);
    const newMasterLines: string[] = [];

    for (let i = 0; i < masterLines.length; i++) {
      const line = masterLines[i].trim();
      if (line && !line.startsWith('#') && (line.includes('.m3u8') || line.includes('/files/'))) {
        const qualityMatch = line.match(/\/files\/[^/]+\/([0-9a-zA-Z]+p)\//i) || line.match(/\/([0-9a-zA-Z]+p)\.m3u8/i);
        const quality = qualityMatch ? qualityMatch[1] : '720p';

        console.log(`[SyntheticHLS] 🛠️ Building synthetic variant for quality: ${quality}`);

        let syntheticText = `#EXTM3U\n#EXT-X-VERSION:3\n${targetDurationLine}\n#EXT-X-MEDIA-SEQUENCE:0\n`;
        for (const seg of segments) {
          const videoSegName = seg.name.replace(/\.js$/, '.jpg');
          const segUrl = `https://${audioHost}/files/${realFileId}/${quality}/${videoSegName}`;
          syntheticText += `${seg.durationInfo}\n${segUrl}\n`;
        }
        syntheticText += `#EXT-X-ENDLIST\n`;

        const base64 = Buffer.from(syntheticText).toString('base64');
        const dataUri = `data:application/x-mpegURL;base64,${base64}`;

        newMasterLines.push(dataUri);
      } else {
        newMasterLines.push(masterLines[i]);
      }
    }

    return newMasterLines.join('\n');
  } catch (err: any) {
    console.error(`[SyntheticHLS] ❌ Error generating synthetic HLS: ${err.message}`);
    return masterBody;
  }
}

/**
 * Normalize a source URL:
 * - Ensure absolute
 * - Fix dead CDN domains
 * - Replace placeholder auth tokens
 */
function normalizeSourceUrl(url: string, base: string, hToken: string): string {
  let finalUrl = url.startsWith('//') 
    ? `https:${url}` 
    : (url.startsWith('http') ? url : `${base}${url}`);
  
  // Fix dead CDN domains
  finalUrl = fixDeadCdnDomains(finalUrl);
  
  // Replace placeholder auth token with real h-token
  if (hToken && hToken.startsWith('in=')) {
    finalUrl = finalUrl.replace(/in=unknown[^&\s"']*/g, hToken);
  }
  
  return finalUrl;
}

/**
 * Rewrite the full manifest content:
 * 1. Fix dead CDN domains
 * 2. Replace placeholder auth tokens
 * 3. Fix empty hostnames (https:///files/)
 */
function rewriteManifest(content: string, hToken: string, fallbackHostname: string): string {
  // Remove BOM
  let rewritten = content.replace(/^\uFEFF/, '');
  
  // 1. Fix dead CDN domains
  rewritten = fixDeadCdnDomains(rewritten);
  
  // 2. Replace placeholder auth token with real h-token
  if (hToken && hToken.startsWith('in=')) {
    rewritten = rewritten.replace(/in=unknown[^\s&"']*/g, hToken);
  }
  
  // 3. Fix broken empty-hostname URIs (https:///files/)
  if (fallbackHostname && rewritten.includes("https:///")) {
    rewritten = rewritten.replace(/https:\/\/\//g, `https://${fallbackHostname}/`);
  }
  
  return rewritten;
}

/**
 * Extract the fallback hostname from manifest sources or manifest body for fixing broken URIs.
 */
function extractFallbackHostname(sources: any[], base: string, hToken: string, manifestBody: string = ''): string {
  // Try sources first
  for (const src of sources) {
    const url = normalizeSourceUrl(src.file, base, hToken);
    const match = url.match(/^https?:\/\/([^/]+)/);
    if (match && !match[1].match(/^net\d+\.cc$/) && !match[1].includes('netfree.cc') && !match[1].includes('netmirror.vip')) {
      return match[1];
    }
  }
  
  // Fallback: search manifest body for CDN hostnames
  if (manifestBody) {
    const cdnMatch = manifestBody.match(/https?:\/\/(s\d+\.freecdn\d+\.top|[a-z0-9-]+\.freecdn\d+\.top)/i);
    if (cdnMatch) {
      console.log(`[extractFallbackHostname] Derived CDN host from manifest body: ${cdnMatch[1]}`);
      return cdnMatch[1];
    }
    // Also try any hostname followed by /files/
    const filesMatch = manifestBody.match(/https?:\/\/([a-z0-9.-]+)\/files\//i);
    if (filesMatch && !filesMatch[1].match(/^net\d+\.cc$/) && !filesMatch[1].includes('netfree.cc')) {
      console.log(`[extractFallbackHostname] Derived host from /files/ pattern: ${filesMatch[1]}`);
      return filesMatch[1];
    }
  }
  
  return '';
}

/**
 * Validate a CDN stream URL to detect rate-limiting.
 * When rate-limited, CDN serves .jpg slideshow instead of real .ts segments.
 * Returns true if the stream is valid (not rate-limited).
 */
async function validateCdnStream(streamUrl: string, label: string): Promise<{ valid: boolean; rateLimited: boolean }> {
  try {
    const streamCheck = await axios.get(streamUrl, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 8000,
      responseType: 'text',
      validateStatus: (status) => true, // Don't throw on non-2xx so we can inspect
    });
    const status = streamCheck.status;
    const content = streamCheck.data?.toString() || '';
    
    if (status === 404) {
      console.error(`[${label}] ❌ CDN returned 404 — stream files don't exist`);
      return { valid: false, rateLimited: false };
    }
    if (status === 403) {
      console.error(`[${label}] ❌ CDN returned 403 — access denied (token expired or IP mismatch)`);
      return { valid: false, rateLimited: false };
    }
    if (status === 429) {
      console.warn(`[${label}] ⚠️ CDN returned 429 — rate limited`);
      return { valid: false, rateLimited: true };
    }
    if (status >= 400) {
      console.error(`[${label}] ❌ CDN returned HTTP ${status}`);
      return { valid: false, rateLimited: false };
    }
    
    if (content.includes('#EXTM3U')) {
      console.log(`[${label}] ✅ CDN returned valid HLS playlist (${content.length} bytes)`);
      return { valid: true, rateLimited: false };
    }
    
    // Check for rate-limit slideshow (serves .jpg instead of .ts)
    if (content.includes('.jpg') && !content.includes('.ts')) {
      console.warn(`[${label}] ⚠️ CDN returned slideshow manifest — rate limited`);
      return { valid: false, rateLimited: true };
    }
    
    // Detect HTML error pages (e.g. "<h1>Only Valid Users Allowed.</h1>")
    if (content.includes('<h1>') || content.includes('<html') || content.includes('<!DOCTYPE') || content.includes('Only Valid Users')) {
      console.error(`[${label}] ❌ CDN returned HTML error page (${content.length} bytes): "${content.substring(0, 60)}"`);
      // If CDN rejected our token, invalidate the cached addhash so next attempt gets a fresh one
      if (content.includes('Only Valid Users')) {
        invalidateMobileAddHash();
      }
      return { valid: false, rateLimited: false };
    }
    
    // Very short non-m3u8 responses are almost certainly error pages
    if (content.length < 50 && !content.includes('#EXT')) {
      console.error(`[${label}] ❌ CDN returned suspiciously short non-HLS response (${content.length} bytes)`);
      return { valid: false, rateLimited: false };
    }
    
    console.warn(`[${label}] ⚠️ CDN stream unclear (${content.length} bytes, starts: "${content.substring(0, 40)}..."), proceeding cautiously`);
    return { valid: true, rateLimited: false };
  } catch (err: any) {
    // Network errors (timeout, DNS, etc.) — don't block, might work for the player
    console.warn(`[${label}] ⚠️ CDN validation network error: ${err.message} — proceeding anyway`);
    return { valid: true, rateLimited: false };
  }
}

/**
 * Fetch canonical title and year from TMDB.
 */
async function getTmdbInfoForNet22(tmdbId: string, type: 'movie' | 'tv'): Promise<{ title: string; year: string }> {
  const mediaType = type === "tv" ? "tv" : "movie";
  const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}`;
  const body = await netMirrorRequest(url, "", "https://www.themoviedb.org/");
  const json = JSON.parse(body);
  const title = json.title || json.name || json.original_title || json.original_name || "";
  const date = json.release_date || json.first_air_date || "";
  const year = date.length >= 4 ? date.substring(0, 4) : "";
  return { title, year };
}

/**
 * Extract captions from playlist item tracks.
 */
function extractCaptions(tracks: any[], base: string, hToken: string): any[] {
  const captions: any[] = [];
  for (const track of tracks) {
    if (track.kind === "captions") {
      const captionUrl = track.file.startsWith("//") 
        ? `https:${track.file}` 
        : (track.file.startsWith("http") ? track.file : normalizeSourceUrl(track.file, base, hToken));
      captions.push({
        id: track.language || "en",
        url: captionUrl,
        language: track.label || track.language || "English",
        type: track.file.endsWith(".vtt") ? "vtt" : "srt"
      });
    }
  }
  return captions;
}

/**
 * Core resolver for a single NetMirror domain.
 */
async function resolveNetMirrorDomain(
  domain: string,
  sourceId: string,
  tmdbId: string,
  type: 'movie' | 'tv',
  season: number,
  episode: number,
  firestoreCookie: string
): Promise<NetMirrorStream> {
  const _resolveStartMs = Date.now();
  const label = `[${sourceId.toUpperCase()}Resolver]`;
  console.log(`${label} ──── START Resolving TMDB ${tmdbId} (${type}) S${season}E${episode} | cookie: ${firestoreCookie ? 'present(' + firestoreCookie.length + ' chars)' : 'NONE'} ────`);
  const tm = Math.floor(Date.now() / 1000).toString();
  const base = `https://${domain}`;

  // Step 1: TMDB title and year
  const tmdbT0 = Date.now();
  const { title: searchTitle, year: searchYear } = await getTmdbInfoForNet22(tmdbId, type);
  console.log(`${label} TMDB metadata in ${Date.now() - tmdbT0}ms: "${searchTitle}" (${searchYear})`);
  if (!searchTitle) throw new Error(`${sourceId}: Could not retrieve TMDB metadata`);

  console.log(`${label} Searching: "${searchTitle}" (${searchYear})`);

  // Step 2: Generate session cookie
  const sessionUserToken = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const sessionCookie = firestoreCookie || `user_token=${sessionUserToken}; ott=nf;`;
  const playbackCookie = `user_token=${sessionUserToken}; ott=nf; hd=on;`;

  // Step 3: Search
  const searchUrl = `${base}/search.php?s=${encodeURIComponent(searchTitle)}&t=${tm}`;
  const searchT0 = Date.now();
  const searchBody = await netMirrorRequest(searchUrl, sessionCookie, `${base}/home`);
  console.log(`${label} Search API in ${Date.now() - searchT0}ms (${searchBody.length} bytes)`);
  const searchJson = JSON.parse(searchBody);
  const results = searchJson.searchResult;
  if (!results || !Array.isArray(results) || results.length === 0) {
    console.error(`${label} ❌ Search returned no results. Raw keys: ${Object.keys(searchJson).join(', ')}`);
    throw new Error(`${sourceId}: No search results for "${searchTitle}"`);
  }
  console.log(`${label} Search returned ${results.length} result(s): ${results.slice(0, 3).map((r: any) => `"${r.t}" (id=${r.id})`).join(', ')}`);

  // Find best match by title similarity + year
  let bestResult = results[0];
  let bestScore = scoreTitleMatch(bestResult.t || '', searchTitle, searchYear);
  for (const item of results) {
    const score = scoreTitleMatch(item.t || '', searchTitle, searchYear);
    if (score > bestScore) {
      bestScore = score;
      bestResult = item;
    }
  }
  console.log(`${label} Best match: "${bestResult.t}" (score: ${bestScore})`);

  let rootId = bestResult.id;
  const contentTitle = bestResult.t || searchTitle;
  if (!rootId) throw new Error(`${sourceId}: No content ID found`);

  console.log(`${label} Found ID: ${rootId} ("${contentTitle}")`);

  // Step 4: Register view / resolve TV episode ID
  if (type === "tv" && episode > 0) {
    try {
      const postBody = await netMirrorRequest(
        `${base}/post.php?id=${rootId}&t=${tm}`,
        sessionCookie,
        `${base}/home`
      );
      const postJson = JSON.parse(postBody);
      const episodes = postJson.episodes || [];
      let epId = "";
      for (const ep of episodes) {
        if (ep.s === `S${season}` && ep.ep === episode.toString()) {
          epId = ep.id;
          break;
        }
      }
      if (epId) {
        rootId = epId;
        console.log(`${label} Matched S${season}E${episode} ID: ${rootId}`);
      } else {
        console.warn(`${label} Episode S${season}E${episode} not found in post.php, continuing with rootId`);
      }
    } catch (e: any) {
      console.warn(`${label} post.php warning: ${e.message}`);
    }
  } else {
    try {
      await netMirrorRequest(`${base}/post.php?id=${rootId}&t=${tm}`, sessionCookie, `${base}/home`);
    } catch (e: any) {
      console.warn(`${label} post.php warning: ${e.message}`);
    }
  }

  // Step 5: Dual Resolution Strategy
  let masterUrl = "";
  let masterBody = "";
  let isPoisoned = false;
  let finalCookie = sessionCookie;
  let finalCaptions: any[] = [];
  let hToken = "";

  // ──────────────────────────────────────────────────────────────────────
  // Method 0: Mobile API (Primary — fastest and most reliable)
  // Discovered from MITM traffic analysis of the NetMirror Android app.
  // Uses /mobile/home addhash cookie → /mobile/hls/{id}.m3u8 direct manifest.
  // Bypasses the desktop play.php (which is often dead) and Firestore cookies.
  // ──────────────────────────────────────────────────────────────────────
  try {
    const m0T0 = Date.now();
    const addHash = await fetchMobileAddHash(domain);
    if (addHash) {
      console.log(`${label} [Method 0] \uD83D\uDCF1 Mobile API — addhash token ready (${addHash.length} chars)`);

      // Try to get captions from mobile playlist (best effort, non-blocking)
      try {
        const mobilePlaylistBody = await netMirrorRequest(
          `${base}/mobile/playlist.php?id=${rootId}&t=${encodeURIComponent(contentTitle)}&tm=${tm}`,
          `addhash=${encodeURIComponent(addHash)}`,
          `${base}/mobile/home?app=1`
        );
        const mobilePl = JSON.parse(mobilePlaylistBody);
        if (Array.isArray(mobilePl) && mobilePl[0]?.tracks) {
          finalCaptions = extractCaptions(mobilePl[0].tracks, base, '');
          console.log(`${label} [Method 0] \uD83D\uDCDD Got ${finalCaptions.length} caption track(s) from mobile playlist`);
        }
      } catch (capErr: any) {
        console.log(`${label} [Method 0] \u2139\uFE0F Mobile playlist captions unavailable: ${capErr.message}`);
      }

      // Fetch master manifest from /mobile/hls/ endpoint
      const hlsUrl = `${base}/mobile/hls/${rootId}.m3u8?in=${encodeURIComponent(addHash)}&hd=on&lang=eng`;
      console.log(`${label} [Method 0] \uD83C\uDFAC Fetching: ${hlsUrl.substring(0, 100)}...`);

      const hlsRes = await axios.get(hlsUrl, {
        headers: {
          'User-Agent': MOBILE_USER_AGENT,
          'X-Requested-With': 'app.netmirror.netmirrornew',
          'Accept': '*/*',
          'Referer': `${base}/mobile/home?app=1`,
          'Cookie': `addhash=${encodeURIComponent(addHash)}`,
          'sec-ch-ua-mobile': '?1',
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-Mode': 'cors',
        },
        timeout: 10000,
        responseType: 'text',
      });

      const m0Body = typeof hlsRes.data === 'string' ? hlsRes.data : String(hlsRes.data);

      if (m0Body.includes('#EXTM3U') && !m0Body.includes('in=unknown')) {
        masterBody = m0Body;
        masterUrl = hlsUrl;
        console.log(`${label} [Method 0] \u2705 Valid master manifest in ${Date.now() - m0T0}ms (${masterBody.length} bytes)`);
      } else if (m0Body.includes('in=unknown')) {
        console.warn(`${label} [Method 0] \u26A0\uFE0F Manifest contains in=unknown — addhash token not accepted (${Date.now() - m0T0}ms)`);
        // Invalidate the cache so next attempt gets a fresh token
        invalidateMobileAddHash();
      } else {
        console.warn(`${label} [Method 0] \u26A0\uFE0F Invalid manifest response (${Date.now() - m0T0}ms, ${m0Body.length} bytes)`);
      }
    } else {
      console.warn(`${label} [Method 0] \u26A0\uFE0F Could not obtain addhash token`);
    }
  } catch (m0Err: any) {
    console.warn(`${label} [Method 0] \u274C Mobile API failed: ${m0Err.message}`);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Desktop API Fallback — only if Mobile API didn't produce a valid manifest
  // ──────────────────────────────────────────────────────────────────────
  if (!masterBody || !masterBody.includes('#EXTM3U')) {
    console.log(`${label} [Desktop Fallback] Mobile API didn't resolve — trying desktop methods...`);

  // Method 1: Try Firestore Cookies (direct playlist without play.php)
  if (firestoreCookie) {
    try {
      console.log(`${label} [Method 1] Resolving via Firestore cookies...`);
      const m1T0 = Date.now();
      const playlistBody = await netMirrorRequest(
        `${base}/playlist.php?id=${rootId}&tm=${tm}`,
        firestoreCookie,
        `${base}/home`
      );
      console.log(`${label} [Method 1] playlist.php in ${Date.now() - m1T0}ms (${playlistBody.length} bytes)`);
      const playlist = JSON.parse(playlistBody);
      if (playlist && playlist.length > 0) {
        const item = playlist[0];
        const sources = item.sources;
        if (sources && sources.length > 0) {
          const file = sources[0].file;
          masterUrl = normalizeSourceUrl(file, base, "");
          
          if (masterUrl.includes("in=unknown")) {
            isPoisoned = true;
            console.warn(`${label} [Method 1] Manifest URL placeholder (in=unknown) detected.`);
          } else {
            console.log(`${label} Fetching Method 1 manifest: ${masterUrl.substring(0, 80)}...`);
            masterBody = await fetchCdnM3u8(masterUrl, base);

            if (isPoisonedM3u8(masterBody)) {
              isPoisoned = true;
              console.warn(`${label} [Method 1] Retrieved manifest is poisoned.`);
            } else {
              finalCaptions = extractCaptions(item.tracks || [], base, "");
            }
          }
        }
      }
    } catch (err: any) {
      isPoisoned = true;
      console.warn(`${label} [Method 1] Failed: ${err.message}`);
    }
  }

  // Method 2: Fallback to play.php dynamic token (IP-bound)
  if (!firestoreCookie || isPoisoned) {
    console.log(`${label} [Method 2] Activating dynamic session + play.php H-Token fallback... (reason: ${!firestoreCookie ? 'no cookie' : 'poisoned manifest'})`);
    finalCookie = playbackCookie;

    // CRITICAL: Pass ep= parameter for TV episodes (required for correct h-token generation)
    let playData = `id=${rootId}`;
    if (type === "tv" && episode > 0) {
      playData += `&ep=${episode}`;
    }

    // Fetch H-Token
    const m2T0 = Date.now();
    const playResBody = await axios.post(`${base}/play.php`, playData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': playbackCookie,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${base}/`,
        'User-Agent': USER_AGENT,
        'Origin': base,
      },
      timeout: 10000
    });
    console.log(`${label} [Method 2] play.php responded in ${Date.now() - m2T0}ms`);

    const playData2 = typeof playResBody.data === 'string' ? JSON.parse(playResBody.data) : playResBody.data;
    hToken = playData2?.h || "";
    if (!hToken || hToken === 'error') {
      console.error(`${label} [Method 2] ❌ play.php returned invalid h-token: ${JSON.stringify(playData2).substring(0, 200)}`);
      throw new Error(`${sourceId}: Invalid H-Token returned from play.php`);
    }
    console.log(`${label} [Method 2] Got H-Token: ${hToken.substring(0, 50)}...`);

    // Call playlist.php with h parameter
    const playlistBody = await netMirrorRequest(
      `${base}/playlist.php?id=${rootId}&t=${tm}&h=${hToken}&ott=nf`,
      finalCookie,
      `${base}/`
    );

    const playlist = JSON.parse(playlistBody);
    if (!playlist || playlist.length === 0) {
      throw new Error(`${sourceId}: Received empty playlist in fallback mode`);
    }

    const item = playlist[0];
    const file = item.sources[0].file;
    masterUrl = normalizeSourceUrl(file, base, hToken);

    console.log(`${label} [Method 2] Rewritten Master URL: ${masterUrl.substring(0, 80)}...`);

    // Fetch the manifest
    masterBody = await axios.get(masterUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        "Referer": `${base}/`,
        "Origin": base,
        "Cookie": finalCookie
      },
      timeout: 10000
    }).then(r => r.data);

    // Extract captions
    finalCaptions = extractCaptions(item.tracks || [], base, hToken);
    
    // Extract fallback hostname for broken URIs
    const fallbackHostname = extractFallbackHostname(item.sources, base, hToken, masterBody);
    
    // Full manifest rewrite
    masterBody = rewriteManifest(masterBody, hToken, fallbackHostname);

    // Unpoison: replace /files/220884/ with real content ID
    const audioIdMatch2 = masterBody.match(/\/files\/([A-Z0-9]{10,}|\d{5,})\/a\//);
    const realId = audioIdMatch2?.[1] || rootId;
    if (masterBody.includes('/files/220884/') && realId) {
      console.log(`${label} Unpoisoning manifest: 220884 → ${realId}`);
      masterBody = masterBody.replace(/\/files\/220884\//g, `/files/${realId}/`);
    }

    if (isPoisonedM3u8(masterBody)) {
      throw new Error(`${sourceId}: CDN returned poisoned manifest and unpoisoning failed`);
    }
  }

  } // end desktop API fallback (Method 1/2 block)

  // Step 6: Validate if we have the manifest body
  if (!masterBody || !masterBody.includes('#EXTM3U')) {
    throw new Error(`${sourceId}: Invalid or empty manifest`);
  }

  // Step 7: If Method 1 was used without hToken, apply CDN domain fixes
  if (!hToken) {
    // Derive fallback hostname from manifest body for fixing broken https:/// URIs
    const m1HostMatch = masterBody.match(/https?:\/\/(s\d+\.freecdn\d+\.top|[a-z0-9-]+\.freecdn\d+\.top)/i)
      || masterBody.match(/https?:\/\/([a-z0-9.-]+)\/files\//i);
    const fallbackHostname = m1HostMatch ? m1HostMatch[1] : '';
    masterBody = rewriteManifest(masterBody, hToken, fallbackHostname);
  }

  // Step 7b: Unpoison manifest if still poisoned (for Method 1 path)
  if (masterBody.includes('/files/220884/')) {
    const audioIdMatch3 = masterBody.match(/\/files\/([A-Z0-9]{10,}|\d{5,})\/a\//);
    const fallbackId = audioIdMatch3?.[1] || rootId;
    if (fallbackId) {
      console.log(`${label} Unpoisoning Method 1 manifest: 220884 → ${fallbackId}`);
      masterBody = masterBody.replace(/\/files\/220884\//g, `/files/${fallbackId}/`);
    }
  }

  // Step 7c: Generate synthetic HLS manifest using same CDN path as audio
  const finalFileIdMatch = masterBody.match(/\/files\/([A-Z0-9]{10,}|\d{5,})\/a\//);
  const finalRealFileId = finalFileIdMatch?.[1] || rootId;
  masterBody = await buildSyntheticHls(masterBody, finalRealFileId, masterUrl, base);

  // Step 8: Validate CDN stream (rate-limit detection)
  // After synthetic HLS, look for actual CDN segment URLs (the audio-derived paths)
  // These are in the synthetic variant playlists embedded as data: URIs
  const manifestLines = masterBody.split('\n');
  const cdnStreamUrls = manifestLines
    .map((l: string) => l.trim())
    .filter((l: string) => l.startsWith('http') && (l.includes('.m3u8') || l.includes('/files/')));

  // Also extract segment URLs from embedded data: URIs for validation
  let segmentTestUrl = '';
  const dataUriLines = manifestLines.filter((l: string) => l.trim().startsWith('data:'));
  if (dataUriLines.length > 0) {
    try {
      const b64 = dataUriLines[0].trim().replace(/^data:[^;]+;base64,/, '');
      const decoded = Buffer.from(b64, 'base64').toString('utf-8');
      const segLines = decoded.split('\n').filter((l: string) => l.trim().startsWith('http'));
      if (segLines.length > 0) {
        segmentTestUrl = segLines[0].trim();
      }
    } catch {}
  }

  // Prefer testing a synthetic segment URL (audio-derived), fall back to .m3u8 variant
  const testUrl = segmentTestUrl || (cdnStreamUrls.length > 0 ? cdnStreamUrls[0] : '');
  
  if (testUrl) {
    console.log(`${label} 🧪 Validating CDN stream: ${testUrl.substring(0, 80)}...`);
    const { valid, rateLimited } = await validateCdnStream(testUrl, label);
    
    if (rateLimited) {
      console.error(`${label} ❌ Rate limited by CDN — returning empty stream`);
      return {
        url: "",
        headers: {},
        captions: [],
        sourceId,
        expiresAt: Date.now(),
        title: contentTitle,
        isRateLimited: true
      };
    }
    
    if (!valid) {
      console.error(`${label} ❌ CDN validation failed — stream is not playable`);
      throw new Error(`${sourceId}: CDN stream validation failed (not a valid HLS response)`);
    }
  }

  // Step 9: Build data URI from the full rewritten manifest
  // This gives the player the complete adaptive bitrate manifest with all quality variants
  const base64Manifest = Buffer.from(masterBody).toString('base64');
  const dataUri = `data:application/x-mpegURL;base64,${base64Manifest}`;
  
  const totalElapsed = Date.now() - _resolveStartMs;
  console.log(`${label} ✨ SUCCESS in ${totalElapsed}ms! Manifest size: ${masterBody.length} bytes, ${cdnStreamUrls.length} variant(s), ${finalCaptions.length} caption(s)`);

  // Also determine a direct CDN URL fallback (highest quality variant)
  let directUrl = masterUrl;
  if (cdnStreamUrls.length > 0) {
    directUrl = cdnStreamUrls[cdnStreamUrls.length - 1]; // Highest quality = last
  }

  return {
    url: dataUri,  // Primary: full manifest as data URI
    headers: {
      "User-Agent": USER_AGENT,
      "Referer": `${base}/`,
      "Origin": base,
      "Cookie": finalCookie
    },
    captions: finalCaptions,
    sourceId,
    expiresAt: Date.now() + 3 * 60 * 60 * 1000,
    title: contentTitle
  };
}

/**
 * Resolve Net22 stream.
 */
export async function resolveNet22(
  tmdbId: string,
  type: 'movie' | 'tv',
  season: number = 0,
  episode: number = 0
): Promise<NetMirrorStream> {
  const t0 = Date.now();
  console.log(`[Net22] ▶️ resolveNet22 called: TMDB ${tmdbId} (${type}) S${season}E${episode}`);
  try {
    // Auto-discover the live domain instead of hardcoding
    const { net22Domain } = await getNetMirrorDomains();
    console.log(`[Net22] 🌐 Using discovered domain: ${net22Domain}`);
    const { net22Cookie } = await fetchNetMirrorCookies();
    console.log(`[Net22] 🍪 Cookie fetch done in ${Date.now() - t0}ms`);
    const result = await resolveNetMirrorDomain(net22Domain, "net22", tmdbId, type, season, episode, net22Cookie);
    console.log(`[Net22] ✅ resolveNet22 total: ${Date.now() - t0}ms | url: ${result.url ? result.url.substring(0, 60) + '...' : 'EMPTY'} | rateLimited: ${result.isRateLimited || false}`);
    return result;
  } catch (err: any) {
    console.error(`[Net22] ❌ resolveNet22 FAILED after ${Date.now() - t0}ms: ${err.message}`);
    // If the domain might have rotated, force a refresh for next attempt
    if (err.message?.includes('ENOTFOUND') || err.message?.includes('ECONNREFUSED') || err.message?.includes('Network Error')) {
      console.log(`[Net22] 🔄 Domain may have rotated — refreshing for next attempt`);
      refreshNetMirrorDomains().catch(() => {});
    }
    throw err;
  }
}

/**
 * Resolve Net52 stream.
 * Tries root API first, then /pv/ API fallback.
 */
export async function resolveNet52(
  tmdbId: string,
  type: 'movie' | 'tv',
  season: number = 0,
  episode: number = 0
): Promise<NetMirrorStream> {
  const t0 = Date.now();
  console.log(`[Net52] ▶️ resolveNet52 called: TMDB ${tmdbId} (${type}) S${season}E${episode}`);
  // Auto-discover the live domain instead of hardcoding
  const { net52Domain } = await getNetMirrorDomains();
  console.log(`[Net52] 🌐 Using discovered domain: ${net52Domain}`);
  const { net52Cookie } = await fetchNetMirrorCookies();
  console.log(`[Net52] 🍪 Cookie fetch done in ${Date.now() - t0}ms`);
  
  // Try root API first (same as net22 pattern)
  try {
    const rootT0 = Date.now();
    const result = await resolveNetMirrorDomain(net52Domain, "net52", tmdbId, type, season, episode, net52Cookie);
    console.log(`[Net52] ✅ Root API resolved in ${Date.now() - rootT0}ms (total ${Date.now() - t0}ms) | url: ${result.url ? result.url.substring(0, 60) + '...' : 'EMPTY'} | rateLimited: ${result.isRateLimited || false}`);
    return result;
  } catch (rootErr: any) {
    console.log(`[Net52] ⚠️ Root API failed after ${Date.now() - t0}ms: ${rootErr.message}. Trying /pv/ API...`);
  }

  // Fallback to /pv/ API
  try {
    const pvT0 = Date.now();
    const result = await resolveNet52Pv(tmdbId, type, season, episode, net52Cookie);
    console.log(`[Net52] ✅ /pv/ API resolved in ${Date.now() - pvT0}ms (total ${Date.now() - t0}ms) | url: ${result.url ? result.url.substring(0, 60) + '...' : 'EMPTY'} | rateLimited: ${result.isRateLimited || false}`);
    return result;
  } catch (pvErr: any) {
    console.error(`[Net52] ❌ resolveNet52 FULLY FAILED after ${Date.now() - t0}ms | root: failed | /pv/: ${pvErr.message}`);
    // If the domain might have rotated, force a refresh for next attempt
    if (pvErr.message?.includes('ENOTFOUND') || pvErr.message?.includes('ECONNREFUSED') || pvErr.message?.includes('Network Error')) {
      console.log(`[Net52] 🔄 Domain may have rotated — refreshing for next attempt`);
      refreshNetMirrorDomains().catch(() => {});
    }
    throw pvErr;
  }
}

/**
 * Resolve Net52 stream via /pv/ API path.
 */
async function resolveNet52Pv(
  tmdbId: string,
  type: 'movie' | 'tv',
  season: number,
  episode: number,
  firestoreCookie: string
): Promise<NetMirrorStream> {
  const label = "[Net52PvResolver]";
  // Use the discovered net52 domain
  const { net52Domain } = await getNetMirrorDomains();
  const base = `https://${net52Domain}`;
  const tm = Math.floor(Date.now() / 1000).toString();

  // TMDB info
  const { title: searchTitle, year: searchYear } = await getTmdbInfoForNet22(tmdbId, type);
  if (!searchTitle) throw new Error("Net52Pv: Could not retrieve TMDB metadata");

  // Session
  const sessionUserToken = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const finalCookie = firestoreCookie || `user_token=${sessionUserToken}; ott=pv; hd=on;`;

  // Search /pv/ API
  console.log(`${label} Searching /pv/ API for "${searchTitle}"...`);
  const searchUrl = `${base}/pv/search.php?s=${encodeURIComponent(searchTitle)}&t=${tm}`;
  const searchBody = await netMirrorRequest(searchUrl, finalCookie, `${base}/search`);
  const searchJson = JSON.parse(searchBody);
  const results = searchJson.searchResult;
  if (!results || !Array.isArray(results) || results.length === 0) {
    throw new Error(`Net52Pv: No search results for "${searchTitle}"`);
  }

  // Best match by title similarity + year
  let bestResult = results[0];
  let bestScore = scoreTitleMatch(bestResult.t || '', searchTitle, searchYear);
  for (const item of results) {
    const score = scoreTitleMatch(item.t || '', searchTitle, searchYear);
    if (score > bestScore) {
      bestScore = score;
      bestResult = item;
    }
  }
  console.log(`${label} Best match: "${bestResult.t}" (score: ${bestScore})`);
  let resolvedId = bestResult.id;
  const contentTitle = bestResult.t || searchTitle;
  if (!resolvedId) throw new Error("Net52Pv: No content ID");

  console.log(`${label} Found ID: ${resolvedId} ("${contentTitle}")`);

  // Register view
  try {
    await netMirrorRequest(`${base}/pv/post.php?id=${encodeURIComponent(resolvedId)}&t=${tm}`, finalCookie, `${base}/search`);
  } catch (e) {}

  // Playlist (Direct call with cookie, no H-Token needed)
  console.log(`${label} Fetching playlist directly...`);
  const playlistBody = await netMirrorRequest(
    `${base}/pv/playlist.php?id=${encodeURIComponent(resolvedId)}&t=${tm}&tm=${tm}&ott=pv`,
    finalCookie,
    `${base}/search`
  );

  const playlist = JSON.parse(playlistBody);
  if (!playlist || playlist.length === 0) {
    throw new Error("Net52Pv: Empty playlist");
  }

  // For TV shows, find the right episode in the playlist
  let item = playlist[0];
  if (type === "tv" && episode > 0) {
    for (let i = 0; i < playlist.length; i++) {
      const epItem = playlist[i];
      const epTitle = epItem.t || "";
      if (
        epTitle.toLowerCase().includes(`episode ${episode}`) ||
        epTitle.toLowerCase().includes(`e${episode}`) ||
        epTitle.startsWith(`${episode} `) ||
        (playlist.length >= episode && i === episode - 1 && !epTitle.toLowerCase().includes("episode"))
      ) {
        item = epItem;
        break;
      }
    }
  }

  // Resolve source URL and extract hToken
  const file = item.sources[0].file;
  const urlTokenMatch = file.match(/[?&](in=[^&\s"']+)/);
  const hToken = urlTokenMatch ? urlTokenMatch[1] : '';

  let masterUrl: string;
  if (file.startsWith("http")) {
    masterUrl = file;
  } else if (file.startsWith("/pv/")) {
    masterUrl = `${base}${file}`;
  } else if (file.startsWith("/")) {
    masterUrl = `${base}/pv${file}`;
  } else {
    masterUrl = `${base}/pv/${file}`;
  }
  masterUrl = normalizeSourceUrl(masterUrl, base, hToken);
  
  console.log(`${label} Master URL: ${masterUrl.substring(0, 80)}...`);

  // Fetch manifest
  let masterBody = await axios.get(masterUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      "Referer": `${base}/search`,
      "Origin": base,
      "Cookie": finalCookie
    },
    timeout: 10000
  }).then(r => r.data);

  // Rewrite manifest
  const fallbackHostname = extractFallbackHostname(item.sources, base, hToken, masterBody);
  masterBody = rewriteManifest(masterBody, hToken, fallbackHostname);

  // Unpoison Net52 manifest: replace /files/220884/ with the real ID
  const audioIdMatch = masterBody.match(/\/files\/([A-Z0-9]{10,})\/a\//);
  const realFileId = audioIdMatch?.[1] || resolvedId;
  if (realFileId) {
    console.log(`${label} Unpoisoning CDN files: replacing /files/220884/ with /files/${realFileId}/`);
    masterBody = masterBody.replace(/\/files\/220884\//g, `/files/${realFileId}/`);
  }

  if (isPoisonedM3u8(masterBody)) {
    throw new Error("Net52Pv: CDN returned poisoned manifest and unpoisoning failed");
  }

  // Generate synthetic HLS manifest using same CDN path as audio
  masterBody = await buildSyntheticHls(masterBody, realFileId, masterUrl, base);

  // Validate
  const cdnStreamUrls = masterBody.split('\n')
    .map((l: string) => l.trim())
    .filter((l: string) => l.startsWith('http') && l.includes('.m3u8'));

  if (cdnStreamUrls.length > 0) {
    const { valid, rateLimited } = await validateCdnStream(cdnStreamUrls[0], label);
    if (rateLimited) {
      return {
        url: "", headers: {}, captions: [],
        sourceId: "net52", expiresAt: Date.now(),
        title: contentTitle, isRateLimited: true
      };
    }
    if (!valid) {
      throw new Error('Net52Pv: CDN stream validation failed (not a valid HLS response)');
    }
  }

  // Build data URI
  const base64Manifest = Buffer.from(masterBody).toString('base64');
  const dataUri = `data:application/x-mpegURL;base64,${base64Manifest}`;
  
  const finalCaptions = extractCaptions(item.tracks || [], base, hToken);

  console.log(`${label} ✨ SUCCESS! Manifest: ${masterBody.length} bytes, ${cdnStreamUrls.length} variant(s)`);

  return {
    url: dataUri,
    headers: {
      "User-Agent": USER_AGENT,
      "Referer": `${base}/search`,
      "Origin": base,
      "Cookie": finalCookie
    },
    captions: finalCaptions,
    sourceId: "net52",
    expiresAt: Date.now() + 3 * 60 * 60 * 1000,
    title: contentTitle
  };
}
