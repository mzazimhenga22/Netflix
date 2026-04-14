/**
 * VidLink Streaming Service
 * 
 * Provides direct HLS streaming links via VidLink.pro.
 * Uses a hidden WebView to resolve the encrypted token and extract the M3U8 URL.
 * 
 * Flow:
 * 1. Load vidlink.pro/movie/{tmdbId} in a hidden WebView
 * 2. Inject JS to intercept XHR/fetch calls matching "api/b/"
 * 3. Extract the JSON response containing the HLS playlist URL
 * 4. Return the playlist URL + headers to the native player
 */

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
 * Build the VidLink embed URL for a given TMDB ID
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

/**
 * JavaScript to inject into the WebView that intercepts XHR/fetch
 * and captures the VidLink API response containing the HLS stream.
 */
export const VIDLINK_INTERCEPTOR_JS = `
(function() {
  let resolved = false;

  function dbg(msg) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'VIDLINK_DEBUG',
        data: msg
      }));
    } catch(e) {}
  }

  dbg('Interceptor injected, hooking fetch and XHR...');

  // Intercept fetch() calls
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
    dbg('FETCH: ' + url.substring(0, 120));

    return originalFetch.apply(this, args).then(async response => {
      if (!resolved && url.includes('/api/b/')) {
        dbg('MATCH! /api/b/ found, reading response...');
        try {
          const clone = response.clone();
          const text = await clone.text();
          dbg('Response length: ' + text.length);
          const json = JSON.parse(text);
          if (json && json.stream && json.stream.playlist) {
            resolved = true;
            dbg('SUCCESS! Playlist found: ' + json.stream.playlist.substring(0, 80));
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'VIDLINK_STREAM',
              data: json
            }));
          } else {
            dbg('No stream.playlist in response: ' + JSON.stringify(json).substring(0, 200));
          }
        } catch(e) {
          dbg('Parse error: ' + e.message);
        }
      }
      return response;
    }).catch(err => {
      dbg('FETCH ERROR for ' + url.substring(0, 80) + ': ' + err.message);
      throw err;
    });
  };

  // Intercept XMLHttpRequest as fallback
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._vUrl = url;
    dbg('XHR OPEN: ' + url.substring(0, 120));
    return origOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', function() {
      if (!resolved && this._vUrl && this._vUrl.includes('/api/b/')) {
        dbg('XHR MATCH! /api/b/ response received');
        try {
          const json = JSON.parse(this.responseText);
          if (json && json.stream && json.stream.playlist) {
            resolved = true;
            dbg('XHR SUCCESS! Playlist: ' + json.stream.playlist.substring(0, 80));
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'VIDLINK_STREAM',
              data: json
            }));
          }
        } catch(e) { dbg('XHR parse error: ' + e.message); }
      }
    });
    return origSend.apply(this, args);
  };

  // Timeout
  setTimeout(() => {
    if (!resolved) {
      dbg('TIMEOUT - no stream found in 20s');
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'VIDLINK_TIMEOUT'
      }));
    }
  }, 20000);

  true;
})();
`;

/**
 * Parse the raw VidLink API response into our clean stream format
 */
export function parseVidLinkResponse(data: any): VidLinkStream | null {
  try {
    if (!data?.stream?.playlist) return null;

    const stream = data.stream;
    let playlistUrl: string = stream.playlist;

    // FIX: Replace %2F (encoded slashes) in the proxy path ONLY.
    // Using decodeURIComponent on the full URL breaks base64/token paths.
    // e.g. .../proxy/file2%2F5RREG7don... → .../proxy/file2/5RREG7don...
    playlistUrl = playlistUrl.replace(/%2F/gi, '/');

    console.log(`[VidLink] Playlist URL: ${playlistUrl.substring(0, 120)}...`);

    // Conditionally add headers based on the proxy endpoint type:
    // - file2/ paths: require Referer + Origin (hotlink protection)
    // - slh-eerht/ etc: must NOT send Referer/Origin (they are encoded in URL and 
    //   sending these HTTP headers causes the proxy to reject with 404)
    const responseHeaders: Record<string, string> = {};
    if (stream.headers && typeof stream.headers === 'object') {
      Object.assign(responseHeaders, stream.headers);
    }
    
    // Only fall back to Referer/Origin for file2 paths that don't embed headers
    const isFile2Proxy = /\/proxy\/file\d+\//i.test(playlistUrl);
    if (isFile2Proxy && !responseHeaders['Referer']) {
      responseHeaders['Referer'] = 'https://vidlink.pro/';
      responseHeaders['Origin'] = 'https://vidlink.pro';
    }
    
    // Always enforce a standard browser User-Agent for all proxies to avoid 403 bot blocks
    if (!responseHeaders['User-Agent']) {
      responseHeaders['User-Agent'] = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
    }

    // Captions
    const captions: VidLinkCaption[] = (stream.captions || []).map((c: any) => ({
      id: c.id || c.url,
      url: c.url,
      language: c.language || 'Unknown',
      type: c.type || 'vtt',
    }));

    // Intelligent Jump Markers (Intro / Outro)
    const markers: VidLinkSkipMarker[] = [];
    if (stream.intro) {
      markers.push({ type: 'intro', start: stream.intro.start || 0, end: stream.intro.end || 0 });
    }
    if (stream.outro) {
      markers.push({ type: 'outro', start: stream.outro.start || 0, end: stream.outro.end || 0 });
    }
    if (Array.isArray(stream.skips)) {
      stream.skips.forEach((s: any) => {
        // Handle type as string ('intro'/'outro') or number (1=intro, 2=outro)
        let skipType: 'intro' | 'outro' = 'outro';
        if (s.type === 'intro' || s.type === 1) {
          skipType = 'intro';
        } else if (s.type === 'outro' || s.type === 2) {
          skipType = 'outro';
        }
        markers.push({ type: skipType, start: s.start || 0, end: s.end || 0 });
      });
    }

    return {
      url: playlistUrl,
      headers: responseHeaders,
      captions,
      markers,
      sourceId: data.sourceId || 'vidlink',
    };
  } catch (e) {
    console.error('[VidLink] Failed to parse response:', e);
    return null;
  }
}
