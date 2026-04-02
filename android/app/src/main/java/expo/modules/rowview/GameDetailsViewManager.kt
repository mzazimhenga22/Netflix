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
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.events.RCTEventEmitter

class GameDetailsViewManager : SimpleViewManager<FrameLayout>() {

    companion object {
        private val TAG_COMPOSE_VIEW = "game_details_compose_view".hashCode()
        private val TAG_GAME_DATA = "game_details_data".hashCode()
    }

    override fun getName() = "GameDetailsNativeView"

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

                reactContext.currentActivity?.let { activity ->
                    if (activity is LifecycleOwner) {
                        composeView.setViewTreeLifecycleOwner(activity)
                    }
                    if (activity is SavedStateRegistryOwner) {
                        composeView.setViewTreeSavedStateRegistryOwner(activity)
                    }
                }

                val data = root.getTag(TAG_GAME_DATA) as? Map<String, String>
                if (data != null) {
                    applyContent(root, composeView, data, reactContext)
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

    @ReactProp(name = "gameData")
    fun setGameData(view: FrameLayout, gameMap: ReadableMap?) {
        val data = mutableMapOf<String, String>()
        gameMap?.let {
            data["id"] = it.getString("id") ?: ""
            data["title"] = it.getString("title") ?: ""
            data["subtitle"] = it.getString("subtitle") ?: ""
            data["description"] = it.getString("description") ?: ""
            data["heroUrl"] = it.getString("heroUrl") ?: ""
            data["posterUrl"] = it.getString("posterUrl") ?: ""
        }
        view.setTag(TAG_GAME_DATA, data)

        if (view.isAttachedToWindow) {
            val composeView = view.getTag(TAG_COMPOSE_VIEW) as? ComposeView ?: return
            applyContent(view, composeView, data, view.context as ThemedReactContext)
        }
    }

    private fun applyContent(
        view: FrameLayout,
        composeView: ComposeView,
        data: Map<String, String>,
        context: ThemedReactContext
    ) {
        composeView.setContent {
            GameDetailsComposable(
                id = data["id"] ?: "",
                title = data["title"] ?: "",
                subtitle = data["subtitle"] ?: "",
                description = data["description"] ?: "",
                heroUrl = data["heroUrl"] ?: "",
                posterUrl = data["posterUrl"] ?: "",
                onBackClick = {
                    sendEvent(view, context, "onBackClick", "")
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
            "onBackClick" to mutableMapOf("registrationName" to "onBackClick")
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
