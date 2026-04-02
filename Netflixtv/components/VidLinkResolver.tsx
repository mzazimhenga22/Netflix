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
// TV Compatibility:
// - 320x240 minimum size (Android TV WebView needs this for reliable JS execution)
// - Default rendering layer (let system choose GPU/CPU based on device)
// - Cookies & cache enabled (VidLink needs session cookies for token flow)
// - Modern user agent (old/TV agents get blocked by anti-bot)
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

  // Set a safety timeout — if WebView hangs, fire error after 25s
  useEffect(() => {
    if (!enabled) return;
    const safetyTimeout = setTimeout(() => {
      if (!hasResolved) {
        console.warn('[VidLink] ⏰ Safety timeout (25s) — WebView may be stuck');
        onError('Stream resolution timed out (25s)');
      }
    }, 25000);
    return () => clearTimeout(safetyTimeout);
  }, [enabled, tmdbId, type, season, episode]);

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
        // === TV COMPATIBILITY ===
        // Let the system decide GPU vs CPU rendering ("none" = system default)
        // "software" breaks JS execution on many TV chipsets
        androidLayerType="none"
        // Enable cache — VidLink loads JS bundles that need caching for token generation
        cacheEnabled={true}
        // Do NOT use incognito — VidLink needs session cookies for its encrypted token flow
        incognito={false}
        // Don't play any media (saves decoder RAM)
        mediaPlaybackRequiresUserAction={true}
        allowsInlineMediaPlayback={false}
        // Disable file access (not needed)
        allowFileAccess={false}
        allowUniversalAccessFromFileURLs={false}
        // Allow third-party cookies (critical for VidLink session/token)
        thirdPartyCookiesEnabled={true}
        // Share cookies with other WebViews (helps if VidLink sets tokens across loads)
        sharedCookiesEnabled={true}
        overScrollMode="never"
        // Don't open popups
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
        // CRITICAL: Use a modern Chrome user agent for ALL devices.
        // Old/TV user agents (Chrome/91, "SmartTV") get blocked by VidLink anti-bot.
        userAgent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    // 320x240 minimum — Android TV WebView needs this size for reliable JS execution.
    // Smaller sizes cause JS throttling/skipping on low-end chipsets (Amlogic, Realtek).
    // Placed offscreen so it's invisible to the user.
    width: 320,
    height: 240,
    left: -1000,
    top: -1000,
    opacity: 0.01, // Near-invisible but not 0 — prevents Android from optimizing away the view
    overflow: 'hidden',
  },
  hiddenWebView: {
    width: 320,
    height: 240,
  },
});
