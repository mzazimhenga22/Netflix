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

                val item = root.getTag(TAG_HERO_ITEM) as? Map<String, Any>
                if (item != null) {
                    applyContent(root, composeView, item, reactContext)
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

    @ReactProp(name = "item")
    fun setItem(view: FrameLayout, itemMap: ReadableMap?) {
        val item = mutableMapOf<String, Any>()
        itemMap?.let {
            item["id"] = getSafeString(it, "id")
            item["title"] = getSafeString(it, "title")
            item["imageUrl"] = getSafeString(it, "imageUrl")
            item["nLogoUrl"] = getSafeString(it, "nLogoUrl")
            
            val categories = mutableListOf<String>()
            it.getArray("categories")?.let { arr ->
                for (i in 0 until arr.size()) {
                    categories.add(arr.getString(i) ?: "")
                }
            }
            item["categories"] = categories
            item["isInMyList"] = if (it.hasKey("isInMyList")) it.getBoolean("isInMyList") else false
        }
        
        view.setTag(TAG_HERO_ITEM, item)
        
        if (view.isAttachedToWindow) {
            val composeView = view.getTag(TAG_COMPOSE_VIEW) as? ComposeView ?: return
            applyContent(view, composeView, item, view.context as ThemedReactContext)
        }
    }

    private fun applyContent(
        view: FrameLayout,
        composeView: ComposeView,
        item: Map<String, Any>,
        context: ThemedReactContext
    ) {
        val id = item["id"] as? String ?: ""
        val title = item["title"] as? String ?: ""
        val imageUrl = item["imageUrl"] as? String ?: ""
        val nLogoUrl = item["nLogoUrl"] as? String ?: ""
        val categories = item["categories"] as? List<String> ?: emptyList()
        val isInMyList = item["isInMyList"] as? Boolean ?: false

        composeView.setContent {
            PhoneHeroComposable(
                id = id,
                title = title,
                imageUrl = imageUrl,
                nLogoUrl = nLogoUrl,
                categories = categories,
                isInMyList = isInMyList,
                onPlayPress = {
                    sendEvent(view, context, "onPlayPress", id)
                },
                onListPress = {
                    sendEvent(view, context, "onListPress", id)
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
            "onListPress" to mutableMapOf("registrationName" to "onListPress")
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
