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
import java.net.URLDecoder
import java.net.URLEncoder
import java.security.MessageDigest

class TvNativeModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "TvNative"
        private const val TMDB_API_KEY = "8baba8ab6b8bbe247645bcae7df63d0d"
        // Real desktop Chrome UA — SmartTV/Android UAs get CDN-poisoned (220884 garbage)
        private const val USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
        private var NET22_COOKIES = "user_token=31deeb6effad57af95225c8473a0fb83; t_hash_t=4b8a56e529d55c3a924142a370bd63d6%3A%3A9824f100144d301f2cde6bedd66d2c7b%3A%3A1777974213%3A%3Aek%3A%3Ap"
        private var NET52_COOKIES = "user_token=31deeb6effad57af95225c8473a0fb83; t_hash_t=4b8a56e529d55c3a924142a370bd63d6%3A%3A9824f100144d301f2cde6bedd66d2c7b%3A%3A1777974213%3A%3Aek%3A%3Ap"
        // Known poison CDN identifiers — if these appear in M3U8 responses, the CDN has fingerprinted us
        // Note: .jpg extensions are normal CDN obfuscation for real video segments
        private val POISON_MARKERS = listOf("/files/220884/")
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .followRedirects(true).followSslRedirects(true).build()

    override fun getName(): String = "TvNativeModule"

    @ReactMethod
    fun setNetMirrorCookies(net22Cookie: String, net52Cookie: String, promise: Promise) {
        if (net22Cookie.isNotBlank()) NET22_COOKIES = net22Cookie
        if (net52Cookie.isNotBlank()) NET52_COOKIES = net52Cookie
        Log.d(TAG, "NetMirror cookies updated dynamically from Javascript")
        promise.resolve(true)
    }

    /**
     * Self-healing cookie refresh: Opens hidden WebViews to net22.cc and net52.cc,
     * lets the site establish a session, then extracts cookies from Android's CookieManager.
     * This is the PERMANENT solution — no manual capture needed.
     */
    @ReactMethod
    fun refreshNetMirrorCookies(promise: Promise) {
        val mainHandler = Handler(Looper.getMainLooper())
        mainHandler.post {
            try {
                Log.d(TAG, "🔄 Starting self-healing cookie refresh...")
                val cookieManager = android.webkit.CookieManager.getInstance()
                cookieManager.setAcceptCookie(true)
                
                // Clear old cookies for these domains
                cookieManager.removeAllCookies(null)
                
                var net22Done = false
                var net52Done = false
                val results = mutableMapOf<String, String>()

                fun checkComplete() {
                    if (net22Done && net52Done) {
                        Log.d(TAG, "🔄 Both domains refreshed")
                        if (results["net22"]?.isNotBlank() == true) {
                            NET22_COOKIES = results["net22"]!!
                            Log.d(TAG, "✅ Net22 cookies refreshed: ${NET22_COOKIES.take(50)}...")
                        }
                        if (results["net52"]?.isNotBlank() == true) {
                            NET52_COOKIES = results["net52"]!!
                            Log.d(TAG, "✅ Net52 cookies refreshed: ${NET52_COOKIES.take(50)}...")
                        }
                        
                        val result = WritableNativeMap().apply {
                            putString("net22Cookie", results["net22"] ?: "")
                            putString("net52Cookie", results["net52"] ?: "")
                            putBoolean("success", results.values.any { it.isNotBlank() })
                        }
                        promise.resolve(result)
                    }
                }

                fun loadSiteAndExtract(domain: String, key: String) {
                    val webView = WebView(reactApplicationContext)
                    webView.settings.javaScriptEnabled = true
                    webView.settings.domStorageEnabled = true
                    webView.settings.userAgentString = USER_AGENT
                    android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

                    webView.webViewClient = object : WebViewClient() {
                        override fun onPageFinished(view: WebView?, url: String?) {
                            super.onPageFinished(view, url)
                            // Wait a moment for any JS-set cookies
                            mainHandler.postDelayed({
                                val rawCookies = cookieManager.getCookie("https://$domain") ?: ""
                                Log.d(TAG, "🔄 [$domain] Raw cookies: ${rawCookies.take(80)}...")
                                
                                // Filter to only the important session cookies
                                val parts = rawCookies.split(";").map { it.trim() }
                                val important = parts.filter { p ->
                                    p.startsWith("user_token=") || p.startsWith("t_hash_t=") || p.startsWith("t_hash=")
                                }
                                results[key] = important.joinToString("; ")
                                
                                // Cleanup
                                view?.destroy()
                                
                                if (key == "net22") net22Done = true else net52Done = true
                                checkComplete()
                            }, 3000) // 3s wait for cookies to settle
                        }
                    }

                    Log.d(TAG, "🔄 Loading https://$domain/home ...")
                    webView.loadUrl("https://$domain/home")
                    
                    // Safety timeout
                    mainHandler.postDelayed({
                        if (key == "net22" && !net22Done) {
                            net22Done = true
                            val rawCookies = cookieManager.getCookie("https://$domain") ?: ""
                            val parts = rawCookies.split(";").map { it.trim() }
                            val important = parts.filter { p ->
                                p.startsWith("user_token=") || p.startsWith("t_hash_t=") || p.startsWith("t_hash=")
                            }
                            results[key] = important.joinToString("; ")
                            webView.destroy()
                            checkComplete()
                        }
                        if (key == "net52" && !net52Done) {
                            net52Done = true
                            val rawCookies = cookieManager.getCookie("https://$domain") ?: ""
                            val parts = rawCookies.split(";").map { it.trim() }
                            val important = parts.filter { p ->
                                p.startsWith("user_token=") || p.startsWith("t_hash_t=") || p.startsWith("t_hash=")
                            }
                            results[key] = important.joinToString("; ")
                            webView.destroy()
                            checkComplete()
                        }
                    }, 15000) // 15s max per domain
                }

                // Launch both in parallel
                loadSiteAndExtract("net22.cc", "net22")
                loadSiteAndExtract("net52.cc", "net52")

            } catch (e: Exception) {
                Log.e(TAG, "Cookie refresh failed: ${e.message}")
                promise.reject("COOKIE_REFRESH_FAILED", e.message)
            }
        }
    }

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

    private fun urlEncode(value: String): String =
        URLEncoder.encode(value, "UTF-8")

    private fun md5(value: String): String {
        val bytes = MessageDigest.getInstance("MD5").digest(value.toByteArray())
        return bytes.joinToString("") { "%02x".format(it) }
    }

    private fun netMirrorRequest(url: String, cookie: String, referer: String = "https://net52.cc/home"): String {
        Log.d(TAG, "HTTP REQ: $url")
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", USER_AGENT)
            .header("Referer", referer)
            .header("Accept", "*/*")
            .header("Accept-Language", "en-US,en;q=0.9")
            .header("sec-ch-ua", "\"Chromium\";v=\"136\", \"Google Chrome\";v=\"136\", \"Not.A/Brand\";v=\"8\"")
            .header("sec-ch-ua-mobile", "?0")
            .header("sec-ch-ua-platform", "\"Windows\"")
            .header("Sec-Fetch-Dest", "empty")
            .header("Sec-Fetch-Mode", "cors")
            .header("Sec-Fetch-Site", "same-origin")
            .apply { if (cookie.isNotBlank()) header("Cookie", cookie) }
            .build()
        client.newCall(request).execute().use { response ->
            Log.d(TAG, "HTTP RES [${response.code}] for $url")
            val body = response.body?.string() ?: ""
            if (body.length < 500) {
                Log.d(TAG, "HTTP BODY: $body")
            } else {
                Log.d(TAG, "HTTP BODY: ${body.take(500)}... (total ${body.length} chars)")
            }
            if (!response.isSuccessful) throw Exception("HTTP ${response.code} for $url")
            return body
        }
    }

    private fun netMirrorNoRedirect(url: String, cookie: String, referer: String = "https://net52.cc/home"): Response {
        val noRedirectClient = client.newBuilder().followRedirects(false).followSslRedirects(false).build()
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", USER_AGENT)
            .header("Referer", referer)
            .header("Cookie", cookie)
            .header("Accept", "*/*")
            .header("sec-ch-ua", "\"Chromium\";v=\"136\", \"Google Chrome\";v=\"136\", \"Not.A/Brand\";v=\"8\"")
            .header("sec-ch-ua-mobile", "?0")
            .header("sec-ch-ua-platform", "\"Windows\"")
            .build()
        return noRedirectClient.newCall(request).execute()
    }

    /**
     * Fetches an M3U8 from the CDN with cross-origin headers.
     * The CDN (freecdn2/freecdn4) fingerprints requests differently than net52.cc,
     * so we need specific Sec-Fetch-Site: cross-site and Origin headers.
     */
    private fun fetchCdnM3u8(url: String, originDomain: String = "https://net52.cc"): String {
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", USER_AGENT)
            .header("Origin", originDomain)
            .header("Referer", "$originDomain/")
            .header("Accept", "*/*")
            .header("Accept-Language", "en-US,en;q=0.9")
            .header("sec-ch-ua", "\"Chromium\";v=\"136\", \"Google Chrome\";v=\"136\", \"Not.A/Brand\";v=\"8\"")
            .header("sec-ch-ua-mobile", "?0")
            .header("sec-ch-ua-platform", "\"Windows\"")
            .header("Sec-Fetch-Dest", "empty")
            .header("Sec-Fetch-Mode", "cors")
            .header("Sec-Fetch-Site", "cross-site")
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw Exception("CDN HTTP ${response.code}")
            return response.body?.string() ?: ""
        }
    }

    /**
     * Check if an M3U8 body is poisoned by the CDN (contains known garbage markers).
     */
    private fun isPoisonedM3u8(body: String): Boolean {
        return POISON_MARKERS.any { marker -> body.contains(marker, ignoreCase = true) }
    }

    private fun getTmdbInfoForNet22(tmdbId: String, type: String): JSONObject {
        val mediaType = if (type == "tv") "tv" else "movie"
        val body = netMirrorRequest(
            "https://api.themoviedb.org/3/$mediaType/$tmdbId?api_key=$TMDB_API_KEY",
            cookie = "",
            referer = "https://www.themoviedb.org/"
        )
        val json = JSONObject(body)
        val title = json.optString("title").ifEmpty { json.optString("name") }
            .ifEmpty { json.optString("original_title") }
            .ifEmpty { json.optString("original_name") }
        
        val date = json.optString("release_date").ifEmpty { json.optString("first_air_date") }
        val year = if (date.length >= 4) date.substring(0, 4) else ""
        
        return JSONObject().apply {
            put("title", title)
            put("year", year)
        }
    }

    private fun getTmdbEpisodeIdForNet22(tmdbId: String, season: Int, episode: Int): Pair<String, String>? {
        if (season <= 0 || episode <= 0) return null
        val body = netMirrorRequest(
            "https://api.themoviedb.org/3/tv/$tmdbId/season/$season?api_key=$TMDB_API_KEY",
            cookie = "",
            referer = "https://www.themoviedb.org/"
        )
        val episodes = JSONObject(body).optJSONArray("episodes") ?: return null
        for (i in 0 until episodes.length()) {
            val item = episodes.getJSONObject(i)
            if (item.optInt("episode_number") == episode) {
                return Pair(item.optLong("id").toString(), item.optString("name"))
            }
        }
        return null
    }

    @ReactMethod
    fun resolveNet22(tmdbId: String, type: String, season: Int, episode: Int, promise: Promise) {
        scope.launch {
            try {
                if (NET22_COOKIES.isBlank()) {
                    promise.reject("NET22_COOKIES_MISSING", "Net22 cookies are not embedded")
                    return@launch
                }

                Log.d(TAG, "Net22 resolving: TMDB $tmdbId ($type)")

                val tm = (System.currentTimeMillis() / 1000L).toString()
                val cookie = NET22_COOKIES

                // Step 1: Get title from TMDB
                val tmdbInfo = getTmdbInfoForNet22(tmdbId, type)
                val searchTitle = tmdbInfo.getString("title")
                val searchYear = tmdbInfo.getString("year")
                if (searchTitle.isBlank()) throw Exception("No TMDB title")

                Log.d(TAG, "Net22 searching: \"$searchTitle\" ($searchYear)")

                // Step 2: Search via root search.php (returns numeric IDs)
                val searchBody = netMirrorRequest(
                    "https://net22.cc/search.php?s=${urlEncode(searchTitle)}&t=$tm",
                    cookie,
                    "https://net22.cc/home"
                )
                val searchJson = JSONObject(searchBody)
                val results = searchJson.optJSONArray("searchResult")
                    ?: throw Exception("Net22: No search results for \"$searchTitle\"")
                if (results.length() == 0) throw Exception("Net22: Empty search results")

                // Smart match: prefer title with matching year
                var bestResult = results.getJSONObject(0)
                if (searchYear.isNotBlank()) {
                    for (i in 0 until results.length()) {
                        val item = results.getJSONObject(i)
                        val itemTitle = item.optString("t", "")
                        if (itemTitle.contains(searchYear)) {
                            bestResult = item
                            break
                        }
                    }
                }

                var rootId = bestResult.optString("id")
                val contentTitle = bestResult.optString("t", searchTitle)
                if (rootId.isBlank()) throw Exception("Net22: No content ID from search")

                Log.d(TAG, "Net22 found: id=$rootId title=\"$contentTitle\"")

                // If TV show, we need the specific episode ID. Root API handles this via post.php
                if (type == "tv" && episode > 0) {
                    val postBody = netMirrorRequest(
                        "https://net22.cc/post.php?id=$rootId&t=$tm",
                        cookie,
                        "https://net22.cc/home"
                    )
                    val postJson = JSONObject(postBody)
                    val episodes = postJson.optJSONArray("episodes") ?: JSONArray()
                    var epId = ""
                    for (i in 0 until episodes.length()) {
                        val ep = episodes.getJSONObject(i)
                        if (ep.optString("s") == "S$season" && ep.optString("ep") == episode.toString()) {
                            epId = ep.optString("id")
                            break
                        }
                    }
                    if (epId.isNotBlank()) {
                        rootId = epId
                        Log.d(TAG, "Net22 matched TV episode ID: $rootId")
                    } else {
                        throw Exception("Net22: Episode S${season}E${episode} not found")
                    }
                } else {
                    // For movies, just register view
                    try {
                        netMirrorRequest(
                            "https://net22.cc/post.php?id=$rootId&t=$tm",
                            cookie,
                            "https://net22.cc/home"
                        )
                    } catch (e: Exception) {
                        Log.w(TAG, "Net22 post.php skipped: ${e.message}")
                    }
                }

                // Step 4: Get playlist from root playlist.php
                val playlistBody = netMirrorRequest(
                    "https://net22.cc/playlist.php?id=$rootId&tm=$tm",
                    cookie,
                    "https://net22.cc/home"
                )
                val playlist = JSONArray(playlistBody)
                if (playlist.length() == 0) throw Exception("Net22: Empty playlist")
                val item = playlist.getJSONObject(0)

                val sources = item.optJSONArray("sources") ?: throw Exception("Net22: No sources")
                if (sources.length() == 0) throw Exception("Net22: Empty sources")

                val file = sources.getJSONObject(0).optString("file")
                if (file.isBlank()) throw Exception("Net22: No master playlist file")

                // Build full master URL (root API returns /hls/ instead of /pv/)
                var masterUrl = when {
                    file.startsWith("http") -> file
                    else -> "https://net22.cc$file"
                }

                // Extract hToken from raw file path if present
                val tokenRegex22 = """[?&](in=[^&\s"']+)""".toRegex()
                val tokenMatch22 = tokenRegex22.find(file)
                val hToken = tokenMatch22?.groupValues?.get(1) ?: ""

                // Validate: Fetch the master M3U8 and check for CDN poisoning
                Log.d(TAG, "Net22 validating master: ${masterUrl.take(100)}")
                val masterBody = try {
                    if (masterUrl.contains("cdn")) fetchCdnM3u8(masterUrl, "https://net22.cc")
                    else netMirrorRequest(masterUrl, cookie, "https://net22.cc/")
                } catch (e: Exception) {
                    Log.w(TAG, "Net22 master fetch failed: ${e.message}")
                    "" // Continue — player might still resolve it
                }

                var resolvedUrl = masterUrl

                if (masterBody.isNotBlank()) {
                    // 1. Fix dead CDN domains (nm-cdn → freecdn)
                    var rewrittenBody = masterBody.replace("""nm-cdn(\d+)?\.top""".toRegex()) { match ->
                        val p1 = match.groups[1]?.value
                        if (p1 != null) "freecdn$p1.top" else "freecdn1.top"
                    }

                    // 2. Fix broken empty-hostname URIs (https:///files/ → https://{cdn}/files/)
                    if (rewrittenBody.contains("https:///")) {
                        rewrittenBody = rewrittenBody.replace("https:///", "https://s21.freecdn4.top/")
                        Log.d(TAG, "Net22: Fixed empty-hostname URIs")
                    }

                    // 3. Replace placeholder auth tokens with real hToken
                    if (hToken.isNotBlank() && hToken.startsWith("in=")) {
                        rewrittenBody = rewrittenBody.replace("""in=unknown[^&\s"'\r\n]*""".toRegex(), hToken)
                    }

                    // 4. Unpoison: replace 220884 with real content ID
                    val audioIdMatch22 = """/files/([A-Z0-9]{10,}|\d{5,})/a/""".toRegex().find(rewrittenBody)
                    val realFileId = audioIdMatch22?.groupValues?.get(1) ?: rootId
                    if (rewrittenBody.contains("/files/220884/") && realFileId.isNotBlank()) {
                        Log.d(TAG, "Net22 unpoisoning: replacing 220884 with $realFileId")
                        rewrittenBody = rewrittenBody.replace("/files/220884/", "/files/$realFileId/")
                    }

                    if (isPoisonedM3u8(rewrittenBody)) {
                        throw Exception("Net22: CDN returned poisoned M3U8 and unpoisoning failed")
                    }

                    // Apply synthetic HLS proxying same path as audio
                    rewrittenBody = buildSyntheticHls(rewrittenBody, realFileId)

                    // 5. Build data URI
                    val base64Bytes = Base64.encode(rewrittenBody.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
                    resolvedUrl = "data:application/x-mpegURL;base64,${String(base64Bytes, Charsets.UTF_8)}"

                    Log.d(TAG, "Net22 manifest rewritten and encoded to data URI (${rewrittenBody.length} bytes)")
                }

                // Captions
                val captions = WritableNativeArray()
                val tracks = item.optJSONArray("tracks") ?: JSONArray()
                for (i in 0 until tracks.length()) {
                    val track = tracks.getJSONObject(i)
                    if (track.optString("kind") != "captions") continue
                    val captionUrl = track.optString("file")
                    captions.pushMap(WritableNativeMap().apply {
                        putString("id", track.optString("language", "en"))
                        putString("url", captionUrl)
                        putString("language", track.optString("label", track.optString("language", "English")))
                        putString("type", if (captionUrl.endsWith(".vtt")) "vtt" else "srt")
                    })
                }

                val headers = WritableNativeMap().apply {
                    putString("User-Agent", USER_AGENT)
                    putString("Referer", "https://net22.cc/")
                    putString("Origin", "https://net22.cc")
                    putString("Cookie", cookie)
                }

                val result = WritableNativeMap().apply {
                    putString("url", resolvedUrl)
                    putMap("headers", headers)
                    putArray("captions", captions)
                    putArray("markers", WritableNativeArray())
                    putString("sourceId", "net22")
                    putDouble("expiresAt", (System.currentTimeMillis() + 3 * 60 * 60 * 1000).toDouble())
                    putString("title", contentTitle)
                }

                Log.d(TAG, "Net22 resolved: ${resolvedUrl.take(100)}")
                promise.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "Net22 failed: ${e.message}")
                promise.reject("NET22_FAILED", e.message)
            }
        }
    }

    // ========== Net52 /pv/ Stream Resolution (Disney+/Prime Video) ==========

    @ReactMethod
    fun resolveNet52(tmdbId: String, type: String, season: Int, episode: Int, promise: Promise) {
        scope.launch {
            try {
                if (NET52_COOKIES.isBlank()) {
                    promise.reject("NET52_COOKIES_MISSING", "Net52 cookies are not embedded")
                    return@launch
                }

                Log.d(TAG, "Net52 resolving: TMDB $tmdbId ($type)")

                // Step 1: Get title from TMDB
                val tmdbInfo = getTmdbInfoForNet22(tmdbId, type)
                val searchTitle = tmdbInfo.getString("title")
                val searchYear = tmdbInfo.getString("year")
                if (searchTitle.isBlank()) throw Exception("No TMDB title")

                val tm = (System.currentTimeMillis() / 1000L).toString()
                val cookie = NET52_COOKIES

                // --- DUAL API SEARCH: Root API (Netflix) vs /pv/ API (Disney/Prime) ---
                var searchBody = ""
                var searchJson = JSONObject()
                var results: JSONArray? = null
                var isRootApi = true

                // 1. Try Root API first (Netflix titles)
                try {
                    searchBody = netMirrorRequest(
                        "https://net52.cc/search.php?s=${urlEncode(searchTitle)}&t=$tm",
                        cookie,
                        "https://net52.cc/home"
                    )
                    searchJson = JSONObject(searchBody)
                    results = searchJson.optJSONArray("searchResult")
                } catch (e: Exception) {
                    Log.w(TAG, "Net52 root search failed, trying /pv/: ${e.message}")
                }

                // 2. If no results on Root, try /pv/ API (Disney/Prime titles)
                if (results == null || results.length() == 0) {
                    isRootApi = false
                    searchBody = netMirrorRequest(
                        "https://net52.cc/pv/search.php?s=${urlEncode(searchTitle)}&t=$tm",
                        cookie,
                        "https://net52.cc/search"
                    )
                    searchJson = JSONObject(searchBody)
                    results = searchJson.optJSONArray("searchResult")
                        ?: throw Exception("Net52: No search results in either Root or /pv/ API for \"$searchTitle\"")
                    if (results.length() == 0) throw Exception("Net52: Empty search results in both APIs")
                }

                Log.d(TAG, "Net52 searching: \"$searchTitle\" ($searchYear). API: ${if(isRootApi) "Root" else "/pv/"}")

                // Smart match: prefer title with matching year
                var bestResult = results.getJSONObject(0)
                if (searchYear.isNotBlank()) {
                    for (i in 0 until results.length()) {
                        val item = results.getJSONObject(i)
                        val itemTitle = item.optString("t", "")
                        if (itemTitle.contains(searchYear)) {
                            bestResult = item
                            break
                        }
                    }
                }

                var resolvedId = bestResult.optString("id")
                val contentTitle = bestResult.optString("t", searchTitle)
                if (resolvedId.isBlank()) throw Exception("Net52: No content ID from search")

                Log.d(TAG, "Net52 found: id=$resolvedId title=\"$contentTitle\" (Root API: $isRootApi)")

                // Step 3: Call post.php and handle TV episodes
                if (isRootApi) {
                    // Root API episode matching
                    if (type == "tv" && episode > 0) {
                        val postBody = netMirrorRequest("https://net52.cc/post.php?id=$resolvedId&t=$tm", cookie, "https://net52.cc/home")
                        val episodes = JSONObject(postBody).optJSONArray("episodes") ?: JSONArray()
                        var epId = ""
                        for (i in 0 until episodes.length()) {
                            val ep = episodes.getJSONObject(i)
                            if (ep.optString("s") == "S$season" && ep.optString("ep") == episode.toString()) {
                                epId = ep.optString("id")
                                break
                            }
                        }
                        if (epId.isNotBlank()) resolvedId = epId else throw Exception("Net52: Episode not found")
                    } else {
                        try { netMirrorRequest("https://net52.cc/post.php?id=$resolvedId&t=$tm", cookie, "https://net52.cc/home") } catch (e: Exception) {}
                    }
                } else {
                    // /pv/ API register view
                    try { netMirrorRequest("https://net52.cc/pv/post.php?id=${urlEncode(resolvedId)}&t=$tm", cookie, "https://net52.cc/search") } catch (e: Exception) {}
                }

                // Step 4: Get playlist
                val playlistUrl = if (isRootApi) "https://net52.cc/playlist.php?id=$resolvedId&tm=$tm" 
                                  else "https://net52.cc/pv/playlist.php?id=${urlEncode(resolvedId)}&tm=$tm"
                val referer = if (isRootApi) "https://net52.cc/home" else "https://net52.cc/search"
                
                val playlistBody = netMirrorRequest(playlistUrl, cookie, referer)
                val playlist = JSONArray(playlistBody)
                if (playlist.length() == 0) throw Exception("Net52: Empty playlist")

                var item = playlist.getJSONObject(0)
                if (!isRootApi && type == "tv" && episode > 0) {
                    // /pv/ API episode matching from playlist
                    for (i in 0 until playlist.length()) {
                        val epItem = playlist.getJSONObject(i)
                        val epTitle = epItem.optString("t", "")
                        if (epTitle.contains("Episode $episode", ignoreCase = true) ||
                            epTitle.contains("E$episode", ignoreCase = true) ||
                            epTitle.startsWith("$episode ") ||
                            (playlist.length() >= episode && i == episode - 1 && !epTitle.contains("Episode"))) {
                            item = epItem
                            break
                        }
                    }
                }

                val sources = item.optJSONArray("sources") ?: throw Exception("Net52: No sources")
                if (sources.length() == 0) throw Exception("Net52: Empty sources")

                val file = sources.getJSONObject(0).optString("file")
                if (file.isBlank()) throw Exception("Net52: No master playlist file")

                // Build full master URL
                val masterUrl = when {
                    file.startsWith("http") -> file
                    isRootApi -> "https://net52.cc$file"
                    file.startsWith("/pv/") -> "https://net52.cc$file"
                    file.startsWith("/") -> "https://net52.cc/pv$file"
                    else -> "https://net52.cc/pv/$file"
                }

                // Extract hToken from raw file path if present (playlist returns it directly)
                val tokenRegex = """[?&](in=[^&\s"']+)""".toRegex()
                val tokenMatch = tokenRegex.find(file)
                val hToken = tokenMatch?.groupValues?.get(1) ?: ""

                // Validate: Fetch the master M3U8 and check for CDN poisoning or dead CDNs
                Log.d(TAG, "Net52 validating master: ${masterUrl.take(100)}")
                val masterBody = try {
                    if (masterUrl.contains("cdn")) fetchCdnM3u8(masterUrl, "https://net52.cc")
                    else netMirrorRequest(masterUrl, cookie, "https://net52.cc/")
                } catch (e: Exception) {
                    Log.w(TAG, "Net52 master fetch failed: ${e.message}")
                    "" // Continue — player might still resolve it
                }

                var resolvedUrl = masterUrl

                if (masterBody.isNotBlank()) {
                    // 1. Fix dead CDN domains
                    var rewrittenBody = masterBody.replace("""nm-cdn(\d+)?\.top""".toRegex()) { match ->
                        val p1 = match.groups[1]?.value
                        if (p1 != null) "freecdn$p1.top" else "freecdn1.top"
                    }

                    // 2. Extract fallback hostname
                    var fallbackHostname = ""
                    for (sIdx in 0 until sources.length()) {
                        val sFile = sources.getJSONObject(sIdx).optString("file")
                        val normalized = if (sFile.startsWith("http")) sFile else "https://net52.cc$sFile"
                        val match = """https?://([^/]+)""".toRegex().find(normalized)
                        if (match != null) {
                            val host = match.groupValues[1]
                            if (!host.contains("net22.cc") && !host.contains("net52.cc") && !host.contains("netfree.cc")) {
                                fallbackHostname = host
                                break
                            }
                        }
                    }
                    if (fallbackHostname.isBlank()) {
                        fallbackHostname = "s21.freecdn4.top"
                    }

                    // 3. Fix empty-hostname URIs
                    if (rewrittenBody.contains("https:///")) {
                        rewrittenBody = rewrittenBody.replace("https:///", "https://$fallbackHostname/")
                    }

                    // 4. Replace placeholder auth tokens with real hToken
                    if (hToken.isNotBlank() && hToken.startsWith("in=")) {
                        rewrittenBody = rewrittenBody.replace("""in=unknown[^&\s"'\r\n]*""".toRegex(), hToken)
                    }

                    // 5. Unpoison: replace 220884 with real content ID
                    val audioIdMatch = """/files/([A-Z0-9]{10,})/a/""".toRegex().find(rewrittenBody)
                    val realFileId = audioIdMatch?.groupValues?.get(1) ?: resolvedId
                    if (realFileId.isNotBlank()) {
                        Log.d(TAG, "Net52 unpoisoning: replacing 220884 with $realFileId")
                        rewrittenBody = rewrittenBody.replace("/files/220884/", "/files/$realFileId/")
                    }

                    if (isPoisonedM3u8(rewrittenBody)) {
                        throw Exception("Net52: CDN returned poisoned M3U8 and unpoisoning failed")
                    }

                    // Apply synthetic HLS proxying same path as audio
                    rewrittenBody = buildSyntheticHls(rewrittenBody, realFileId)

                    // 6. Build data URI
                    val base64Bytes = Base64.encode(rewrittenBody.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
                    resolvedUrl = "data:application/x-mpegURL;base64,${String(base64Bytes, Charsets.UTF_8)}"
                    
                    Log.d(TAG, "Net52 manifest rewritten and encoded to data URI successfully!")
                }

                // Captions
                val captions = WritableNativeArray()
                val tracks = item.optJSONArray("tracks") ?: JSONArray()
                for (i in 0 until tracks.length()) {
                    val track = tracks.getJSONObject(i)
                    if (track.optString("kind") != "captions") continue
                    val captionUrl = track.optString("file")
                    captions.pushMap(WritableNativeMap().apply {
                        putString("id", track.optString("language", "en"))
                        putString("url", captionUrl)
                        putString("language", track.optString("label", track.optString("language", "English")))
                        putString("type", if (captionUrl.endsWith(".vtt")) "vtt" else "srt")
                    })
                }

                val headers = WritableNativeMap().apply {
                    putString("User-Agent", USER_AGENT)
                    putString("Referer", "https://net52.cc/")
                    putString("Origin", "https://net52.cc")
                    putString("Cookie", cookie)
                }

                val result = WritableNativeMap().apply {
                    putString("url", resolvedUrl)
                    putMap("headers", headers)
                    putArray("captions", captions)
                    putArray("markers", WritableNativeArray())
                    putString("sourceId", "net52")
                    putDouble("expiresAt", (System.currentTimeMillis() + 3 * 60 * 60 * 1000).toDouble())
                    putString("title", contentTitle)
                }

                Log.d(TAG, "Net52 resolved: ${resolvedUrl.take(100)}")
                promise.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "Net52 failed: ${e.message}")
                promise.reject("NET52_FAILED", e.message)
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

    private fun buildSyntheticHls(masterBody: String, rootId: String): String {
        try {
            // 1. Find audio URI in the master manifest
            val audioUriRegex = """URI="([^"]*/a/\d+/[^\s"]+\.m3u8[^"]*)"""".toRegex(RegexOption.IGNORE_CASE)
            val audioUriMatch = audioUriRegex.find(masterBody) ?: return masterBody
            val audioUri = audioUriMatch.groupValues[1]
            Log.d(TAG, "[SyntheticHLS] Found audio URI: $audioUri")

            // Parse host and real ID from audio URI
            val audioUrl = java.net.URL(audioUri)
            val audioHost = audioUrl.host
            
            val fileIdRegex = """/files/([^/]+)/""".toRegex()
            val fileIdMatch = fileIdRegex.find(audioUrl.path)
            val realFileId = fileIdMatch?.groupValues?.get(1) ?: rootId
            Log.d(TAG, "[SyntheticHLS] Audio host: $audioHost, Real File ID: $realFileId")

            // 2. Fetch the audio playlist
            Log.d(TAG, "[SyntheticHLS] Fetching audio playlist: $audioUri")
            val audioPlaylistText = netMirrorRequest(audioUri, cookie = "", referer = "https://net22.cc/")
            if (!audioPlaylistText.contains("#EXTINF")) {
                Log.w(TAG, "[SyntheticHLS] Audio playlist does not contain #EXTINF")
                return masterBody
            }

            // Parse target duration and segments
            val lines = audioPlaylistText.split("\n")
            val targetDurationLine = lines.find { it.contains("#EXT-X-TARGETDURATION:") } ?: "#EXT-X-TARGETDURATION:10"
            
            val segments = mutableListOf<Pair<String, String>>()
            var currentDuration = ""
            for (line in lines) {
                val trimmed = line.trim()
                if (trimmed.startsWith("#EXTINF:")) {
                    currentDuration = trimmed
                } else if (trimmed.isNotBlank() && !trimmed.startsWith("#")) {
                    segments.add(Pair(currentDuration, trimmed))
                }
            }

            if (segments.isEmpty()) {
                Log.w(TAG, "[SyntheticHLS] No segments found in audio playlist")
                return masterBody
            }

            // 3. Rebuild the master manifest
            val masterLines = masterBody.split("\n")
            val newMasterLines = mutableListOf<String>()

            for (masterLine in masterLines) {
                val trimmedLine = masterLine.trim()
                if (trimmedLine.isNotBlank() && !trimmedLine.startsWith("#") && (trimmedLine.contains(".m3u8") || trimmedLine.contains("/files/"))) {
                    // Extract quality
                    val qualityRegex = """/files/[^/]+/([0-9a-zA-Z]+p)/""".toRegex()
                    val qualityMatch = qualityRegex.find(trimmedLine) ?: """/([0-9a-zA-Z]+p)\.m3u8""".toRegex().find(trimmedLine)
                    val quality = qualityMatch?.groupValues?.get(1) ?: "720p"

                    Log.d(TAG, "[SyntheticHLS] Building synthetic variant for quality: $quality")

                    // Build synthetic variant playlist
                    val syntheticTextBuilder = StringBuilder()
                    syntheticTextBuilder.append("#EXTM3U\n")
                    syntheticTextBuilder.append("#EXT-X-VERSION:3\n")
                    syntheticTextBuilder.append(targetDurationLine).append("\n")
                    syntheticTextBuilder.append("#EXT-X-MEDIA-SEQUENCE:0\n")
                    for (seg in segments) {
                        val videoSegName = seg.second.replace(".js", ".jpg")
                        val segUrl = "https://$audioHost/files/$realFileId/$quality/$videoSegName"
                        syntheticTextBuilder.append(seg.first).append("\n")
                        syntheticTextBuilder.append(segUrl).append("\n")
                    }
                    syntheticTextBuilder.append("#EXT-X-ENDLIST\n")

                    // Base64 encode
                    val base64Bytes = Base64.encode(syntheticTextBuilder.toString().toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
                    val dataUri = "data:application/x-mpegURL;base64,${String(base64Bytes, Charsets.UTF_8)}"
                    newMasterLines.add(dataUri)
                } else {
                    newMasterLines.add(masterLine)
                }
            }

            return newMasterLines.joinToString("\n")
        } catch (e: Exception) {
            Log.e(TAG, "[SyntheticHLS] Error generating synthetic HLS: ${e.message}", e)
            return masterBody
        }
    }

    override fun onCatalystInstanceDestroy() { super.onCatalystInstanceDestroy(); scope.cancel() }
}
