/**
 * VidSrc Direct Source Extractor
 * 
 * Goes DIRECTLY to the upstream video source instead of through vidsrc's npm scraper.
 * 
 * Traced chain:
 *   vidsrc.cc → /api/source/{token} → vidbox.site → streameeeeee.site (Vidcloud/JWPlayer) → cloudnestra CDN
 * 
 * Strategy:
 *   Load vidsrc.cc embed in a hidden WebView, let JS execute natively,
 *   and intercept:
 *   1. JWPlayer's .setup() call which contains the direct m3u8 URL
 *   2. fetch/XHR calls that return m3u8 playlists
 *   3. HLS.js source assignments
 *   4. <video> src changes
 *
 * This gives us the final CDN URL (cloudnestra/etc) without needing
 * any npm scraper packages.
 */

export interface VidSrcStream {
  url: string;              // Direct HLS .m3u8 URL from the CDN
  headers: Record<string, string>;
  captions: VidSrcCaption[];
  sourceId: string;         // Which upstream source was used
  quality?: string;         // e.g. "1080p", "720p", "auto"
}

export interface VidSrcCaption {
  id: string;
  url: string;
  language: string;
  type: string;
}

/**
 * Build the VidSrc embed URL for a given TMDB ID
 */
export function getVidSrcEmbedUrl(
  tmdbId: string,
  type: 'movie' | 'tv' = 'movie',
  season?: number,
  episode?: number
): string {
  if (type === 'tv' && season && episode) {
    return `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${season}/${episode}`;
  }
  return `https://vidsrc.cc/v2/embed/${type}/${tmdbId}`;
}

/**
 * JavaScript injected into the WebView BEFORE page loads.
 * 
 * Multi-layer interception strategy:
 * 
 * Layer 1: Hook JWPlayer .setup() — the player receives the m3u8 in its config
 * Layer 2: Hook HLS.js loadSource() — if they use hls.js instead of native HLS
 * Layer 3: Hook fetch() — catch any /api/ calls returning m3u8 URLs
 * Layer 4: Hook XMLHttpRequest — fallback for older XHR-based requests
 * Layer 5: Monitor <video> elements for src changes
 * Layer 6: Auto-click the play button to trigger the chain
 */
