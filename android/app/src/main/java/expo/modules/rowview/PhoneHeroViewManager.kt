package expo.modules.rowview

import android.view.Choreographer
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.savedstate.SavedStateRegistryOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.events.RCTEventEmitter

class PhoneHeroViewManager : SimpleViewManager<FrameLayout>() {

    companion object {
        private val TAG_COMPOSE_VIEW = "phone_hero_compose_view".hashCode()
        private val TAG_HERO_ITEM = "phone_hero_item".hashCode()
        private val TAG_SPATIAL_ENABLED = "phone_hero_spatial_enabled".hashCode()
    }

    override fun getName() = "PhoneHeroView"

    override fun createViewInstance(reactContext: ThemedReactContext): FrameLayout {
        val root = FrameLayout(reactContext)
        val composeView = ComposeView(reactContext).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnDetachedFromWindow)
        }

        root.setTag(TAG_COMPOSE_VIEW, composeView)

        root.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            private var frameCallback: Choreographer.FrameCallback? = null

            override fun onViewAttachedToWindow(v: View) {
                if (composeView.parent == null) {
                    root.addView(composeView)
                }

                reactContext.getCurrentActivity()?.let { activity ->
                    if (activity is LifecycleOwner) {
                        composeView.setViewTreeLifecycleOwner(activity)
                    }
                    if (activity is SavedStateRegistryOwner) {
                        composeView.setViewTreeSavedStateRegistryOwner(activity)
                    }
                }

                val items = root.getTag(TAG_HERO_ITEM) as? List<Map<String, Any>>
                val spatialEnabled = root.getTag(TAG_SPATIAL_ENABLED) as? Boolean ?: true
                if (items != null) {
                    applyContent(root, composeView, items, spatialEnabled, reactContext)
                }

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
                frameCallback?.let { Choreographer.getInstance().removeFrameCallback(it) }
                frameCallback = null
            }
        })

        return root
    }

    @ReactProp(name = "items")
    fun setItems(view: FrameLayout, itemsArray: ReadableArray?) {
        val itemsList = mutableListOf<Map<String, Any>>()
        
        itemsArray?.let { arr ->
            for (i in 0 until arr.size()) {
                val it = arr.getMap(i)
                if (it != null) {
                    val item = mutableMapOf<String, Any>()
                    item["id"] = getSafeString(it, "id")
                    item["title"] = getSafeString(it, "title")
                    item["imageUrl"] = getSafeString(it, "imageUrl")
                    item["nLogoUrl"] = getSafeString(it, "nLogoUrl")
                    item["titleLogoUrl"] = getSafeString(it, "titleLogoUrl")
                    
                    val categories = mutableListOf<String>()
                    it.getArray("categories")?.let { catArr ->
                        for (j in 0 until catArr.size()) {
                            categories.add(catArr.getString(j) ?: "")
                        }
                    }
                    item["categories"] = categories
                    item["isInMyList"] = if (it.hasKey("isInMyList")) it.getBoolean("isInMyList") else false
                    item["type"] = getSafeString(it, "type")
                    
                    itemsList.add(item)
                }
            }
        }
        
        view.setTag(TAG_HERO_ITEM, itemsList)
        
        if (view.isAttachedToWindow) {
            val composeView = view.getTag(TAG_COMPOSE_VIEW) as? ComposeView ?: return
            val spatialEnabled = view.getTag(TAG_SPATIAL_ENABLED) as? Boolean ?: true
            applyContent(view, composeView, itemsList, spatialEnabled, view.context as ThemedReactContext)
        }
    }

    @ReactProp(name = "spatialEnabled", defaultBoolean = true)
    fun setSpatialEnabled(view: FrameLayout, spatialEnabled: Boolean) {
        view.setTag(TAG_SPATIAL_ENABLED, spatialEnabled)

        if (view.isAttachedToWindow) {
            val composeView = view.getTag(TAG_COMPOSE_VIEW) as? ComposeView ?: return
            val items = view.getTag(TAG_HERO_ITEM) as? List<Map<String, Any>> ?: emptyList()
            applyContent(view, composeView, items, spatialEnabled, view.context as ThemedReactContext)
        }
    }

    private fun applyContent(
        view: FrameLayout,
        composeView: ComposeView,
        items: List<Map<String, Any>>,
        spatialEnabled: Boolean,
        context: ThemedReactContext
    ) {
        composeView.setContent {
            PhoneHeroComposable(
                items = items,
                spatialEnabled = spatialEnabled,
                onPlayPress = { id ->
                    sendEvent(view, context, "onPlayPress", id)
                },
                onListPress = { id ->
                    sendEvent(view, context, "onListPress", id)
                },
                onLongPress = { id ->
                    sendEvent(view, context, "onLongPress", id)
                }
            )
        }
    }

    private fun sendEvent(view: View, context: ThemedReactContext, eventName: String, id: String) {
        val event = Arguments.createMap()
        event.putString("id", id)
        context.getJSModule(RCTEventEmitter::class.java).receiveEvent(
            view.id,
            eventName,
            event
        )
    }

    override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> {
        return mutableMapOf(
            "onPlayPress" to mutableMapOf("registrationName" to "onPlayPress"),
            "onListPress" to mutableMapOf("registrationName" to "onListPress"),
            "onLongPress" to mutableMapOf("registrationName" to "onLongPress")
        )
    }

    private fun manuallyLayoutChildren(view: ViewGroup) {
        val width = view.width
        val height = view.height
        if (width == 0 || height == 0) return
        view.measure(
            View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY)
        )
        view.layout(view.left, view.top, view.right, view.bottom)
    }

    private fun getSafeString(map: ReadableMap, key: String): String {
        if (!map.hasKey(key) || map.isNull(key)) return ""
        return try {
            map.getString(key) ?: ""
        } catch (e: Exception) {
            ""
        }
    }
}
