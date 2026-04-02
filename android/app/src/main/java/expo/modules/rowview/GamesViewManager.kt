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
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter

class GamesViewManager : SimpleViewManager<FrameLayout>() {

    companion object {
        private val TAG_COMPOSE_VIEW = "games_compose_view".hashCode()
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

                reactContext.currentActivity?.let { activity ->
                    if (activity is LifecycleOwner) {
                        composeView.setViewTreeLifecycleOwner(activity)
                    }
                    if (activity is SavedStateRegistryOwner) {
                        composeView.setViewTreeSavedStateRegistryOwner(activity)
                    }
                }

                composeView.setContent {
                    GamesComposable(
                        onSearchClick = {
                            sendEvent(root, reactContext, "onSearchClick", "")
                        },
                        onGamePress = { id ->
                            sendEvent(root, reactContext, "onGamePress", id)
                        }
                    )
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
