/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * NetMirror Stream Resolver — Mobile API Only
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Proven flow (MITM-verified + diagnostic-confirmed):
 *
 *   1. GET /mobile/home?app=1        → addhash cookie (4-part: hash1::hash2::ts::ek)
 *   2. GET /search.php?s=...         → find series/movie ID
 *   3. GET /mobile/post.php?id=...   → episode list for TV shows
 *   4. GET /mobile/hls/{id}.m3u8     → master HLS manifest
 *   5. GET /mobile/playlist.php      → subtitles / captions
 *
 * CRITICAL RULES (from diagnostic):
 *   ✅ Use RAW 4-part token as-is for in= parameter
 *   ❌ Do NOT append ::m (5th part causes server rejection → in=unknown)
 *   ✅ ek tokens work perfectly (no need to filter for eb)
 *   ✅ CDN segments work without additional auth
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import axios from 'axios';
import { Buffer } from 'buffer';
import { getNetMirrorDomains, refreshNetMirrorDomains } from './netmirrorDomains';

// ─── Constants ────────────────────────────────────────────────────────────────

const TMDB_API_KEY = '8baba8ab6b8bbe247645bcae7df63d0d';

/** Exact User-Agent from real NetMirror Android app (MITM line 3059) */
const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 16; Pixel 9 Build/BP2A.250526.006; wv) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.6943.137 ' +
  'Mobile Safari/537.36 /OS.Gatu v3.0';

/** sec-ch-ua header from real app */
const SEC_CH_UA = '"Not(A:Brand";v="99", "Android WebView";v="133", "Chromium";v="133"';

/** Domains known to serve the mobile API with addhash cookie */
const MOBILE_API_DOMAINS = [
  'net52.cc',       // Primary — confirmed working
  'netfree.cc',     // Gateway
  'netmirror.vip',  // Gateway
  'net50.cc',
  'net23.cc',
  'net11.cc',
];

/** Poisoned file ID injected by CDN as a honeypot */
const POISON_ID = '220884';

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

export interface NetMirrorCookies {
  net22Cookie: string;
  net52Cookie: string;
}

// ─── Session Cache ────────────────────────────────────────────────────────────

interface MobileSession {
  addhash: string;           // Raw 4-part token (hash1::hash2::ts::flag)
  cookieHeader: string;      // Full cookie string for requests (includes t_hash_t, t_hash)
  domain: string;            // Domain that issued this token
  fetchedAt: number;
}

let _session: MobileSession | null = null;
let _sessionInFlight: Promise<MobileSession> | null = null;  // Dedup concurrent warm-ups
const SESSION_TTL_MS = 20 * 60 * 1000; // 20 minutes

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────

/** Standard headers for mobile API requests (matches MITM exactly) */
function mobileHeaders(referer: string, xrw: 'app' | 'xhr' = 'app'): Record<string, string> {
  return {
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
    'X-Requested-With': xrw === 'xhr' ? 'XMLHttpRequest' : 'app.netmirror.netmirrornew',
  };
}

