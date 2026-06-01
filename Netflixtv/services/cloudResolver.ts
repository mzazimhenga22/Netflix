/**
 * Embedded Stream Resolver (TV App)
 *
 * Keeps the existing export names used by the player, but resolves providers
 * inside the app through TvNativeModule instead of calling a local or cloud
 * server.
 */

import { resolveVidLinkStream, VidLinkStream, VidLinkSkipMarker } from './vidlink';
import { resolveVidSrcStream } from './vidsrc';

const LOCAL_PROVIDER_TIMEOUT_MS = 38000;
const LOCAL_TOTAL_TIMEOUT_MS = 45000;
const CACHE_DURATION_MS = 30 * 60 * 1000;

const streamCache = new Map<string, { data: CloudResolverResult; timestamp: number }>();

function getCacheKey(tmdbId: string, type: string, season?: number, episode?: number) {
  return `${type}_${tmdbId}_S${season ?? '0'}_E${episode ?? '0'}`;
}

export interface CloudResolverResult {
  url: string;
  headers: Record<string, string>;
  captions: { id: string; url: string; language: string; type: string }[];
  markers: VidLinkSkipMarker[];
  sourceId: string;
  expiresAt?: number | null;
}

export interface ResolveStreamOptions {
  forceRefresh?: boolean;
  healthOnly?: boolean;
  currentUrl?: string;
  currentHeaders?: Record<string, string>;
  title?: string;
}

export interface CloudStreamHealthResult {
  ok: boolean;
  healthy: boolean;
  status: number | null;
  checkedUrl?: string | null;
  mode?: string;
  error?: string;
}

function getTvNativeModule(): any | null {
  try {
    const { NativeModules } = require('react-native');
    return NativeModules?.TvNativeModule || null;
  } catch {
    return null;
  }
}

