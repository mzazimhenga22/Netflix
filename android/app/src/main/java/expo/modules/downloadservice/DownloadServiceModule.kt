package expo.modules.downloadservice

import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DownloadServiceModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DownloadService"

    @ReactMethod
    fun startForeground(title: String) {
        val context = reactApplicationContext
        val intent = Intent(context, DownloadForegroundService::class.java).apply {
            putExtra("title", title)
        }

        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        } catch (e: Exception) {
            println("Failed to start foreground service: ${e.message}")
        }
    }

    @ReactMethod
    fun updateProgress(title: String, percent: Double) {
        val context = reactApplicationContext
        if (!DownloadForegroundService.isRunning) return

        val intent = Intent(context, DownloadForegroundService::class.java).apply {
            putExtra("title", title)
            putExtra("progress", (percent * 100).toInt())
            putExtra("isUpdate", true)
        }

        try {
            context.startService(intent)
        } catch (e: Exception) {
            // Ignored
        }
    }

    @ReactMethod
    fun stopForeground() {
        val context = reactApplicationContext
        val intent = Intent(context, DownloadForegroundService::class.java)
        context.stopService(intent)
    }

    @ReactMethod
    fun getCookies(url: String, promise: com.facebook.react.bridge.Promise) {
        try {
            val cookieManager = android.webkit.CookieManager.getInstance()
            val cookies = cookieManager.getCookie(url) ?: ""
            promise.resolve(cookies)
        } catch (e: Exception) {
            promise.reject("COOKIE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun setCookie(url: String, cookieValue: String, promise: com.facebook.react.bridge.Promise) {
        try {
            val cookieManager = android.webkit.CookieManager.getInstance()
            cookieManager.setCookie(url, cookieValue)
            cookieManager.flush()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("COOKIE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun nativeFetch(urlStr: String, options: com.facebook.react.bridge.ReadableMap, promise: com.facebook.react.bridge.Promise) {
        Thread {
            var connection: java.net.HttpURLConnection? = null
            try {
                val url = java.net.URL(urlStr)
                connection = url.openConnection() as java.net.HttpURLConnection
                
                val method = if (options.hasKey("method")) options.getString("method") else "GET"
                connection.requestMethod = method
                
                if (options.hasKey("headers")) {
                    val headersMap = options.getMap("headers")
                    if (headersMap != null) {
                        val iterator = headersMap.keySetIterator()
                        while (iterator.hasNextKey()) {
                            val key = iterator.nextKey()
                            val value = when (headersMap.getType(key)) {
                                com.facebook.react.bridge.ReadableType.String -> headersMap.getString(key)
                                com.facebook.react.bridge.ReadableType.Number -> headersMap.getDouble(key).toString()
                                com.facebook.react.bridge.ReadableType.Boolean -> headersMap.getBoolean(key).toString()
                                else -> null
                            }
                            if (value != null) {
                                connection.setRequestProperty(key, value)
                            }
                        }
                    }
                }
                
                connection.instanceFollowRedirects = true
                
                if (options.hasKey("body") && (method == "POST" || method == "PUT")) {
                    connection.doOutput = true
                    val body = options.getString("body") ?: ""
                    val writer = java.io.OutputStreamWriter(connection.outputStream, "UTF-8")
                    writer.write(body)
                    writer.flush()
                    writer.close()
                }
                
                val responseCode = connection.responseCode
                
                val responseHeaders = com.facebook.react.bridge.Arguments.createMap()
                for ((key, values) in connection.headerFields) {
                    if (key != null) {
                        val headerKey = key.lowercase()
                        val array = com.facebook.react.bridge.Arguments.createArray()
                        for (v in values) {
                            array.pushString(v)
                        }
                        responseHeaders.putArray(headerKey, array)
                    }
                }
                
                val stream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
                val bodyString = if (stream != null) {
                    val reader = java.io.BufferedReader(java.io.InputStreamReader(stream, "UTF-8"))
                    val sb = java.lang.StringBuilder()
                    var line: String?
                    while (reader.readLine().also { line = it } != null) {
                        sb.append(line).append("\n")
                    }
                    reader.close()
                    sb.toString()
                } else {
                    ""
                }
                
                val result = com.facebook.react.bridge.Arguments.createMap()
                result.putInt("status", responseCode)
                result.putString("body", bodyString)
                result.putMap("headers", responseHeaders)
                
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("FETCH_ERROR", e.message, e)
            } finally {
                connection?.disconnect()
            }
        }.start()
    }
}
