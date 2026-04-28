package expo.modules.hologram

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Color
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.opengl.GLSurfaceView
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.Size
import android.view.Display
import android.view.Surface
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.drm.DefaultDrmSessionManagerProvider
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetector
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenter
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import com.facebook.react.bridge.Arguments
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.abs
import kotlin.math.sqrt

class HologramView(context: Context) : FrameLayout(context), SensorEventListener, LifecycleOwner {

    companion object {
        private const val TAG = "HologramView"
    }

    private val lifecycleRegistry = LifecycleRegistry(this)
    override val lifecycle: Lifecycle get() = lifecycleRegistry

    private val glView: GLSurfaceView
    internal val renderer: HologramRenderer
    private var player: ExoPlayer? = null

    var videoUrl: String = ""
        set(value) {
            field = value
            setupPlayer()
        }

    var title: String = ""
    var drmLicenseUrl: String = ""
    var videoFormat: String = "standard"
        set(value) {
            field = value
            renderer.videoFormat = if (value == "3d-top-bottom") 1 else 0
        }



    private val sensorMgr: SensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private var rotSensor: Sensor? = sensorMgr.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)
        ?: sensorMgr.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    private var gravSensor: Sensor? = sensorMgr.getDefaultSensor(Sensor.TYPE_GRAVITY)
    private var accelSensor: Sensor? = sensorMgr.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

    @Volatile private var faceTrackingEnabled = false
    @Volatile private var faceLocked = false

    private var cameraExec: ExecutorService? = null
    private var camProvider: ProcessCameraProvider? = null
    private var faceDetector: FaceDetector? = null
    private var subjectSegmenter: SubjectSegmenter? = null

    private val handler = Handler(Looper.getMainLooper())

    private var isFlat = false
    private var flatSince = 0L
    private var stableSince = 0L
    private val flatThresholdMs = 700L
    private val stillnessThresholdMs = 550L
    private var tableTransition = 0f
    private var accelMagnitude = SensorManager.GRAVITY_EARTH

    private val gyroXFilter = ScalarKalmanFilter()
    private val gyroYFilter = ScalarKalmanFilter()
    private val faceXFilter = ScalarKalmanFilter(processNoise = 0.006f, measurementNoise = 0.08f)
    private val faceYFilter = ScalarKalmanFilter(processNoise = 0.006f, measurementNoise = 0.08f)
    private val faceZFilter = ScalarKalmanFilter(processNoise = 0.01f, measurementNoise = 0.12f)
    private val subjectCenterXFilter = ScalarKalmanFilter(processNoise = 0.01f, measurementNoise = 0.08f)
    private val subjectCenterYFilter = ScalarKalmanFilter(processNoise = 0.01f, measurementNoise = 0.08f)
    private val subjectScaleXFilter = ScalarKalmanFilter(processNoise = 0.01f, measurementNoise = 0.1f)
    private val subjectScaleYFilter = ScalarKalmanFilter(processNoise = 0.01f, measurementNoise = 0.1f)
    private val subjectBoostFilter = ScalarKalmanFilter(processNoise = 0.012f, measurementNoise = 0.12f)

    init {
        lifecycleRegistry.currentState = Lifecycle.State.CREATED
        setBackgroundColor(Color.BLACK)

        glView = GLSurfaceView(context).apply { setEGLContextClientVersion(2) }
        renderer = HologramRenderer { st ->
            post { player?.setVideoSurface(Surface(st)) }
        }
        
        // Pass segmenter down to renderer so it can process FBO frames instead of relying on MediaMetadataRetriever
        renderer.onFrameBitmapExtracted = { bitmap ->
            subjectSegmenter?.let { segmenter ->
                val input = InputImage.fromBitmap(bitmap, 0)
                segmenter.process(input)
                    .addOnSuccessListener { result ->
                        val buffer = result.foregroundConfidenceMask ?: return@addOnSuccessListener
                        val width = bitmap.width
                        val height = bitmap.height
                        if (width <= 0 || height <= 0) return@addOnSuccessListener
                        val stepX = maxOf(1, width / 14)
                        val stepY = maxOf(1, height / 14)
                        var total = 0f
                        var weightX = 0f
                        var weightY = 0f
                        var minX = width.toFloat()
                        var maxX = 0f
                        var minY = height.toFloat()
                        var maxY = 0f

                        for (y in 0 until height step stepY) {
                            for (x in 0 until width step stepX) {
                                val index = y * width + x
                                if (index >= buffer.limit()) continue
                                val confidence = buffer.get(index).coerceIn(0f, 1f)
                                if (confidence < 0.18f) continue

                                total += confidence
                                weightX += confidence * x
                                weightY += confidence * y
                                if (x < minX) minX = x.toFloat()
                                if (x > maxX) maxX = x.toFloat()
                                if (y < minY) minY = y.toFloat()
                                if (y > maxY) maxY = y.toFloat()
                            }
                        }

                        if (total > 0.01f) {
                            val centerX = (weightX / total / width).coerceIn(0.12f, 0.88f)
                            val centerY = (weightY / total / height).coerceIn(0.12f, 0.88f)
                            val scaleX = (((maxX - minX) / width) * 0.75f).coerceIn(0.18f, 0.72f)
                            val scaleY = (((maxY - minY) / height) * 0.9f).coerceIn(0.18f, 0.74f)
                            val boost = (0.24f + total / 30f).coerceIn(0.2f, 0.72f)
                            
                            renderer.subjectCenterX = subjectCenterXFilter.update(centerX)
                            renderer.subjectCenterY = subjectCenterYFilter.update(centerY)
                            renderer.subjectScaleX = subjectScaleXFilter.update(scaleX)
                            renderer.subjectScaleY = subjectScaleYFilter.update(scaleY)
                            renderer.subjectBoost = subjectBoostFilter.update(boost)
                        }
                    }
                    .addOnCompleteListener {
                        bitmap.recycle()
                    }
            } ?: bitmap.recycle()
        }

        glView.setEGLConfigChooser(8, 8, 8, 8, 16, 0)
        glView.setRenderer(renderer)
        glView.renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
        addView(glView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))

        detectDisplayProfile()
    }

    private fun setupPlayer() {
        if (videoUrl.isEmpty()) return
        player?.release()

        val audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .build()

        val builder = ExoPlayer.Builder(context)
        player = builder.build().apply {
            setAudioAttributes(audioAttributes, true)
            
            val mediaItemBuilder = MediaItem.Builder().setUri(videoUrl)
            
            if (drmLicenseUrl.isNotEmpty()) {
                val drmConfiguration = MediaItem.DrmConfiguration.Builder(C.WIDEVINE_UUID)
                    .setLicenseUri(drmLicenseUrl)
                    .build()
                mediaItemBuilder.setDrmConfiguration(drmConfiguration)
            }
            
            setMediaItem(mediaItemBuilder.build())
            repeatMode = Player.REPEAT_MODE_ONE
            prepare()
            playWhenReady = true
            
            addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(state: Int) {
                    dispatchStatusUpdate()
                }
                override fun onIsPlayingChanged(isPlaying: Boolean) {
                    dispatchStatusUpdate()
                }
            })
        }
        
        startProgress()
    }

    private val progressRun = object : Runnable {
        override fun run() {
            dispatchStatusUpdate()
            handler.postDelayed(this, 500)
        }
    }

    private fun startProgress() {
        handler.removeCallbacks(progressRun)
        handler.post(progressRun)
    }

    private fun dispatchStatusUpdate() {
        player?.let { p ->
            val event = Arguments.createMap().apply {
                putDouble("position", p.currentPosition.toDouble())
                putDouble("duration", p.duration.coerceAtLeast(0L).toDouble())
                putBoolean("isPlaying", p.isPlaying)
                putBoolean("isBuffering", p.playbackState == Player.STATE_BUFFERING)
            }
            val reactContext = context as ThemedReactContext
            reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(id, "onPlaybackStatusUpdate", event)
        }
    }

    private fun detectDisplayProfile() {
        val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val activeDisplay: Display? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            context.display ?: windowManager.defaultDisplay
        } else {
            @Suppress("DEPRECATION")
            windowManager.defaultDisplay
        }
        val isHdr = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && (activeDisplay?.isHdr ?: false)
        renderer.profile = if (isHdr) {
            HologramRenderer.DisplayProfile.EMISSIVE
        } else {
            HologramRenderer.DisplayProfile.LCD
        }
        Log.d(TAG, "Display profile: ${renderer.profile} (hdr=$isHdr)")
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        lifecycleRegistry.currentState = Lifecycle.State.STARTED
        lifecycleRegistry.currentState = Lifecycle.State.RESUMED
        glView.onResume()
        player?.play()
        
        rotSensor?.let { sensorMgr.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        gravSensor?.let { sensorMgr.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        accelSensor?.let { sensorMgr.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startFaceTracking()
        }
    }

    override fun onDetachedFromWindow() {
        lifecycleRegistry.currentState = Lifecycle.State.DESTROYED
        glView.onPause()
        player?.pause()
        handler.removeCallbacks(progressRun)
        sensorMgr.unregisterListener(this)
        faceLocked = false
        
        camProvider?.unbindAll()
        camProvider = null
        faceDetector?.close()
        faceDetector = null
        subjectSegmenter?.close()
        subjectSegmenter = null
        cameraExec?.shutdown()
        cameraExec = null
        
        player?.release()
        player = null
        
        super.onDetachedFromWindow()
    }

    override fun onSensorChanged(event: SensorEvent?) {
        event ?: return
        when (event.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> handleAccelerometer(event)
            Sensor.TYPE_GRAVITY -> handleGravity(event)
            Sensor.TYPE_GAME_ROTATION_VECTOR, Sensor.TYPE_ROTATION_VECTOR -> handleRotation(event)
        }
    }

    private fun handleAccelerometer(event: SensorEvent) {
        val ax = event.values[0]
        val ay = event.values[1]
        val az = event.values[2]
        val magnitude = sqrt(ax * ax + ay * ay + az * az)
        accelMagnitude = accelMagnitude * 0.82f + magnitude * 0.18f

        val still = abs(accelMagnitude - SensorManager.GRAVITY_EARTH) < 0.18f
        if (still) {
            if (stableSince == 0L) stableSince = System.currentTimeMillis()
        } else {
            stableSince = 0L
            if (!isFlat && tableTransition > 0f) {
                tableTransition = (tableTransition - 0.02f).coerceAtLeast(0f)
                renderer.tableModeBlend = tableTransition
            }
        }
    }

    private fun handleGravity(event: SensorEvent) {
        val gz = event.values[2]
        val now = System.currentTimeMillis()
        val nowFlat = gz > 9.3f
        val stableLongEnough = stableSince > 0L && (now - stableSince) > stillnessThresholdMs

        if (nowFlat && !isFlat) {
            isFlat = true
            flatSince = now
        } else if (!nowFlat) {
            isFlat = false
            flatSince = 0L
            stableSince = 0L
            faceLocked = false
            if (tableTransition > 0f) {
                tableTransition = (tableTransition - 0.02f).coerceAtLeast(0f)
                renderer.tableModeBlend = tableTransition
            }
        }

        if (isFlat && stableLongEnough && flatSince > 0L && (now - flatSince) > flatThresholdMs) {
            if (tableTransition < 1f) {
                tableTransition = (tableTransition + 0.03f).coerceAtMost(1f)
                renderer.tableModeBlend = tableTransition
            }
        }
    }

    private fun handleRotation(event: SensorEvent) {
        if (faceLocked) return
        val rm = FloatArray(9)
        SensorManager.getRotationMatrixFromVector(rm, event.values)
        val orient = FloatArray(3)
        SensorManager.getOrientation(rm, orient)

        val tx = applyDeadZone((orient[2] * 2.5f).coerceIn(-1f, 1f), 0.015f)
        val ty = applyDeadZone((orient[1] * 2.5f).coerceIn(-1f, 1f), 0.015f)

        renderer.eyeOffsetX = gyroXFilter.update(tx)
        renderer.eyeOffsetY = gyroYFilter.update(ty)
        renderer.eyeDistance += (1.0f - renderer.eyeDistance) * 0.06f
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private fun startFaceTracking() {
        faceTrackingEnabled = true
        faceLocked = false
        if (cameraExec == null) {
            cameraExec = Executors.newSingleThreadExecutor()
        }
        faceDetector?.close()
        subjectSegmenter?.close()

        val options = FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
            .setMinFaceSize(0.25f)
            .build()
        faceDetector = FaceDetection.getClient(options)
        
        val subjectOptions = SubjectSegmenterOptions.Builder()
            .enableForegroundConfidenceMask()
            .build()
        subjectSegmenter = SubjectSegmentation.getClient(subjectOptions)

        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
        cameraProviderFuture.addListener({
            camProvider = cameraProviderFuture.get()
            val analysis = ImageAnalysis.Builder()
                .setTargetResolution(Size(320, 240))
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
            analysis.setAnalyzer(cameraExec!!) { proxy -> processFrame(proxy) }

            try {
                camProvider?.unbindAll()
                camProvider?.bindToLifecycle(this, CameraSelector.DEFAULT_FRONT_CAMERA, analysis)
                Log.d(TAG, "Face tracking active")
            } catch (e: Exception) {
                faceTrackingEnabled = false
                faceLocked = false
                Log.e(TAG, "Camera bind failed: ${e.message}")
            }
        }, ContextCompat.getMainExecutor(context))
    }

    @androidx.camera.core.ExperimentalGetImage
    private fun processFrame(proxy: ImageProxy) {
        val image = proxy.image ?: run {
            proxy.close()
            return
        }
        val ambientSample = sampleAmbientColor(proxy)
        renderer.ambientR += (ambientSample[0] - renderer.ambientR) * 0.08f
        renderer.ambientG += (ambientSample[1] - renderer.ambientG) * 0.08f
        renderer.ambientB += (ambientSample[2] - renderer.ambientB) * 0.08f
        renderer.ambientStrength += (ambientSample[3] - renderer.ambientStrength) * 0.08f
        
        val input = InputImage.fromMediaImage(image, proxy.imageInfo.rotationDegrees)
        var pendingTasks = if (subjectSegmenter != null) 2 else 1
        val finishTask = {
            pendingTasks -= 1
            if (pendingTasks <= 0) {
                proxy.close()
            }
        }

        faceDetector?.process(input)
            ?.addOnSuccessListener { faces ->
                if (faces.isNotEmpty()) {
                    faceLocked = true
                    val bounds = faces[0].boundingBox
                    val iw = input.width.toFloat()
                    val ih = input.height.toFloat()
                    val nx = -((bounds.centerX() / iw) * 2f - 1f)
                    val ny = -((bounds.centerY() / ih) * 2f - 1f)
                    val fw = bounds.width() / iw
                    val fh = bounds.height() / ih
                    val dist = (0.3f / fw.coerceAtLeast(0.05f)).coerceIn(0.5f, 2f)

                    renderer.eyeOffsetX = faceXFilter.update(applyDeadZone(nx.coerceIn(-1f, 1f), 0.01f))
                    renderer.eyeOffsetY = faceYFilter.update(applyDeadZone(ny.coerceIn(-1f, 1f), 0.01f))
                    renderer.eyeDistance = faceZFilter.update(dist)
                } else {
                    faceLocked = false
                }
            }
            ?.addOnFailureListener { faceLocked = false }
            ?.addOnCompleteListener { finishTask() }

        if (subjectSegmenter != null) {
            processSubjectMask(input, finishTask)
        }
    }

    private fun processSubjectMask(input: InputImage, onComplete: () -> Unit) {
        subjectSegmenter?.process(input)
            ?.addOnSuccessListener { result ->
                val buffer = result.foregroundConfidenceMask ?: return@addOnSuccessListener
                val width = input.width
                val height = input.height
                if (width <= 0 || height <= 0) return@addOnSuccessListener

                val stepX = maxOf(1, width / 12)
                val stepY = maxOf(1, height / 12)
                var total = 0f
                var weightX = 0f
                var weightY = 0f

                for (y in 0 until height step stepY) {
                    for (x in 0 until width step stepX) {
                        val index = y * width + x
                        if (index >= buffer.limit()) continue
                        val confidence = buffer.get(index).coerceIn(0f, 1f)
                        total += confidence
                        weightX += confidence * x
                        weightY += confidence * y
                    }
                }

                if (total > 0.01f) {
                    val cx = (weightX / total / width).coerceIn(0.15f, 0.85f)
                    val cy = (weightY / total / height).coerceIn(0.15f, 0.85f)
                    // The camera ambient subject track is just a fallback. The FBO Extractor (onFrameBitmapExtracted) 
                    // will overwrite these with more accurate video content tracking if available.
                    renderer.subjectCenterX = subjectCenterXFilter.update(cx)
                    renderer.subjectCenterY = subjectCenterYFilter.update(cy)
                    renderer.subjectBoost = subjectBoostFilter.update((0.2f + total / 22f).coerceIn(0.18f, 0.7f))
                }
            }
            ?.addOnCompleteListener { onComplete() }
    }

    private fun sampleAmbientColor(proxy: ImageProxy): FloatArray {
        val planes = proxy.planes
        if (planes.size < 3) return floatArrayOf(0.18f, 0.22f, 0.28f, 0.22f)

        val yPlane = planes[0]
        val uPlane = planes[1]
        val vPlane = planes[2]

        val yBuffer = yPlane.buffer.duplicate()
        val uBuffer = uPlane.buffer.duplicate()
        val vBuffer = vPlane.buffer.duplicate()

        val width = proxy.width
        val height = proxy.height
        val yRowStride = yPlane.rowStride
        val yPixelStride = yPlane.pixelStride
        val uvRowStride = uPlane.rowStride
        val uvPixelStride = uPlane.pixelStride

        val sampleGrid = 6
        var sumR = 0f
        var sumG = 0f
        var sumB = 0f
        var sampleCount = 0

        for (gy in 0 until sampleGrid) {
            val py = ((gy + 0.5f) / sampleGrid * (height - 1)).toInt()
            for (gx in 0 until sampleGrid) {
                val px = ((gx + 0.5f) / sampleGrid * (width - 1)).toInt()

                val yIndex = py * yRowStride + px * yPixelStride
                val uvX = px / 2
                val uvY = py / 2
                val uvIndex = uvY * uvRowStride + uvX * uvPixelStride

                if (yIndex >= yBuffer.limit() || uvIndex >= uBuffer.limit() || uvIndex >= vBuffer.limit()) continue

                val y = (yBuffer.get(yIndex).toInt() and 0xFF).toFloat()
                val u = (uBuffer.get(uvIndex).toInt() and 0xFF).toFloat() - 128f
                val v = (vBuffer.get(uvIndex).toInt() and 0xFF).toFloat() - 128f

                val r = ((y + 1.402f * v) / 255f).coerceIn(0f, 1f)
                val g = ((y - 0.344136f * u - 0.714136f * v) / 255f).coerceIn(0f, 1f)
                val b = ((y + 1.772f * u) / 255f).coerceIn(0f, 1f)

                sumR += r
                sumG += g
                sumB += b
                sampleCount++
            }
        }

        if (sampleCount == 0) return floatArrayOf(0.18f, 0.22f, 0.28f, 0.22f)

        val avgR = sumR / sampleCount
        val avgG = sumG / sampleCount
        val avgB = sumB / sampleCount
        val luma = (0.2126f * avgR + 0.7152f * avgG + 0.0722f * avgB).coerceIn(0f, 1f)

        val tintR = (avgR * 0.75f + 0.08f).coerceIn(0f, 1f)
        val tintG = (avgG * 0.8f + 0.12f).coerceIn(0f, 1f)
        val tintB = (avgB * 0.9f + 0.16f).coerceIn(0f, 1f)
        val strength = (0.15f + luma * 0.4f).coerceIn(0.12f, 0.5f)

        return floatArrayOf(tintR, tintG, tintB, strength)
    }

    private fun applyDeadZone(value: Float, deadZone: Float): Float {
        return if (abs(value) < deadZone) 0f else value
    }

    private class ScalarKalmanFilter(
        private val processNoise: Float = 0.004f,
        private val measurementNoise: Float = 0.06f
    ) {
        private var estimate = 0f
        private var errorCovariance = 1f
        private var initialized = false

        fun update(measurement: Float): Float {
            if (!initialized) {
                estimate = measurement
                initialized = true
                return estimate
            }
            errorCovariance += processNoise
            val gain = errorCovariance / (errorCovariance + measurementNoise)
            estimate += gain * (measurement - estimate)
            errorCovariance *= (1f - gain)
            return estimate
        }
    }
}
