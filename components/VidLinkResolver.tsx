import React, { useRef, useCallback, useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import { 
  getVidLinkEmbedUrl, 
  VIDLINK_INTERCEPTOR_JS, 
  parseVidLinkResponse,
  VidLinkStream 
} from '../services/vidlink';

interface VidLinkResolverProps {
  tmdbId: string;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  onStreamResolved: (stream: VidLinkStream) => void;
  onError: (error: string) => void;
  enabled: boolean;
}

// VidLinkResolver - Hidden WebView that resolves HLS streaming links.
// Renders a 1x1 WebView, loads VidLink embed page, intercepts the
// internal API call, and extracts the direct .m3u8 URL for native playback.
export function VidLinkResolver({ 
  tmdbId, 
  type, 
  season, 
  episode, 
  onStreamResolved, 
  onError,
  enabled 
}: VidLinkResolverProps) {
  const webviewRef = useRef<WebView>(null);
  const [hasResolved, setHasResolved] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Reset resolved state when content parameters change (new episode/movie)
  useEffect(() => {
    setHasResolved(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [tmdbId, type, season, episode]);

  const embedUrl = getVidLinkEmbedUrl(tmdbId, type, season, episode);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    if (hasResolved) return;
    
    try {
      const message = JSON.parse(event.nativeEvent.data);
      
      if (message.type === 'VIDLINK_STREAM') {
        const stream = parseVidLinkResponse(message.data);
        if (stream) {
          console.log(`[VidLink] ✅ Stream resolved!`);
          console.log(`[VidLink] 🎬 URL: ${stream.url.substring(0, 100)}...`);
          console.log(`[VidLink] 📝 Captions: ${stream.captions.length}`);
          console.log(`[VidLink] 🔑 Headers:`, JSON.stringify(stream.headers));
          setHasResolved(true);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          onStreamResolved(stream);
        } else {
          console.error('[VidLink] ❌ Failed to parse stream response');
          onError('Failed to parse stream data');
        }
      } else if (message.type === 'VIDLINK_TIMEOUT') {
        console.warn('[VidLink] ⏰ Resolution timed out after 15s');
        onError('Stream resolution timed out');
      } else if (message.type === 'VIDLINK_DEBUG') {
        console.log(`[VidLink] 🔍 Debug: ${message.data}`);
      }
    } catch (e) {
      console.error('[VidLink] ❌ Message parse error:', e);
    }
  }, [hasResolved, onStreamResolved, onError]);

  // Allow ALL URL schemes including data: URIs (needed for VidLink's
  // WebRTC/Audio fingerprinting which uses data:text/html iframes)
  const handleShouldStartLoad = useCallback((request: WebViewNavigation) => {
    const { url } = request;
    // Allow data: URIs - VidLink uses these for fingerprinting
    if (url.startsWith('data:')) {
      return true;
    }
    // Allow vidlink.pro and its CDN domains
    if (url.includes('vidlink.pro') || 
        url.includes('vodvidl.site') ||
        url.includes('videostr.net') ||
        url.includes('megafiles.store') ||
        url.includes('thunderleaf')) {
      return true;
    }
    // Allow all other requests too (ad scripts, etc. needed for page to work)
    return true;
  }, []);

  if (!enabled || !tmdbId) return null;

  console.log(`[VidLink] 🌐 Loading embed: ${embedUrl}`);

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={webviewRef}
        source={{ uri: embedUrl }}
        style={styles.hiddenWebView}
        injectedJavaScriptBeforeContentLoaded={VIDLINK_INTERCEPTOR_JS}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        // Allow data: URIs for fingerprinting scripts
        originWhitelist={['*']}
        // Allow mixed content
        mixedContentMode="always"
        // Allow media playback detection but don't actually play
        mediaPlaybackRequiresUserAction={true}
        allowsInlineMediaPlayback={true}
        // Allow file access for WASM
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        // Allow third-party cookies (needed for session)
        thirdPartyCookiesEnabled={true}
        // Don't block any navigations
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onMessage={handleMessage}
        onLoadStart={() => {
          console.log('[VidLink] 📄 WebView load started...');
        }}
        onLoadEnd={() => {
          console.log('[VidLink] 📄 WebView load finished, waiting for stream...');
        }}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('[VidLink] ❌ WebView error:', nativeEvent.description);
          onError(`WebView error: ${nativeEvent.description}`);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.warn(`[VidLink] ⚠️ HTTP ${nativeEvent.statusCode}: ${nativeEvent.url?.substring(0, 80)}`);
        }}
        setSupportMultipleWindows={false}
        userAgent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
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