function normalizeResolverResult(result: any, sourceId: string): CloudResolverResult | null {
  if (!result?.url) return null;

  return {
    url: result.url,
    headers: result.headers || {},
    captions: (result.captions || []).map((c: any) => ({
      id: c.id || c.url,
      url: c.url,
      language: c.language || 'Unknown',
      type: c.type || 'vtt',
    })),
    markers: (result.markers || []).map((m: any) => ({
      type: m.type as 'intro' | 'outro',
      start: m.start || 0,
      end: m.end || 0,
    })),
    sourceId: result.sourceId || sourceId,
    expiresAt: typeof result.expiresAt === 'number' ? result.expiresAt : null,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

// TMDB provider IDs for platform routing
const NETFLIX_PROVIDER_ID = 8;
const DISNEY_PROVIDER_ID = 337;
const PRIME_PROVIDER_IDS = [9, 119]; // Amazon Prime Video variants

type Platform = 'netflix' | 'disney_prime' | 'other';

async function detectPlatform(tmdbId: string, type: string): Promise<Platform> {
  const TMDB_API_KEY = '8baba8ab6b8bbe247645bcae7df63d0d';
  try {
    const mediaType = type === 'tv' ? 'tv' : 'movie';
    const res = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/watch/providers?api_key=${TMDB_API_KEY}`
    );
    if (!res.ok) return 'other';

    const data = await res.json();
    // Check US providers first, then any region
    const regions = data?.results || {};
    const checkRegions = [regions.US, regions.GB, regions.IN, ...Object.values(regions)];

    for (const region of checkRegions) {
      if (!region || typeof region !== 'object') continue;
      const allProviders = [
        ...((region as any).flatrate || []),
        ...((region as any).ads || []),
        ...((region as any).free || []),
      ];
      const providerIds = allProviders.map((p: any) => p.provider_id);

      if (providerIds.includes(NETFLIX_PROVIDER_ID)) {
        console.log(`[EmbeddedResolver] Platform: Netflix (TMDB ${tmdbId})`);
        return 'netflix';
      }
      if (providerIds.includes(DISNEY_PROVIDER_ID) ||
          PRIME_PROVIDER_IDS.some(id => providerIds.includes(id))) {
        console.log(`[EmbeddedResolver] Platform: Disney+/Prime (TMDB ${tmdbId})`);
        return 'disney_prime';
      }
    }
  } catch (e: any) {
    console.log(`[EmbeddedResolver] Platform detection failed: ${e?.message}`);
  }
  return 'other';
}

async function resolveStreamInsideApp(
  tmdbId: string,
  type: 'movie' | 'tv',
  season?: number,
  episode?: number
): Promise<CloudResolverResult | null> {
  console.log(`[EmbeddedResolver] Resolving: TMDB ${tmdbId} (${type})`);
  const startedAt = Date.now();

  // Detect which streaming platform this title belongs to
  const platform = await detectPlatform(tmdbId, type);

  // Build provider chain based on platform
  const netMirrorProvider = (name: string, method: string) => ({
    name,
    run: async () =>
      (getTvNativeModule() as any)?.[method]?.(tmdbId, type, season ?? 0, episode ?? 0) ?? null,
  });

  const genericProviders = [
    { name: 'vidlink', run: () => resolveVidLinkStream(tmdbId, type, season, episode) },
    { name: 'vidsrc', run: () => resolveVidSrcStream(tmdbId, type, season, episode) },
    netMirrorProvider('moviesapi', 'resolveMoviesAPI'),
    netMirrorProvider('superembed', 'resolveSuperEmbed'),
  ];

  let providers: { name: string; run: () => Promise<any> }[];

  switch (platform) {
    case 'netflix':
      // Netflix → net22 first, then net52, then generic
      console.log('[EmbeddedResolver] Routing: net22 → net52 → generic fallbacks');
      providers = [
        netMirrorProvider('net22', 'resolveNet22'),
        netMirrorProvider('net52', 'resolveNet52'),
        ...genericProviders,
      ];
      break;
    case 'disney_prime':
      // Disney+/Prime → net52 first, then net22, then generic
      console.log('[EmbeddedResolver] Routing: net52 → net22 → generic fallbacks');
      providers = [
        netMirrorProvider('net52', 'resolveNet52'),
        netMirrorProvider('net22', 'resolveNet22'),
        ...genericProviders,
      ];
      break;
    default:
      // Unknown platform → try both NetMirror domains, then generic
      console.log('[EmbeddedResolver] Routing: net22 → net52 → generic fallbacks');
      providers = [
        netMirrorProvider('net22', 'resolveNet22'),
        netMirrorProvider('net52', 'resolveNet52'),
        ...genericProviders,
      ];
      break;
  }

  let poisonDetected = false;

  for (const provider of providers) {
    const remainingMs = LOCAL_TOTAL_TIMEOUT_MS - (Date.now() - startedAt);
    if (remainingMs <= 1000) {
      console.log('[EmbeddedResolver] Provider budget exhausted');
      break;
    }

    try {
      const result = await withTimeout(
        provider.run(),
        Math.min(LOCAL_PROVIDER_TIMEOUT_MS, remainingMs),
        provider.name
      );
      const normalized = normalizeResolverResult(result, provider.name);
      if (normalized?.url) {
        console.log(`[EmbeddedResolver] Resolved via ${provider.name}`);
        return normalized;
      }
      console.log(`[EmbeddedResolver] ${provider.name} returned no stream`);
    } catch (error: any) {
      const msg = error?.message || String(error);
      console.log(`[EmbeddedResolver] ${provider.name} failed: ${msg}`);
      
      // Detect poisoned cookies — trigger self-healing
      if (msg.includes('220884') || msg.includes('poisoned') || msg.includes('POISONED')) {
        poisonDetected = true;
      }
    }
  }

  // 🔄 SELF-HEALING: If poison was detected, refresh cookies and retry NetMirror
  if (poisonDetected) {
    console.log('[EmbeddedResolver] 🔄 Poison detected! Attempting self-healing cookie refresh...');
    try {
      const refreshed = await CookieService.refreshCookiesFromDevice();
      if (refreshed) {
        console.log('[EmbeddedResolver] 🔄 Cookies refreshed! Retrying net22/net52...');
        // Retry net22 then net52
        for (const name of ['net22', 'net52']) {
          try {
            const method = name === 'net22' ? 'resolveNet22' : 'resolveNet52';
            const nativeModule = getTvNativeModule() as any;
            const result = await withTimeout(
              nativeModule?.[method]?.(tmdbId, type, season ?? 0, episode ?? 0),
              LOCAL_PROVIDER_TIMEOUT_MS,
              `${name}-retry`
            );
            const normalized = normalizeResolverResult(result, `${name}-retry`);
            if (normalized?.url) {
              console.log(`[EmbeddedResolver] ✅ Resolved via ${name} after self-healing!`);
              return normalized;
            }
          } catch (retryErr: any) {
            console.log(`[EmbeddedResolver] ${name} retry failed: ${retryErr?.message}`);
          }
        }
      }
    } catch (healErr: any) {
      console.log(`[EmbeddedResolver] Self-healing failed: ${healErr?.message}`);
    }
  }

  return null;
}

/**
 * Name kept for compatibility. This no longer calls Google or localhost.
 */
export async function resolveStreamFromCloud(
  tmdbId: string,
  type: 'movie' | 'tv' = 'movie',
  season?: number,
  episode?: number,
  options: ResolveStreamOptions = {}
): Promise<CloudResolverResult | null> {
  const cacheKey = getCacheKey(tmdbId, type, season, episode);
  const cached = streamCache.get(cacheKey);
  const now = Date.now();

  if (!options.forceRefresh && cached && now - cached.timestamp < CACHE_DURATION_MS) {
    console.log(`[EmbeddedResolver] Cache hit: ${cacheKey}`);
    return cached.data;
  }

  if (options.healthOnly === true) {
    return checkStreamHealthOnCloud(
      tmdbId,
      type,
      options.currentUrl || '',
      options.currentHeaders,
      season,
      episode
    ) as any;
  }

  const result = await resolveStreamInsideApp(tmdbId, type, season, episode);
  if (result?.url) {
    streamCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  }

  console.log('[EmbeddedResolver] No embedded provider resolved a stream');
  return null;
}

export function invalidateCacheEntry(
  tmdbId: string,
  type: string,
  season?: number,
  episode?: number
): void {
  const cacheKey = getCacheKey(tmdbId, type, season, episode);
  const deleted = streamCache.delete(cacheKey);
  if (deleted) {
    console.log(`[EmbeddedResolver] Cache invalidated: ${cacheKey}`);
  }
}

export function clearStreamCache(): void {
  const size = streamCache.size;
  streamCache.clear();
  console.log(`[EmbeddedResolver] Full cache cleared (${size} entries)`);
}

export function toVidLinkStream(result: CloudResolverResult): VidLinkStream {
  return {
    url: result.url,
    headers: result.headers,
    captions: result.captions,
    markers: result.markers,
    sourceId: result.sourceId,
  };
}

export async function checkStreamHealthOnCloud(
  _tmdbId: string,
  _type: 'movie' | 'tv' = 'movie',
  currentUrl: string,
  currentHeaders?: Record<string, string>,
  _season?: number,
  _episode?: number
): Promise<CloudStreamHealthResult | null> {
  if (!currentUrl) {
    return {
      ok: false,
      healthy: false,
      status: null,
      checkedUrl: null,
      mode: 'embeddedHealth',
      error: 'Missing currentUrl',
    };
  }

  try {
    const response = await fetch(currentUrl, {
      method: 'GET',
      headers: currentHeaders || {},
    });

    return {
      ok: response.ok,
      healthy: response.ok,
      status: response.status,
      checkedUrl: currentUrl,
      mode: 'embeddedHealth',
    };
  } catch (error: any) {
    return {
      ok: false,
      healthy: false,
      status: null,
      checkedUrl: currentUrl,
      mode: 'embeddedHealth',
      error: error?.message || String(error),
    };
  }
}

import { CookieService } from "./CookieService";

/**
 * Dynamically fetches fresh NetMirror cookies from Firestore
 * and injects them into the Native Module to avoid APK rebuilds.
 */
export async function syncNetMirrorCookies() {
  return await CookieService.syncCookies();
}
