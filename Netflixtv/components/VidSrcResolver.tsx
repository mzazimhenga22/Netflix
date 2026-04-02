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
 * VidSrcResolver (TV) — Hidden WebView that resolves HLS streaming links
 * from vidsrc.cc's upstream sources (Vidcloud/cloudnestra CDN).
 * 
 * TV-specific:
 * - 320x240 minimum size (Android TV WebView needs this for reliable JS execution)
 * - 35s timeout (TV chipsets are slower)
 * - No incognito (session cookies needed for token flow)
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
          console.log(`[VidSrc-TV] ✅ Direct stream resolved via ${stream.sourceId}!`);
          console.log(`[VidSrc-TV] 🎬 URL: ${stream.url.substring(0, 100)}...`);
          setHasResolved(true);
          onStreamResolved(stream);
        } else {
          onError('Failed to parse VidSrc stream data');
        }
      } else if (message.type === 'VIDSRC_TIMEOUT') {
        console.warn('[VidSrc-TV] ⏰ Resolution timed out');
        onError('VidSrc stream resolution timed out');
      } else if (message.type === 'VIDSRC_DEBUG') {
        console.log(`[VidSrc-TV] 🔍 ${message.data}`);
      }
    } catch (e) {
      console.error('[VidSrc-TV] ❌ Message parse error:', e);
    }
  }, [hasResolved, onStreamResolved, onError]);

  const handleShouldStartLoad = useCallback((request: WebViewNavigation) => {
    const { url } = request;
    if (url.startsWith('data:')) return true;
    if (url.includes('google-analytics') || 
        url.includes('googlesyndication') ||
        url.includes('googletagmanager') ||
        url.includes('doubleclick') ||
        url.includes('facebook.net') ||
        url.includes('adservice') ||
        url.includes('popads')) {
      return false;
    }
    return true;
  }, []);

  if (!enabled || !tmdbId) return null;

  useEffect(() => {
    if (!enabled) return;
    const safetyTimeout = setTimeout(() => {
      if (!hasResolved) {
        console.warn('[VidSrc-TV] ⏰ Safety timeout (40s)');
        onError('VidSrc resolution timed out (40s)');
      }
    }, 40000);
    return () => clearTimeout(safetyTimeout);
  }, [enabled, tmdbId, type, season, episode]);

  console.log(`[VidSrc-TV] 🌐 Loading: ${embedUrl}`);

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
        androidLayerType="none"
        cacheEnabled={true}
        incognito={false}
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
        onLoadStart={() => console.log('[VidSrc-TV] 📄 Loading...')}
        onLoadEnd={() => console.log('[VidSrc-TV] 📄 Loaded, awaiting stream...')}
        onError={(e) => {
          console.error('[VidSrc-TV] ❌ WebView error:', e.nativeEvent.description);
          onError(`WebView error: ${e.nativeEvent.description}`);
        }}
        onHttpError={(e) => {
          console.warn(`[VidSrc-TV] ⚠️ HTTP ${e.nativeEvent.statusCode}`);
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
