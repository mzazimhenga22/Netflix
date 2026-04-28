package com.movieflix.tv.tvnative

import android.util.Log
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebSettings
import com.facebook.react.bridge.*
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import android.util.Base64

class TvNativeModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "TvNative"
        private const val TMDB_API_KEY = "8baba8ab6b8bbe247645bcae7df63d0d"
        private const val USER_AGENT = "Mozilla/5.0 (Linux; Android 14; SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .followRedirects(true).followSslRedirects(true).build()

    override fun getName(): String = "TvNativeModule"

    // ========== VidSrc Direct Stream Resolution (Native WebView) ==========

    /**
     * Interceptor JS injected into Android's native WebView.
     * Uses VidSrcBridge (JavascriptInterface) instead of ReactNativeWebView.postMessage.
     *
     * Multi-layer interception:
     *   Layer 1: JWPlayer .setup() — m3u8 is in the config
     *   Layer 2: HLS.js .loadSource() — catches HLS source assignments
     *   Layer 3: fetch() — catches API responses containing m3u8 URLs
     *   Layer 4: XMLHttpRequest — fallback for XHR-based requests
     *   Layer 5: <video> src monitoring — catches direct src assignments
     *   Layer 6: Auto-click play button to trigger the chain
     */
    private val VIDSRC_INTERCEPTOR_JS = """
(function() {
  var resolved = false;
  var playClicked = false;

  function dbg(msg) {
    try { VidSrcBridge.onDebug('' + msg); } catch(e) {}
  }

  function sendStream(url, captions, sourceId) {
    if (resolved) return;
    resolved = true;
    dbg('FOUND: ' + url.substring(0, 100));
    try {
      VidSrcBridge.onStreamFound(url, JSON.stringify(captions || []), sourceId || 'vidsrc');
    } catch(e) { dbg('Bridge error: ' + e.message); }
  }

  dbg('Interceptor injected');

  // Layer 1: Hook JWPlayer
  function hookJW() {
    if (typeof window.jwplayer !== 'function') return;
    var origJw = window.jwplayer;
    window.jwplayer = function() {
      var inst = origJw.apply(this, arguments);
      if (inst && inst.setup && !inst._h) {
        var origSetup = inst.setup;
        inst.setup = function(cfg) {
          dbg('JWPlayer.setup intercepted');
          try {
            var m3u8 = null;
            var caps = [];
            if (cfg.file) m3u8 = cfg.file;
            if (cfg.sources) {
              for (var i = 0; i < cfg.sources.length; i++) {
                var s = cfg.sources[i];
                if (s.file && s.file.indexOf('.m3u8') !== -1) { m3u8 = s.file; break; }
                if (s.file) m3u8 = s.file;
              }
            }
            if (cfg.playlist && cfg.playlist.length) {
              for (var j = 0; j < cfg.playlist.length; j++) {
                var item = cfg.playlist[j];
                if (item.file && item.file.indexOf('.m3u8') !== -1) { m3u8 = item.file; break; }
                if (item.sources) {
                  for (var k = 0; k < item.sources.length; k++) {
                    if (item.sources[k].file && item.sources[k].file.indexOf('.m3u8') !== -1) {
                      m3u8 = item.sources[k].file; break;
                    }
                    if (item.sources[k].file) m3u8 = item.sources[k].file;
                  }
                }
                if (item.tracks) {
                  for (var t = 0; t < item.tracks.length; t++) {
                    var tr = item.tracks[t];
                    if (tr.kind === 'captions' || tr.kind === 'subtitles') {
                      caps.push({id: tr.label || tr.file, url: tr.file, language: tr.label || 'Unknown', type: 'vtt'});
                    }
                  }
                }
              }
            }
            if (cfg.tracks) {
              for (var t2 = 0; t2 < cfg.tracks.length; t2++) {
                var tr2 = cfg.tracks[t2];
                if (tr2.kind === 'captions' || tr2.kind === 'subtitles') {
                  caps.push({id: tr2.label || tr2.file, url: tr2.file, language: tr2.label || 'Unknown', type: 'vtt'});
                }
              }
            }
            if (m3u8) sendStream(m3u8, caps, 'jwplayer');
            else dbg('JW config no m3u8: ' + JSON.stringify(cfg).substring(0, 200));
          } catch(e) { dbg('JW hook err: ' + e.message); }
          return origSetup.call(this, cfg);
        };
        inst._h = true;
      }
      return inst;
    };
    for (var key in origJw) { if (origJw.hasOwnProperty(key)) window.jwplayer[key] = origJw[key]; }
    dbg('JWPlayer hooked');
  }

  // Layer 2: Hook HLS.js
  function hookHLS() {
    if (typeof window.Hls !== 'function') return;
    var origProto = window.Hls.prototype.loadSource;
    window.Hls.prototype.loadSource = function(src) {
      dbg('HLS.loadSource: ' + src);
      if (src && (src.indexOf('.m3u8') !== -1 || src.indexOf('master') !== -1)) {
        sendStream(src, [], 'hls.js');
      }
      return origProto.apply(this, arguments);
    };
    dbg('HLS.js hooked');
  }

  // Layer 3: Hook fetch()
  var origFetch = window.fetch;
  window.fetch = function() {
    var url = typeof arguments[0] === 'string' ? arguments[0] : (arguments[0] && arguments[0].url ? arguments[0].url : '');
    if (url.length > 5) dbg('FETCH: ' + url.substring(0, 120));

    return origFetch.apply(this, arguments).then(function(response) {
      if (resolved) return response;
      if (url.indexOf('.m3u8') !== -1) { sendStream(url, [], 'fetch-m3u8'); return response; }
      if (url.indexOf('/api/') !== -1 || url.indexOf('/source') !== -1) {
        var clone = response.clone();
        clone.text().then(function(text) {
          if (resolved) return;
          var m = text.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i);
          if (m) { sendStream(m[1], [], 'api-response'); return; }
          try {
            var j = JSON.parse(text);
            var src = (j.data && j.data.source) || j.source || j.file || j.url || (j.data && j.data.file) || (j.data && j.data.url);
            if (src && typeof src === 'string' && src.indexOf('.m3u8') !== -1) sendStream(src, [], 'api-json');
          } catch(e2) {}
        }).catch(function(){});
      }
      return response;
    }).catch(function(err) { throw err; });
  };

  // Layer 4: Hook XMLHttpRequest
  var origXhrOpen = XMLHttpRequest.prototype.open;
  var origXhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._vsUrl = url;
    return origXhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    var xhr = this;
    xhr.addEventListener('load', function() {
      if (resolved) return;
      var url = xhr._vsUrl || '';
      if (url.indexOf('.m3u8') !== -1) { sendStream(url, [], 'xhr-m3u8'); return; }
      if (url.indexOf('/api/') !== -1 || url.indexOf('/source') !== -1) {
        try {
          var m = xhr.responseText.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i);
          if (m) sendStream(m[1], [], 'xhr-api');
        } catch(e3) {}
      }
    });
    return origXhrSend.apply(this, arguments);
  };

  // Layer 5: Monitor <video> elements
  var obs = new MutationObserver(function() {
    if (resolved) return;
    var vids = document.querySelectorAll('video');
    for (var v = 0; v < vids.length; v++) {
      if (vids[v].src && vids[v].src.indexOf('.m3u8') !== -1 && !vids[v]._vs) {
        vids[v]._vs = true;
        sendStream(vids[v].src, [], 'video-src');
      }
    }
  });
  obs.observe(document.documentElement, {childList: true, subtree: true});

  // Layer 6: Auto-click play
  function tryPlay() {
    if (playClicked || resolved) return;
    var btns = document.querySelectorAll('#btn-play, .play-btn, [class*="play"], button');
    for (var b = 0; b < btns.length; b++) {
      if (btns[b].offsetParent !== null) {
        dbg('Auto-click: ' + (btns[b].id || btns[b].className || btns[b].tagName));
        playClicked = true;
        btns[b].click();
        return;
      }
    }
  }

  setTimeout(tryPlay, 1500);
  setTimeout(tryPlay, 3500);
  setTimeout(hookJW, 100);
  setTimeout(hookHLS, 100);
  setTimeout(hookJW, 2000);
  setTimeout(hookHLS, 2000);
  setTimeout(hookJW, 5000);
  setTimeout(hookHLS, 5000);
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(tryPlay, 500);
    setTimeout(hookJW, 200);
    setTimeout(hookHLS, 200);
  });

  // Timeout — 30s
  setTimeout(function() {
    if (!resolved) {
      dbg('TIMEOUT');
      VidSrcBridge.onTimeout();
    }
  }, 30000);

  dbg('VidSrc interceptor ready');
})();
""".trimIndent()

    private val SUPEREMBED_INTERCEPTOR_JS = """
(function() {
  var resolved = false;
  function sendStream(url) {
    if (resolved) return;
    resolved = true;
    try { SuperEmbedBridge.onStreamFound(url); } catch(e) {}
  }
  var origFetch = window.fetch;
  window.fetch = function() {
    var url = typeof arguments[0] === 'string' ? arguments[0] : (arguments[0] && arguments[0].url ? arguments[0].url : '');
    return origFetch.apply(this, arguments).then(function(res) {
      if (url.indexOf('.m3u8') !== -1) sendStream(url);
      return res;
    });
  };
  var obs = new MutationObserver(function() {
    var vids = document.querySelectorAll('video');
    for (var i=0; i<vids.length; i++) {
      if (vids[i].src && vids[i].src.indexOf('.m3u8') !== -1) sendStream(vids[i].src);
    }
  });
  obs.observe(document.documentElement, {childList: true, subtree: true});
  setTimeout(function() {
    var play = document.querySelector('.play-btn, #btn-play, button');
    if (play) play.click();
  }, 2000);
})();
""".trimIndent()

    private val MOVIESAPI_INTERCEPTOR_JS = """
(function() {
  var resolved = false;
  function sendStream(url) {
    if (resolved) return;
    resolved = true;
    try { MoviesAPIBridge.onStreamFound(url); } catch(e) {}
  }

  function tryJwPlayer() {
    try {
      if (typeof window.jwplayer !== 'function') return false;
      var player = window.jwplayer();
      if (!player) return false;
      var playlist = [];
      try { playlist = player.getPlaylist ? player.getPlaylist() : []; } catch(e) {}
      if ((!playlist || !playlist.length) && player.getPlaylistItem) {
        var current = player.getPlaylistItem();
        if (current) playlist = [current];
      }
      for (var i = 0; i < playlist.length; i++) {
        var item = playlist[i];
        var sources = item && item.sources ? item.sources : [];
        for (var j = 0; j < sources.length; j++) {
          var file = sources[j] && sources[j].file;
          if (file && (file.indexOf('.m3u8') !== -1 || file.indexOf('.mp4') !== -1)) {
            sendStream(file);
            return true;
          }
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
      var play = document.querySelector('#player-button-container, #player-button, .play-button, .play-btn, button');
      if (play) play.click();
    } catch(e) {}
  }

  if (location.hostname.indexOf('moviesapi.to') !== -1 && location.hostname.indexOf('ww2.') !== 0) {
    setTimeout(function() {
      var iframe = document.querySelector('iframe');
      if (iframe && iframe.src) location.href = iframe.src;
    }, 1200);
    return;
  }

  if (location.hostname.indexOf('ww2.moviesapi.to') !== -1) {
    setTimeout(function() {
      var iframe = document.querySelector('iframe');
      if (iframe && iframe.src) location.href = iframe.src;
    }, 1200);
    return;
  }

  var origFetch = window.fetch;
  window.fetch = function() {
    var url = typeof arguments[0] === 'string' ? arguments[0] : (arguments[0] && arguments[0].url ? arguments[0].url : '');
    return origFetch.apply(this, arguments).then(function(res) {
      if (url.indexOf('.m3u8') !== -1 || url.indexOf('.mp4') !== -1) sendStream(url);
      return res;
    });
  };

  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._moviesApiUrl = url;
    return origOpen.apply(this, arguments);
  };

  var observer = new MutationObserver(function() {
    var vids = document.querySelectorAll('video');
    for (var i = 0; i < vids.length; i++) {
      if (vids[i].src && (vids[i].src.indexOf('.m3u8') !== -1 || vids[i].src.indexOf('.mp4') !== -1)) {
        sendStream(vids[i].src);
        return;
      }
    }
    tryJwPlayer();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  setInterval(function() {
    clickThrough();
    tryJwPlayer();
  }, 1500);

  setTimeout(function() {
    clickThrough();
    tryJwPlayer();
  }, 500);
})();
""".trimIndent()

    @ReactMethod
    fun resolveVidSrcStream(tmdbId: String, type: String, season: Int, episode: Int, promise: Promise) {
        val embedUrl = if (type == "tv" && season > 0 && episode > 0)
            "https://vidsrc.cc/v2/embed/tv/$tmdbId/$season/$episode"
        else "https://vidsrc.cc/v2/embed/$type/$tmdbId"

        Log.d(TAG, "VidSrc resolving: $embedUrl")

        val mainHandler = Handler(Looper.getMainLooper())
        mainHandler.post {
            try {
                val ctx = reactApplicationContext
                val webView = WebView(ctx)
                var resolved = false

                // Configure WebView for TV
                webView.settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                    userAgentString = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
                    cacheMode = WebSettings.LOAD_DEFAULT
                    allowContentAccess = true
                    mediaPlaybackRequiresUserGesture = false
                    @Suppress("DEPRECATION")
                    allowUniversalAccessFromFileURLs = false
                    setSupportMultipleWindows(false)
                }

                // Cleanup helper
                fun cleanup() {
                    mainHandler.post {
                        try {
                            webView.stopLoading()
                            webView.removeJavascriptInterface("VidSrcBridge")
                            webView.destroy()
                        } catch (_: Exception) {}
                    }
                }

                // JavascriptInterface — receives callbacks from injected JS
                webView.addJavascriptInterface(object {
                    @JavascriptInterface
                    fun onStreamFound(url: String, captionsJson: String, sourceId: String) {
                        if (resolved) return
                        resolved = true
                        Log.d(TAG, "VidSrc stream via $sourceId: ${url.take(100)}")

                        val result = WritableNativeMap().apply {
                            putString("url", url.replace("%2F", "/", ignoreCase = true))
                            putString("sourceId", sourceId)
                            putString("quality", "auto")

                            // CDN-specific headers
                            val headers = WritableNativeMap()
                            headers.putString("User-Agent", USER_AGENT)
                            when {
                                url.contains("cloudnestra") -> {
                                    headers.putString("Referer", "https://streameeeeee.site/")
                                    headers.putString("Origin", "https://streameeeeee.site")
                                }
                                url.contains("vidsrc") || url.contains("vidbox") -> {
                                    headers.putString("Referer", "https://vidsrc.cc/")
                                    headers.putString("Origin", "https://vidsrc.cc")
                                }
                            }
                            putMap("headers", headers)

                            // Parse captions
                            val capsArr = WritableNativeArray()
                            try {
                                val caps = JSONArray(captionsJson)
                                for (i in 0 until caps.length()) {
                                    val c = caps.getJSONObject(i)
                                    capsArr.pushMap(WritableNativeMap().apply {
                                        putString("id", c.optString("id", c.optString("url", "")))
                                        putString("url", c.optString("url", ""))
                                        putString("language", c.optString("language", "Unknown"))
                                        putString("type", c.optString("type", "vtt"))
                                    })
                                }
                            } catch (_: Exception) {}
                            putArray("captions", capsArr)
                        }

                        cleanup()
                        promise.resolve(result)
                    }

                    @JavascriptInterface
                    fun onTimeout() {
                        if (resolved) return
                        resolved = true
                        Log.w(TAG, "VidSrc timed out")
                        cleanup()
                        promise.reject("VIDSRC_TIMEOUT", "VidSrc resolution timed out")
                    }

                    @JavascriptInterface
                    fun onDebug(msg: String) {
                        Log.d(TAG, "VidSrc: $msg")
                    }
                }, "VidSrcBridge")

                // WebViewClient — inject interceptor after page loads
                webView.webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                        Log.d(TAG, "VidSrc page loaded: ${url?.take(60)}")
                        view?.evaluateJavascript(VIDSRC_INTERCEPTOR_JS, null)
                    }
                }

                // Safety timeout — 35s for TV chipsets
                mainHandler.postDelayed({
                    if (!resolved) {
                        resolved = true
                        Log.w(TAG, "VidSrc safety timeout (35s)")
                        cleanup()
                        promise.reject("VIDSRC_TIMEOUT", "Safety timeout (35s)")
                    }
                }, 35000)

                // Load the embed
                webView.loadUrl(embedUrl)
                Log.d(TAG, "VidSrc WebView loading...")

            } catch (e: Exception) {
                Log.e(TAG, "VidSrc error: ${e.message}")
                promise.reject("VIDSRC_ERROR", e.message)
            }
        }
    }

    // ========== VidLink Stream Resolution (Native WebView) ==========

    /**
     * VidLink interceptor JS — hooks fetch/XHR to capture the /api/b/ response.
     * VidLink is a JS SPA that constructs /api/b/ at runtime with encrypted tokens.
     * Static HTML scraping (OkHttp) can NEVER find the endpoint.
     * Uses VidLinkBridge (JavascriptInterface) for callbacks.
     */
    private val VIDLINK_INTERCEPTOR_JS = """
(function() {
  var resolved = false;
  var apiBAttempts = 0;

  function dbg(msg) {
    try { VidLinkBridge.onDebug('' + msg); } catch(e) {}
  }

  function sendStream(jsonStr) {
    if (resolved) return;
    resolved = true;
    dbg('Stream captured!');
    try { VidLinkBridge.onStreamFound(jsonStr); } catch(e) { dbg('Bridge error: ' + e.message); }
  }

  dbg('VidLink interceptor injected');

  // Hook fetch() — catch /api/b/ responses
  var origFetch = window.fetch;
  window.fetch = function() {
    var url = typeof arguments[0] === 'string' ? arguments[0] : (arguments[0] && arguments[0].url ? arguments[0].url : '');
    if (url.length > 5) dbg('FETCH: ' + url.substring(0, 120));

    return origFetch.apply(this, arguments).then(function(response) {
      if (resolved) return response;
      if (url.indexOf('/api/b/') !== -1) {
        apiBAttempts++;
        dbg('/api/b/ found (attempt ' + apiBAttempts + ')');
        var clone = response.clone();
        clone.text().then(function(text) {
          if (resolved) return;
          if (!text || text.length === 0) {
            dbg('/api/b/ empty response');
            if (apiBAttempts >= 2) VidLinkBridge.onTimeout();
            return;
          }
          try {
            var json = JSON.parse(text);
            if (json && json.stream && json.stream.playlist) {
              dbg('Playlist: ' + json.stream.playlist.substring(0, 80));
              sendStream(text);
            } else {
              dbg('No stream.playlist in response');
            }
          } catch(e) { dbg('Parse error: ' + e.message); }
        }).catch(function(){});
      }
      return response;
    }).catch(function(err) { throw err; });
  };

  // Hook XMLHttpRequest as fallback
  var origXhrOpen = XMLHttpRequest.prototype.open;
  var origXhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._vlUrl = url;
    return origXhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    var xhr = this;
    xhr.addEventListener('load', function() {
      if (resolved) return;
      var url = xhr._vlUrl || '';
      if (url.indexOf('/api/b/') !== -1) {
        dbg('XHR /api/b/ response');
        try {
          var json = JSON.parse(xhr.responseText);
          if (json && json.stream && json.stream.playlist) {
            sendStream(xhr.responseText);
          }
        } catch(e) {}
      }
    });
    return origXhrSend.apply(this, arguments);
  };

  // Auto-click play controls to force stream bootstrap on TV WebViews
  var playClicked = false;
  function tryPlay() {
    if (resolved || playClicked) return;
    var selectors = [
      '#btn-play', '.play-btn', '[data-testid*="play"]',
      'button[aria-label*="Play"]', 'button[title*="Play"]',
      '.vjs-big-play-button', '.jw-icon-playback'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.offsetParent !== null) {
        playClicked = true;
        dbg('Auto-click play: ' + selectors[i]);
        try { el.click(); } catch(e) {}
        return;
      }
    }
  }

  setTimeout(tryPlay, 1200);
  setTimeout(tryPlay, 3000);
  setTimeout(tryPlay, 5500);
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(tryPlay, 400);
    setTimeout(tryPlay, 1800);
  });

  // Timeout — 35s (TV WebViews are slower)
  setTimeout(function() {
    if (!resolved) {
      dbg('TIMEOUT');
      VidLinkBridge.onTimeout();
    }
  }, 35000);

  dbg('VidLink interceptor ready');
})();
""".trimIndent()

    @ReactMethod
    fun resolveVidLinkStream(tmdbId: String, type: String, season: Int, episode: Int, promise: Promise) {
        val embedUrl = if (type == "tv" && season > 0 && episode > 0)
            "https://vidlink.pro/tv/$tmdbId/$season/$episode"
        else "https://vidlink.pro/movie/$tmdbId"

        Log.d(TAG, "VidLink resolving via native WebView: $embedUrl")

        val mainHandler = Handler(Looper.getMainLooper())
        mainHandler.post {
            try {
                val ctx = reactApplicationContext
                val webView = WebView(ctx)
                var resolved = false

                webView.settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                    userAgentString = USER_AGENT
                    cacheMode = WebSettings.LOAD_DEFAULT
                    allowContentAccess = true
                    mediaPlaybackRequiresUserGesture = false
                    @Suppress("DEPRECATION")
                    allowUniversalAccessFromFileURLs = false
                    setSupportMultipleWindows(false)
                }
                
                // Enable third-party cookies (Critical for VidLink session/WASM tokens)
                val cookieManager = android.webkit.CookieManager.getInstance()
                cookieManager.setAcceptCookie(true)
                cookieManager.setAcceptThirdPartyCookies(webView, true)

                fun cleanup() {
                    mainHandler.post {
                        try {
                            webView.stopLoading()
                            webView.removeJavascriptInterface("VidLinkBridge")
                            webView.destroy()
                        } catch (_: Exception) {}
                    }
                }

                webView.addJavascriptInterface(object {
                    @JavascriptInterface
                    fun onStreamFound(jsonStr: String) {
                        if (resolved) return
                        resolved = true
                        try {
                            val json = JSONObject(jsonStr)
                            val stream = json.optJSONObject("stream")
                            var playlist = stream?.optString("playlist", "") ?: ""
                            if (playlist.isEmpty()) {
                                cleanup(); promise.reject("VIDLINK_NO_PLAYLIST", "No playlist"); return
                            }

                            // Fix encoded slashes
                            playlist = playlist.replace("%2F", "/", ignoreCase = true)
                            Log.d(TAG, "VidLink playlist: ${playlist.take(120)}")

                            // Build headers
                            val responseHeaders = WritableNativeMap()
                            val streamHeaders = stream?.optJSONObject("headers")
                            if (streamHeaders != null) {
                                val keys = streamHeaders.keys()
                                while (keys.hasNext()) {
                                    val key = keys.next()
                                    responseHeaders.putString(key, streamHeaders.optString(key, ""))
                                }
                            }
                            val isFile2Proxy = Regex("""/proxy/file\d+/""", RegexOption.IGNORE_CASE).containsMatchIn(playlist)
                            if (isFile2Proxy && !responseHeaders.hasKey("Referer")) {
                                responseHeaders.putString("Referer", "https://vidlink.pro/")
                                responseHeaders.putString("Origin", "https://vidlink.pro")
                            }
                            if (!responseHeaders.hasKey("User-Agent")) {
                                responseHeaders.putString("User-Agent", USER_AGENT)
                            }

                            // Captions
                            val captionsArr = WritableNativeArray()
                            val caps = stream?.optJSONArray("captions") ?: JSONArray()
                            for (i in 0 until caps.length()) {
                                val c = caps.getJSONObject(i)
                                captionsArr.pushMap(WritableNativeMap().apply {
                                    putString("id", c.optString("id", c.optString("url", "")))
                                    putString("url", c.optString("url", ""))
                                    putString("language", c.optString("language", "Unknown"))
                                    putString("type", c.optString("type", "vtt"))
                                })
                            }

                            // Skip markers
                            val markersArr = WritableNativeArray()
                            val intro = stream?.optJSONObject("intro")
                            if (intro != null) {
                                markersArr.pushMap(WritableNativeMap().apply {
                                    putString("type", "intro")
                                    putDouble("start", intro.optDouble("start", 0.0))
                                    putDouble("end", intro.optDouble("end", 0.0))
                                })
                            }
                            val outro = stream?.optJSONObject("outro")
                            if (outro != null) {
                                markersArr.pushMap(WritableNativeMap().apply {
                                    putString("type", "outro")
                                    putDouble("start", outro.optDouble("start", 0.0))
                                    putDouble("end", outro.optDouble("end", 0.0))
                                })
                            }
                            val skips = stream?.optJSONArray("skips")
                            if (skips != null) {
                                for (i in 0 until skips.length()) {
                                    val s = skips.getJSONObject(i)
                                    val skipType = s.optString("type", "").ifEmpty {
                                        if (s.optInt("type", 0) == 1) "intro" else "outro"
                                    }
                                    markersArr.pushMap(WritableNativeMap().apply {
                                        putString("type", skipType)
                                        putDouble("start", s.optDouble("start", 0.0))
                                        putDouble("end", s.optDouble("end", 0.0))
                                    })
                                }
                            }

                            val result = WritableNativeMap().apply {
                                putString("url", playlist)
                                putString("sourceId", json.optString("sourceId", "vidlink"))
                                putMap("headers", responseHeaders)
                                putArray("captions", captionsArr)
                                putArray("markers", markersArr)
                            }
                            Log.d(TAG, "VidLink resolved via native WebView!")
                            cleanup()
                            promise.resolve(result)
                        } catch (e: Exception) {
                            Log.e(TAG, "VidLink parse error: ${e.message}")
                            cleanup()
                            promise.reject("VIDLINK_PARSE_ERROR", e.message)
                        }
                    }

                    @JavascriptInterface
                    fun onTimeout() {
                        if (resolved) return
                        resolved = true
                        Log.w(TAG, "VidLink timed out")
                        cleanup()
                        promise.reject("VIDLINK_TIMEOUT", "VidLink resolution timed out")
                    }

                    @JavascriptInterface
                    fun onDebug(msg: String) {
                        Log.d(TAG, "VidLink: $msg")
                    }
                }, "VidLinkBridge")

                webView.webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                        Log.d(TAG, "VidLink page loaded: ${url?.take(60)}")
                        view?.evaluateJavascript(VIDLINK_INTERCEPTOR_JS, null)
                    }
                }

                // Safety timeout — 30s
                mainHandler.postDelayed({
                    if (!resolved) {
                        resolved = true
                        Log.w(TAG, "VidLink safety timeout (30s)")
                        cleanup()
                        promise.reject("VIDLINK_TIMEOUT", "Safety timeout (30s)")
                    }
                }, 30000)

                webView.loadUrl(embedUrl)
                Log.d(TAG, "VidLink WebView loading...")

            } catch (e: Exception) {
                Log.e(TAG, "VidLink error: ${e.message}")
                promise.reject("VIDLINK_ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun resolveSuperEmbed(tmdbId: String, type: String, season: Int, episode: Int, promise: Promise) {
        val embedUrl = if (type == "tv" && season > 0 && episode > 0)
            "https://multiembed.mov/?video_id=$tmdbId&tmdb=1&s=$season&e=$episode"
        else "https://multiembed.mov/?video_id=$tmdbId&tmdb=1"

        Log.d(TAG, "SuperEmbed resolving: $embedUrl")
        val mainHandler = Handler(Looper.getMainLooper())
        mainHandler.post {
            try {
                val webView = WebView(reactApplicationContext)
                var resolved = false
                webView.settings.javaScriptEnabled = true
                webView.settings.domStorageEnabled = true
                webView.settings.userAgentString = USER_AGENT

                fun cleanup() { mainHandler.post { try { webView.destroy() } catch (_: Exception) {} } }

                webView.addJavascriptInterface(object {
                    @JavascriptInterface
                    fun onStreamFound(url: String) {
                        if (resolved) return; resolved = true
                        val result = WritableNativeMap().apply {
                            putString("url", url); putString("sourceId", "superembed")
                            val headers = WritableNativeMap().apply { putString("User-Agent", USER_AGENT); putString("Referer", "https://multiembed.mov/") }
                            putMap("headers", headers)
                        }
                        cleanup(); promise.resolve(result)
                    }
                }, "SuperEmbedBridge")

                webView.webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView?, url: String?) {
                        view?.evaluateJavascript(SUPEREMBED_INTERCEPTOR_JS, null)
                    }
                }
                mainHandler.postDelayed({ if (!resolved) { resolved = true; cleanup(); promise.reject("TIMEOUT", "SuperEmbed Timeout") } }, 30000)
                webView.loadUrl(embedUrl)
            } catch (e: Exception) { promise.reject("ERROR", e.message) }
        }
    }

    @ReactMethod
    fun resolveMoviesAPI(tmdbId: String, type: String, season: Int, episode: Int, promise: Promise) {
        val embedUrl = if (type == "tv" && season > 0 && episode > 0)
            "https://moviesapi.to/tv/$tmdbId-$season-$episode"
        else "https://moviesapi.to/movie/$tmdbId"

        Log.d(TAG, "MoviesAPI resolving: $embedUrl")
        val mainHandler = Handler(Looper.getMainLooper())
        mainHandler.post {
            try {
                val webView = WebView(reactApplicationContext)
                var resolved = false
                webView.settings.javaScriptEnabled = true
                webView.settings.domStorageEnabled = true
                webView.settings.userAgentString = USER_AGENT

                fun cleanup() { mainHandler.post { try { webView.destroy() } catch (_: Exception) {} } }

                webView.addJavascriptInterface(object {
                    @JavascriptInterface
                    fun onStreamFound(url: String) {
                        if (resolved) return; resolved = true
                        val result = WritableNativeMap().apply {
                            putString("url", url); putString("sourceId", "moviesapi")
                            val headers = WritableNativeMap().apply { putString("User-Agent", USER_AGENT); putString("Referer", "https://ww2.moviesapi.to/") }
                            putMap("headers", headers)
                        }
                        cleanup(); promise.resolve(result)
                    }
                }, "MoviesAPIBridge")

                webView.webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView?, url: String?) {
                        view?.evaluateJavascript(MOVIESAPI_INTERCEPTOR_JS, null)
                    }
                }
                mainHandler.postDelayed({ if (!resolved) { resolved = true; cleanup(); promise.reject("TIMEOUT", "MoviesAPI Timeout") } }, 30000)
                webView.loadUrl(embedUrl)
            } catch (e: Exception) { promise.reject("ERROR", e.message) }
        }
    }

    // ========== IMDb Trailer Resolution ==========

    @ReactMethod
    fun resolveTrailer(tmdbId: String, mediaType: String, promise: Promise) {
        scope.launch {
            try {
                val result = resolveTrailerInternal(tmdbId, mediaType)
                if (result != null) promise.resolve(result)
                else promise.reject("TRAILER_FAILED", "Could not resolve trailer")
            } catch (e: Exception) {
                Log.e(TAG, "Trailer error: ${e.message}")
                promise.reject("TRAILER_ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun prefetchTrailers(tmdbIdsArray: ReadableArray, mediaType: String, promise: Promise) {
        scope.launch {
            try {
                val results = WritableNativeMap()
                val jobs = mutableListOf<Deferred<Pair<String, WritableMap?>?>>()
                for (i in 0 until tmdbIdsArray.size()) {
                    val id = tmdbIdsArray.getString(i) ?: continue
                    jobs.add(async {
                        delay(i * 200L)
                        try { Pair(id, resolveTrailerInternal(id, mediaType)) } catch (_: Exception) { null }
                    })
                }
                jobs.awaitAll().filterNotNull().forEach { results.putMap(it.first, it.second) }
                Log.d(TAG, "Prefetch: ${results.toHashMap().size}/${tmdbIdsArray.size()} resolved")
                promise.resolve(results)
            } catch (e: Exception) {
                promise.reject("PREFETCH_ERROR", e.message)
            }
        }
    }

    private suspend fun resolveTrailerInternal(tmdbId: String, mediaType: String): WritableNativeMap? {
        val ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"

        // Get IMDb ID
        val idsReq = Request.Builder().url("https://api.themoviedb.org/3/$mediaType/$tmdbId/external_ids?api_key=$TMDB_API_KEY").build()
        val idsResp = client.newCall(idsReq).execute()
        val idsBody = idsResp.body?.string() ?: ""; idsResp.close()
        val imdbId = JSONObject(idsBody).optString("imdb_id", "")
        if (imdbId.isEmpty()) return null

        // Fetch title page
        val titleReq = Request.Builder().url("https://www.imdb.com/title/$imdbId/")
            .header("User-Agent", ua).header("Accept", "*/*").build()
        val titleResp = client.newCall(titleReq).execute()
        val titleHtml = titleResp.body?.string() ?: ""; titleResp.close()
        if (titleHtml.isEmpty()) return null

        // Extract video ID — use raw strings for regex patterns
        val vidPatterns = listOf(
            Regex("""/video/(vi\d+)"""),
            Regex(""""video"\s*:\s*"(vi\d+)""""),
            Regex(""""videoId"\s*:\s*"(vi\d+)""""),
            Regex("""data-video-id="(vi\d+)""""),
            Regex("""href="/video/(vi\d+)""")
        )
        var videoId: String? = null
        for (p in vidPatterns) { val m = p.find(titleHtml); if (m != null) { videoId = m.groupValues[1]; break } }

        if (videoId == null) {
            try {
                val mr = client.newCall(Request.Builder().url("https://www.imdb.com/title/$imdbId/mediaindex")
                    .header("User-Agent", ua).build()).execute()
                val mh = mr.body?.string() ?: ""; mr.close()
                for (p in vidPatterns) { val m = p.find(mh); if (m != null) { videoId = m.groupValues[1]; break } }
            } catch (_: Exception) {}
        }
        if (videoId == null) return null

        // Fetch embed page
        val embedReq = Request.Builder().url("https://www.imdb.com/videoembed/$videoId")
            .header("User-Agent", ua).header("Accept", "*/*").build()
        val embedResp = client.newCall(embedReq).execute()
        val embedHtml = embedResp.body?.string() ?: ""; embedResp.close()

        // Extract media URLs
        data class TC(val url: String, val type: String)
        val candidates = mutableListOf<TC>()
        Regex("""https:[^"' ]+\.mp4[^"' ]*""").findAll(embedHtml).forEach { candidates.add(TC(it.value, "mp4")) }
        Regex("""https:[^"' ]+\.m3u8[^"' ]*""").findAll(embedHtml).forEach { candidates.add(TC(it.value, "hls")) }
        Regex("""https:[^"' ]+\.mpd[^"' ]*""").findAll(embedHtml).forEach { candidates.add(TC(it.value, "dash")) }

        val sorted = candidates.sortedBy { when (it.type) { "hls" -> 0; "mp4" -> 1; else -> 2 } }
        for (c in sorted) {
            try {
                val check = client.newCall(Request.Builder().url(c.url).head().header("User-Agent", ua).build()).execute()
                val ok = check.isSuccessful; check.close()
                if (ok) return WritableNativeMap().apply { putString("url", c.url); putString("type", c.type) }
            } catch (_: Exception) {}
        }
        return null
    }

    override fun onCatalystInstanceDestroy() { super.onCatalystInstanceDestroy(); scope.cancel() }
}
