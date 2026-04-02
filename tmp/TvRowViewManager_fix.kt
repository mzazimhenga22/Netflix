package com.com1.tvnative

import android.view.Choreographer
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.compose.ui.platform.ComposeView
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.Arguments
import com.facebook.react.uimanager.events.RCTEventEmitter
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.savedstate.SavedStateRegistryOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import androidx.compose.ui.platform.ViewCompositionStrategy


class TvRowViewManager : SimpleViewManager<FrameLayout>() {

    companion object {
        // Use View.generateViewId() as a unique tag key — avoids needing R.id resource
        private val TAG_PENDING_ITEMS = "tv_row_pending_items".hashCode()
    }

    override fun getName() = "TvRowView"

    override fun createViewInstance(reactContext: ThemedReactContext): FrameLayout {
        val root = FrameLayout(reactContext)
        val composeView = ComposeView(reactContext).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            // DisposeOnDetachedFromWindow: only compose when attached, dispose when detached
            setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnDetachedFromWindow)
        }

        root.addView(composeView)

        // Defer lifecycle owner setup and layout hack until the view is attached to a window.
        // This prevents the "Cannot locate windowRecomposer" crash that occurs when
        // ComposeView.onMeasure() is called before the view is in a window.
        root.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            private var frameCallback: Choreographer.FrameCallback? = null

            override fun onViewAttachedToWindow(v: View) {
                // Set lifecycle owners now that we have a window
                reactContext.currentActivity?.let { activity ->
                    if (activity is LifecycleOwner) {
                        composeView.setViewTreeLifecycleOwner(activity)
                    }
                    if (activity is SavedStateRegistryOwner) {
                        composeView.setViewTreeSavedStateRegistryOwner(activity)
                    }
                }

                // Apply any pending content that was set via @ReactProp before attachment
                @Suppress("UNCHECKED_CAST")
                val pendingItems = root.getTag(TAG_PENDING_ITEMS) as? List<Map<String, Any>>
                if (pendingItems != null) {
                    applyContent(root, composeView, pendingItems, reactContext)
                    root.setTag(TAG_PENDING_ITEMS, null)
                }

                // Start layout hack only when attached
                frameCallback = object : Choreographer.FrameCallback {
                    override fun doFrame(frameTimeNanos: Long) {
                        if (root.isAttachedToWindow) {
                            manuallyLayoutChildren(root)
                            root.viewTreeObserver.dispatchOnGlobalLayout()
                            Choreographer.getInstance().postFrameCallback(this)
                        }
                    }
                }
                Choreographer.getInstance().postFrameCallback(frameCallback!!)
            }

            override fun onViewDetachedFromWindow(v: View) {
                // Stop the layout hack when detached to prevent leaks and crashes
                frameCallback?.let { Choreographer.getInstance().removeFrameCallback(it) }
                frameCallback = null
            }
        })

        return root
    }

    @ReactProp(name = "data")
    fun setData(view: FrameLayout, data: ReadableArray?) {
        val context = view.context as ThemedReactContext
        val composeView = view.getChildAt(0) as? ComposeView ?: return

        // Convert ReadableArray to List of Maps
        val itemsList = mutableListOf<Map<String, Any>>()
        data?.let {
            for (i in 0 until it.size()) {
                val map = it.getMap(i) ?: continue
                val item = mutableMapOf<String, Any>()
                item["id"] = getSafeString(map, "id")
                item["title"] = getSafeString(map, "title").ifEmpty { getSafeString(map, "name") }
                item["poster_path"] = getSafeString(map, "poster_path")
                item["backdrop_path"] = getSafeString(map, "backdrop_path")
                item["media_type"] = getSafeString(map, "media_type").ifEmpty { "movie" }
                itemsList.add(item)
            }
        }

        // If the view is not yet attached to a window, store the data for later.
        // Calling setContent on a ComposeView before it's attached to a window
        // causes "Cannot locate windowRecomposer" crash.
        if (!view.isAttachedToWindow) {
            view.setTag(TAG_PENDING_ITEMS, itemsList)
            return
        }

        applyContent(view, composeView, itemsList, context)
    }

    private fun applyContent(
        view: FrameLayout,
        composeView: ComposeView,
        itemsList: List<Map<String, Any>>,
        context: ThemedReactContext
    ) {
        composeView.setContent {
            TvRowComposable(
                items = itemsList,
                onItemSelect = { id, type ->
                    val event = Arguments.createMap()
                    event.putString("id", id)
                    event.putString("mediaType", type)
                    context.getJSModule(RCTEventEmitter::class.java).receiveEvent(
                        view.id,
                        "topSelect",
                        event
                    )
                },
                onItemFocus = { id ->
                    val event = Arguments.createMap()
                    event.putString("id", id)
                    context.getJSModule(RCTEventEmitter::class.java).receiveEvent(
                        view.id,
                        "topFocusChange",
                        event
                    )
                }
            )
        }
    }

    override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> {
        return mutableMapOf(
            "topSelect" to mutableMapOf("registrationName" to "onSelect"),
            "topFocusChange" to mutableMapOf("registrationName" to "onFocusChange")
        )
    }

    private fun manuallyLayoutChildren(view: ViewGroup) {
        val width = view.width
        val height = view.height
        if (width == 0 || height == 0) return  // Skip if not laid out yet
        view.measure(
            View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY)
        )
        view.layout(view.left, view.top, view.right, view.bottom)
    }

    private fun getSafeString(map: com.facebook.react.bridge.ReadableMap, key: String): String {
        if (!map.hasKey(key) || map.isNull(key)) return ""
        return try {
            when (map.getType(key)) {
                com.facebook.react.bridge.ReadableType.String -> map.getString(key) ?: ""
                com.facebook.react.bridge.ReadableType.Number -> {
                    val d = map.getDouble(key)
                    if (d == d.toLong().toDouble()) d.toLong().toString() else d.toString()
                }
                else -> ""
            }
        } catch (e: Exception) {
            ""
        }
    }
}
