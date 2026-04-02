/**
 * VidLink Streaming Service (TV)
 * 
 * Uses TvNativeModule's native Android WebView (not React Native's wrapper)
 * to extract HLS streaming links from vidlink.pro.
 * 
 * Chain: vidlink.pro embed → JS constructs /api/b/ with encrypted tokens
 *      → response contains HLS playlist URL + captions + skip markers
 * 
 * The Kotlin native WebView:
 *  - Loads the vidlink.pro embed page
 *  - Injects JS that hooks fetch/XHR to capture the /api/b/ response
 *  - Parses the response JSON for playlist, captions, intro/outro markers
 *  - Returns the direct stream URL to React Native
 */

import { NativeModules } from 'react-native';

const { TvNativeModule } = NativeModules;

export interface VidLinkSkipMarker {
  type: 'intro' | 'outro';
  start: number;
  end: number;
}

export interface VidLinkStream {
  url: string;           // Direct HLS .m3u8 URL
  headers: Record<string, string>;
  captions: VidLinkCaption[];
  markers?: VidLinkSkipMarker[];
  sourceId: string;
}

export interface VidLinkCaption {
  id: string;
  url: string;
  language: string;
  type: string;
}

/**
 * Resolve a VidLink stream using the Kotlin native WebView.
 * 
 * This calls TvNativeModule.resolveVidLinkStream() which:
 * 1. Creates an Android native WebView (NOT react-native-webview)
 * 2. Loads vidlink.pro/movie/{tmdbId} with a modern Chrome UA
 * 3. Injects JS to intercept fetch/XHR calls matching /api/b/
 * 4. Captures the JSON response containing the HLS playlist URL
 * 5. Parses captions, skip markers (intro/outro), and builds headers
 * 6. Returns the stream with proper proxy-specific headers
 * 
 * Timeout: 30s (TV chipsets are slow)
 */
export async function resolveVidLinkStream(
  tmdbId: string,
  type: 'movie' | 'tv' = 'movie',
  season?: number,
  episode?: number
): Promise<VidLinkStream | null> {
  try {
    console.log(`[VidLink] Resolving via native WebView: TMDB ${tmdbId} (${type})`);
    
    const result = await TvNativeModule.resolveVidLinkStream(
      tmdbId,
      type,
      season ?? 0,
      episode ?? 0
    );

    if (result?.url) {
      console.log(`[VidLink] ✅ Stream resolved: ${result.url.substring(0, 80)}...`);
      
      // Parse markers from native array
      const markers: VidLinkSkipMarker[] = (result.markers || []).map((m: any) => ({
        type: m.type as 'intro' | 'outro',
        start: m.start || 0,
        end: m.end || 0,
      }));

      return {
        url: result.url,
        headers: result.headers || {},
        captions: (result.captions || []).map((c: any) => ({
          id: c.id || c.url,
          url: c.url,
          language: c.language || 'Unknown',
          type: c.type || 'vtt',
        })),
        markers,
        sourceId: result.sourceId || 'vidlink',
      };
    }

    console.warn('[VidLink] No stream URL in response');
    return null;
  } catch (error: any) {
    console.error(`[VidLink] ❌ ${error.code || 'ERROR'}: ${error.message}`);
    return null;
  }
}

/**
 * Get the VidLink embed URL (for debugging/logging purposes)
 */
export function getVidLinkEmbedUrl(
  tmdbId: string,
  type: 'movie' | 'tv' = 'movie',
  season?: number,
  episode?: number
): string {
  if (type === 'tv' && season && episode) {
    return `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`;
  }
  return `https://vidlink.pro/movie/${tmdbId}`;
}