/** Parse Set-Cookie headers into a cookie jar string */
function parseCookies(setCookies: string | string[] | undefined, existing: string = ''): string {
  const jar = new Map<string, string>();

  // Parse existing cookies
  if (existing) {
    for (const part of existing.split(';')) {
      const eq = part.indexOf('=');
      if (eq > 0) jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    }
  }

  // Parse new Set-Cookie headers
  const headers = !setCookies ? [] : Array.isArray(setCookies) ? setCookies : [setCookies];
  for (const h of headers) {
    const cookiePart = h.split(';')[0];
    const eq = cookiePart.indexOf('=');
    if (eq > 0) jar.set(cookiePart.slice(0, eq).trim(), cookiePart.slice(eq + 1).trim());
  }

  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

/** Extract a named cookie value from a cookie header string */
function getCookieValue(cookieHeader: string, name: string): string {
  const re = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`);
  const m = cookieHeader.match(re);
  return m ? decodeURIComponent(m[1]) : '';
}

// ─── Mobile Session Management ───────────────────────────────────────────────

/**
 * Derive t_hash_t cookie from addhash token.
 * MITM shows post.php needs t_hash_t cookie for authentication.
 *
 * IMPORTANT: t_hash_t cookie uses 5-part format (hash1::hash2::ts::flag::m)
 * This is DIFFERENT from the HLS in= parameter which uses RAW 4-part token.
 * The ::m suffix only breaks HLS in= param, NOT the cookie.
 */
function buildCookieHeader(addhash: string): string {
  const parts = addhash.split('::');
  if (parts.length < 4) return `addhash=${encodeURIComponent(addhash)}`;

  const [hash1, hash2, timestamp, flag] = parts;

  // t_hash_t: 5-part token (MITM line 3069: t_hash_t=hash1::hash2::ts::eb::m)
  const tHashT = `${hash1}::${hash2}::${timestamp}::${flag}::m`;

  // t_hash: 3-part token (MITM line 3072: t_hash=hash1::ts::flag)
  const tHash = `${hash1}::${timestamp}::${flag}`;

  return [
    `addhash=${encodeURIComponent(addhash)}`,
    `t_hash_t=${encodeURIComponent(tHashT)}`,
    `t_hash=${encodeURIComponent(tHash)}`,
  ].join('; ');
}

/**
 * Warm the mobile session by hitting /mobile/home?app=1.
 * Returns the raw 4-part addhash token and full cookie header.
 *
 * DIAGNOSTIC RESULTS:
 *   HLS in= parameter:  4-part (::ek) → ✅ | 5-part (::ek::m) → ❌ in=unknown
 *   Cookie t_hash_t:    5-part (::ek::m) → needed for post.php auth
 *
 * Concurrent calls are deduplicated so Net22+Net52 share one warm-up.
 */
async function warmMobileSession(forceDomain?: string): Promise<MobileSession> {
  // Return cached session if still valid
  if (_session && (Date.now() - _session.fetchedAt) < SESSION_TTL_MS) {
    console.log(`[MobileAPI] 🔑 Using cached session (age: ${Math.round((Date.now() - _session.fetchedAt) / 1000)}s, domain: ${_session.domain})`);
    return _session;
  }

  // Deduplicate concurrent warm-up calls (Net22 + Net52 fire simultaneously)
  if (_sessionInFlight) {
    console.log(`[MobileAPI] ⏳ Session warm-up already in flight, waiting...`);
    return _sessionInFlight;
  }

  _sessionInFlight = (async () => {
    try {
      const domainsToTry = forceDomain ? [forceDomain] : MOBILE_API_DOMAINS;

      for (const domain of domainsToTry) {
        try {
          const base = `https://${domain}`;
          console.log(`[MobileAPI] 🌐 Warming session on ${domain}...`);

          const res = await axios.get(`${base}/mobile/home?app=1`, {
            headers: {
              'User-Agent': MOBILE_UA,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'sec-ch-ua': SEC_CH_UA,
              'sec-ch-ua-mobile': '?1',
              'sec-ch-ua-platform': '"Android"',
              'Sec-Fetch-Site': 'none',
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Dest': 'document',
              'Sec-Fetch-User': '?1',
              'Upgrade-Insecure-Requests': '1',
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache',
            },
            timeout: 10000,
            maxRedirects: 5,
            validateStatus: (s) => s >= 200 && s < 400,
          });

          const cookies = parseCookies(res.headers['set-cookie']);
          const addhash = getCookieValue(cookies, 'addhash');

          // Extract from data-addhash attribute in HTML body (backup/primary for React Native)
          let bodyAddhash = '';
          if (typeof res.data === 'string') {
            const m = res.data.match(/data-addhash=["']([^"']+)["']/i) || res.data.match(/data-addhash="([^"]+)"/);
            if (m) {
              bodyAddhash = m[1];
            } else {
              const m2 = res.data.match(/data-hash=["']([^"']+)["']/i);
              if (m2) bodyAddhash = m2[1];
            }
          }

          const token = addhash || bodyAddhash;

          if (!token || token.split('::').length < 4) {
            console.log(`[MobileAPI] ⚠️ ${domain}: no valid token found (cookie addhash: ${addhash || 'none'}, body data-addhash: ${bodyAddhash || 'none'})`);
            continue;
          }

          const parts = token.split('::');
          console.log(`[MobileAPI] ✅ Got addhash from ${domain}: ${parts[0].substring(0, 8)}...::${parts[3]} (${parts.length} parts)`);

          // Build full cookie header with t_hash_t and t_hash
          const cookieHeader = buildCookieHeader(token);

          _session = {
            addhash: token,
            cookieHeader,
            domain,
            fetchedAt: Date.now(),
          };

          return _session;
        } catch (err: any) {
          console.log(`[MobileAPI] ❌ ${domain} failed: ${err.message}`);
        }
      }

      throw new Error('MobileAPI: Could not warm session on any domain');
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
  tmdbEpisodeId?: string;   // TMDB episode ID — works directly as content ID on mirror!
  episodeName?: string;
}

/**
 * Get TMDB metadata including the TMDB episode ID for TV shows.
 *
 * KEY INSIGHT (from serverless code + testing):
 *   TMDB episode IDs work directly as content IDs on the mirror!
 *   e.g. Stranger Things S1E6 → TMDB ep ID 1205905
 *        playlist.php?id=1205905 → returns episode-specific sources ✅
 *        /mobile/hls/1205905.m3u8 → returns episode-specific manifest ✅
 *   This completely bypasses post.php (which requires eb token).
 */
