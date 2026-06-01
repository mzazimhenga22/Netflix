import React, { useRef, useCallback, useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import { 
  MOVIESAPI_INTERCEPTOR_JS, 
  parseMoviesApiResponse,
  MoviesApiStream,
  MoviesApiCaption
} from '../services/moviesapi';

interface MoviesApiResolverProps {
  tmdbId: string;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  onStreamResolved: (stream: MoviesApiStream) => void;
  onError: (error: string) => void;
  enabled: boolean;
}

/**
 * MoviesApiResolver — Hidden WebView that resolves HLS/MP4 streaming links.
 * 
 * Strategy (sequential, fast-fail):
 *   1. Load flixcdn.cyou embed directly (fastest — skips moviesapi.to middleman)
 *      → API fetch for video_url with 6s timeout
 *      → Load embed in WebView, JWPlayer extraction in ~2s
 *   2. If Step 1 fails, try upn_url alternative embed (hd4u.sbs)
 *   3. If both fail, load moviesapi.to/movie/{id} directly in WebView
 *      → The page itself contains an iframe to the embed
 */
export const MoviesApiResolver = React.memo(({ 
  tmdbId, 
  type, 
  season, 
  episode, 
  onStreamResolved, 
  onError,
  enabled 
}: MoviesApiResolverProps) => {
  const webviewRef = useRef<WebView>(null);
  const [hasResolved, setHasResolved] = useState(false);
  const hasResolvedRef = useRef(false);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [subtitles, setSubtitles] = useState<MoviesApiCaption[]>([]);
  const attemptRef = useRef(0);

  // Reset state when content changes
  useEffect(() => {
    setHasResolved(false);
    hasResolvedRef.current = false;
    setEmbedUrl(null);
    setSubtitles([]);
    attemptRef.current = 0;
  }, [tmdbId, type, season, episode]);

  // Resolve embed URL — try fast API fetch, then fallback to direct moviesapi.to
  useEffect(() => {
    if (!enabled || !tmdbId || hasResolvedRef.current) return;
    if (embedUrl) return; // Already have a URL to try

    let active = true;
    const attempt = attemptRef.current;

    (async () => {
      try {
        if (attempt === 0) {
          // ── Attempt 0: Fast API fetch for direct embed URL ──
          console.log(`[MoviesAPI] 🔍 Attempt 0: Fast API fetch for TMDB ${tmdbId}...`);
          
          const apiUrl = type === 'tv' && season && episode
            ? `https://ww2.moviesapi.to/api/tv/${tmdbId}/${season}/${episode}`
            : `https://ww2.moviesapi.to/api/movie/${tmdbId}`;

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s — aggressive

          try {
            const res = await fetch(apiUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                'Referer': 'https://moviesapi.to/',
              },
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (res.ok) {
              const json = await res.json();
              console.log(`[MoviesAPI] ✅ API returned keys: [${Object.keys(json).join(', ')}]`);

              // Parse subtitles
              if (Array.isArray(json.subtitles)) {
                const subs = json.subtitles
                  .filter((s: any) => s.label && (s.label.toLowerCase().includes('english') || s.default === true))
                  .map((s: any) => ({ id: s.label || s.url, url: s.url, language: s.label || 'English', type: 'srt' }));
                if (active) setSubtitles(subs);
              }

              // Try primary embed (flixcdn.cyou)
              if (json.video_url) {
                console.log(`[MoviesAPI] 🌐 Using primary embed: ${json.video_url.substring(0, 80)}`);
                if (active) setEmbedUrl(json.video_url);
                return;
              }

              // Try alternative embed (hd4u.sbs)
              if (json.upn_url) {
                console.log(`[MoviesAPI] 🌐 Using alternative embed (upn_url): ${json.upn_url.substring(0, 80)}`);
                if (active) setEmbedUrl(json.upn_url);
                return;
              }

              throw new Error('No video_url or upn_url in API response');
            } else {
              throw new Error(`HTTP ${res.status}`);
            }
          } catch (fetchErr: any) {
            clearTimeout(timeoutId);
            const msg = fetchErr.name === 'AbortError' ? 'API fetch timed out (6s)' : fetchErr.message;
            console.warn(`[MoviesAPI] ⚠️ API fetch failed: ${msg} — falling back to direct page load`);
            
            // Fallback: load moviesapi.to directly in WebView
            if (!active) return;
            attemptRef.current = 1;
            const directUrl = type === 'tv' && season && episode
              ? `https://moviesapi.to/tv/${tmdbId}-${season}-${episode}`
              : `https://moviesapi.to/movie/${tmdbId}`;
            console.log(`[MoviesAPI] 🌐 Attempt 1: Direct page load: ${directUrl}`);
            setEmbedUrl(directUrl);
          }
        }
      } catch (e: any) {
        if (!active) return;
        console.error(`[MoviesAPI] ❌ Resolve error: ${e.message}`);
        onError(`MoviesAPI error: ${e.message}`);
      }
    })();

    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tmdbId, type, season, episode, embedUrl]);

  // When WebView-loaded embed times out, try the next fallback
  const handleEmbedTimeout = useCallback(() => {
    if (hasResolvedRef.current) return;
    const current = attemptRef.current;
    
    if (current === 0) {
      // Primary embed timed out, try direct page
      attemptRef.current = 1;
      const directUrl = type === 'tv' && season && episode
        ? `https://moviesapi.to/tv/${tmdbId}-${season}-${episode}`
        : `https://moviesapi.to/movie/${tmdbId}`;
      console.warn(`[MoviesAPI] ⏰ Embed timed out — trying direct page: ${directUrl}`);
      setEmbedUrl(directUrl);
    } else {
      // All attempts exhausted
      console.warn('[MoviesAPI] ⏰ All attempts exhausted');
      onError('MoviesAPI: all embeds timed out');
    }
  }, [tmdbId, type, season, episode, onError]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    if (hasResolvedRef.current) return;
    
    try {
      const message = JSON.parse(event.nativeEvent.data);
      
      if (message.type === 'MOVIESAPI_STREAM') {
        const stream = parseMoviesApiResponse(message.data.url, subtitles);
        if (stream) {
          console.log(`[MoviesAPI] ✅ Stream resolved!`);
          console.log(`[MoviesAPI] 🎬 URL: ${stream.url.substring(0, 100)}...`);
          console.log(`[MoviesAPI] 📝 Captions: ${stream.captions.length}`);
          hasResolvedRef.current = true;
          setHasResolved(true);
          onStreamResolved(stream);
        } else {
          console.error('[MoviesAPI] ❌ Failed to parse stream response');
          handleEmbedTimeout(); // Try next fallback
        }
      } else if (message.type === 'MOVIESAPI_TIMEOUT') {
        handleEmbedTimeout();
      } else if (message.type === 'MOVIESAPI_DEBUG') {
        console.log(`[MoviesAPI] 🔍 ${message.data}`);
      }
    } catch (e) {
      console.error('[MoviesAPI] ❌ Message parse error:', e);
    }
  }, [onStreamResolved, onError, subtitles, handleEmbedTimeout]);

  // Only block truly dangerous pop-unders. Do NOT block Google ad SDK —
  // flixcdn.cyou's player depends on IMA SDK for initialization.
  const handleShouldStartLoad = useCallback((request: WebViewNavigation) => {
    const { url } = request;
    if (url.startsWith('data:')) return true;
    if (url.includes('popads') ||
        url.includes('pop-under')) {
      console.log(`[MoviesAPI] 🚫 Blocked: ${url.substring(0, 60)}`);
      return false;
    }
    return true;
  }, []);

  // Safety timeout — 25s per embed attempt
  useEffect(() => {
    if (!enabled || !tmdbId || !embedUrl || hasResolvedRef.current) return;
    const safetyTimeout = setTimeout(() => {
      if (!hasResolvedRef.current) {
        console.warn(`[MoviesAPI] ⏰ Safety timeout (25s) for: ${embedUrl.substring(0, 60)}`);
        handleEmbedTimeout();
      }
    }, 25000);
    return () => clearTimeout(safetyTimeout);
  }, [enabled, tmdbId, embedUrl, handleEmbedTimeout]);

  if (!enabled || !tmdbId || !embedUrl) {
    if (enabled && tmdbId) {
      console.log(`[MoviesAPI] ⏳ Waiting for embed URL... (enabled=${enabled}, tmdbId=${tmdbId})`);
    }
    return null;
  }

  console.log(`[MoviesAPI] 🌐 WebView loading: ${embedUrl.substring(0, 80)}`);

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        key={embedUrl} // Force remount on URL change
        ref={webviewRef}
        source={{ uri: embedUrl }}
        style={styles.hiddenWebView}
        injectedJavaScriptBeforeContentLoaded={MOVIESAPI_INTERCEPTOR_JS}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        mixedContentMode="always"
        androidLayerType="none"
        cacheEnabled={true}
        incognito={false}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        allowFileAccess={false}
        allowUniversalAccessFromFileURLs={false}
        thirdPartyCookiesEnabled={true}
        sharedCookiesEnabled={true}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onMessage={handleMessage}
        onLoadStart={() => console.log(`[MoviesAPI] 📄 WebView load started: ${embedUrl.substring(0, 60)}`)}
        onLoadEnd={() => console.log(`[MoviesAPI] 📄 WebView loaded, polling for stream...`)}
        onError={(e) => {
          console.error(`[MoviesAPI] ❌ WebView error: ${e.nativeEvent.description}`);
          handleEmbedTimeout();
        }}
        onHttpError={(e) => {
          console.warn(`[MoviesAPI] ⚠️ HTTP ${e.nativeEvent.statusCode}: ${e.nativeEvent.url?.substring(0, 80)}`);
        }}
        userAgent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 320,
    height: 240,
    left: -1000,
    top: -1000,
    opacity: 0.01,
    overflow: 'hidden',
  },
  hiddenWebView: {
    width: 320,
    height: 240,
  },
});
