import React, { useRef, useCallback, useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import { 
  getVidSrcEmbedUrl, 
  VIDSRC_INTERCEPTOR_JS, 
  parseVidSrcResponse,
  VidSrcStream 
} from '../services/vidsrc';

interface VidSrcResolverProps {
  tmdbId: string;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  onStreamResolved: (stream: VidSrcStream) => void;
  onError: (error: string) => void;
  enabled: boolean;
}

/**
 * VidSrcResolver — Hidden WebView that resolves HLS streaming links
 * from vidsrc.cc's upstream sources (Vidcloud/cloudnestra CDN).
 * 
 * This bypasses the @definisi/vidsrc-scraper npm package entirely.
 * The WebView loads the embed, lets the obfuscated JS execute natively,
 * and our injected interceptor captures the m3u8 URL when JWPlayer
 * receives it from the API chain.
 */
export const VidSrcResolver = React.memo(({ 
  tmdbId, 
  type, 
  season, 
  episode, 
  onStreamResolved, 
  onError,
  enabled 
}: VidSrcResolverProps) => {
  const webviewRef = useRef<WebView>(null);
  const [hasResolved, setHasResolved] = useState(false);

  // Reset resolved state when content changes
  useEffect(() => {
    setHasResolved(false);
  }, [tmdbId, type, season, episode]);

  const embedUrl = getVidSrcEmbedUrl(tmdbId, type, season, episode);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    if (hasResolved) return;
    
    try {
      const message = JSON.parse(event.nativeEvent.data);
      
      if (message.type === 'VIDSRC_STREAM') {
        const stream = parseVidSrcResponse(message.data);
        if (stream) {
          console.log(`[VidSrc] ✅ Direct stream resolved via ${stream.sourceId}!`);
          console.log(`[VidSrc] 🎬 URL: ${stream.url.substring(0, 100)}...`);
          console.log(`[VidSrc] 📝 Captions: ${stream.captions.length}`);
          setHasResolved(true);
          onStreamResolved(stream);
        } else {
          console.error('[VidSrc] ❌ Failed to parse stream response');
          onError('Failed to parse VidSrc stream data');
        }
      } else if (message.type === 'VIDSRC_TIMEOUT') {
        console.warn('[VidSrc] ⏰ Resolution timed out');
        onError('VidSrc stream resolution timed out');
      } else if (message.type === 'VIDSRC_DEBUG') {
        console.log(`[VidSrc] 🔍 ${message.data}`);
      }
    } catch (e) {
      console.error('[VidSrc] ❌ Message parse error:', e);
    }
  }, [hasResolved, onStreamResolved, onError]);

  // Block ads/tracking to save bandwidth & RAM
  const handleShouldStartLoad = useCallback((request: WebViewNavigation) => {
    const { url } = request;
    if (url.startsWith('data:')) return true;
    if (url.includes('google-analytics') || 
        url.includes('googlesyndication') ||
        url.includes('googletagmanager') ||
        url.includes('doubleclick') ||
        url.includes('facebook.net') ||
        url.includes('adservice') ||
        url.includes('popads') ||
        url.includes('pop-under')) {
      console.log(`[VidSrc] 🚫 Blocked: ${url.substring(0, 60)}`);
      return false;
    }
    return true;
  }, []);


  // Safety timeout — if WebView hangs
  useEffect(() => {
    if (!enabled || !tmdbId) return;
    const safetyTimeout = setTimeout(() => {
      if (!hasResolved) {
        console.warn('[VidSrc] ⏰ Safety timeout (35s)');
        onError('VidSrc resolution timed out (35s)');
      }
    }, 35000);
    return () => clearTimeout(safetyTimeout);
  }, [enabled, tmdbId, type, season, episode, hasResolved, onError]);

  if (!enabled || !tmdbId) return null;

  console.log(`[VidSrc] 🌐 Loading embed: ${embedUrl}`);

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={webviewRef}
        source={{ uri: embedUrl }}
        style={styles.hiddenWebView}
        injectedJavaScriptBeforeContentLoaded={VIDSRC_INTERCEPTOR_JS}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        mixedContentMode="always"
        // Let system decide GPU vs CPU rendering
        androidLayerType="none"
        cacheEnabled={true}
        incognito={false}
        // Don't play media — we only want the URL
        mediaPlaybackRequiresUserAction={true}
        allowsInlineMediaPlayback={false}
        allowFileAccess={false}
        allowUniversalAccessFromFileURLs={false}
        thirdPartyCookiesEnabled={true}
        sharedCookiesEnabled={true}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onMessage={handleMessage}
        onLoadStart={() => console.log('[VidSrc] 📄 WebView load started...')}
        onLoadEnd={() => console.log('[VidSrc] 📄 WebView finished, waiting for stream...')}
        onError={(e) => {
          console.error('[VidSrc] ❌ WebView error:', e.nativeEvent.description);
          onError(`WebView error: ${e.nativeEvent.description}`);
        }}
        onHttpError={(e) => {
          console.warn(`[VidSrc] ⚠️ HTTP ${e.nativeEvent.statusCode}: ${e.nativeEvent.url?.substring(0, 80)}`);
        }}
        // Modern Chrome UA — old/TV UAs get blocked
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