export const VIDSRC_INTERCEPTOR_JS = `
(function() {
  let resolved = false;
  let playClicked = false;

  function dbg(msg) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'VIDSRC_DEBUG',
        data: msg
      }));
    } catch(e) {}
  }

  function sendStream(url, captions, sourceId) {
    if (resolved) return;
    resolved = true;
    dbg('🎉 Stream captured: ' + url.substring(0, 100));
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'VIDSRC_STREAM',
      data: {
        url: url,
        captions: captions || [],
        sourceId: sourceId || 'vidsrc-direct'
      }
    }));
  }

  dbg('VidSrc interceptor injecting...');

  // =============================================
  // Layer 1: Hook JWPlayer .setup()
  // vidsrc.cc uses JWPlayer — the m3u8 is passed in the setup config
  // =============================================
  let _origJwSetup = null;

  function hookJWPlayer() {
    if (typeof window.jwplayer === 'function') {
      const origJw = window.jwplayer;
      window.jwplayer = function() {
        const instance = origJw.apply(this, arguments);
        if (instance && instance.setup && !instance._hooked) {
          const origSetup = instance.setup;
          instance.setup = function(config) {
            dbg('JWPlayer.setup() intercepted!');
            try {
              // Extract m3u8 from sources/playlist
              let m3u8 = null;
              let captions = [];

              if (config.file) m3u8 = config.file;
              if (config.sources) {
                for (const s of config.sources) {
                  if (s.file && s.file.includes('.m3u8')) { m3u8 = s.file; break; }
                  if (s.file) m3u8 = s.file; // Take any source
                }
              }
              if (config.playlist && Array.isArray(config.playlist)) {
                for (const item of config.playlist) {
                  if (item.file && item.file.includes('.m3u8')) { m3u8 = item.file; break; }
                  if (item.sources) {
                    for (const s of item.sources) {
                      if (s.file && s.file.includes('.m3u8')) { m3u8 = s.file; break; }
                      if (s.file) m3u8 = s.file;
                    }
                  }
                  // Extract captions/tracks
                  if (item.tracks) {
                    captions = item.tracks
                      .filter(t => t.kind === 'captions' || t.kind === 'subtitles')
                      .map(t => ({ id: t.label || t.file, url: t.file, language: t.label || 'Unknown', type: 'vtt' }));
                  }
                }
              }
              // Also check tracks at config level
              if (config.tracks) {
                captions = config.tracks
                  .filter(t => t.kind === 'captions' || t.kind === 'subtitles')
                  .map(t => ({ id: t.label || t.file, url: t.file, language: t.label || 'Unknown', type: 'vtt' }));
              }

              if (m3u8) {
                sendStream(m3u8, captions, 'jwplayer');
              } else {
                dbg('JWPlayer config had no m3u8: ' + JSON.stringify(config).substring(0, 300));
              }
            } catch(e) {
              dbg('JWPlayer hook error: ' + e.message);
            }
            return origSetup.call(this, config);
          };
          instance._hooked = true;
        }
        return instance;
      };
      // Copy static methods
      for (var key in origJw) {
        if (origJw.hasOwnProperty(key)) window.jwplayer[key] = origJw[key];
      }
      dbg('JWPlayer hooked');
    }
  }

  // =============================================
  // Layer 2: Hook HLS.js loadSource()
  // =============================================
  function hookHLS() {
    if (typeof window.Hls === 'function') {
      const OrigHls = window.Hls;
      const origProto = OrigHls.prototype.loadSource;
      OrigHls.prototype.loadSource = function(src) {
        dbg('HLS.loadSource: ' + src);
        if (src && (src.includes('.m3u8') || src.includes('master'))) {
          sendStream(src, [], 'hls.js');
        }
        return origProto.apply(this, arguments);
      };
      dbg('HLS.js hooked');
    }
  }

  // =============================================
  // Layer 3: Hook fetch()
  // =============================================
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
    
    // Log all fetches for debugging
    if (url.length > 5) dbg('FETCH: ' + url.substring(0, 120));

    return originalFetch.apply(this, args).then(async response => {
      if (resolved) return response;
      
      // Check if the response URL contains m3u8
      if (url.includes('.m3u8') || url.includes('master.m3u8')) {
        sendStream(url, [], 'fetch-m3u8');
        return response;
      }
      
      // Check API responses that might contain source URLs
      if (url.includes('/api/') || url.includes('/source') || url.includes('/embed')) {
        try {
          const clone = response.clone();
          const text = await clone.text();
          // Look for m3u8 URLs in the response
          const m3u8Match = text.match(/(https?:\\/\\/[^\\s"']+\\.m3u8[^\\s"']*)/i);
          if (m3u8Match) {
            dbg('Found m3u8 in API response: ' + m3u8Match[1].substring(0, 100));
            sendStream(m3u8Match[1], [], 'api-response');
          }
          // Check for JSON with source/file/url fields
          try {
            const json = JSON.parse(text);
            const src = json?.data?.source || json?.source || json?.file || json?.url || 
                        json?.data?.file || json?.data?.url || json?.stream?.file;
            if (src && typeof src === 'string' && (src.includes('.m3u8') || src.includes('http'))) {
              dbg('Found source in JSON: ' + src.substring(0, 100));
              // If it's a direct m3u8, send it
              if (src.includes('.m3u8')) {
                sendStream(src, [], 'api-json');
              }
            }
          } catch {}
        } catch(e) {
          dbg('API intercept error: ' + e.message);
        }
      }
      return response;
    }).catch(err => {
      dbg('FETCH ERR: ' + url.substring(0, 60) + ': ' + err.message);
      throw err;
    });
  };

  // =============================================
  // Layer 4: Hook XMLHttpRequest
  // =============================================
  const origXhrOpen = XMLHttpRequest.prototype.open;
  const origXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._vsUrl = url;
    return origXhrOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', function() {
      if (resolved) return;
      const url = this._vsUrl || '';
      
      if (url.includes('.m3u8')) {
        sendStream(url, [], 'xhr-m3u8');
        return;
      }
      
      if (url.includes('/api/') || url.includes('/source')) {
        try {
          const m3u8Match = this.responseText.match(/(https?:\\/\\/[^\\s"']+\\.m3u8[^\\s"']*)/i);
          if (m3u8Match) {
            sendStream(m3u8Match[1], [], 'xhr-api');
          }
        } catch {}
      }
    });
    return origXhrSend.apply(this, args);
  };

  // =============================================
  // Layer 5: Monitor <video> elements
  // =============================================
  const videoObserver = new MutationObserver(function(mutations) {
    if (resolved) return;
    document.querySelectorAll('video').forEach(function(vid) {
      if (vid.src && vid.src.includes('.m3u8') && !vid._vsChecked) {
        vid._vsChecked = true;
        sendStream(vid.src, [], 'video-src');
      }
      vid.querySelectorAll('source').forEach(function(src) {
        if (src.src && src.src.includes('.m3u8')) {
          sendStream(src.src, [], 'video-source-tag');
        }
      });
    });
  });
  videoObserver.observe(document.documentElement, { childList: true, subtree: true });

  // =============================================
  // Layer 6: Auto-click play button after load
  // =============================================
  function tryAutoPlay() {
    if (playClicked || resolved) return;
    
    // vidsrc.cc uses #btn-play or similar
    var playBtns = document.querySelectorAll('#btn-play, .play-btn, [class*="play"], button');
    for (var i = 0; i < playBtns.length; i++) {
      var btn = playBtns[i];
      if (btn.offsetParent !== null) { // visible
        dbg('Auto-clicking play button: ' + (btn.id || btn.className || btn.tagName));
        playClicked = true;
        btn.click();
        break;
      }
    }
    
    // Also try clicking the video area itself
    if (!playClicked) {
      var embedArea = document.querySelector('.embed-responsive, .video-wrapper, .player');
      if (embedArea) {
        dbg('Auto-clicking embed area');
        playClicked = true;
        embedArea.click();
      }
    }
  }

  // Try clicking play at 1s and 3s
  setTimeout(tryAutoPlay, 1000);
  setTimeout(tryAutoPlay, 3000);
  // Also on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(tryAutoPlay, 500);
    // Hook JWPlayer/HLS after scripts load
    setTimeout(hookJWPlayer, 200);
    setTimeout(hookHLS, 200);
  });
  
  // Periodic re-check hooks (scripts may load late)
  setTimeout(hookJWPlayer, 100);
  setTimeout(hookHLS, 100);
  setTimeout(hookJWPlayer, 2000);
  setTimeout(hookHLS, 2000);
  setTimeout(hookJWPlayer, 5000);
  setTimeout(hookHLS, 5000);

  // Timeout — 25s for mobile, 35s for TV
  setTimeout(function() {
    if (!resolved) {
      dbg('TIMEOUT — no stream found');
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'VIDSRC_TIMEOUT'
      }));
    }
  }, 30000);

  dbg('VidSrc interceptor ready — waiting for stream...');
  true;
})();
`;

