package com.movieflix.tv.tvnative

import android.view.View
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.lifecycle.setViewTreeViewModelStoreOwner
import androidx.lifecycle.findViewTreeLifecycleOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ViewModelStoreOwner
import androidx.savedstate.SavedStateRegistryOwner

class TvRowViewManager : SimpleViewManager<SafeComposeView>() {

    override fun getName(): String = "TvRow"

    /**
     * Per-view mutable state holders.
     *
     * CRITICAL: Using mutableStateOf instead of a plain data class means that
     * when a prop changes (e.g. focusedStreamUrl arrives after a card focus),
     * Compose recomposes only the affected sub-tree WITHOUT calling setContent()
     * again. Calling setContent() on every prop update re-creates the entire
     * Compose tree, wiping all remember{} state — including focusedMovieId,
     * exoPlayer instances, and LazyRow scroll position.
     */
    private data class RowStateHolders(
        val title: MutableState<String?> = mutableStateOf(null),
        val content: MutableState<String?> = mutableStateOf(null),
        val focusedStreamUrl: MutableState<String?> = mutableStateOf(null),
        val focusedStreamHeaders: MutableState<String?> = mutableStateOf(null),
        val showRank: MutableState<Boolean> = mutableStateOf(false),
        val preferredMovieId: MutableState<String?> = mutableStateOf(null),
        val focusRequestToken: MutableState<Int> = mutableStateOf(0)
    )

    private val viewState = mutableMapOf<Int, RowStateHolders>()

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

        // Let focus pass through to the Compose Surface cards inside.
        // Setting the container as focusable would intercept D-pad focus
        // before it reaches the TV Material3 ClickableSurface elements.
        view.isFocusable = false
        view.isFocusableInTouchMode = false
        view.descendantFocusability = android.view.ViewGroup.FOCUS_AFTER_DESCENDANTS

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

    @ReactProp(name = "title")
    fun setTitle(view: SafeComposeView, title: String?) {
        viewState.getOrPut(view.id) { RowStateHolders() }.title.value = title
        ensureMounted(view)
    }

    @ReactProp(name = "content")
    fun setContent(view: SafeComposeView, content: String?) {
        viewState.getOrPut(view.id) { RowStateHolders() }.content.value = content
        ensureMounted(view)
    }

    @ReactProp(name = "focusedStreamUrl")
    fun setFocusedStreamUrl(view: SafeComposeView, url: String?) {
        viewState.getOrPut(view.id) { RowStateHolders() }.focusedStreamUrl.value = url
        ensureMounted(view)
    }

    @ReactProp(name = "focusedStreamHeaders")
    fun setFocusedStreamHeaders(view: SafeComposeView, headers: String?) {
        viewState.getOrPut(view.id) { RowStateHolders() }.focusedStreamHeaders.value = headers
        ensureMounted(view)
    }

    @ReactProp(name = "showRank")
    fun setShowRank(view: SafeComposeView, showRank: Boolean) {
        viewState.getOrPut(view.id) { RowStateHolders() }.showRank.value = showRank
        ensureMounted(view)
    }

    @ReactProp(name = "preferredMovieId")
    fun setPreferredMovieId(view: SafeComposeView, preferredMovieId: String?) {
        viewState.getOrPut(view.id) { RowStateHolders() }.preferredMovieId.value = preferredMovieId
        ensureMounted(view)
    }

    @ReactProp(name = "focusRequestToken", defaultInt = 0)
    fun setFocusRequestToken(view: SafeComposeView, focusRequestToken: Int) {
        viewState.getOrPut(view.id) { RowStateHolders() }.focusRequestToken.value = focusRequestToken
        ensureMounted(view)
    }

    /**
     * Mounts the Compose content tree exactly once.
     * Subsequent prop updates flow via mutableStateOf, not setContent().
     */
    private fun mountCompose(view: SafeComposeView, reactContext: ThemedReactContext) {
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

        val holders = viewState.getOrPut(view.id) { RowStateHolders() }

        view.setContent {
            // Reading mutableStateOf values here registers Compose observers.
            // Any change to these values triggers a fine-grained recomposition
            // of only the affected subtrees — not the entire tree.
            TvRow(
                viewId = view.id,
                title = holders.title.value,
                content = holders.content.value,
                focusedStreamUrl = holders.focusedStreamUrl.value,
                focusedStreamHeaders = holders.focusedStreamHeaders.value,
                showRank = holders.showRank.value,
                preferredMovieId = holders.preferredMovieId.value,
                focusRequestToken = holders.focusRequestToken.value,
                reactContext = reactContext
            )
        }
    }

    /**
     * Called by every prop setter. If the view is already attached and mounted,
     * this is a no-op (the mutableStateOf update already triggered recomposition).
     * If the view is not yet mounted, mount now if attached; otherwise the
     * onAttachedToWindow listener handles it.
     */
    private fun ensureMounted(view: SafeComposeView) {
        if (view.isAttachedToWindow && !view.hasContent()) {
            val reactContext = view.context as? ThemedReactContext ?: return
            mountCompose(view, reactContext)
        }
    }

    override fun onDropViewInstance(view: SafeComposeView) {
        super.onDropViewInstance(view)
        viewState.remove(view.id)
        view.disposeComposition()
    }

    override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any>? {
        return MapBuilder.builder<String, Any>()
            .put("onItemFocus", MapBuilder.of("registrationName", "onItemFocus"))
            .put("onItemPress", MapBuilder.of("registrationName", "onItemPress"))
            .build()
    }
}
