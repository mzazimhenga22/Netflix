package expo.modules.hologram

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class HologramViewManager : SimpleViewManager<HologramView>() {
    override fun getName() = "HologramModule"

    override fun createViewInstance(reactContext: ThemedReactContext): HologramView {
        return HologramView(reactContext)
    }

    @ReactProp(name = "videoUrl")
    fun setVideoUrl(view: HologramView, url: String?) {
        view.videoUrl = url ?: ""
    }

    @ReactProp(name = "title")
    fun setTitle(view: HologramView, title: String?) {
        view.title = title ?: ""
    }

    @ReactProp(name = "drmLicenseUrl")
    fun setDrmLicenseUrl(view: HologramView, url: String?) {
        view.drmLicenseUrl = url ?: ""
    }

    @ReactProp(name = "videoFormat")
    fun setVideoFormat(view: HologramView, format: String?) {
        view.videoFormat = format ?: "standard"
    }

    override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> {
        return mutableMapOf(
            "onPlaybackStatusUpdate" to mutableMapOf("registrationName" to "onPlaybackStatusUpdate")
        )
    }
}