/**
 * Parse the raw VidSrc intercepted stream into our clean format
 */
export function parseVidSrcResponse(data: any): VidSrcStream | null {
  try {
    if (!data?.url) return null;

    let streamUrl: string = data.url;
    
    // Normalize encoded slashes
    streamUrl = streamUrl.replace(/%2F/gi, '/');
    
    console.log(`[VidSrc] Stream URL: ${streamUrl.substring(0, 120)}...`);

    // Determine CDN domain for headers
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    };

    // cloudnestra CDN needs specific referer
    if (streamUrl.includes('cloudnestra')) {
      headers['Referer'] = 'https://streameeeeee.site/';
      headers['Origin'] = 'https://streameeeeee.site';
    } else if (streamUrl.includes('vidbox') || streamUrl.includes('vidsrc')) {
      headers['Referer'] = 'https://vidsrc.cc/';
      headers['Origin'] = 'https://vidsrc.cc';
    }

    // Captions
    const captions: VidSrcCaption[] = (data.captions || []).map((c: any) => ({
      id: c.id || c.url || c.language,
      url: c.url,
      language: c.language || 'Unknown',
      type: c.type || 'vtt',
    }));

    return {
      url: streamUrl,
      headers,
      captions,
      sourceId: data.sourceId || 'vidsrc-direct',
      quality: 'auto',
    };
  } catch (e) {
    console.error('[VidSrc] Failed to parse response:', e);
    return null;
  }
}
