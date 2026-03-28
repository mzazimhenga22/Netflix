/**
 * Streaming Service
 * 
 * Primary provider: VidLink.pro (Hybrid WebView → HLS extraction)
 * The actual stream resolution is handled by the VidLinkResolver component
 * which uses a hidden WebView to extract direct .m3u8 links.
 * 
 * This file re-exports VidLink utilities for backward compatibility
 * and provides any additional streaming helpers.
 */

export { 
  getVidLinkEmbedUrl, 
  parseVidLinkResponse,
  VIDLINK_INTERCEPTOR_JS 
} from './vidlink';

export type { VidLinkStream, VidLinkCaption } from './vidlink';

export interface StreamSource {
  url: string;
  isM3U8: boolean;
  quality?: string;
}

export interface StreamData {
  sources: StreamSource[];
  subtitles?: { url: string; lang: string }[];
}

/**
 * Legacy streaming link fetcher (deprecated - kept for backward compatibility).
 * New code should use the VidLinkResolver component directly.
 */
export const fetchStreamingLinks = async (
  id: string,
  type: 'movie' | 'tv' = 'movie',
  season?: number,
  episode?: number
): Promise<StreamData | null> => {
  console.warn('[Streaming] fetchStreamingLinks is deprecated. Use VidLinkResolver component instead.');
  return null;
};
