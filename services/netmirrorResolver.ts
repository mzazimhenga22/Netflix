/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * NetMirror Stream Resolver — Mobile API with Nurture Flow
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Working flow (MITM-verified 2026-06-17):
 *
 *   1. GET  /mobile/home?app=1           → addhash cookie (4-part, ::eb flag)
 *   2. GET  userver.{domain}/?ffr455=... → trigger monetag ad chain
 *   3. DWELL 38 seconds                  → wait for sftouch/qlog postback
 *   4. POST /mobile/verify2.php          → t_hash_t cookie (5-part)
 *   5. GET  /mobile/home?app=1           → returning-session refresh (with x-requested-with)
 *   6. GET  /mobile/post.php?id={showId} → episode list (TV) or content metadata (movie)
 *   7. GET  /mobile/playlist.php?id={id} → server-generated HLS URL with ?in= hash
 *   8. POST /mobile/recentplay.php       → register content session (recentplay=SE{showId})
 *   9. GET  /mobile/hls/{id}.m3u8?in=... → master HLS manifest (using server URL from step 7)
 *
 * OTT Sections (discovered 2026-06-25):
 *   NF (Netflix):      /search.php, /mobile/post.php, /mobile/episodes.php, /mobile/playlist.php
 *   PV (Prime Video):  /mobile/pv/search.php, /mobile/pv/post.php, /mobile/pv/episodes.php, /mobile/pv/playlist.php
 *   → PV IDs are alphanumeric (e.g. 0UABA3VF0B9O4BUEJ395QE759W)
 *   → PV requires ott=pv cookie
 *   → Resolver tries NF first, then PV if no NF match found
 *
 * CRITICAL RULES (from MITM + CDN verification):
 *   ✅ The ?in= hash is SERVER-GENERATED in playlist.php — do NOT build it client-side
 *   ✅ Server-issued variant URLs in manifests are CORRECT — pass verbatim
 *   ❌ Do NOT rewrite contentId or regenerate ?in= hashes on variants
 *   ✅ Only fix empty audio hosts: https:/// → https://{cdnHost}/
 *   ✅ SE cookie: SE{showId}={contentId} (not SE{random}={contentId})
 *   ✅ recentplay POST body: recentplay=SE{showId}
 *   ✅ Single domain: net52.cc
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import axios from 'axios';
import { Buffer } from 'buffer';
import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DownloadService = NativeModules.DownloadService;

/**
 * Native HTTP fetch via Android's HttpURLConnection.
 * Bypasses React Native's JS bridge which strips Set-Cookie headers.
 * Falls back to axios on non-Android platforms.
 */
async function nativeFetch(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; body: string; headers: Record<string, string[]> }> {
  if (Platform.OS === 'android' && DownloadService?.nativeFetch) {
    try {
      const result = await DownloadService.nativeFetch(url, {
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body || '',
      });
      // Convert ReadableMap headers to Record<string, string[]>
      const headers: Record<string, string[]> = {};
      if (result.headers) {
        const rawHeaders = result.headers as any;
        // nativeFetch returns headers as { key: [val1, val2] }
        for (const key of Object.keys(rawHeaders)) {
          const val = rawHeaders[key];
          headers[key] = Array.isArray(val) ? val : [String(val)];
        }
      }
      return { status: result.status, body: result.body || '', headers };
    } catch (err: any) {
      console.log(`[NetMirror] ⚠️ nativeFetch failed, falling back to axios: ${err.message}`);
    }
  }
  // Fallback: axios (won't have Set-Cookie but at least works)
  const res = await axios({ url, method: options.method || 'GET', headers: options.headers, data: options.body, timeout: 15000, validateStatus: () => true });
  const headers: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(res.headers)) {
    headers[k] = Array.isArray(v) ? v : [String(v)];
  }
  return { status: res.status, body: typeof res.data === 'string' ? res.data : JSON.stringify(res.data), headers };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DOMAIN = 'net52.cc';

const TMDB_API_KEY = '8baba8ab6b8bbe247645bcae7df63d0d';

/** Exact User-Agent from real NetMirror Android app (MITM-verified) */
const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 16; sdk_gphone64_x86_64 Build/BE2A.250530.026.D1; wv) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.6943.137 ' +
  'Mobile Safari/537.36 /OS.Gatu v3.0';

const SEC_CH_UA =
  '"Not(A:Brand";v="99", "Android WebView";v="133", "Chromium";v="133"';

const X_REQUESTED_WITH = 'app.netmirror.netmirrornew';

// ─── OTT Section Types ───────────────────────────────────────────────────────

/** Supported OTT content sections */
type OttSection = 'nf' | 'pv';

/** All OTT sections to try, in priority order */
const OTT_SEARCH_ORDER: OttSection[] = ['nf', 'pv'];

/**
 * Get the URL path prefix for an OTT section.
 * NF uses the default paths, PV uses /mobile/pv/ prefix.
 */
function ottPathPrefix(ott: OttSection): string {
  switch (ott) {
    case 'nf': return '/mobile';
    case 'pv': return '/mobile/pv';
    default: return '/mobile';
  }
}

// Old ottSearchPath removed — replaced by ottSearchPaths (multi-endpoint resilience)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NetMirrorStream {
  url: string;
  headers: Record<string, string>;
  captions: any[];
  sourceId: string;
  expiresAt: number;
  title: string;
  isRateLimited?: boolean;
}

// ─── Session Types & Cache ────────────────────────────────────────────────────

interface WarmSession {
  domain: string;
  addhashRaw: string;       // decoded 4-part token (hash1::hash2::ts::eb)
  addhashEncoded: string;    // URL-encoded for Cookie header
  tHashTEncoded: string;     // URL-encoded 5-part t_hash_t
  tHashTRaw: string;         // decoded t_hash_t (for playlist.php userhash param)
  fetchedAt: number;
}

let _session: WarmSession | null = null;
let _sessionInFlight: Promise<WarmSession | null> | null = null;
const SESSION_TTL_MS = 10 * 60 * 60 * 1000; // 10 hours (real app session lasts ~12hrs)
const SESSION_STORAGE_KEY = 'netmirror_session';

// ─── Utility Helpers ──────────────────────────────────────────────────────────

