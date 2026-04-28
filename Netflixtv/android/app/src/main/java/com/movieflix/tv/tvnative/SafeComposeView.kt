package com.movieflix.tv.tvnative

import android.content.Context
import android.widget.FrameLayout
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy

/**
 * A FrameLayout wrapper for ComposeView that guards against the
 * "Cannot locate windowRecomposer; View is not attached to a window" crash.
 *
 * Since ComposeView is final and its onMeasure is also final, we cannot subclass it.
 * Instead, we wrap it in a FrameLayout and intercept the measurement pass.
 * If the wrapper is measured before being attached to a window (common in RN Fabric),
 * we skip measuring the child ComposeView to avoid the crash.
 */
class SafeComposeView(context: Context) : FrameLayout(context) {
    val composeView = ComposeView(context)

    init {
        clipChildren = false
        clipToPadding = false

        // Ensure D-pad focus passes through to Compose TV Material3 surfaces
        isFocusable = false
        isFocusableInTouchMode = false
        descendantFocusability = FOCUS_AFTER_DESCENDANTS
        composeView.isFocusable = false
        composeView.isFocusableInTouchMode = false
        composeView.descendantFocusability = FOCUS_AFTER_DESCENDANTS

        // Match parent layout
        composeView.layoutParams = LayoutParams(
            LayoutParams.MATCH_PARENT,
            LayoutParams.MATCH_PARENT
        )
        addView(composeView)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        // Ensure measurement happens once attached to avoid 0x0 stuck state
        requestLayout()
    }

    private var contentSet = false

    /**
     * Delegate setContent to the inner ComposeView.
     * Tracks whether content has been set so callers can avoid re-calling.
     */
    fun setContent(content: @Composable () -> Unit) {
        contentSet = true
        composeView.setContent(content)
    }

    /**
     * Delegate strategy to the inner ComposeView
     */
    fun setViewCompositionStrategy(strategy: ViewCompositionStrategy) {
        composeView.setViewCompositionStrategy(strategy)
    }

    /**
     * Delegate disposal to the inner ComposeView
     */
    fun disposeComposition() {
        composeView.disposeComposition()
    }

    /**
     * Returns true if setContent() has already been called on this view.
     * Used by ViewManagers to avoid calling setContent() multiple times
     * (which would re-create the entire Compose tree and wipe remember{} state).
     */
    fun hasContent(): Boolean = contentSet

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        if (!isAttachedToWindow) {
            // Guard: If not attached, skip measuring the child ComposeView
            // and return default sizes. This prevents Compose from attempting
            // to initialize the recomposer prematurely.
            setMeasuredDimension(
                getDefaultSize(suggestedMinimumWidth, widthMeasureSpec),
                getDefaultSize(suggestedMinimumHeight, heightMeasureSpec)
            )
            return
        }
        // Once attached, it's safe to measure children
        super.onMeasure(widthMeasureSpec, heightMeasureSpec)
    }
}
