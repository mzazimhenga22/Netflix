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

class GamesViewManager : SimpleViewManager<FrameLayout>() {

    companion object {
        private val TAG_COMPOSE_VIEW = "games_compose_view".hashCode()
        private val TAG_SECTIONS = "games_sections".hashCode()
    }

    override fun getName() = "GamesNativeView"

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

                val sections = root.getTag(TAG_SECTIONS) as? List<GameSection>
                applyContent(root, composeView, reactContext, sections)

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

    @ReactProp(name = "sections")
    fun setSections(view: FrameLayout, sectionsArray: ReadableArray?) {
        val sections = sectionsArray?.let { parseSections(it) } ?: emptyList()
        view.setTag(TAG_SECTIONS, sections)

        if (view.isAttachedToWindow) {
            val composeView = view.getTag(TAG_COMPOSE_VIEW) as? ComposeView ?: return
            applyContent(view, composeView, view.context as ThemedReactContext, sections)
        }
    }

    private fun applyContent(
        root: FrameLayout,
        composeView: ComposeView,
        reactContext: ThemedReactContext,
        sections: List<GameSection>?
    ) {
        composeView.setContent {
            GamesComposable(
                sections = sections ?: emptyList(),
                onSearchClick = {
                    sendEvent(root, reactContext, "onSearchClick", "")
                },
                onGamePress = { id ->
                    sendEvent(root, reactContext, "onGamePress", id)
                }
            )
        }
    }

    private fun parseSections(array: ReadableArray): List<GameSection> {
        val sections = mutableListOf<GameSection>()
        for (i in 0 until array.size()) {
            val sectionMap = array.getMap(i) ?: continue
            val title = sectionMap.getString("title") ?: continue
            val itemsArray = sectionMap.getArray("items") ?: continue
            val items = mutableListOf<GameItem>()
            for (j in 0 until itemsArray.size()) {
                val itemMap = itemsArray.getMap(j) ?: continue
                items.add(parseGameItem(itemMap))
            }
            if (items.isNotEmpty()) {
                sections.add(GameSection(title, items))
            }
        }
        return sections
    }

    private fun parseGameItem(itemMap: ReadableMap): GameItem {
        return GameItem(
            id = readString(itemMap, "id"),
            title = readString(itemMap, "title"),
            subtitle = readString(itemMap, "subtitle"),
            posterUrl = readString(itemMap, "posterUrl"),
            badge1 = readOptionalString(itemMap, "badge1"),
            badge2 = readOptionalString(itemMap, "badge2")
        )
    }

    private fun readString(map: ReadableMap, key: String): String {
        return if (map.hasKey(key) && !map.isNull(key)) map.getString(key) ?: "" else ""
    }

    private fun readOptionalString(map: ReadableMap, key: String): String? {
        return if (map.hasKey(key) && !map.isNull(key)) map.getString(key) else null
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
            "onSearchClick" to mutableMapOf("registrationName" to "onSearchClick"),
            "onGamePress" to mutableMapOf("registrationName" to "onGamePress")
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
}