function randomHex(bytes: number): string {
  return Array.from({ length: bytes * 2 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

/** Standard mobile headers matching the real NetMirror app */
function mobileHeaders(referer: string, includeXRW: boolean = true): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': MOBILE_UA,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'sec-ch-ua': SEC_CH_UA,
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    'Referer': referer,
  };
  if (includeXRW) {
    headers['X-Requested-With'] = X_REQUESTED_WITH;
  }
  return headers;
}

/** Extract a named cookie value from Set-Cookie response headers */
function extractSetCookie(headers: any, name: string): string {
  // Try 'set-cookie' key (nativeFetch returns lowercase keys with arrays)
  const setCookies = headers?.['set-cookie'] || headers?.['Set-Cookie'];
  if (!setCookies) return '';
  const list = Array.isArray(setCookies) ? setCookies : [setCookies];
  for (const h of list) {
    const trimmed = String(h).trim();
    if (trimmed.startsWith(`${name}=`)) {
      return trimmed.substring(name.length + 1).split(';')[0].trim();
    }
  }
  return '';
}

// ─── Session Warmup Steps ─────────────────────────────────────────────────────

/**
 * Step 1: GET /mobile/home?app=1 → addhash cookie
 * MITM shows: first request has NO x-requested-with header, just sec-fetch-site: none
 */
async function fetchAddhash(
  domain: string
): Promise<{ raw: string; encoded: string } | null> {
  const url = `https://${domain}/mobile/home?app=1`;
  console.log(`[NetMirror] 🌐 Step 1: GET ${url} (using nativeFetch for Set-Cookie)`);

  try {
    const reqHeaders: Record<string, string> = {
      'User-Agent': MOBILE_UA,
      'Accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'sec-ch-ua': SEC_CH_UA,
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      // MITM shows x-requested-with is EMPTY on first home request (line 116)
      'x-requested-with': '',
    };

    const res = await nativeFetch(url, { method: 'GET', headers: reqHeaders });

    // Extract addhash from Set-Cookie (nativeFetch gives us the REAL headers)
    let encoded = extractSetCookie(res.headers, 'addhash');
    let raw = '';

    if (encoded) {
      raw = decodeURIComponent(encoded);
      console.log(
        `[NetMirror] ✅ addhash from Set-Cookie: ${raw.substring(0, 20)}...`
      );
    } else {
      // Fallback: extract from HTML body data-hash attribute (3-part, less reliable)
      const body = res.body || '';
      const m =
        body.match(/data-hash=["']([^"']+)["']/i) ||
        body.match(/data-addhash=["']([^"']+)["']/i);
      if (m) {
        raw = m[1];
        encoded = encodeURIComponent(raw);
        console.log(
          `[NetMirror] ⚠️ addhash from HTML body (fallback, may be 3-part): ${raw.substring(0, 20)}...`
        );
      } else {
        console.log(`[NetMirror] ❌ No addhash cookie or HTML attribute`);
        return null;
      }
    }

    const parts = raw.split('::');
    if (parts.length < 3) {
      console.log(
        `[NetMirror] ❌ addhash only ${parts.length} parts: ${raw.substring(0, 30)}`
      );
      return null;
    }

    const flag = parts[parts.length - 1];
    console.log(
      `[NetMirror] ✅ addhash: ${parts[0].substring(0, 8)}...::${flag} (${parts.length} parts)`
    );
    return { raw, encoded };
  } catch (err: any) {
    console.log(`[NetMirror] ❌ fetchAddhash failed: ${err.message}`);
    return null;
  }
}

/**
 * Step 2: Trigger monetag ad chain via userver subdomain
 * MITM line 2775: ffr455={addhash_raw_decoded}
 */
async function triggerUserver(
  domain: string,
  addhashRaw: string
): Promise<void> {
  const ffr = encodeURIComponent(addhashRaw);
  const t = Math.random().toString();
  const url = `https://userver.${domain}/?ffr455=${ffr}&a=y&t=${t}`;
  console.log(`[NetMirror] 📡 Step 2: Triggering userver monetag chain...`);

  try {
    await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
        'Referer': `https://${domain}/`,
      },
      timeout: 15000,
      maxRedirects: 10,
      validateStatus: () => true,
    });
    console.log(`[NetMirror] ✅ userver triggered`);
  } catch (err: any) {
    // Non-fatal — the redirect chain may have partially fired
    console.log(`[NetMirror] ⚠️ userver error (non-fatal): ${err.message}`);
  }
}

/**
 * Step 3: Dwell for monetag sftouch/qlog postback
 */
function dwell(seconds: number): Promise<void> {
  console.log(
    `[NetMirror] ⏳ Step 3: Dwelling ${seconds}s for monetag postback...`
  );
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/**
 * Step 4: POST /mobile/verify2.php → t_hash_t cookie
 * MITM line 12773-12812: body is verify={addhash_url_encoded}
 * Content-length 101 confirms URL-encoded form.
 */
async function pollVerify2(
  domain: string,
  addhashEncoded: string,
  maxAttempts: number = 60,
  delayMs: number = 2500
): Promise<{ encoded: string; raw: string } | null> {
  console.log(
    `[NetMirror] 🔑 Step 4: Polling verify2.php (up to ${maxAttempts} attempts, using nativeFetch)...`
  );

  const postHeaders: Record<string, string> = {
    'User-Agent': MOBILE_UA,
    'sec-ch-ua': SEC_CH_UA,
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Origin': `https://${domain}`,
    'Referer': `https://${domain}/mobile/home?app=1`,
    'Cookie': `addhash=${addhashEncoded}`,
  };

  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const res = await nativeFetch(
        `https://${domain}/mobile/verify2.php`,
        {
          method: 'POST',
          headers: postHeaders,
          body: `verify=${addhashEncoded}`,
        }
      );

      const bodyText = res.body || '';
      console.log(
        `[NetMirror] 🔑 verify2 #${i}: HTTP ${res.status} [${bodyText.substring(0, 60)}]`
      );

      const tHashT = extractSetCookie(res.headers, 't_hash_t');
      if (tHashT) {
        const raw = decodeURIComponent(tHashT);
        console.log(
          `[NetMirror] ✅ t_hash_t received on attempt ${i}: ${raw.substring(0, 30)}...`
        );
        return { encoded: tHashT, raw };
      }

      if (i < maxAttempts) {
        await new Promise<void>((r) => setTimeout(r, delayMs));
      }
    } catch (err: any) {
      console.log(`[NetMirror] ⚠️ verify2 #${i} error: ${err.message}`);
      if (i < maxAttempts) {
        await new Promise<void>((r) => setTimeout(r, delayMs));
      }
    }
  }

  console.log(
    `[NetMirror] ❌ verify2 exhausted ${maxAttempts} attempts — ads may not have postbacked`
  );
  return null;
}

