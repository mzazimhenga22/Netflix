/**
 * VidSrc Direct Source Extractor (TV)
 * 
 * Uses TvNativeModule's native Android WebView (not React Native's wrapper)
 * to extract direct HLS streams from vidsrc.cc → cloudnestra CDN.
 * 
 * Chain: vidsrc.cc → vidbox.site → streameeeeee.site (Vidcloud) → cloudnestra CDN
 * 
 * The Kotlin native WebView:
 *  - Loads the vidsrc.cc embed page
 *  - Injects JS that hooks JWPlayer.setup(), HLS.js, fetch(), XHR, <video> src
 *  - Auto-clicks the play button
 *  - Captures the m3u8 URL via JavascriptInterface callback
 *  - Returns the direct CDN URL to React Native
 */

import { NativeModules } from 'react-native';

const { TvNativeModule } = NativeModules;

export interface VidSrcStream {
  url: string;              // Direct HLS .m3u8 URL from CDN (cloudnestra)
  headers: Record<string, string>;
  captions: VidSrcCaption[];
  sourceId: string;         // Which interception layer caught it (jwplayer, hls.js, fetch, etc.)
  quality?: string;
}

export interface VidSrcCaption {
  id: string;
  url: string;
  language: string;
  type: string;
}

/**
 * Resolve a VidSrc stream using the Kotlin native WebView.
 * 
 * This calls TvNativeModule.resolveVidSrcStream() which:
 * 1. Creates an Android native WebView (NOT react-native-webview)
 * 2. Loads vidsrc.cc embed with a modern Chrome UA
 * 3. Injects JS to intercept JWPlayer/HLS.js/fetch/XHR
 * 4. Auto-clicks the play button to trigger the chain
 * 5. Captures the m3u8 URL from the upstream CDN (cloudnestra)
 * 6. Returns it with proper CDN-specific headers
 * 
 * Timeout: 35s (TV chipsets are slow)
 */
export async function resolveVidSrcStream(
  tmdbId: string,
  type: 'movie' | 'tv' = 'movie',
  season?: number,
  episode?: number
): Promise<VidSrcStream | null> {
  try {
    console.log(`[VidSrc] Resolving via native WebView: TMDB ${tmdbId} (${type})`);
    
    const result = await TvNativeModule.resolveVidSrcStream(
      tmdbId,
      type,
      season ?? 0,
      episode ?? 0
    );

    if (result?.url) {
      console.log(`[VidSrc] ✅ Stream resolved via ${result.sourceId}: ${result.url.substring(0, 80)}...`);
      return {
        url: result.url,
        headers: result.headers || {},
        captions: result.captions || [],
        sourceId: result.sourceId || 'vidsrc',
        quality: result.quality || 'auto',
      };
    }

    console.warn('[VidSrc] No stream URL in response');
    return null;
  } catch (error: any) {
    console.error(`[VidSrc] ❌ ${error.code || 'ERROR'}: ${error.message}`);
    return null;
  }
}

/**
 * Get the VidSrc embed URL (for debugging/logging purposes)
 */
export function getVidSrcEmbedUrl(
  tmdbId: string,
  type: 'movie' | 'tv' = 'movie',
  season?: number,
  episode?: number
): string {
  if (type === 'tv' && season && episode) {
    return `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${season}/${episode}`;
  }
  return `https://vidsrc.cc/v2/embed/${type}/${tmdbId}`;
}
