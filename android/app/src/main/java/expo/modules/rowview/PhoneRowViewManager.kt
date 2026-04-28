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
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.events.RCTEventEmitter

class PhoneRowViewManager : SimpleViewManager<FrameLayout>() {

    companion object {
        private val TAG_COMPOSE_VIEW = "phone_row_compose_view".hashCode()
        private val TAG_PENDING_ITEMS = "phone_row_pending_items".hashCode()
        private val TAG_PENDING_PROPS = "phone_row_pending_props".hashCode()
    }

    override fun getName() = "PhoneRowView"

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

                @Suppress("UNCHECKED_CAST")
                val pendingItems = root.getTag(TAG_PENDING_ITEMS) as? List<Map<String, Any>>
                val pendingProps = root.getTag(TAG_PENDING_PROPS) as? Map<String, Any>
                if (pendingItems != null) {
                    applyContent(root, composeView, pendingItems, pendingProps, reactContext)
                    root.setTag(TAG_PENDING_ITEMS, null)
                    root.setTag(TAG_PENDING_PROPS, null)
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

    @ReactProp(name = "variant")
    fun setVariant(view: FrameLayout, variant: String?) {
        val props = (view.getTag(TAG_PENDING_PROPS) as? MutableMap<String, Any>) ?: mutableMapOf()
        props["variant"] = variant ?: "poster"
        view.setTag(TAG_PENDING_PROPS, props)
        
        // If already attached, apply immediately using cached items if any
        if (view.isAttachedToWindow) {
            val composeView = view.getTag(TAG_COMPOSE_VIEW) as? ComposeView ?: return
            @Suppress("UNCHECKED_CAST")
            val items = view.getTag(TAG_PENDING_ITEMS) as? List<Map<String, Any>> ?: emptyList()
            applyContent(view, composeView, items, props, view.context as ThemedReactContext)
        }
    }

    @ReactProp(name = "data")
    fun setData(view: FrameLayout, data: ReadableArray?) {
        val context = view.context as ThemedReactContext
        val composeView = view.getTag(TAG_COMPOSE_VIEW) as? ComposeView ?: return

        val itemsList = mutableListOf<Map<String, Any>>()
        data?.let {
            for (i in 0 until it.size()) {
                val map = it.getMap(i) ?: continue
                val item = mutableMapOf<String, Any>()
                item["id"] = getSafeString(map, "id")
                item["title"] = getSafeString(map, "title").ifEmpty { getSafeString(map, "name") }
                item["imageUrl"] = getSafeString(map, "imageUrl")
                item["type"] = getSafeString(map, "type")
                if (map.hasKey("isLocked")) {
                    item["isLocked"] = map.getBoolean("isLocked")
                }
                itemsList.add(item)
            }
        }

        view.setTag(TAG_PENDING_ITEMS, itemsList)

        if (!view.isAttachedToWindow) {
            return
        }
        
        @Suppress("UNCHECKED_CAST")
        val props = view.getTag(TAG_PENDING_PROPS) as? Map<String, Any>
        applyContent(view, composeView, itemsList, props, context)
    }

    private fun applyContent(
        view: FrameLayout,
        composeView: ComposeView,
        itemsList: List<Map<String, Any>>,
        props: Map<String, Any>?,
        context: ThemedReactContext
    ) {
        val variant = props?.get("variant") as? String ?: "poster"
        
        composeView.setContent {
            PhoneRowComposable(
                items = itemsList,
                variant = variant,
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
                onItemLongPress = { id, type ->
                    val event = Arguments.createMap()
                    event.putString("id", id)
                    event.putString("mediaType", type)
                    context.getJSModule(RCTEventEmitter::class.java).receiveEvent(
                        view.id,
                        "topLongPress",
                        event
                    )
                }
            )
        }
    }

    override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> {
        return mutableMapOf(
            "topSelect" to mutableMapOf("registrationName" to "onSelect"),
            "topLongPress" to mutableMapOf("registrationName" to "onLongPress")
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
