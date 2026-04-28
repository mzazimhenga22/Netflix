package expo.modules.hologram

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HologramModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("HologramModule")

        View(HologramView::class) {
            Prop("videoUrl") { view: HologramView, url: String ->
                view.videoUrl = url
            }
            Prop("title") { view: HologramView, title: String ->
                view.title = title
            }
            Prop("drmLicenseUrl") { view: HologramView, url: String ->
                view.drmLicenseUrl = url
            }
            Prop("videoFormat") { view: HologramView, format: String ->
                view.videoFormat = format
            }
            Events("onPlaybackStatusUpdate")
        }
    }
}