/**
 * Step 5: GET /mobile/home?app=1 — returning-session refresh
 * MITM line 12858-12893: sends both cookies + x-requested-with: app.netmirror.netmirrornew
 * This is important: the second home request upgrades the session to a full app session.
 */
async function refreshSession(
  domain: string,
  addhashEncoded: string,
  tHashTEncoded: string
): Promise<void> {
  console.log(`[NetMirror] 🔄 Step 5: Refreshing session (returning-session home)...`);
  try {
    await axios.get(`https://${domain}/mobile/home?app=1`, {
      headers: {
        'Cache-Control': 'max-age=0',
        'User-Agent': MOBILE_UA,
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'sec-ch-ua': SEC_CH_UA,
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'Upgrade-Insecure-Requests': '1',
        'X-Requested-With': X_REQUESTED_WITH,
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Dest': 'document',
        'Referer': `https://${domain}/mobile/home?app=1`,
        'Cookie': `addhash=${addhashEncoded}; t_hash_t=${tHashTEncoded}`,
      },
      timeout: 15000,
      validateStatus: () => true,
    });
    console.log(`[NetMirror] ✅ Session refreshed (returning-session)`);
  } catch (err: any) {
    console.log(`[NetMirror] ⚠️ Session refresh failed (non-fatal): ${err.message}`);
  }
}

// ─── Session Management ───────────────────────────────────────────────────────

/**
 * Full session warmup: home → userver → dwell 38s → verify2 → refresh home
 */
async function warmSession(): Promise<WarmSession | null> {
  const domain = DOMAIN;
  const t0 = Date.now();
  console.log(`[NetMirror] ━━━ Session warmup START on ${domain} ━━━`);

  // Step 1: Fetch addhash
  const addhash = await fetchAddhash(domain);
  if (!addhash) return null;

  // Step 2: Trigger userver monetag chain
  await triggerUserver(domain, addhash.raw);

  // Step 3: Dwell 38 seconds for monetag postback
  await dwell(38);

  // Step 4: Poll verify2.php for t_hash_t
  const tHashT = await pollVerify2(domain, addhash.encoded, 60, 2500);
  if (!tHashT) {
    console.log(`[NetMirror] ❌ Session warmup FAILED — no t_hash_t`);
    return null;
  }

  // Step 5: Refresh session (returning-session home request)
  await refreshSession(domain, addhash.encoded, tHashT.encoded);

  const session: WarmSession = {
    domain,
    addhashRaw: addhash.raw,
    addhashEncoded: addhash.encoded,
    tHashTEncoded: tHashT.encoded,
    tHashTRaw: tHashT.raw,
    fetchedAt: Date.now(),
  };

  console.log(
    `[NetMirror] ━━━ Session warmup DONE in ${Math.round((Date.now() - t0) / 1000)}s ━━━`
  );

  // Persist session across app restarts
  try {
    await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (err) {
    console.error(`[NetMirror] Failed to persist session:`, err);
  }

  return session;
}

/**
 * Get or create a warm session. Cached for 10 minutes.
 * Concurrent calls are deduplicated so only one warmup runs at a time.
 */
async function getSession(): Promise<WarmSession | null> {
  // Load from AsyncStorage on first call if memory is empty
  if (!_session) {
    try {
      const storedStr = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
      if (storedStr) {
        const storedSession = JSON.parse(storedStr) as WarmSession;
        if (Date.now() - storedSession.fetchedAt < SESSION_TTL_MS) {
          console.log(`[NetMirror] 💾 Restored session from storage (age: ${Math.round((Date.now() - storedSession.fetchedAt) / 1000)}s)`);
          _session = storedSession;
        } else {
          console.log(`[NetMirror] 🗑️ Stored session expired, discarding...`);
          await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }
    } catch (err) {
      console.error(`[NetMirror] Failed to read session from storage:`, err);
    }
  }

  // Return cached session if still valid
  if (_session && Date.now() - _session.fetchedAt < SESSION_TTL_MS) {
    console.log(
      `[NetMirror] 🔑 Reusing cached session (age: ${Math.round((Date.now() - _session.fetchedAt) / 1000)}s)`
    );
    return _session;
  }

  // Deduplicate concurrent warmup calls
  if (_sessionInFlight) {
    console.log(`[NetMirror] ⏳ Session warmup already in flight, waiting...`);
    return _sessionInFlight;
  }

  _sessionInFlight = (async () => {
    try {
      const session = await warmSession();
      if (session) {
        _session = session;
      }
      return session;
    } finally {
      _sessionInFlight = null;
    }
  })();

  return _sessionInFlight;
}

// ─── TMDB Metadata ────────────────────────────────────────────────────────────

interface TmdbInfo {
  title: string;
  year: string;
}

async function getTmdbInfo(
  tmdbId: string,
  type: 'movie' | 'tv'
): Promise<TmdbInfo> {
  try {
    const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const res = await axios.get(url, { timeout: 8000 });
    const data = res.data;
    const title = data.title || data.name || '';
    const year = (data.release_date || data.first_air_date || '').split('-')[0];
    return { title, year };
  } catch (err: any) {
    console.warn(`[TMDB] Failed to fetch info for ${tmdbId}: ${err.message}`);
    return { title: '', year: '' };
  }
}

// ─── Content Search ───────────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  title: string;
  year: string;
  ott: OttSection;   // Which OTT section this result came from
}

/**
 * Normalize a title for comparison: lowercase, strip articles, strip ALL
 * non-alphanumeric/space characters, collapse whitespace.
 * This ensures "Avatar: The Last Airbender" == "Avatar The Last Airbender".
 */
function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/[^a-z0-9\s]/g, '')     // strip everything except letters/digits/space
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Calculate word-overlap score between two normalized titles.
 * Returns a ratio 0..1 of how many words overlap relative to the shorter title.
 */
function wordOverlapScore(a: string, b: string): number {
  const wordsA = new Set(a.split(' ').filter(w => w.length > 1));
  const wordsB = new Set(b.split(' ').filter(w => w.length > 1));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  return overlap / Math.min(wordsA.size, wordsB.size);
}

