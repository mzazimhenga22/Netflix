package com.com1.tvnative

import android.util.Log
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
        private const val USER_AGENT = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .followRedirects(true).followSslRedirects(true).build()

    override fun getName(): String = "TvNativeModule"

    // ========== VidLink Stream Resolution ==========

    @ReactMethod
    fun resolveVidLinkStream(tmdbId: String, type: String, season: Int, episode: Int, promise: Promise) {
        scope.launch {
            try {
                Log.d(TAG, "Resolving VidLink for TMDB: $tmdbId ($type)")
                val embedUrl = if (type == "tv" && season > 0 && episode > 0)
                    "https://vidlink.pro/tv/$tmdbId/$season/$episode"
                else "https://vidlink.pro/movie/$tmdbId"

                val embedRequest = Request.Builder().url(embedUrl)
                    .header("User-Agent", USER_AGENT)
                    .header("Referer", "https://vidlink.pro/").build()
                val embedResponse = client.newCall(embedRequest).execute()
                val embedHtml = embedResponse.body?.string() ?: ""
                embedResponse.close()

                if (embedHtml.isEmpty()) { promise.reject("VIDLINK_ERROR", "Empty embed page"); return@launch }

                // Extract API endpoint from page
                val apiPatterns = listOf(
                    Regex("""['"](/api/b/[^'"]+)['"]"""),
                    Regex("""['"](/api/b/[^'"]+)['"]"""),
                    Regex("""['"]([^'"]*?/api/b/[^'"]+)['"]"""),
                    Regex("""apiUrl\s*[=:]\s*['"]([^'"]+)['"]""")
                )
                var apiUrl: String? = null
                for (p in apiPatterns) {
                    val m = p.find(embedHtml)
                    if (m != null) { apiUrl = m.groupValues[1]; break }
                }

                // Also check script files
                if (apiUrl == null) {
                    val scriptPattern = Regex("""<script[^>]+src=['"]([^'"]+\.js[^'"]*)""")
                    val scripts = scriptPattern.findAll(embedHtml).toList().take(5)
                    for (sm in scripts) {
                        var sUrl = sm.groupValues[1]
                        if (!sUrl.startsWith("http")) sUrl = "https://vidlink.pro$sUrl"
                        try {
                            val sr = client.newCall(Request.Builder().url(sUrl)
                                .header("User-Agent", "Mozilla/5.0").header("Referer", embedUrl).build()).execute()
                            val sc = sr.body?.string() ?: ""; sr.close()
                            for (p in apiPatterns) {
                                val m = p.find(sc)
                                if (m != null) { apiUrl = m.groupValues[1]; break }
                            }
                            if (apiUrl != null) break
                        } catch (_: Exception) {}
                    }
                }

                if (apiUrl == null) { promise.reject("VIDLINK_NO_API", "No API endpoint found"); return@launch }

                val fullApiUrl = if (apiUrl.startsWith("http")) apiUrl else "https://vidlink.pro$apiUrl"
                Log.d(TAG, "API: ${fullApiUrl.take(80)}")

                val apiReq = Request.Builder().url(fullApiUrl)
                    .header("User-Agent", USER_AGENT)
                    .header("Referer", embedUrl).header("Origin", "https://vidlink.pro").build()
                val apiResp = client.newCall(apiReq).execute()
                val apiBody = apiResp.body?.string() ?: ""; apiResp.close()

                if (apiBody.isEmpty()) { promise.reject("VIDLINK_EMPTY", "Empty API response"); return@launch }

                val json = JSONObject(apiBody)
                val stream = json.optJSONObject("stream")
                var playlist = stream?.optString("playlist", "") ?: ""
                if (playlist.isEmpty()) { promise.reject("VIDLINK_NO_PLAYLIST", "No playlist"); return@launch }

                // ===== PARITY WITH PHONE vidlink.ts parseVidLinkResponse =====

                // Fix: Replace %2F (encoded slashes) in the proxy path
                // e.g. .../proxy/file2%2F5RREG7don... -> .../proxy/file2/5RREG7don...
                playlist = playlist.replace("%2F", "/", ignoreCase = true)

                Log.d(TAG, "Playlist URL: ${playlist.take(120)}...")

                // Build response headers with conditional logic matching phone version
                val responseHeaders = WritableNativeMap()

                // Copy any headers from the API response
                val streamHeaders = stream?.optJSONObject("headers")
                if (streamHeaders != null) {
                    val keys = streamHeaders.keys()
                    while (keys.hasNext()) {
                        val key = keys.next()
                        responseHeaders.putString(key, streamHeaders.optString(key, ""))
                    }
                }

                // Only add Referer/Origin for file2 proxy paths that don't already have headers
                val isFile2Proxy = Regex("""/proxy/file\d+/""", RegexOption.IGNORE_CASE).containsMatchIn(playlist)
                if (isFile2Proxy && !responseHeaders.hasKey("Referer")) {
                    responseHeaders.putString("Referer", "https://vidlink.pro/")
                    responseHeaders.putString("Origin", "https://vidlink.pro")
                }

                // Always enforce a standard browser User-Agent to avoid 403 bot blocks
                if (!responseHeaders.hasKey("User-Agent")) {
                    responseHeaders.putString("User-Agent", USER_AGENT)
                }

                // Parse captions
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

                // Parse skip markers (intro/outro) — matching phone version
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
                Log.d(TAG, "VidLink resolved!")
                promise.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "VidLink error: ${e.message}")
                promise.reject("VIDLINK_ERROR", e.message)
            }
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

        // Extract video ID
        val vidPatterns = listOf(
            Regex("""/video/(vi\d+)"""), Regex(""""video"\s*:\s*"(vi\d+)""""),
            Regex(""""videoId"\s*:\s*"(vi\d+)""""), Regex("""data-video-id="(vi\d+)""""),
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
