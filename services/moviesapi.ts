export interface MoviesApiStream {
  url: string;              // Direct HLS .m3u8 or .mp4 URL
  headers: Record<string, string>;
  captions: MoviesApiCaption[];
  sourceId: string;         // "moviesapi"
  quality?: string;         // "auto"
}

export interface MoviesApiCaption {
  id: string;
  url: string;
  language: string;
  type: string;
}

/**
 * Fetch MoviesAPI embed URL and subtitles from the ww2.moviesapi.to API
 */
export async function fetchMoviesApiData(
  tmdbId: string,
  type: 'movie' | 'tv' = 'movie',
  season?: number,
  episode?: number
): Promise<{ embedUrl: string; subtitles: MoviesApiCaption[] }> {
  const apiUrl =
    type === 'tv' && season && episode
      ? `https://ww2.moviesapi.to/api/tv/${tmdbId}/${season}/${episode}`
      : `https://ww2.moviesapi.to/api/movie/${tmdbId}`;

  console.log(`[MoviesAPI] Fetching JSON API: ${apiUrl}`);

  const USER_AGENT = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

  // 15s timeout — prevents fetch from hanging indefinitely on Android
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let res: Response;
  try {
    res = await fetch(apiUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': 'https://moviesapi.to/'
      },
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('MoviesAPI fetch timed out (15s)');
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    throw new Error(`HTTP error ${res.status}`);
  }

  const json = await res.json();
  const embedUrl = json.video_url;
  if (!embedUrl) {
    throw new Error('No video_url in API response');
  }

  // Parse English / default subtitles
  let subtitles: MoviesApiCaption[] = [];
  if (Array.isArray(json.subtitles)) {
    subtitles = json.subtitles
      .filter((s: any) => s.label && (s.label.toLowerCase().includes('english') || s.default === true))
      .map((s: any) => ({
        id: s.label || s.url,
        url: s.url,
        language: s.label || 'English',
        type: 'srt',
      }));
  }

  return {
    embedUrl,
    subtitles
  };
}

/**
 * JavaScript injected into the WebView BEFORE page loads.
 */
