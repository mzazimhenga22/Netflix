package com.movieflix.tv.tvnative

import android.view.View
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.lifecycle.setViewTreeViewModelStoreOwner
import androidx.lifecycle.findViewTreeLifecycleOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import com.facebook.react.bridge.Arguments
import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.events.RCTEventEmitter
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ViewModelStoreOwner
import androidx.savedstate.SavedStateRegistryOwner

class TvHeroBannerViewManager : SimpleViewManager<SafeComposeView>() {

    override fun getName(): String = "TvHeroBanner"

    /**
     * Per-view state using Compose mutableStateOf holders.
     *
     * CRITICAL: We use mutableStateOf here rather than a plain data class so that
     * prop updates trigger Compose recomposition WITHOUT calling setContent() again.
     * Calling setContent() on every prop change re-creates the entire Compose tree,
     * wiping all remember{} state — including the ExoPlayer instance — which causes
     * the hero banner video to stop and restart on every focus event.
     */
    private data class BannerStateHolders(
        val movieData: MutableState<String?> = mutableStateOf(null),
        val streamUrl: MutableState<String?> = mutableStateOf(null),
        val streamHeaders: MutableState<String?> = mutableStateOf(null),
        val hasFocus: MutableState<Boolean> = mutableStateOf(false)
    )

    private val viewState = mutableMapOf<Int, BannerStateHolders>()

    override fun createViewInstance(reactContext: ThemedReactContext): SafeComposeView {
        val view = SafeComposeView(reactContext)

        // Bind lifecycle owners from the hosting Activity
        val activity = reactContext.currentActivity
        if (activity is LifecycleOwner) {
            view.setViewTreeLifecycleOwner(activity)
        }
        if (activity is SavedStateRegistryOwner) {
            view.setViewTreeSavedStateRegistryOwner(activity)
        }
        if (activity is ViewModelStoreOwner) {
            view.setViewTreeViewModelStoreOwner(activity)
        }

        view.setViewCompositionStrategy(
            ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed
        )

        view.isFocusable = true
        view.isFocusableInTouchMode = true

        view.setOnFocusChangeListener { _, hasFocus ->
            val holders = viewState.getOrPut(view.id) { BannerStateHolders() }
            holders.hasFocus.value = hasFocus   // reactive update — no setContent needed

            if (hasFocus) {
                val event = Arguments.createMap()
                reactContext.getJSModule(RCTEventEmitter::class.java)
                    .receiveEvent(view.id, "topFocus", event)
            }
        }

        // setContent is called ONCE when the view attaches to a window.
        // After that, all prop updates go through mutableStateOf — Compose
        // recomposes only the affected subtree without destroying ExoPlayer.
        view.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) {
                mountCompose(view, reactContext)
            }
            override fun onViewDetachedFromWindow(v: View) { /* Compose handles cleanup */ }
        })

        return view
    }

    @ReactProp(name = "movieData")
    fun setMovieData(view: SafeComposeView, movieData: String?) {
        val holders = viewState.getOrPut(view.id) { BannerStateHolders() }
        holders.movieData.value = movieData         // triggers recompose reactively
        ensureMounted(view)
    }

    @ReactProp(name = "streamUrl")
    fun setStreamUrl(view: SafeComposeView, streamUrl: String?) {
        val holders = viewState.getOrPut(view.id) { BannerStateHolders() }
        holders.streamUrl.value = streamUrl         // triggers recompose reactively
        ensureMounted(view)
    }

    @ReactProp(name = "streamHeaders")
    fun setStreamHeaders(view: SafeComposeView, streamHeaders: String?) {
        val holders = viewState.getOrPut(view.id) { BannerStateHolders() }
        holders.streamHeaders.value = streamHeaders // triggers recompose reactively
        ensureMounted(view)
    }

    /**
     * Mounts the Compose content tree exactly once.
     * Subsequent prop updates flow via mutableStateOf, not setContent().
     */
    private fun mountCompose(view: SafeComposeView, reactContext: ThemedReactContext) {
        // Guard: view must be attached so the recomposer has a window token
        if (!view.isAttachedToWindow) return

        // Re-bind lifecycle owners if lost (dynamic remount edge case)
        if (view.findViewTreeLifecycleOwner() == null) {
            val activity = reactContext.currentActivity
            if (activity is LifecycleOwner) {
                view.setViewTreeLifecycleOwner(activity)
                view.setViewTreeSavedStateRegistryOwner(activity as? SavedStateRegistryOwner)
                view.setViewTreeViewModelStoreOwner(activity as? ViewModelStoreOwner)
            }
        }

        val holders = viewState.getOrPut(view.id) { BannerStateHolders() }

        view.setContent {
            // Read mutable states here — Compose subscribes to these and recomposes
            // this lambda (and only affected sub-trees) whenever they change.
            TvHeroBanner(
                movieData = holders.movieData.value,
                streamUrl = holders.streamUrl.value,
                streamHeaders = holders.streamHeaders.value,
                isFocused = holders.hasFocus.value,
                onColorExtracted = { colorInt ->
                    val event = Arguments.createMap().apply {
                        val r = (colorInt shr 16) and 0xFF
                        val g = (colorInt shr 8) and 0xFF
                        val b = colorInt and 0xFF
                        putString("color", String.format("#%02x%02x%02x", r, g, b))
                        putInt("colorInt", colorInt)
                    }
                    reactContext.getJSModule(RCTEventEmitter::class.java)
                        .receiveEvent(view.id, "onColorExtracted", event)
                }
            )
        }
    }

    /**
     * Called by prop setters: if the view is already attached, no-op (the
     * mutableStateOf update already triggered recomposition). If not yet
     * attached, the onAttachedToWindow listener will call mountCompose().
     */
    private fun ensureMounted(view: SafeComposeView) {
        if (view.isAttachedToWindow) {
            // If setContent hasn't been called yet (race: props arrived before attach),
            // mount now. Otherwise this is a no-op since state is already updated.
            val reactContext = view.context as? ThemedReactContext ?: return
            if (!view.hasContent()) mountCompose(view, reactContext)
        }
    }

    override fun onDropViewInstance(view: SafeComposeView) {
        super.onDropViewInstance(view)
        viewState.remove(view.id)
        view.disposeComposition()
    }

    override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any>? {
        return MapBuilder.builder<String, Any>()
            .put("onColorExtracted", MapBuilder.of("registrationName", "onColorExtracted"))
            .put("topFocus", MapBuilder.of("registrationName", "onFocus"))
            .build()
    }
}