async function getTmdbInfo(
  tmdbId: string,
  type: 'movie' | 'tv',
  season: number = 0,
  episode: number = 0
): Promise<TmdbInfo> {
  try {
    const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
    const res = await axios.get(url, { timeout: 8000 });
    const data = res.data;
    const title = data.title || data.name || '';
    const year = (data.release_date || data.first_air_date || '').split('-')[0];

    let tmdbEpisodeId: string | undefined;
    let episodeName: string | undefined;

    // For TV shows: resolve the TMDB episode ID
    // This ID works directly as a content ID on the mirror (no post.php needed!)
    if (type === 'tv' && season > 0 && episode > 0) {
      try {
        const seasonUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}?api_key=${TMDB_API_KEY}`;
        const seasonRes = await axios.get(seasonUrl, { timeout: 5000 });
        const episodes = seasonRes.data?.episodes;
        if (Array.isArray(episodes)) {
          const ep = episodes.find((e: any) => e.episode_number === episode);
          if (ep) {
            tmdbEpisodeId = ep.id?.toString();
            episodeName = ep.name;
            console.log(`[TMDB] 🎯 Episode: S${season}E${episode} "${episodeName}" → TMDB ID ${tmdbEpisodeId}`);
          }
        }
      } catch {
        // Non-critical — will fall back to resolveEpisodeId
      }
    }

    return { title, year, tmdbEpisodeId, episodeName };
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
}

/**
 * Search for content on the mirror using the desktop search API.
 * Returns the best matching result ID.
 */
async function searchContent(
  domain: string,
  searchTitle: string,
  searchYear: string,
  primaryId?: string
): Promise<SearchResult | null> {
  const base = `https://${domain}`;
  const ts = Math.floor(Date.now() / 1000);

  // Clean the title
  const cleanTitle = searchTitle
    .replace(/Tyler Perry's\s+/gi, '')
    .replace(/\s+S\d+E\d+/gi, '')
    .replace(/\s+Season\s+\d+/gi, '')
    .replace(/\s+Episode\s+\d+/gi, '')
    .trim();

  console.log(`[Search] 🔍 Searching "${cleanTitle}" on ${domain}...`);

  const searchRes = await axios.get(`${base}/search.php`, {
    params: { s: cleanTitle, t: ts },
    headers: {
      'User-Agent': MOBILE_UA,
      'Cookie': `user_token=${randomHex(32)}; ott=nf;`,
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${base}/`,
    },
    timeout: 10000,
    validateStatus: (s) => s >= 200 && s < 500,
  });

  let results = searchRes.data?.searchResult || searchRes.data;
  if (!Array.isArray(results) || results.length === 0) {
    console.log(`[Search] ❌ No results for "${cleanTitle}"`);
    return null;
  }

  // Prioritize primaryId match
  if (primaryId) {
    const primary = results.find((r: any) => r.id === primaryId);
    if (primary) {
      results = [primary, ...results.filter((r: any) => r.id !== primaryId)];
    }
  }

  // Find best match
  for (const r of results) {
    const rTitle = (r.t || r.title || '').toLowerCase().trim();
    const rYear = (r.y || r.year || '').toString();
    const search = cleanTitle.toLowerCase().trim();
    const isPrimary = primaryId && r.id === primaryId;

    // Title match check
    const stripArticle = (s: string) => s.replace(/^(the|a|an)\s+/i, '');
    const rStripped = stripArticle(rTitle);
    const sStripped = stripArticle(search);

    const titleMatch = isPrimary ||
      rTitle === search ||
      rStripped === sStripped ||
      rStripped.startsWith(sStripped + ' ') ||
      rStripped.startsWith(sStripped + ':') ||
      sStripped.startsWith(rStripped + ' ') ||
      sStripped.startsWith(rStripped + ':');

    if (!titleMatch) continue;

    // Year match check (lenient — skip if no year info)
    if (!isPrimary && searchYear && rYear && !rYear.includes(searchYear) && !searchYear.includes(rYear)) {
      continue;
    }

    console.log(`[Search] ✅ Matched: "${r.t || r.title}" (${rYear}) ID: ${r.id}${isPrimary ? ' [PRIMARY]' : ''}`);
    return { id: r.id, title: r.t || r.title || '', year: rYear };
  }

  console.log(`[Search] ❌ No title match found in ${results.length} results`);
  return null;
}

// ─── Episode Resolution ───────────────────────────────────────────────────────

/**
 * For TV shows: resolve the specific episode ID from the series ID.
 * Uses /mobile/post.php to get the episode list, then matches the target episode.
 */
async function resolveEpisodeId(
  domain: string,
  seriesId: string,
  season: number,
  episode: number,
  session: MobileSession
): Promise<string> {
  const base = `https://${domain}`;
  const ts = Math.floor(Date.now() / 1000);

  console.log(`[Episodes] 📺 Fetching episode list for series ${seriesId} (S${season}E${episode})...`);

  try {
    // Method 1: /mobile/post.php (MITM line 3056)
    const postRes = await axios.get(`${base}/mobile/post.php`, {
      params: { id: seriesId, t: ts },
      headers: {
        ...mobileHeaders(`${base}/mobile/home?app=1`, 'xhr'),
        'Cookie': session.cookieHeader,
      },
      timeout: 10000,
    });

    const postData = postRes.data;

    // Success: JSON with episode data
    if (postData && typeof postData === 'object' && postData.status !== 'n') {
      const episodes = extractEpisodeList(postData);
      if (episodes.length > 0) {
        const match = findEpisode(episodes, season, episode);
        if (match) {
          console.log(`[Episodes] ✅ Found episode ID: ${match} (from post.php)`);
          return match;
        }
      }
    }
  } catch (err: any) {
    console.log(`[Episodes] ⚠️ post.php failed: ${err.message}`);
  }

  try {
    // Method 2: Desktop play.php → get h token → playlist.php with ep param
    // The desktop playlist.php accepts ep= and returns episode-specific content
    const sessionToken = randomHex(32);
    const desktopCookie = `user_token=${sessionToken}; ott=nf; hd=on;`;

    const playRes = await axios.post(`${base}/play.php`, `id=${seriesId}&ep=${episode}`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': desktopCookie,
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': MOBILE_UA,
        'Referer': `${base}/`,
      },
      timeout: 10000,
    });

    const playData = playRes.data;
    if (playData?.h && playData.h !== 'error') {
      console.log(`[Episodes] 🔑 Got h-token from play.php`);

      // Try desktop playlist.php with ep= param to get the episode-specific HLS URL
      try {
        const plRes = await axios.get(`${base}/playlist.php`, {
          params: { id: seriesId, t: ts, h: playData.h, ott: 'nf', ep: episode },
          headers: {
            'Cookie': desktopCookie,
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': MOBILE_UA,
            'Referer': `${base}/`,
          },
          timeout: 10000,
        });

        const plData = Array.isArray(plRes.data) ? plRes.data[0] : plRes.data;
        if (plData?.sources?.[0]?.file) {
          const sourceUrl = plData.sources[0].file;
          // Extract episode ID from HLS URL: /hls/{EPISODE_ID}.m3u8 or /files/{EPISODE_ID}/
          const hlsMatch = sourceUrl.match(/\/hls\/(\d+)\.m3u8/) || sourceUrl.match(/\/files\/(\d+)\//);
          if (hlsMatch && hlsMatch[1] !== seriesId && hlsMatch[1] !== POISON_ID) {
            console.log(`[Episodes] ✅ Found episode ID: ${hlsMatch[1]} (from desktop playlist.php)`);
            return hlsMatch[1];
          }
        }
      } catch {
        // Non-critical
      }

      // Try ep_list endpoint
      try {
        const epListRes = await axios.get(`${base}/ep_list.php`, {
          params: { id: seriesId, t: ts },
          headers: {
            'Cookie': desktopCookie,
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': MOBILE_UA,
            'Referer': `${base}/`,
          },
          timeout: 10000,
        });

        if (typeof epListRes.data === 'string' && epListRes.data.includes('data-')) {
          const ids = extractEpisodeIdsFromHtml(epListRes.data);
          if (ids.length > 0) {
            const targetIdx = episode - 1;
            if (targetIdx >= 0 && targetIdx < ids.length) {
              console.log(`[Episodes] ✅ Found episode ID: ${ids[targetIdx]} (from ep_list.php, index ${targetIdx})`);
              return ids[targetIdx];
            }
            console.log(`[Episodes] ✅ Using first episode ID: ${ids[0]} (from ep_list.php)`);
            return ids[0];
          }
        }
      } catch {
        // Non-critical
      }
    }
  } catch (err: any) {
    console.log(`[Episodes] ⚠️ Desktop fallback failed: ${err.message}`);
  }

  // Method 3: Use mobile playlist.php to extract episode ID from source URL
  try {
    const plRes = await axios.get(`${base}/mobile/playlist.php`, {
      params: { id: seriesId, t: 'test', tm: ts },
      headers: {
        ...mobileHeaders(`${base}/mobile/home?app=1`, 'app'),
        'Cookie': session.cookieHeader,
      },
      timeout: 8000,
    });

    const plData = Array.isArray(plRes.data) ? plRes.data[0] : plRes.data;
    if (plData?.sources?.[0]?.file) {
      const sourceUrl = plData.sources[0].file;
      const hlsMatch = sourceUrl.match(/\/hls\/(\d+)\.m3u8/);
      if (hlsMatch && hlsMatch[1] !== seriesId && hlsMatch[1] !== POISON_ID) {
        console.log(`[Episodes] ✅ Found episode ID: ${hlsMatch[1]} (from mobile playlist.php)`);
        return hlsMatch[1];
      }
    }
  } catch {
    // Non-critical
  }

  // Last resort: use series ID directly
  console.warn(`[Episodes] ⚠️ Could not resolve episode ID, using series ID: ${seriesId}`);
  return seriesId;
}

/** Extract episode list from various JSON structures */
function extractEpisodeList(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  for (const key of ['episodes', 'episode', 'eps', 'list', 'data', 'result', 'results']) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const nested = extractEpisodeList(value);
      if (nested.length > 0) return nested;
    }
  }

  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) {
      const hasEpFields = (value as any[]).some((item: any) =>
        item && typeof item === 'object' && 'id' in item &&
        ('ep' in item || 'e' in item || 'episode' in item || 's' in item || 'season' in item || 'title' in item)
      );
      if (hasEpFields) return value as any[];
    }
  }

  return [];
}

/** Find a specific episode by season + episode number in an episode list */
function findEpisode(episodes: any[], season: number, episode: number): string | null {
  // Direct season+episode match
  for (const ep of episodes) {
    const epSeason = ep.s || ep.season || ep.season_number || 1;
    const epNum = ep.ep || ep.e || ep.episode || ep.episode_number || 0;
    if (Number(epSeason) === season && Number(epNum) === episode && ep.id) {
      return String(ep.id);
    }
  }

  // Episode-number-only match (some APIs don't include season)
  for (const ep of episodes) {
    const epNum = ep.ep || ep.e || ep.episode || ep.episode_number || 0;
    if (Number(epNum) === episode && ep.id) {
      return String(ep.id);
    }
  }

  // Index-based fallback
  const idx = episode - 1;
  if (idx >= 0 && idx < episodes.length && episodes[idx]?.id) {
    return String(episodes[idx].id);
  }

  return null;
}

/** Extract episode IDs from HTML episode list */
function extractEpisodeIdsFromHtml(html: string): string[] {
  const ids: string[] = [];
  const patterns = [
    /\/epimg\/(?:\d+)\/(\d+)\.(?:jpg|jpeg|png|webp)/gi,
    /mobile\/playlist\.php\?id=(\d+)/gi,
    /mobile\/hls\/(\d+)\.m3u8/gi,
    /data-(?:id|post|episode)=["'](\d+)["']/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      if (match[1] && !ids.includes(match[1])) ids.push(match[1]);
    }
  }

  return ids;
}

// ─── HLS Manifest Handling ────────────────────────────────────────────────────

/**
 * Fetch the master HLS manifest from /mobile/hls/{id}.m3u8
 *
 * CRITICAL: Use the RAW 4-part addhash token. The diagnostic proved:
 *   hash1::hash2::timestamp::ek → ✅ valid manifest, CDN works
 *   hash1::hash2::timestamp::ek::m → ❌ in=unknown, CDN blocked
 */
async function fetchMasterManifest(
  domain: string,
  contentId: string,
  session: MobileSession
): Promise<{ manifest: string; url: string } | null> {
  const base = `https://${domain}`;
  const token = session.addhash; // RAW 4-part token — DO NOT modify

  const hlsUrl = `${base}/mobile/hls/${contentId}.m3u8?in=${encodeURIComponent(token)}&hd=off&lang=eng`;
  console.log(`[HLS] 🎬 Fetching: ${hlsUrl.substring(0, 100)}...`);

  const res = await axios.get(hlsUrl, {
    headers: {
      ...mobileHeaders(`${base}/mobile/home?app=1`, 'app'),
      'Cookie': session.cookieHeader,
    },
    timeout: 12000,
    responseType: 'text',
  });

  const body = typeof res.data === 'string' ? res.data : String(res.data);

  if (!body.includes('#EXTM3U')) {
    console.warn(`[HLS] ❌ Response is not a valid HLS manifest (${body.length} bytes)`);
    return null;
  }

  if (body.includes('in=unknown')) {
    console.warn(`[HLS] ⚠️ Manifest contains in=unknown — token was rejected`);
    return null;
  }

  console.log(`[HLS] ✅ Valid master manifest (${body.length} bytes)`);
  return { manifest: body, url: hlsUrl };
}

/**
 * Fetch captions/subtitles from /mobile/playlist.php
 */
async function fetchCaptions(
  domain: string,
  contentId: string,
  title: string,
  session: MobileSession
): Promise<any[]> {
  const base = `https://${domain}`;
  const ts = Math.floor(Date.now() / 1000);

  try {
    const plRes = await axios.get(`${base}/mobile/playlist.php`, {
      params: { id: contentId, t: encodeURIComponent(title), tm: ts },
      headers: {
        ...mobileHeaders(`${base}/mobile/home?app=1`, 'app'),
        'Cookie': session.cookieHeader,
      },
      timeout: 8000,
    });

    const plData = Array.isArray(plRes.data) ? plRes.data[0] : plRes.data;
    if (!plData?.tracks) return [];

    return plData.tracks
      .filter((t: any) => t.kind === 'captions' && t.file)
      .map((t: any) => ({
        url: t.file.startsWith('//') ? `https:${t.file}` : t.file,
        language: t.label || 'Unknown',
        type: 'vtt',
      }));
  } catch (err: any) {
    console.log(`[Captions] ⚠️ Failed to fetch: ${err.message}`);
    return [];
  }
}

// ─── Manifest Rewriting ───────────────────────────────────────────────────────

/**
 * Rewrite the master manifest to fix known issues:
 *  1. Replace dead CDN domains (nm-cdn → freecdn)
 *  2. Unpoison /files/220884/ references with the real content ID
 *  3. Fix CDN domain mismatch: video stream URIs often point to a dead/wrong CDN
 *     while audio URIs have the correct CDN domain. Extract working CDN from audio
 *     and apply it to video stream lines.
 *  4. Remove BOM and trailing \r
 */
function rewriteManifest(manifest: string, contentId: string): string {
  let content = manifest;

  // Remove BOM
  content = content.replace(/^\uFEFF/, '');

  // Remove trailing \r from lines (Windows-style line endings from server)
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '');

  // Fix dead CDN domains: nm-cdn1.top → freecdn1.top, nm-cdn.top → freecdn2.top
  content = content.replace(/nm-cdn(\d+)?\.top/gi, (_match: string, p1?: string) => {
    return p1 ? `freecdn${p1}.top` : 'freecdn2.top';
  });

  // ── CDN Domain Fix ──
  // The manifest often has audio URIs pointing to the correct CDN (e.g. s24.freecdn3.top)
  // with the real file ID, while video stream URIs point to a different/dead CDN
  // (e.g. s21.freecdn4.top) with a poisoned file ID (220884).
  //
  // IMPORTANT: Audio URIs can be HOSTLESS: URI="https:///files/{id}/a/0/0.m3u8"
  // (triple-slash, no hostname). We must handle both formats.
  //
  // Strategy:
  //   1. Try extracting CDN host from audio URIs (full URL format)
  //   2. Extract CDN host from video variant lines (they always have a host)
  //   3. Fix hostless audio URIs with the discovered host
  //   4. Fix video lines pointing to wrong CDN

  let workingCdnHost = '';

  // Strategy A: Extract CDN host from audio URIs with full hostname
  const audioHostMatch = content.match(/URI="https?:\/\/([^"\/]+)\/files\/(\d+)\//);
  if (audioHostMatch) {
    workingCdnHost = audioHostMatch[1];
    const audioContentId = audioHostMatch[2];
    console.log(`[HLS] 🔍 Audio CDN host: ${workingCdnHost}, audio content ID: ${audioContentId}`);
  }

  // Strategy B: If audio URIs are hostless (https:///files/...), extract CDN host
  // from the video variant lines instead. Video lines always have a hostname.
  if (!workingCdnHost) {
    const videoHostMatch = content.match(/^https:\/\/([^\/]+)\/files\/\d+\//m);
    if (videoHostMatch) {
      workingCdnHost = videoHostMatch[1];
      console.log(`[HLS] 🔍 CDN host from video lines: ${workingCdnHost}`);
    }
  }

  // ── Fix hostless audio URIs ──
  // Replace https:///files/... (triple-slash) with https://{cdnHost}/files/...
  if (content.includes('https:///')) {
    if (workingCdnHost) {
      content = content.replace(/https:\/\/\//g, `https://${workingCdnHost}/`);
      console.log(`[HLS] 🔧 Resolved hostless URIs → https://${workingCdnHost}/`);
    } else {
      console.warn(`[HLS] ⚠️ Hostless URIs found but no CDN host to resolve them`);
    }
  }

  // Unpoison: replace /files/220884/ with /files/{realId}/
  if (content.includes(`/files/${POISON_ID}/`)) {
    content = content.replace(
      new RegExp(`/files/${POISON_ID}/`, 'g'),
      `/files/${contentId}/`
    );
    console.log(`[HLS] 🔧 Unpoisoned /files/${POISON_ID}/ → /files/${contentId}/`);
  }

  // ── Re-extract working CDN host after unpoisoning ──
  // Now that audio URIs have real IDs, re-check if audio host differs from video host
  if (!audioHostMatch) {
    // Audio was hostless and now resolved — re-extract
    const fixedAudioMatch = content.match(/URI="https?:\/\/([^"\/]+)\/files\/(\d+)\//);
    if (fixedAudioMatch && fixedAudioMatch[1]) {
      workingCdnHost = fixedAudioMatch[1];
    }
  }

  // Fix CDN domain on video stream lines:
  // If we found a working CDN host from audio, replace any different CDN hosts
  // on video stream lines (lines that are URLs with .m3u8 and have /files/)
  if (workingCdnHost) {
    const lines = content.split('\n');
    const rewrittenLines = lines.map(line => {
      const trimmed = line.trim();
      // Only rewrite lines that are video variant URLs (not audio, not comments)
      if (trimmed.startsWith('https://') && trimmed.includes('.m3u8') && trimmed.includes('/files/')) {
        const lineHostMatch = trimmed.match(/^https?:\/\/([^\/]+)\//);
        if (lineHostMatch && lineHostMatch[1] !== workingCdnHost) {
          const oldHost = lineHostMatch[1];
          const rewritten = trimmed.replace(`https://${oldHost}/`, `https://${workingCdnHost}/`);
          console.log(`[HLS] 🔧 CDN fix: ${oldHost} → ${workingCdnHost}`);
          return rewritten;
        }
      }
      return line;
    });
    content = rewrittenLines.join('\n');
  }

  return content;
}

/**
 * Validate the CDN stream to detect rate limiting.
 * Rate-limited CDN serves .jpg slideshow instead of real .ts segments.
 */
async function validateCdnStream(manifest: string): Promise<{ valid: boolean; rateLimited: boolean }> {
  // Extract first CDN URL from manifest
  const lines = manifest.split('\n');
  const cdnUrl = lines.find(l => l.trim().startsWith('http') && l.includes('.m3u8'));

  if (!cdnUrl) {
    return { valid: true, rateLimited: false }; // No CDN URLs to validate
  }

  try {
    const res = await axios.get(cdnUrl.trim(), {
      headers: { 'User-Agent': MOBILE_UA },
      timeout: 8000,
    });

    const body = res.data.toString();
    const hasJpg = body.includes('.jpg') || body.includes('.jpeg') || body.includes('.png');
    const hasTs = body.includes('.ts');

    if (hasJpg && !hasTs) {
      console.warn(`[CDN] 🚨 RATE LIMITED — CDN serving .jpg slideshow instead of .ts segments`);
      return { valid: false, rateLimited: true };
    }

    if (hasTs || body.includes('#EXTM3U')) {
      console.log(`[CDN] ✅ Stream validated — real video segments`);
    }

    return { valid: true, rateLimited: false };
  } catch (err: any) {
    console.log(`[CDN] ⚠️ Validation failed: ${err.message} — proceeding anyway`);
    return { valid: true, rateLimited: false };
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function randomHex(length: number): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

// ─── Main Resolver ────────────────────────────────────────────────────────────

/**
 * Resolve a stream using the mobile API.
 * This is the single unified flow for both Net22 and Net52.
 */
async function resolveViaMobileApi(
  domain: string,
  label: string,
  tmdbId: string,
  type: 'movie' | 'tv',
  season: number,
  episode: number,
): Promise<NetMirrorStream> {
  const t0 = Date.now();
  console.log(`[${label}] ▶️ Resolving: TMDB ${tmdbId} (${type}) S${season}E${episode} on ${domain}`);

  // Step 1: Get TMDB metadata
  const tmdbInfo = await getTmdbInfo(tmdbId, type, season, episode);
  if (!tmdbInfo.title) {
    throw new Error(`${label}: Could not get title from TMDB for ${tmdbId}`);
  }
  console.log(`[${label}] 📋 TMDB: "${tmdbInfo.title}" (${tmdbInfo.year})`);

  // Step 2: Warm mobile session (get addhash token)
  const session = await warmMobileSession();
  const sessionDomain = session.domain;
  console.log(`[${label}] 🔑 Session: ${session.addhash.substring(0, 12)}... from ${sessionDomain} (${Date.now() - t0}ms)`);

  // Step 3: Search for content
  // Try session domain first (has mobile API), then the requested domain
  const domainsToSearch = [sessionDomain];
  if (domain !== sessionDomain) domainsToSearch.push(domain);

  let match: SearchResult | null = null;
  for (const d of domainsToSearch) {
    match = await searchContent(d, tmdbInfo.title, tmdbInfo.year);
    if (match) break;
  }

  if (!match) {
    throw new Error(`${label}: No search results for "${tmdbInfo.title}" (${tmdbInfo.year})`);
  }

  // Step 4: For TV shows, resolve the specific episode content ID
  //
  // PRIMARY: Use TMDB episode ID directly (bypasses post.php, no eb needed!)
  // FALLBACK: Try resolveEpisodeId (post.php — needs eb, usually fails with ek)
  let contentId = match.id;
  if (type === 'tv' && season > 0 && episode > 0) {
    if (tmdbInfo.tmdbEpisodeId) {
      // TMDB episode IDs work directly as content IDs on the mirror
      // Tested & confirmed: playlist.php?id={tmdbEpId} returns episode sources
      contentId = tmdbInfo.tmdbEpisodeId;
      console.log(`[${label}] 🎯 Using TMDB episode ID: ${contentId} (bypasses post.php)`);
    } else {
      // Fallback to post.php-based resolution (needs eb token, may fail)
      console.log(`[${label}] ⚠️ No TMDB episode ID, trying post.php fallback...`);
      contentId = await resolveEpisodeId(sessionDomain, match.id, season, episode, session);
    }
  }
  console.log(`[${label}] 🎯 Content ID: ${contentId} (${Date.now() - t0}ms)`);

  // Step 5: Fetch master HLS manifest
  let hlsResult = await fetchMasterManifest(sessionDomain, contentId, session);
  if (!hlsResult) {
    // If session domain failed, try refreshing session
    console.log(`[${label}] 🔄 Manifest failed, refreshing session...`);
    _session = null;
    const freshSession = await warmMobileSession();
    hlsResult = await fetchMasterManifest(freshSession.domain, contentId, freshSession);
    if (!hlsResult) {
      throw new Error(`${label}: Could not get valid HLS manifest for ${contentId}`);
    }
  }

  // Step 6: Rewrite manifest (fix CDN domains, unpoison)
  const rewritten = rewriteManifest(hlsResult.manifest, contentId);

  // Step 7: Validate CDN stream
  const validation = await validateCdnStream(rewritten);
  if (validation.rateLimited) {
    console.warn(`[${label}] 🚨 CDN rate limited — returning empty stream`);
    return {
      url: '',
      headers: {},
      captions: [],
      sourceId: label,
      expiresAt: Date.now() + 30000,
      title: tmdbInfo.title,
      isRateLimited: true,
    };
  }

  // Step 8: Fetch captions (use resolved contentId, not series ID)
  const captions = await fetchCaptions(sessionDomain, contentId, tmdbInfo.title, session);
  console.log(`[${label}] 📝 Captions: ${captions.length} tracks`);

  // Step 9: Build data URI from the rewritten manifest
  const base64 = Buffer.from(rewritten).toString('base64');
  const dataUri = `data:application/x-mpegURL;base64,${base64}`;

  const elapsed = Date.now() - t0;
  console.log(`[${label}] ✅ Done in ${elapsed}ms | manifest: ${rewritten.length} bytes | captions: ${captions.length}`);

  return {
    url: dataUri,
    headers: {
      'User-Agent': MOBILE_UA,
      'Origin': `https://${sessionDomain}`,
      'Referer': `https://${sessionDomain}/`,
    },
    captions,
    sourceId: label,
    expiresAt: Date.now() + 3600000, // 1 hour
    title: tmdbInfo.title,
    isRateLimited: false,
  };
}

// ─── Firestore Cookie Fetch (kept for compatibility) ──────────────────────────

let _cookieCache: { cookies: NetMirrorCookies; fetchedAt: number } | null = null;
const COOKIE_CACHE_TTL_MS = 5 * 60 * 1000;

export async function fetchNetMirrorCookies(): Promise<NetMirrorCookies> {
  if (_cookieCache && (Date.now() - _cookieCache.fetchedAt) < COOKIE_CACHE_TTL_MS) {
    return _cookieCache.cookies;
  }

  try {
    const { doc, getDoc } = require('firebase/firestore');
    const { db } = require('./firebase');
    const docRef = doc(db, 'config', 'netmirror');
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      const cookies: NetMirrorCookies = {
        net22Cookie: data.net22Cookie || data.cookie || '',
        net52Cookie: data.net52Cookie || data.net52cookie || '',
      };
      _cookieCache = { cookies, fetchedAt: Date.now() };
      return cookies;
    }
  } catch (err: any) {
    console.warn(`[Cookies] Firestore fetch failed: ${err.message}`);
  }

  return { net22Cookie: '', net52Cookie: '' };
}

// ─── Public Exports ───────────────────────────────────────────────────────────

/**
 * Resolve Net22 stream via mobile API.
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
    const { net22Domain } = await getNetMirrorDomains();
    console.log(`[Net22] 🌐 Using domain: ${net22Domain}`);
    const result = await resolveViaMobileApi(net22Domain, 'Net22', tmdbId, type, season, episode);
    console.log(`[Net22] ✅ Total: ${Date.now() - t0}ms | url: ${result.url ? result.url.substring(0, 60) + '...' : 'EMPTY'}`);
    return result;
  } catch (err: any) {
    console.error(`[Net22] ❌ FAILED after ${Date.now() - t0}ms: ${err.message}`);
    if (err.message?.includes('ENOTFOUND') || err.message?.includes('ECONNREFUSED')) {
      refreshNetMirrorDomains().catch(() => {});
    }
    throw err;
  }
}

/**
 * Resolve Net52 stream via mobile API.
 */
export async function resolveNet52(
  tmdbId: string,
  type: 'movie' | 'tv',
  season: number = 0,
  episode: number = 0
): Promise<NetMirrorStream> {
  const t0 = Date.now();
  console.log(`[Net52] ▶️ resolveNet52 called: TMDB ${tmdbId} (${type}) S${season}E${episode}`);
  try {
    const { net52Domain } = await getNetMirrorDomains();
    console.log(`[Net52] 🌐 Using domain: ${net52Domain}`);
    const result = await resolveViaMobileApi(net52Domain, 'Net52', tmdbId, type, season, episode);
    console.log(`[Net52] ✅ Total: ${Date.now() - t0}ms | url: ${result.url ? result.url.substring(0, 60) + '...' : 'EMPTY'}`);
    return result;
  } catch (err: any) {
    console.error(`[Net52] ❌ FAILED after ${Date.now() - t0}ms: ${err.message}`);
    if (err.message?.includes('ENOTFOUND') || err.message?.includes('ECONNREFUSED')) {
      refreshNetMirrorDomains().catch(() => {});
    }
    throw err;
  }
}
