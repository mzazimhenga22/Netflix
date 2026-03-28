import React, { useRef, useCallback, useState, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
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
// Optimized for low-RAM devices (Android 9, 1GB RAM smart TVs):
// - Software rendering layer (lower memory than GPU)
// - No caching (saves RAM)
// - Incognito mode (lighter footprint)
// - Minimal surface (100x100) — big enough for JS execution, small enough to save RAM
export const VidLinkResolver = React.memo(({ 
  tmdbId, 
  type, 
  season, 
  episode, 
  onStreamResolved, 
  onError,
  enabled 
}: VidLinkResolverProps) => {
  const webviewRef = useRef<WebView>(null);
  const [hasResolved, setHasResolved] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Reset resolved state when content changes (e.g. switching episodes)
  useEffect(() => {
    setHasResolved(false);
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
          setHasResolved(true);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          onStreamResolved(stream);
        } else {
          console.error('[VidLink] ❌ Failed to parse stream response');
          onError('Failed to parse stream data');
        }
      } else if (message.type === 'VIDLINK_TIMEOUT') {
        console.warn('[VidLink] ⏰ Resolution timed out');
        onError('Stream resolution timed out');
      } else if (message.type === 'VIDLINK_DEBUG') {
        console.log(`[VidLink] 🔍 Debug: ${message.data}`);
      }
    } catch (e) {
      console.error('[VidLink] ❌ Message parse error:', e);
    }
  }, [hasResolved, onStreamResolved, onError]);

  // Block ad/tracking scripts to save bandwidth & RAM on low-end devices
  const handleShouldStartLoad = useCallback((request: WebViewNavigation) => {
    const { url } = request;
    // Allow data: URIs - VidLink uses these for fingerprinting
    if (url.startsWith('data:')) return true;
    // Block known ad/tracking domains to save RAM
    if (url.includes('google-analytics') || 
        url.includes('googlesyndication') ||
        url.includes('doubleclick') ||
        url.includes('facebook.net') ||
        url.includes('adservice')) {
      console.log(`[VidLink] 🚫 Blocked ad script: ${url.substring(0, 60)}`);
      return false;
    }
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
        originWhitelist={['*']}
        mixedContentMode="always"
        // === LOW-RAM OPTIMIZATIONS ===
        // Software rendering uses CPU instead of GPU — much lower memory on 1GB devices
        androidLayerType="software"
        // Don't cache anything — saves precious RAM
        cacheEnabled={false}
        // Incognito = lighter memory footprint, no persistent storage
        incognito={true}
        // Don't play any media (saves decoder RAM)
        mediaPlaybackRequiresUserAction={true}
        allowsInlineMediaPlayback={false}
        // Disable file access (not needed, saves permissions overhead)
        allowFileAccess={false}
        allowUniversalAccessFromFileURLs={false}
        // Allow third-party cookies (needed for VidLink session)
        thirdPartyCookiesEnabled={true}
        overScrollMode="never"
        // Don't open popups (saves RAM)
        setSupportMultipleWindows={false}
        // Block ad navigations to save bandwidth/RAM
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
        // Dynamic User Agent: TV gets the lightweight Android 9 agent, Phones get the standard modern agent
        userAgent={Platform.isTV 
          ? "Mozilla/5.0 (Linux; Android 9; SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.101 Mobile Safari/537.36"
          : "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        }
      />
    </View>
  );
});

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    // 100x100 = big enough for Android 9 WebView to execute JS,
    // small enough to minimize RAM usage on 1GB devices.
    // Placed offscreen so it's invisible.
    width: 100,
    height: 100,
    left: -500,
    top: -500,
    opacity: 0.01, // Near-invisible but not 0 — prevents skip-render optimization
    overflow: 'hidden',
  },
  hiddenWebView: {
    width: 100,
    height: 100,
  },
});
