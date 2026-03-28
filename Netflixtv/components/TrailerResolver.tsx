import React, { useRef, useCallback, useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import axios from 'axios';

export interface TrailerStream {
  url: string;
  type: 'mp4' | 'hls' | 'dash';
}

interface TrailerResolverProps {
  tmdbId: number | string;
  mediaType: 'movie' | 'tv';
  onResolved: (stream: TrailerStream) => void;
  onError?: (error: string) => void;
  enabled: boolean;
}

/**
 * STEP 1 INJECTED JS:
 * Runs on the IMDb title page after WAF challenge passes.
 * Extracts the first vi#### video ID from the DOM and posts it back.
 */
const TITLE_PAGE_JS = `
  (function() {
    try {
      var html = document.documentElement.innerHTML;
      var patterns = [
        /\\/video\\/(vi\\d+)/,
        /"video":\\s*"(vi\\d+)"/,
        /"videoId":\\s*"(vi\\d+)"/,
        /data-video-id="(vi\\d+)"/,
        /href="\\/video\\/(vi\\d+)/
      ];
      var videoId = null;
      for (var i = 0; i < patterns.length; i++) {
        var m = html.match(patterns[i]);
        if (m) { videoId = m[1]; break; }
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'IMDB_VIDEO_ID',
        videoId: videoId
      }));
    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'IMDB_ERROR',
        error: e.message
      }));
    }
  })();
  true;
`;

/**
 * STEP 2 INJECTED JS:
 * Runs on the /videoembed/ page.
 * Extracts all MP4, M3U8, and MPD URLs from the embed HTML.
 */
const EMBED_PAGE_JS = `
  (function() {
    try {
      var html = document.documentElement.innerHTML;
      var candidates = [];

      var mp4 = html.match(/https:[^"' ]+\\.mp4[^"' ]*/g);
      if (mp4) mp4.forEach(function(u) { candidates.push({ url: u, type: 'mp4' }); });

      var m3u8 = html.match(/https:[^"' ]+\\.m3u8[^"' ]*/g);
      if (m3u8) m3u8.forEach(function(u) { candidates.push({ url: u, type: 'hls' }); });

      var mpd = html.match(/https:[^"' ]+\\.mpd[^"' ]*/g);
      if (mpd) mpd.forEach(function(u) { candidates.push({ url: u, type: 'dash' }); });

      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'IMDB_STREAMS',
        candidates: candidates
      }));
    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'IMDB_ERROR',
        error: e.message
      }));
    }
  })();
  true;
`;

export function TrailerResolver({
  tmdbId,
  mediaType,
  onResolved,
  onError,
  enabled
}: TrailerResolverProps) {
  const webviewRef = useRef<WebView>(null);
  const [imdbId, setImdbId] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'title' | 'embed' | 'done'>('idle');
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const hasResolved = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCount = useRef(0);
  const MAX_RETRIES = 3;
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch IMDb ID from TMDB
  useEffect(() => {
    if (!enabled || !tmdbId) return;
    let mounted = true;

    async function getImdbId() {
      try {
        const TMDB_API_KEY = '8baba8ab6b8bbe247645bcae7df63d0d';
        const res = await axios.get(
          `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`
        );
        const id = res.data.imdb_id;
        if (id && mounted) {
          console.log(`[TrailerResolver] 🎬 IMDb ID: ${id}`);
          setImdbId(id);
          setPhase('title');
          setCurrentUrl(`https://www.imdb.com/title/${id}/`);
        } else {
          console.warn(`[TrailerResolver] ❌ No IMDb ID for TMDB ${tmdbId}`);
          onError?.('No IMDb ID found');
        }
      } catch (err) {
        console.error('[TrailerResolver] ❌ TMDB fetch failed:', err);
        onError?.('Failed to fetch IMDb ID');
      }
    }

    getImdbId();

    // 30s total timeout (accommodates retries)
    timeoutRef.current = setTimeout(() => {
      if (!hasResolved.current) {
        console.warn('[TrailerResolver] ⏰ Resolution timeout (30s)');
        onError?.('Trailer resolution timed out');
      }
    }, 30000);

    return () => {
      mounted = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [enabled, tmdbId]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    if (hasResolved.current) return;

    try {
      const msg = JSON.parse(event.nativeEvent.data);

      if (msg.type === 'IMDB_VIDEO_ID') {
        if (msg.videoId) {
          console.log(`[TrailerResolver] ✅ Video ID: ${msg.videoId}`);
          retryCount.current = 0;
          setPhase('embed');
          setCurrentUrl(`https://www.imdb.com/videoembed/${msg.videoId}`);
        } else if (retryCount.current < MAX_RETRIES) {
          // WAF challenge likely served on cold start — retry after delay
          retryCount.current += 1;
          console.log(`[TrailerResolver] 🔄 Retry ${retryCount.current}/${MAX_RETRIES} (WAF challenge)`);
          retryTimerRef.current = setTimeout(() => {
            if (!hasResolved.current && imdbId) {
              setCurrentUrl('');
              setTimeout(() => {
                setCurrentUrl(`https://www.imdb.com/title/${imdbId}/`);
              }, 100);
            }
          }, 2000);
        } else {
          console.warn('[TrailerResolver] ❌ No video ID after all retries');
          onError?.('No trailer video found');
        }
      } else if (msg.type === 'IMDB_STREAMS') {
        const candidates = msg.candidates || [];
        console.log(`[TrailerResolver] 🔗 Found ${candidates.length} stream candidates`);

        // Prefer HLS > MP4 > DASH
        const sorted = [
          ...candidates.filter((c: any) => c.type === 'hls'),
          ...candidates.filter((c: any) => c.type === 'mp4'),
          ...candidates.filter((c: any) => c.type === 'dash'),
        ];

        if (sorted.length > 0) {
          const best = sorted[0];
          console.log(`[TrailerResolver] ✨ Resolved: ${best.type} - ${best.url.substring(0, 60)}...`);
          hasResolved.current = true;
          setPhase('done');
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          onResolved(best);
        } else {
          console.warn('[TrailerResolver] ❌ No playable streams in embed');
          onError?.('No playable trailer streams found');
        }
      } else if (msg.type === 'IMDB_ERROR') {
        console.error('[TrailerResolver] ❌ JS Error:', msg.error);
      }
    } catch (e) {
      console.error('[TrailerResolver] ❌ Message parse error:', e);
    }
  }, [onResolved, onError, imdbId]);

  if (!enabled || !currentUrl || phase === 'done' || phase === 'idle') return null;

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        key={currentUrl}
        ref={webviewRef}
        source={{ uri: currentUrl }}
        style={styles.hiddenWebView}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        mixedContentMode="always"
        thirdPartyCookiesEnabled={true}
        setSupportMultipleWindows={false}
        mediaPlaybackRequiresUserAction={true}
        sharedCookiesEnabled={true}
        incognito={false}
        userAgent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        onLoadEnd={() => {
          console.log(`[TrailerResolver] 📄 Page loaded (phase: ${phase})`);
          const delay = retryCount.current > 0 ? 1500 : 500;
          setTimeout(() => {
            if (phase === 'title') {
              webviewRef.current?.injectJavaScript(TITLE_PAGE_JS);
            } else if (phase === 'embed') {
              webviewRef.current?.injectJavaScript(EMBED_PAGE_JS);
            }
          }, delay);
        }}
        onMessage={handleMessage}
        onError={(e) => {
          console.error('[TrailerResolver] ❌ WebView error:', e.nativeEvent.description);
        }}
        onHttpError={(e) => {
          console.warn(`[TrailerResolver] ⚠️ HTTP ${e.nativeEvent.statusCode}`);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
  },
  hiddenWebView: {
    width: 1,
    height: 1,
  },
});