export const MOVIESAPI_INTERCEPTOR_JS = `
(function() {
  var resolved = false;
  var playClicked = false;
  var pollCount = 0;

  function dbg(msg) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'MOVIESAPI_DEBUG',
        data: msg
      }));
    } catch(e) {}
  }

  function sendStream(url) {
    if (resolved) return;
    if (!url || url.length < 10) return;
    resolved = true;
    dbg('🎉 MoviesAPI Stream captured: ' + url.substring(0, 100));
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'MOVIESAPI_STREAM',
      data: {
        url: url
      }
    }));
  }

  dbg('MoviesAPI interceptor injecting on ' + location.hostname);

  function tryJwPlayer() {
    try {
      if (typeof window.jwplayer !== 'function') return false;
      var player = window.jwplayer();
      if (!player) return false;
      
      // Method 1: getPlaylist
      var playlist = [];
      try { playlist = player.getPlaylist ? player.getPlaylist() : []; } catch(e) {}
      if ((!playlist || !playlist.length) && player.getPlaylistItem) {
        var current = player.getPlaylistItem();
        if (current) playlist = [current];
      }
      for (var i = 0; i < playlist.length; i++) {
        var item = playlist[i];
        // Check item.file directly (common in JW8)
        if (item && item.file && (item.file.indexOf('.m3u8') !== -1 || item.file.indexOf('.mp4') !== -1)) {
          sendStream(item.file);
          return true;
        }
        var sources = item && item.sources ? item.sources : [];
        for (var j = 0; j < sources.length; j++) {
          var file = sources[j] && sources[j].file;
          if (file && (file.indexOf('.m3u8') !== -1 || file.indexOf('.mp4') !== -1)) {
            sendStream(file);
            return true;
          }
        }
      }
      
      // Method 2: Check config directly
      try {
        var config = player.getConfig ? player.getConfig() : null;
        if (config && config.file && (config.file.indexOf('.m3u8') !== -1 || config.file.indexOf('.mp4') !== -1)) {
          sendStream(config.file);
          return true;
        }
      } catch(e) {}
    } catch(e) {
      if (pollCount < 3) dbg('JWPlayer extraction error: ' + e.message);
    }
    return false;
  }

  function tryVideoElements() {
    try {
      var vids = document.querySelectorAll('video');
      for (var i = 0; i < vids.length; i++) {
        var src = vids[i].src || vids[i].currentSrc || '';
        if (src && (src.indexOf('.m3u8') !== -1 || src.indexOf('.mp4') !== -1)) {
          sendStream(src);
          return true;
        }
        // Check source elements
        var sources = vids[i].querySelectorAll('source');
        for (var j = 0; j < sources.length; j++) {
          var ssrc = sources[j].src || '';
          if (ssrc && (ssrc.indexOf('.m3u8') !== -1 || ssrc.indexOf('.mp4') !== -1)) {
            sendStream(ssrc);
            return true;
          }
        }
      }
    } catch(e) {}
    return false;
  }

  function tryHlsJs() {
    try {
      if (!window.Hls) return false;
      var vids = document.querySelectorAll('video');
      for (var i = 0; i < vids.length; i++) {
        var hls = vids[i]._hls || vids[i].hlsPlayer;
        if (hls && hls.url) {
          sendStream(hls.url);
          return true;
        }
      }
    } catch(e) {}
    return false;
  }

  function clickThrough() {
    try {
      var overlays = Array.prototype.slice.call(document.querySelectorAll('div')).filter(function(el) {
        var style = window.getComputedStyle(el);
        return style.position === 'fixed' && style.zIndex === '2147483647';
      });
      overlays.forEach(function(el) { try { el.click(); } catch(e) {} });
    } catch(e) {}

    try {
      var play = document.querySelector('#player-button-container, #player-button, .play-button, .play-btn, .jw-icon-display, button');
      if (play) {
        play.click();
        playClicked = true;
      }
    } catch(e) {}
  }

  function pollAll() {
    if (resolved) return;
    pollCount++;
    if (tryJwPlayer()) return;
    if (tryVideoElements()) return;
    if (tryHlsJs()) return;
    clickThrough();
  }

  // Handle redirects if on moviesapi.to domain
  if (location.hostname.indexOf('moviesapi.to') !== -1 && location.hostname.indexOf('ww2.') !== 0) {
    setTimeout(function() {
      var iframe = document.querySelector('iframe');
      if (iframe && iframe.src) {
        dbg('Redirecting to iframe: ' + iframe.src);
        location.href = iframe.src;
      }
    }, 1200);
    return;
  }

  if (location.hostname.indexOf('ww2.moviesapi.to') !== -1) {
    setTimeout(function() {
      var iframe = document.querySelector('iframe');
      if (iframe && iframe.src) {
        dbg('Redirecting to iframe: ' + iframe.src);
        location.href = iframe.src;
      }
    }, 1200);
    return;
  }

  // Intercept fetch
  var origFetch = window.fetch;
  window.fetch = function() {
    var url = typeof arguments[0] === 'string' ? arguments[0] : (arguments[0] && arguments[0].url ? arguments[0].url : '');
    if (url.length > 5 && url.indexOf('cloudflare') === -1 && url.indexOf('google') === -1) {
      dbg('FETCH: ' + url.substring(0, 120));
    }
    return origFetch.apply(this, arguments).then(function(res) {
      if (url.indexOf('.m3u8') !== -1 || url.indexOf('.mp4') !== -1) {
        sendStream(url);
      }
      return res;
    });
  };

  // Intercept XMLHttpRequest
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._moviesApiUrl = url;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    var xhr = this;
    xhr.addEventListener('load', function() {
      if (resolved) return;
      var url = xhr._moviesApiUrl || '';
      if (url.indexOf('.m3u8') !== -1 || url.indexOf('.mp4') !== -1) {
        sendStream(url);
      }
    });
    return origSend.apply(this, arguments);
  };

  // Monitor DOM for video elements
  var observer = new MutationObserver(function() {
    if (resolved) return;
    tryVideoElements();
    tryJwPlayer();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Aggressive polling: 500ms for first 10s, then 1500ms
  // JWPlayer takes ~1-3s to configure on flixcdn.cyou
  var fastPollInterval = setInterval(function() {
    pollAll();
    if (pollCount > 20) { // ~10s of fast polling
      clearInterval(fastPollInterval);
      // Switch to slower polling
      setInterval(function() { pollAll(); }, 1500);
    }
  }, 500);

  // First poll at 200ms
  setTimeout(function() { pollAll(); }, 200);

  // Timeout - 30s
  setTimeout(function() {
    if (!resolved) {
      dbg('TIMEOUT after ' + pollCount + ' polls');
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'MOVIESAPI_TIMEOUT'
      }));
    }
  }, 30000);

  dbg('MoviesAPI interceptor ready on ' + location.hostname);
})();
`;


/**
 * Parse the raw MoviesAPI intercepted stream into our clean format
 */
export function parseMoviesApiResponse(streamUrl: string, apiSubtitles: MoviesApiCaption[] = []): MoviesApiStream | null {
  try {
    if (!streamUrl) return null;

    let finalUrl = streamUrl.replace(/%2F/gi, '/');
    console.log(`[MoviesAPI] Resolved Stream URL: ${finalUrl.substring(0, 120)}...`);

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Referer': 'https://ww2.moviesapi.to/',
    };

    return {
      url: finalUrl,
      headers,
      captions: apiSubtitles,
      sourceId: 'moviesapi',
      quality: 'auto',
    };
  } catch (e) {
    console.error('[MoviesAPI] Failed to parse stream URL:', e);
    return null;
  }
}
