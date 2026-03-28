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
}
