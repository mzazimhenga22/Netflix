/**
 * Cloud Stream Resolver (TV App)
 * 
 * Calls the Google Cloud Function to resolve streaming links.
 * Replaces the broken WebView-based resolution on Android TV.
 * 
 * The Cloud Function runs Puppeteer with full Chrome, so VidLink's
 * WASM/fingerprinting and VidSrc's JWPlayer chain work perfectly.
 * 
 * Response format matches VidLinkStream exactly, so ModernVideoPlayer
 * doesn't need any changes to its stream handling logic.
 */

import { VidLinkStream, VidLinkSkipMarker } from './vidlink';

// ================================================================
// IMPORTANT: Update this URL after deploying the Cloud Function.
// Format: https://<region>-<project-id>.cloudfunctions.net/resolveStream
// ================================================================
const CLOUD_FUNCTION_URL = 'https://us-central1-my-new-app-493307.cloudfunctions.net/resolveStream';

// Request timeout — generous to allow Puppeteer to do its work
const REQUEST_TIMEOUT_MS = 45000;

// Cache configuration
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const streamCache = new Map<string, { data: CloudResolverResult, timestamp: number }>();

function getCacheKey(tmdbId: string, type: string, season?: number, episode?: number) {
  return `${type}_${tmdbId}_S${season ?? '0'}_E${episode ?? '0'}`;
}

export interface CloudResolverResult {
  url: string;
  headers: Record<string, string>;
  captions: { id: string; url: string; language: string; type: string }[];
  markers: VidLinkSkipMarker[];
  sourceId: string;
}

/**
 * Resolve a streaming link via the serverless Cloud Function.
 * 
 * @param tmdbId - TMDB movie/show ID
 * @param type - 'movie' or 'tv'
 * @param season - Season number (for TV)
 * @param episode - Episode number (for TV)
 * @returns Resolved stream data, or null if resolution failed
 */
export async function resolveStreamFromCloud(
  tmdbId: string,
  type: 'movie' | 'tv' = 'movie',
  season?: number,
  episode?: number
): Promise<CloudResolverResult | null> {
  const cacheKey = getCacheKey(tmdbId, type, season, episode);
  const cached = streamCache.get(cacheKey);
  const now = Date.now();

  if (cached && (now - cached.timestamp < CACHE_DURATION_MS)) {
    console.log(`[CloudResolver] 🎯 Cache hit: ${cacheKey}`);
    return cached.data;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    console.log(`[CloudResolver] 🚀 Requesting stream: TMDB ${tmdbId} (${type}) S${season ?? '-'} E${episode ?? '-'}`);
    console.log(`[CloudResolver] 🌐 URL: ${CLOUD_FUNCTION_URL}`);

    const response = await fetch(CLOUD_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tmdbId,
        type,
        season: season ?? undefined,
        episode: episode ?? undefined,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[CloudResolver] ❌ HTTP ${response.status}: ${errorBody.substring(0, 200)}`);
      return null;
    }

    const data: CloudResolverResult = await response.json();

    if (!data.url) {
      console.error('[CloudResolver] ❌ Response missing stream URL');
      return null;
    }

    console.log(`[CloudResolver] ✅ Stream resolved via ${data.sourceId}: ${data.url.substring(0, 80)}...`);
    console.log(`[CloudResolver] 📝 Captions: ${data.captions?.length ?? 0}, Markers: ${data.markers?.length ?? 0}`);

    const result: CloudResolverResult = {
      url: data.url,
      headers: data.headers || {},
      captions: (data.captions || []).map(c => ({
        id: c.id || c.url,
        url: c.url,
        language: c.language || 'Unknown',
        type: c.type || 'vtt',
      })),
      markers: (data.markers || []).map(m => ({
        type: m.type as 'intro' | 'outro',
        start: m.start || 0,
        end: m.end || 0,
      })),
      sourceId: data.sourceId || 'cloud',
    };

    // Store in cache
    streamCache.set(cacheKey, { data: result, timestamp: Date.now() });

    return result;
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      console.error(`[CloudResolver] ⏰ Request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    } else {
      console.error(`[CloudResolver] ❌ Error: ${error.message}`);
    }

    // --- LOCAL FALLBACK ---
    console.log('[CloudResolver] 🔄 Attempting local native fallback...');
    try {
      const { NativeModules } = require('react-native');
      const { TvNativeModule } = NativeModules;
      if (TvNativeModule) {
        // Try SuperEmbed locally
        const localResult = await TvNativeModule.resolveSuperEmbed(
          tmdbId, type, season ?? 0, episode ?? 0
        ).catch(() => null);

        if (localResult?.url) {
           console.log(`[CloudResolver] ✅ Local fallback success via ${localResult.sourceId}`);
           return {
             url: localResult.url,
             headers: localResult.headers || {},
             captions: [],
             markers: [],
             sourceId: localResult.sourceId,
           };
        }
      }
    } catch (fallbackError) {
      console.error('[CloudResolver] ❌ Local fallback failed:', fallbackError);
    }

    return null;
  }
}

/**
 * Invalidate a specific cached stream entry.
 * Call this before opening the video player to ensure a fresh stream URL
 * is resolved instead of reusing one the preview ExoPlayer already consumed.
 */
export function invalidateCacheEntry(
  tmdbId: string,
  type: string,
  season?: number,
  episode?: number
): void {
  const cacheKey = getCacheKey(tmdbId, type, season, episode);
  const deleted = streamCache.delete(cacheKey);
  if (deleted) {
    console.log(`[CloudResolver] 🗑️ Cache invalidated: ${cacheKey}`);
  }
}

/**
 * Clear the entire stream cache.
 * Useful when navigating to the player to guarantee no stale tokens.
 */
export function clearStreamCache(): void {
  const size = streamCache.size;
  streamCache.clear();
  console.log(`[CloudResolver] 🧹 Full cache cleared (${size} entries)`);
}

/**
 * Convert CloudResolverResult to VidLinkStream format
 * for seamless integration with the existing player logic.
 */
export function toVidLinkStream(result: CloudResolverResult): VidLinkStream {
  return {
    url: result.url,
    headers: result.headers,
    captions: result.captions,
    markers: result.markers,
    sourceId: result.sourceId,
  };
}
