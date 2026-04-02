/**
 * useTvNative - TypeScript bridge to TvNativeModule (Kotlin)
 *
 * Provides typed async wrappers for all native methods.
 * Falls back gracefully when the native module isn't available.
 */

import { NativeModules, Platform } from 'react-native';

const { TvNativeModule } = NativeModules;

const isAvailable = !!TvNativeModule;
if (!isAvailable) {
  console.warn('[TvNative] Native module not available — fallback mode');
}

// ===== Types =====

export interface NativeVidLinkStream {
  url: string;
  headers: Record<string, string>;
  captions: NativeCaption[];
  markers?: NativeSkipMarker[];
  sourceId: string;
}

export interface NativeVidSrcStream {
  url: string;
  headers: Record<string, string>;
  captions: NativeCaption[];
  sourceId: string;
  quality?: string;
}

export interface NativeCaption {
  id: string;
  url: string;
  language: string;
  type: string;
}

export interface NativeSkipMarker {
  type: 'intro' | 'outro';
  start: number;
  end: number;
}

export interface NativeTrailerStream {
  url: string;
  type: 'mp4' | 'hls' | 'dash';
}

// ===== API =====

/**
 * Resolve a VidLink HLS stream via native Android WebView (Kotlin).
 * The Kotlin module creates a headless WebView, loads the embed page,
 * and intercepts the /api/b/ fetch response containing the HLS playlist.
 */
export async function resolveVidLinkStream(
  tmdbId: string,
  type: 'movie' | 'tv',
  season?: number,
  episode?: number
): Promise<NativeVidLinkStream | null> {
  if (!isAvailable) return null;
  try {
    const result = await TvNativeModule.resolveVidLinkStream(
      tmdbId,
      type,
      season ?? 0,
      episode ?? 0
    );
    return result as NativeVidLinkStream;
  } catch (e: any) {
    console.warn(`[TvNative] resolveVidLinkStream error: ${e.message}`);
    return null;
  }
}

/**
 * Resolve a VidSrc HLS stream via native Android WebView (Kotlin).
 * The Kotlin module creates a headless WebView, loads vidsrc.cc embed,
 * and intercepts JWPlayer/HLS.js/fetch calls to capture the m3u8 URL
 * from the upstream CDN (cloudnestra).
 */
export async function resolveVidSrcStream(
  tmdbId: string,
  type: 'movie' | 'tv',
  season?: number,
  episode?: number
): Promise<NativeVidSrcStream | null> {
  if (!isAvailable) return null;
  try {
    const result = await TvNativeModule.resolveVidSrcStream(
      tmdbId,
      type,
      season ?? 0,
      episode ?? 0
    );
    return result as NativeVidSrcStream;
  } catch (e: any) {
    console.warn(`[TvNative] resolveVidSrcStream error: ${e.message}`);
    return null;
  }
}

/**
 * Resolve an IMDb trailer URL on the native thread.
 */
export async function resolveTrailer(
  tmdbId: string | number,
  mediaType: 'movie' | 'tv'
): Promise<NativeTrailerStream | null> {
  if (!isAvailable) return null;
  try {
    const result = await TvNativeModule.resolveTrailer(
      String(tmdbId),
      mediaType
    );
    return result as NativeTrailerStream;
  } catch (e: any) {
    console.warn(`[TvNative] resolveTrailer error: ${e.message}`);
    return null;
  }
}

/**
 * Batch-prefetch trailers for multiple items (for ExpandingRow).
 * Staggers requests 200ms apart to avoid rate limiting.
 */
export async function prefetchTrailers(
  tmdbIds: (string | number)[],
  mediaType: 'movie' | 'tv'
): Promise<Record<string, NativeTrailerStream>> {
  if (!isAvailable) return {};
  try {
    const ids = tmdbIds.map(String);
    const result = await TvNativeModule.prefetchTrailers(ids, mediaType);
    return result as Record<string, NativeTrailerStream>;
  } catch (e: any) {
    console.warn(`[TvNative] prefetchTrailers error: ${e.message}`);
    return {};
  }
}

/**
 * Check if the native module is available.
 */
export function isTvNativeAvailable(): boolean {
  return isAvailable;
}