/**
 * Sanitize a title for the search query parameter.
 * Strips all special characters that net52.cc backend chokes on.
 */
function sanitizeSearchQuery(title: string): string {
  return title
    .replace(/Tyler Perry's\s+/gi, '')
    .replace(/\s+S\d+E\d+/gi, '')
    .replace(/\s+Season\s+\d+/gi, '')
    .replace(/\s+Episode\s+\d+/gi, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')   // Kill ALL non-alphanumeric → spaces
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Generate search query variants from a title, ordered by specificity.
 * e.g. "Avatar The Last Airbender" → ["Avatar The Last Airbender", "Avatar The Last", "Avatar"]
 */
function searchVariants(cleanTitle: string): string[] {
  const variants: string[] = [cleanTitle];
  const words = cleanTitle.split(' ');

  // For multi-word titles, add progressively shorter prefixes
  if (words.length >= 4) {
    variants.push(words.slice(0, 3).join(' '));  // first 3 words
  }
  if (words.length >= 3) {
    variants.push(words.slice(0, 2).join(' '));  // first 2 words
  }
  // Single keyword (only for long-enough first words to avoid false matches)
  if (words[0] && words[0].length >= 4) {
    variants.push(words[0]);
  }

  // Deduplicate
  return [...new Set(variants)];
}

/**
 * All search endpoint paths to try for an OTT section.
 * Backends sometimes move endpoints; trying multiple ensures resilience.
 */
function ottSearchPaths(ott: OttSection): string[] {
  switch (ott) {
    case 'nf': return ['/search.php', '/mobile/search.php'];
    case 'pv': return ['/mobile/pv/search.php'];
    default: return ['/search.php', '/mobile/search.php'];
  }
}

/**
 * Extract search results from various backend response formats.
 * Handles: {searchResult:[...]}, raw [...], {status:"n",...,searchResult:[trending]},
 * and {head:...,type:0} (empty response).
 */
function extractResults(parsed: any): any[] {
  if (!parsed) return [];

  // Direct array response
  if (Array.isArray(parsed)) return parsed;

  // Standard searchResult wrapper
  if (Array.isArray(parsed.searchResult) && parsed.searchResult.length > 0) {
    // status: "n" means the backend returned trending/popular, not actual matches
    // Only use if status is not explicitly "n" (no-match indicator)
    if (parsed.status === 'n') {
      return []; // Trending results, not search matches
    }
    return parsed.searchResult;
  }

  // {head:...,type:0} — empty response from newer API
  if (parsed.type === 0 && !parsed.searchResult) {
    return [];
  }

  return [];
}

/**
 * Match search results against the original title.
 * Returns best match or null. Uses multiple strategies:
 *   1. Exact normalized match
 *   2. Prefix/contains match with length guard
 *   3. High word-overlap score (≥70%)
 *   4. Plausible first result (word overlap ≥50% for longer titles)
 */
function findBestMatch(
  results: any[],
  searchTitle: string,
  searchYear: string,
  ott: OttSection
): SearchResult | null {
  if (!results || results.length === 0) return null;

  const searchNorm = normalizeTitle(searchTitle);
  if (!searchNorm) return null;

  // Score each result
  interface ScoredResult { r: any; score: number; reason: string }
  const scored: ScoredResult[] = [];

  for (const r of results) {
    if (!r || (!r.id && !r.Id)) continue;
    const rTitle = r.t || r.title || r.T || r.Title || '';
    const rYear = (r.y || r.year || r.Y || r.Year || '').toString();
    const rId = (r.id || r.Id || '').toString();
    const rNorm = normalizeTitle(rTitle);

    // Year mismatch filter (lenient — only reject if both years exist and differ by >1)
    if (searchYear && rYear && rYear.length === 4 && searchYear.length === 4) {
      const yearDiff = Math.abs(parseInt(searchYear) - parseInt(rYear));
      if (yearDiff > 1) continue;
    }

    // Score: exact match
    if (rNorm === searchNorm) {
      scored.push({ r, score: 100, reason: 'exact' });
      continue;
    }

    // Score: prefix match (either direction)
    if (rNorm.startsWith(searchNorm + ' ') || searchNorm.startsWith(rNorm + ' ') ||
        rNorm.startsWith(searchNorm) || searchNorm.startsWith(rNorm)) {
      const lenRatio = rNorm.length / Math.max(searchNorm.length, 1);
      // Guard against short queries matching very long titles
      if (searchNorm.length > 6 || lenRatio <= 2.0) {
        scored.push({ r, score: 80, reason: 'prefix' });
        continue;
      }
    }

    // Score: word overlap
    const overlap = wordOverlapScore(searchNorm, rNorm);
    if (overlap >= 0.7) {
      scored.push({ r, score: 60 + overlap * 20, reason: `overlap(${(overlap * 100).toFixed(0)}%)` });
      continue;
    }

    // Score: contains (one inside the other)
    if (searchNorm.length > 5 && (rNorm.includes(searchNorm) || searchNorm.includes(rNorm))) {
      scored.push({ r, score: 50, reason: 'contains' });
      continue;
    }

    // Low-confidence fallback: moderate word overlap for longer titles
    if (overlap >= 0.5 && searchNorm.length > 8) {
      scored.push({ r, score: 30 + overlap * 20, reason: `weak-overlap(${(overlap * 100).toFixed(0)}%)` });
    }
  }

  if (scored.length === 0) return null;

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const bestTitle = best.r.t || best.r.title || best.r.T || best.r.Title || '';
  const bestYear = (best.r.y || best.r.year || best.r.Y || best.r.Year || '').toString();
  const bestId = (best.r.id || best.r.Id || '').toString();

  // Require minimum score of 30 to avoid wild mismatches
  if (best.score < 30) return null;

  console.log(
    `[NetMirror] ✅ Search match [${ott.toUpperCase()}]: "${bestTitle}" (${bestYear}) ID: ${bestId} [${best.reason}, score=${best.score.toFixed(0)}]`
  );
  return { id: bestId, title: bestTitle, year: bestYear, ott };
}

/**
 * Search for content on the mirror using the search API.
 * Returns the best matching result — this is the SHOW id for TV series.
 *
 * RESILIENCE STRATEGY (2026-06-26):
 *   1. Sanitize title: strip ALL special chars (backend rejects colons, &, etc.)
 *   2. Generate query variants: full title → first 3 words → first 2 → first word
 *   3. Try multiple endpoints per OTT section (/search.php, /mobile/search.php)
 *   4. Handle all response formats (arrays, wrapped objects, "no match" indicators)
 *   5. Normalized fuzzy matching with word-overlap scoring
 *
 * @param ott - Which OTT section to search (nf, pv). Defaults to 'nf'.
 */
async function searchContent(
  domain: string,
  searchTitle: string,
  searchYear: string,
  cookie: string,
  ott: OttSection = 'nf'
): Promise<SearchResult | null> {
  const base = `https://${domain}`;
  const cleanTitle = sanitizeSearchQuery(searchTitle);
  const variants = searchVariants(cleanTitle);
  const paths = ottSearchPaths(ott);

  console.log(`[NetMirror] 🔍 Searching "${cleanTitle}" on ${domain} [${ott.toUpperCase()}] (${variants.length} variants, ${paths.length} endpoints)...`);

  // Try each variant against each endpoint — stop on first good match
  for (const query of variants) {
    for (const searchPath of paths) {
      try {
        const ts = Math.floor(Date.now() / 1000);
        const searchUrl = `${base}${searchPath}?s=${encodeURIComponent(query)}&t=${ts}`;
        console.log(`[NetMirror]   → trying "${query}" via ${searchPath}`);

        const res = await nativeFetch(searchUrl, {
          method: 'GET',
          headers: {
            'User-Agent': MOBILE_UA,
            'Cookie': cookie,
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': `${base}/`,
          },
        });

        let parsed: any;
        try {
          parsed = JSON.parse(res.body);
        } catch {
          console.log(`[NetMirror]     ❌ non-JSON response: ${res.body.substring(0, 80)}`);
          continue; // Try next endpoint
        }

        const results = extractResults(parsed);
        if (results.length === 0) {
          console.log(`[NetMirror]     ❌ empty results`);
          continue; // Try next endpoint, or next variant
        }

        console.log(`[NetMirror]     📦 ${results.length} results from ${searchPath}`);

        // Try to match against the ORIGINAL full title (not the shortened variant)
        const match = findBestMatch(results, searchTitle, searchYear, ott);
        if (match) return match;

        console.log(`[NetMirror]     ❌ no match in ${results.length} results`);
      } catch (err: any) {
        console.log(`[NetMirror]     ❌ ${searchPath} error: ${err.message}`);
      }
    }
  }

  console.log(`[NetMirror] ❌ No results for "${cleanTitle}" across ${variants.length} variants × ${paths.length} endpoints`);
  return null;
}

// ─── Content Detail (post.php) ────────────────────────────────────────────────

/**
 * GET /mobile/post.php?id={showId}&t={ts} → episode list (TV) or metadata (movie)
 * For PV: GET /mobile/pv/post.php?id={showId}&t={ts}
 * MITM line 16800: returns episodes array with { id, s, ep, t, time }
 */
async function fetchPostDetail(
  domain: string,
  showId: string,
  cookie: string,
  ott: OttSection = 'nf'
): Promise<any> {
  const ts = Math.floor(Date.now() / 1000);
  const prefix = ottPathPrefix(ott);
  const url = `https://${domain}${prefix}/post.php?id=${showId}&t=${ts}`;
  console.log(`[NetMirror] 📋 Fetching post.php [${ott.toUpperCase()}] for showId: ${showId}`);

  try {
    const res = await nativeFetch(url, {
      method: 'GET',
      headers: {
        ...mobileHeaders(`https://${domain}/mobile/home?app=1`),
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookie,
      },
    });

    let data: any;
    try {
      data = JSON.parse(res.body);
    } catch {
      console.log(`[NetMirror] ⚠️ post.php returned non-JSON: ${res.body.substring(0, 100)}`);
      return null;
    }

    // Debug: log response structure
    if (data && typeof data === 'object') {
      const keys = Object.keys(data);
      const seasonCount = Array.isArray(data.season) ? data.season.length : (data.season ? 'non-array' : 'missing');
      const epCount = Array.isArray(data.episodes) ? data.episodes.length : (data.episodes ? 'non-array' : 'missing');
      console.log(
        `[NetMirror] 📋 post.php response: status=${data.status}, keys=[${keys.join(',')}], seasons=${seasonCount}, episodes=${epCount}`
      );
    } else {
      console.log(`[NetMirror] ⚠️ post.php returned non-object: ${typeof data}`);
    }

    return data;
  } catch (err: any) {
    console.log(`[NetMirror] ⚠️ post.php failed: ${err.message}`);
    return null;
  }
}

/**
 * Find the episode content ID from an episodes array.
 * The array has items like { id, s: "S1", ep: "E1", t: "Episode Title" }
 */
function findEpisodeId(episodes: any[], season: number, episode: number): string | null {
  if (!Array.isArray(episodes) || episodes.length === 0) {
    return null;
  }

  const targetS = `S${season}`;
  const targetE = `E${episode}`;

  for (const ep of episodes) {
    if (!ep || typeof ep !== 'object') continue;
    if (ep.s === targetS && ep.ep === targetE) {
      console.log(
        `[NetMirror] 🎯 Found episode: ${ep.s}${ep.ep} "${ep.t}" → ID ${ep.id}`
      );
      return ep.id;
    }
  }

  console.log(
    `[NetMirror] ⚠️ Episode S${season}E${episode} not found in ${episodes.length} episodes`
  );
  return null;
}

/**
 * GET /mobile/episodes.php?s={seasonId}&series={showId}&t={ts}
 * For PV: GET /mobile/pv/episodes.php?s={seasonId}&series={showId}&t={ts}
 * Used to fetch episodes for a specific season (post.php only returns the latest).
 * The season ID comes from the post.php response's `season` array.
 */
async function fetchSeasonEpisodes(
  domain: string,
  seasonId: string,
  showId: string,
  cookie: string,
  ott: OttSection = 'nf'
): Promise<any[] | null> {
  const ts = Math.floor(Date.now() / 1000);
  const prefix = ottPathPrefix(ott);
  const url = `https://${domain}${prefix}/episodes.php?s=${seasonId}&series=${showId}&t=${ts}`;
  console.log(`[NetMirror] 📋 Fetching episodes.php [${ott.toUpperCase()}] for seasonId: ${seasonId}, showId: ${showId}`);

  try {
    const res = await nativeFetch(url, {
      method: 'GET',
      headers: {
        ...mobileHeaders(`https://${domain}/mobile/home?app=1`),
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookie,
      },
    });

    let data: any;
    try {
      data = JSON.parse(res.body);
    } catch {
      console.log(`[NetMirror] ⚠️ episodes.php returned non-JSON`);
      return null;
    }

    if (data?.episodes && Array.isArray(data.episodes)) {
      console.log(
        `[NetMirror] ✅ episodes.php returned ${data.episodes.length} episodes for season ${seasonId}`
      );
      return data.episodes;
    }

    console.log(`[NetMirror] ⚠️ episodes.php returned no episodes`);
    return null;
  } catch (err: any) {
    console.log(`[NetMirror] ⚠️ episodes.php failed: ${err.message}`);
    return null;
  }
}

// ─── Playlist (server-generated HLS URL) ──────────────────────────────────────

interface PlaylistResult {
  hlsUrl: string;          // Full path like /mobile/hls/81635392.m3u8?in=...&hd=off&lang=eng
  captions: any[];
  title: string;
}

/**
 * GET /mobile/playlist.php?id={contentId}&t={title}&tm={ts}
 * For PV: GET /mobile/pv/playlist.php?id={contentId}&t={title}&tm={ts}
 * MITM line 18079-18131: returns the SERVER-GENERATED ?in= hash in sources[].file
 * This is the KEY step — the ?in= hash MUST come from the server, not be built client-side.
 */
async function fetchPlaylist(
  domain: string,
  contentId: string,
  title: string,
  cookie: string,
  ott: OttSection = 'nf'
): Promise<PlaylistResult | null> {
  const ts = Math.floor(Date.now() / 1000);
  const prefix = ottPathPrefix(ott);
  const params = `id=${encodeURIComponent(contentId)}&t=${encodeURIComponent(title)}&tm=${ts}`;
  const url = `https://${domain}${prefix}/playlist.php?${params}`;
  console.log(`[NetMirror] 📼 Fetching playlist.php [${ott.toUpperCase()}] for contentId: ${contentId}`);

  try {
    const res = await nativeFetch(url, {
      method: 'GET',
      headers: {
        ...mobileHeaders(`https://${domain}/mobile/home?app=1`),
        'X-Requested-With': X_REQUESTED_WITH,
        'Cookie': cookie,
      },
    });

    let parsed: any;
    try {
      parsed = JSON.parse(res.body);
    } catch {
      console.log(`[NetMirror] ❌ playlist.php returned non-JSON: ${res.body.substring(0, 100)}`);
      return null;
    }

    // Response is an array: [{ sources: [...], tracks: [...], title: "..." }]
    const data = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!data) {
      console.log(`[NetMirror] ❌ playlist.php returned empty response`);
      return null;
    }

    // Extract HLS URL from sources — prefer "Auto" label, fallback to first
    let hlsFile = '';
    if (data.sources && Array.isArray(data.sources)) {
      const autoSource = data.sources.find((s: any) => s.label === 'Auto');
      const defaultSource = data.sources.find((s: any) => s.default === 'true');
      const source = autoSource || defaultSource || data.sources[0];
      hlsFile = source?.file || '';
    }

    if (!hlsFile) {
      console.log(`[NetMirror] ❌ playlist.php has no HLS source`);
      return null;
    }

    console.log(
      `[NetMirror] ✅ playlist.php HLS: ${hlsFile.substring(0, 80)}...`
    );

    // Extract captions
    const captions = (data.tracks || [])
      .filter((t: any) => t.kind === 'captions' && t.file)
      .map((t: any) => ({
        url: t.file.startsWith('//') ? `https:${t.file}` : t.file,
        language: t.label || 'Unknown',
        type: 'vtt',
      }));

    return {
      hlsUrl: hlsFile,
      captions,
      title: data.title || title,
    };
  } catch (err: any) {
    console.log(`[NetMirror] ❌ playlist.php failed: ${err.message}`);
    return null;
  }
}

// ─── Manifest Handling ────────────────────────────────────────────────────────

/**
 * Extract CDN hostname from the manifest.
 * Looks at AUDIO URI lines and video variant lines.
 */
function extractCdnHost(manifest: string): string | null {
  // Audio URI with real host
  const audioMatch = manifest.match(/URI="https:\/\/([^"/]+)\/files\//);
  if (audioMatch) return audioMatch[1];

  // Video variant lines
  const videoMatch = manifest.match(/^https:\/\/([^/]+)\/files\/\d+\//m);
  if (videoMatch) return videoMatch[1];

  return null;
}

/**
 * Rewrite the master manifest — MINIMAL fixes only.
 *
 *  1. Fix empty audio hosts: https:/// → https://{cdnHost}/
 *     Some manifests return audio URIs with no hostname.
 *
 *  DO NOT touch variant URLs — they are server-issued with session-bound ?in= hashes.
 */
function rewriteManifest(
  manifest: string,
  cdnHost: string | null
): string {
  let content = manifest;

  // Remove BOM
  content = content.replace(/^\uFEFF/, '');

  // Normalize line endings
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '');

  // Fix empty audio hosts
  if (cdnHost && content.includes('https:///')) {
    content = content.replace(/https:\/\/\//g, `https://${cdnHost}/`);
    console.log(
      `[NetMirror] 🔧 Fixed empty audio hosts → https://${cdnHost}/`
    );
  }

  return content;
}

// ─── Recentplay ───────────────────────────────────────────────────────────────

/**
 * POST /mobile/recentplay.php to register the content session.
 * MITM line 25217-25257:
 *   - POST body: recentplay=SE{showId}
 *   - Cookie includes: SE{showId}={contentId}
 *   - Response sets cookie: recentplay=SE{showId}
 */
async function postRecentplay(
  domain: string,
  showId: string,
  cookie: string
): Promise<void> {
  const seKey = `SE${showId}`;
  try {
    await axios.post(
      `https://${domain}/mobile/recentplay.php`,
      `recentplay=${seKey}`,
      {
        headers: {
          ...mobileHeaders(`https://${domain}/mobile/home?app=1`),
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': `https://${domain}`,
          'Cookie': cookie,
        },
        timeout: 10000,
        validateStatus: () => true,
      }
    );
    console.log(`[NetMirror] ✅ recentplay registered: ${seKey}`);
  } catch (err: any) {
    // Non-critical — stream may still work
    console.log(
      `[NetMirror] ⚠️ recentplay failed (non-fatal): ${err.message}`
    );
  }
}

// ─── Stream Resolution ────────────────────────────────────────────────────────

/**
 * Build the cookie string for content requests.
 * MITM line 25233-25235 shows the exact format:
 *   addhash={encoded}; t_hash_t={encoded}; SE{showId}={contentId}
 * For PV: adds ott=pv cookie
 */
function buildCookieString(
  session: WarmSession,
  showId: string,
  contentId: string,
  ott: OttSection = 'nf'
): string {
  const parts = [
    `addhash=${session.addhashEncoded}`,
    `t_hash_t=${session.tHashTEncoded}`,
    `SE${showId}=${contentId}`,
  ];
  // PV (and future OTT sections) require the ott cookie
  if (ott !== 'nf') {
    parts.push(`ott=${ott}`);
  }
  return parts.join('; ');
}

/**
 * Full resolve flow:
 *   TMDB lookup → search (NF, then PV fallback) → post.php (TV episodes) → playlist.php (server HLS URL)
 *   → recentplay → fetch HLS manifest → minimal rewrite → data: URI
 */
async function resolveStream(
  tmdbId: string,
  type: 'movie' | 'tv',
  season: number,
  episode: number,
  label: string
): Promise<NetMirrorStream> {
  const t0 = Date.now();
  console.log(
    `[${label}] ▶️ resolveStream: TMDB ${tmdbId} (${type}) S${season}E${episode}`
  );

  // 1. Get TMDB metadata (title, year)
  const tmdbInfo = await getTmdbInfo(tmdbId, type);
  if (!tmdbInfo.title) {
    throw new Error(`${label}: Could not get title from TMDB for ${tmdbId}`);
  }
  console.log(
    `[${label}] 📋 TMDB: "${tmdbInfo.title}" (${tmdbInfo.year})`
  );

  // 2. Get or create warm session
  const session = await getSession();
  if (!session) {
    throw new Error(`${label}: Session warmup failed`);
  }

  const domain = session.domain;
  const sessionCookie = `addhash=${session.addhashEncoded}; t_hash_t=${session.tHashTEncoded}`;

  // 3. Search for content across OTT sections (NF first, then PV)
  let match: SearchResult | null = null;
  for (const ott of OTT_SEARCH_ORDER) {
    const searchCookie = `user_token=${randomHex(16)}; ott=${ott}`;
    match = await searchContent(
      domain,
      tmdbInfo.title,
      tmdbInfo.year,
      searchCookie,
      ott
    );
    if (match) {
      console.log(
        `[${label}] ✅ Found on ${ott.toUpperCase()} section: "${match.title}" (ID: ${match.id})`
      );
      break;
    }
    console.log(
      `[${label}] ⚠️ Not found on ${ott.toUpperCase()}, trying next section...`
    );
  }

  if (!match) {
    throw new Error(
      `${label}: No search results for "${tmdbInfo.title}" (${tmdbInfo.year}) across all OTT sections`
    );
  }

  const matchOtt = match.ott;    // Which OTT section this was found in
  const showId = match.id;       // For TV: this is the SHOW id, not episode id
  let contentId = showId;        // For movies: showId IS the contentId

  // 4. For TV: resolve the episode ID via post.php + episodes.php
  //    Use the OTT-specific endpoints (e.g. /mobile/pv/post.php for PV content)
  if (type === 'tv' && season > 0 && episode > 0) {
    console.log(`[${label}] 📺 TV show detected — fetching episodes via post.php [${matchOtt.toUpperCase()}]...`);
    const postData = await fetchPostDetail(domain, showId, sessionCookie, matchOtt);

    if (postData && typeof postData === 'object') {
      try {
        // First try: look in post.php's episodes array (latest season only)
        const epId = findEpisodeId(postData.episodes || [], season, episode);
        if (epId) {
          contentId = epId;
        } else {
          // post.php only returns latest season episodes.
          // Use the season array to find the NetMirror season ID, then call episodes.php
          const rawSeasonList = Array.isArray(postData.season) ? postData.season : [];
          const seasonList = rawSeasonList.filter((s: any) => s && typeof s === 'object' && s.s && s.id);
          const targetSeason = seasonList.find((s: any) => String(s.s) === String(season));

          if (targetSeason) {
            console.log(
              `[${label}] 📋 Season ${season} found in season list → NetMirror ID: ${targetSeason.id}`
            );
            const seasonEps = await fetchSeasonEpisodes(
              domain,
              targetSeason.id,
              showId,
              sessionCookie,
              matchOtt
            );
            if (seasonEps) {
              const seasonEpId = findEpisodeId(seasonEps, season, episode);
              if (seasonEpId) {
                contentId = seasonEpId;
              }
            }
          } else {
            console.log(
              `[${label}] ⚠️ Season ${season} not in season list (${seasonList.map((s: any) => s.s).join(',')})`
            );
          }

          // Final fallback: try TMDB episode ID (unlikely to work but harmless)
          if (contentId === showId) {
            console.log(`[${label}] ⚠️ Episode not resolved — trying TMDB episode ID as last resort`);
            try {
              const seasonUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}?api_key=${TMDB_API_KEY}`;
              const seasonRes = await axios.get(seasonUrl, { timeout: 5000 });
              const episodes = seasonRes.data?.episodes;
              if (Array.isArray(episodes)) {
                const ep = episodes.find((e: any) => e.episode_number === episode);
                if (ep?.id) {
                  contentId = ep.id.toString();
                  console.log(`[${label}] 🎯 TMDB episode ID fallback: ${contentId}`);
                }
              }
            } catch {
              // Non-critical
            }
          }
        }
      } catch (epErr: any) {
        console.log(`[${label}] ⚠️ Episode resolution error (non-fatal): ${epErr?.message}`);
      }
    }
  }

  console.log(
    `[${label}] 🎯 showId: ${showId}, contentId: ${contentId}, ott: ${matchOtt.toUpperCase()}`
  );

  // 5. Build the full cookie string with SE{showId}={contentId} (+ ott cookie for PV)
  const cookie = buildCookieString(session, showId, contentId, matchOtt);

  // 6. Fetch playlist.php to get server-generated HLS URL (OTT-aware path)
  const playlist = await fetchPlaylist(domain, contentId, tmdbInfo.title, cookie, matchOtt);
  if (!playlist || !playlist.hlsUrl) {
    throw new Error(`${label}: playlist.php returned no HLS URL`);
  }

  // 7. POST recentplay to register the content session
  await postRecentplay(domain, showId, cookie);

  // 8. Build full HLS URL from playlist.php response
  //    playlist.php returns a path like: /mobile/hls/81635392.m3u8?in=...&hd=off&lang=eng
  //    or for PV: /mobile/pv/hls/0KZ3TMDAPFNW34BQTV0AVK8XA9.m3u8?in=...&hd=off&lang=eng
  //    We need to prepend the domain
  let hlsUrl = playlist.hlsUrl;
  if (hlsUrl.startsWith('/')) {
    hlsUrl = `https://${domain}${hlsUrl}`;
  }
  console.log(`[${label}] 🎬 HLS URL: ${hlsUrl.substring(0, 100)}...`);

  // 9. Quick validation: fetch the manifest to verify it's valid HLS
  //    IMPORTANT: We return the HTTPS URL directly to ExoPlayer instead of encoding
  //    as data: URI → file://. This is critical because the CDN (freecdn32z.top)
  //    requires the Referer header (https://net52.cc/) on ALL sub-resource requests.
  //    When we used data: → file://, ExoPlayer didn't propagate the Referer to CDN
  //    requests, causing 404 errors on variant and audio manifest fetches.
  const validationHeaders = {
    ...mobileHeaders(`https://${domain}/mobile/home?app=1`),
    'X-Requested-With': X_REQUESTED_WITH,
    'Origin': `https://${domain}`,
    'Referer': `https://${domain}/`,
    'Cookie': cookie,
  };

  try {
    const res = await axios.get(hlsUrl, {
      headers: validationHeaders,
      timeout: 15000,
      responseType: 'text',
      validateStatus: () => true,
    });

    const body = typeof res.data === 'string' ? res.data : String(res.data);
    console.log(
      `[${label}] 📡 HLS validation: HTTP ${res.status}, ${body.length} bytes`
    );

    if (!body.includes('#EXTM3U')) {
      console.log(
        `[${label}] ❌ Not a valid manifest. Preview: ${body.substring(0, 200)}`
      );
      throw new Error(
        `${label}: Invalid HLS manifest (${body.length}B, HTTP ${res.status})`
      );
    }

    const cdnHost = extractCdnHost(body);
    console.log(
      `[${label}] ✅ Manifest validated: ${body.length}B, CDN host: ${cdnHost || 'unknown'}`
    );
  } catch (valErr: any) {
    if (valErr.message?.includes('Invalid HLS manifest')) throw valErr;
    console.warn(`[${label}] ⚠️ Manifest validation failed (non-fatal): ${valErr.message}`);
    // Continue anyway — the URL might still work for the player
  }

  const elapsed = Date.now() - t0;
  console.log(`[${label}] ✅ Done in ${elapsed}ms [${matchOtt.toUpperCase()}]`);

  // 10. Return the DIRECT HTTPS URL — ExoPlayer will fetch manifest + CDN sub-resources
  //     with the headers we provide, ensuring Referer is sent to the CDN.
  return {
    url: hlsUrl,
    headers: {
      'User-Agent': MOBILE_UA,
      'Origin': `https://${domain}`,
      'Referer': `https://${domain}/`,
      'sec-ch-ua': SEC_CH_UA,
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
      'X-Requested-With': X_REQUESTED_WITH,
      'Cookie': cookie,
    },
    captions: playlist.captions,
    sourceId: `${label} [${matchOtt.toUpperCase()}]`,
    expiresAt: Date.now() + 3600000, // 1 hour
    title: tmdbInfo.title || `NetMirror ${contentId}`,
    isRateLimited: false,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Pre-warm the NetMirror session.
 * Call eagerly (e.g. when user opens a movie detail page) so the ~38s
 * nurture flow completes before they press play.
 * Returns immediately if a valid session is already cached.
 */
export async function warmNetMirrorSession(): Promise<void> {
  console.log(`[NetMirror] 🚀 Pre-warming session...`);
  await getSession();
}

/**
 * Resolve Net22 stream via net52.cc mobile API.
 * Backward-compatible export — consumers don't need to change.
 */
export async function resolveNet22(
  tmdbId: string,
  type: 'movie' | 'tv',
  season: number = 0,
  episode: number = 0
): Promise<NetMirrorStream> {
  const t0 = Date.now();
  console.log(
    `[Net22] ▶️ resolveNet22: TMDB ${tmdbId} (${type}) S${season}E${episode}`
  );
  try {
    const result = await resolveStream(
      tmdbId,
      type,
      season,
      episode,
      'Net22'
    );
    console.log(
      `[Net22] ✅ Total: ${Date.now() - t0}ms | url: ${result.url ? result.url.substring(0, 60) + '...' : 'EMPTY'}`
    );
    return result;
  } catch (err: any) {
    console.error(
      `[Net22] ❌ FAILED after ${Date.now() - t0}ms: ${err.message}`
    );
    throw err;
  }
}

/**
 * Resolve Net52 stream via net52.cc mobile API.
 * Backward-compatible export — consumers don't need to change.
 */
export async function resolveNet52(
  tmdbId: string,
  type: 'movie' | 'tv',
  season: number = 0,
  episode: number = 0
): Promise<NetMirrorStream> {
  const t0 = Date.now();
  console.log(
    `[Net52] ▶️ resolveNet52: TMDB ${tmdbId} (${type}) S${season}E${episode}`
  );
  try {
    const result = await resolveStream(
      tmdbId,
      type,
      season,
      episode,
      'Net52'
    );
    console.log(
      `[Net52] ✅ Total: ${Date.now() - t0}ms | url: ${result.url ? result.url.substring(0, 60) + '...' : 'EMPTY'}`
    );
    return result;
  } catch (err: any) {
    console.error(
      `[Net52] ❌ FAILED after ${Date.now() - t0}ms: ${err.message}`
    );
    throw err;
  }
}

// ─── Auto-Warmup on Module Load ──────────────────────────────────────────────
// Fire-and-forget: start the 38s nurture flow as soon as the app imports this
// module, so the session is ready before the user presses play.
// Errors are silently swallowed — the session will be retried on demand.

(() => {
  console.log(`[NetMirror] 🔥 Auto-warming session on module load...`);
  getSession().catch((err) => {
    console.log(`[NetMirror] ⚠️ Auto-warmup failed (will retry on demand): ${err?.message || err}`);
  });
})();
