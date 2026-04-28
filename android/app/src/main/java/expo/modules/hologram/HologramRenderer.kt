package expo.modules.hologram

import android.graphics.Bitmap
import android.graphics.SurfaceTexture
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.opengl.Matrix
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.ShortBuffer
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.cos
import kotlin.math.sin

class HologramRenderer(private val onSurfaceReady: (SurfaceTexture) -> Unit) :
    GLSurfaceView.Renderer, SurfaceTexture.OnFrameAvailableListener {

    var onFrameBitmapExtracted: ((Bitmap) -> Unit)? = null
    var videoFormat: Int = 0 // 0 = standard, 1 = top-bottom

    private var frameCount = 0
    private var fbo = IntArray(1)
    private var fboTex = IntArray(1)
    private val extractWidth = 160
    private val extractHeight = 120
    private val pixelBuffer = ByteBuffer.allocateDirect(extractWidth * extractHeight * 4).apply {
        order(ByteOrder.LITTLE_ENDIAN)
    }

    private var videoFbo = IntArray(1)
    private var videoFboTex = IntArray(1)
    private val videoFboWidth = 1024
    private val videoFboHeight = 1024

    private var bgFbo = IntArray(1)
    private var bgFboTex = IntArray(1)
    private var inpaintFbo = IntArray(1)
    private var inpaintFboTex = IntArray(1)

    private lateinit var surfaceTexture: SurfaceTexture
    private var textureId = 0
    @Volatile private var updateSurface = false

    @Volatile var eyeOffsetX = 0f
    @Volatile var eyeOffsetY = 0f
    @Volatile var eyeDistance = 1f

    enum class DisplayProfile { EMISSIVE, LCD }
    @Volatile var profile = DisplayProfile.LCD

    @Volatile var tableModeBlend = 0f
    @Volatile var ambientR = 0.18f
    @Volatile var ambientG = 0.22f
    @Volatile var ambientB = 0.28f
    @Volatile var ambientStrength = 0.25f
    @Volatile var subjectCenterX = 0.5f
    @Volatile var subjectCenterY = 0.42f
    @Volatile var subjectScaleX = 0.38f
    @Volatile var subjectScaleY = 0.34f
    @Volatile var subjectBoost = 0.28f

    private var screenWidth = 1
    private var screenHeight = 1

    private val slices = arrayOf(
        floatArrayOf(0.00f, 1.00f, 0.85f),
        floatArrayOf(0.04f, 1.015f, 0.14f),
        floatArrayOf(0.08f, 1.03f, 0.11f),
        floatArrayOf(0.12f, 1.045f, 0.08f),
        floatArrayOf(-0.03f, 0.985f, 0.12f),
        floatArrayOf(-0.06f, 0.97f, 0.09f),
        floatArrayOf(0.16f, 1.06f, 0.06f),
        floatArrayOf(-0.09f, 0.955f, 0.07f)
    )

    private val copyVS = """
        attribute vec4 aPosition;
        attribute vec4 aTextureCoord;
        uniform mat4 uSTMatrix;
        varying vec2 vTC;
        void main() {
            gl_Position = aPosition;
            vTC = (uSTMatrix * aTextureCoord).xy;
        }
    """.trimIndent()

    private val copyFS = """
        #extension GL_OES_EGL_image_external : require
        precision mediump float;
        varying vec2 vTC;
        uniform samplerExternalOES sTexture;
        void main() { gl_FragColor = texture2D(sTexture, vTC); }
    """.trimIndent()

    private val videoVS = """
        uniform mat4 uMVPMatrix;
        attribute vec4 aPosition;
        attribute vec4 aTextureCoord;
        varying vec2 vTC;
        varying vec3 vWP;
        uniform float uVideoFormat;
        uniform sampler2D sTexture;
        
        void main() {
            vec3 pos = aPosition.xyz;
            vTC = aTextureCoord.xy;
            
            if (uVideoFormat > 0.5) {
                vec2 depthTC = vec2(vTC.x, vTC.y * 0.5);
                float depth = texture2D(sTexture, depthTC).r;
                pos.z += (depth - 0.5) * 0.3;
            }
            
            gl_Position = uMVPMatrix * vec4(pos, 1.0);
            vWP = pos;
        }
    """.trimIndent()

    private val videoFS = """
        precision mediump float;
        varying vec2 vTC;
        varying vec3 vWP;
        uniform sampler2D sTexture;
        uniform float uTime;
        uniform float uAlpha;
        uniform float uProfile;
        uniform vec3 uAmbientTint;
        uniform float uAmbientStrength;
        uniform vec2 uSubjectCenter;
        uniform vec2 uSubjectScale;
        uniform float uSubjectBoost;
        uniform float uVideoFormat;
        uniform float uLayer; // 0=all, 1=bg, 2=fg

        void main() {
            vec2 colorTC = vTC;
            if (uVideoFormat > 0.5) {
                float depth = texture2D(sTexture, vec2(vTC.x, vTC.y * 0.5)).r;
                if (uLayer == 1.0 && depth > 0.5) discard;
                if (uLayer == 2.0 && depth <= 0.5) discard;
                colorTC = vec2(vTC.x, 0.5 + vTC.y * 0.5);
            }
            
            vec4 c = texture2D(sTexture, colorTC);
            float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));

            vec2 focusDelta = (vTC - uSubjectCenter) / uSubjectScale;
            float focusMask = 1.0 - smoothstep(0.45, 1.15, length(focusDelta));
            float verticalBias = smoothstep(0.92, 0.18, vTC.y);
            float luminanceMask = smoothstep(0.12, 0.45, luma);
            float mask = clamp(max(luminanceMask, focusMask * 0.75) * verticalBias, 0.0, 1.0);
            vec3 extracted = c.rgb * mask * (1.45 + uSubjectBoost);

            vec2 ts = vec2(1.0 / 720.0, 1.0 / 405.0);
            float lL = dot(texture2D(sTexture, colorTC - vec2(ts.x, 0.0)).rgb, vec3(0.3, 0.59, 0.11));
            float lR = dot(texture2D(sTexture, colorTC + vec2(ts.x, 0.0)).rgb, vec3(0.3, 0.59, 0.11));
            float lU = dot(texture2D(sTexture, colorTC - vec2(0.0, ts.y)).rgb, vec3(0.3, 0.59, 0.11));
            float lD = dot(texture2D(sTexture, colorTC + vec2(0.0, ts.y)).rgb, vec3(0.3, 0.59, 0.11));
            float edge = length(vec2(lR - lL, lD - lU));
            float rim = smoothstep(0.04, 0.18, edge) * 0.45;

            float shimmer = 0.96 + 0.04 * sin(uTime * 14.0 + edge * 40.0 + vTC.x * 15.0);
            extracted *= shimmer;
            extracted += vec3(0.08, 0.55, 0.75) * rim;
            extracted += uAmbientTint * (0.12 + rim * 0.45) * uAmbientStrength;

            vec2 ef = smoothstep(0.0, 0.06, vTC) * smoothstep(0.0, 0.06, 1.0 - vTC);
            float edgeAlpha = ef.x * ef.y;

            if (uProfile > 0.5) {
                vec2 vc = vTC * 2.0 - 1.0;
                float vignette = 1.0 - dot(vc, vc) * 0.4;
                luminanceMask = smoothstep(0.2, 0.55, luma);
                mask = clamp(max(luminanceMask, focusMask * 0.8) * verticalBias, 0.0, 1.0);
                extracted = c.rgb * mask * (1.35 + uSubjectBoost * 0.8);
                extracted += vec3(0.08, 0.55, 0.75) * rim;
                extracted *= shimmer * vignette;
            }

            float a = edgeAlpha * uAlpha * mask * smoothstep(0.01, 0.08, luma + focusMask * 0.12);
            gl_FragColor = vec4(extracted, a);
        }
    """.trimIndent()

    private val inpaintVS = """
        attribute vec4 aPosition;
        attribute vec4 aTextureCoord;
        varying vec2 vTC;
        void main() {
            gl_Position = aPosition;
            vTC = aTextureCoord.xy;
        }
    """.trimIndent()

    private val inpaintFS = """
        precision mediump float;
        varying vec2 vTC;
        uniform sampler2D sTexture;
        uniform vec2 uPixelSize;
        
        void main() {
            vec4 c = texture2D(sTexture, vTC);
            if (c.a > 0.1) {
                gl_FragColor = c;
                return;
            }
            
            vec4 maxCol = vec4(0.0);
            float maxWeight = 0.0;
            // 7x7 algorithmic texture dilation (inpainting)
            for(float y = -3.0; y <= 3.0; y++) {
                for(float x = -3.0; x <= 3.0; x++) {
                    vec4 sample = texture2D(sTexture, vTC + vec2(x, y) * uPixelSize);
                    if (sample.a > 0.1) {
                        float weight = 1.0 / (length(vec2(x,y)) + 1.0);
                        maxCol += sample * weight;
                        maxWeight += weight;
                    }
                }
            }
            
            if (maxWeight > 0.0) {
                gl_FragColor = maxCol / maxWeight;
            } else {
                gl_FragColor = vec4(0.0);
            }
        }
    """.trimIndent()

    private val drawVS = """
        attribute vec4 aPosition;
        attribute vec4 aTextureCoord;
        varying vec2 vTC;
        void main() {
            gl_Position = aPosition;
            vTC = aTextureCoord.xy;
        }
    """.trimIndent()

    private val drawFS = """
        precision mediump float;
        varying vec2 vTC;
        uniform sampler2D sTexture;
        void main() {
            gl_FragColor = texture2D(sTexture, vTC);
        }
    """.trimIndent()

    private var copyProg = 0
    private var videoProg = 0
    private var inpaintProg = 0
    private var drawProg = 0

    private val stMatrix = FloatArray(16)
    private val modelMatrix = FloatArray(16)
    private val viewMatrix = FloatArray(16)
    private val projectionMatrix = FloatArray(16)
    private val mvpMatrix = FloatArray(16)
    private val tempMatrix = FloatArray(16)
    private var t0 = System.nanoTime()

    private val quadVertBuf: FloatBuffer
    private val quadTexBuf: FloatBuffer
    
    private var gridVertCount = 0
    private var gridIndexCount = 0
    private lateinit var gridVertBuf: FloatBuffer
    private lateinit var gridTexBuf: FloatBuffer
    private lateinit var gridIdxBuf: ShortBuffer

    init {
        val quadVerts = floatArrayOf(-1f, 1f, 0f, -1f, -1f, 0f, 1f, -1f, 0f, 1f, 1f, 0f)
        val quadTex = floatArrayOf(0f, 1f, 0f, 0f, 1f, 0f, 1f, 1f)
        quadVertBuf = floatBufferOf(quadVerts)
        quadTexBuf = floatBufferOf(quadTex)
        buildGridMesh()
    }

    private fun buildGridMesh() {
        val segmentsX = 90
        val segmentsY = 90
        val width = 1.4f
        val height = 0.8f
        gridVertCount = (segmentsX + 1) * (segmentsY + 1)
        gridIndexCount = segmentsX * segmentsY * 6
        val verts = FloatArray(gridVertCount * 3)
        val tex = FloatArray(gridVertCount * 2)
        val indices = ShortArray(gridIndexCount)

        var vIdx = 0
        var tIdx = 0
        for (y in 0..segmentsY) {
            val fy = y.toFloat() / segmentsY
            for (x in 0..segmentsX) {
                val fx = x.toFloat() / segmentsX
                verts[vIdx++] = (fx - 0.5f) * width
                verts[vIdx++] = (fy - 0.5f) * height
                verts[vIdx++] = 0f
                tex[tIdx++] = fx
                tex[tIdx++] = 1f - fy
            }
        }

        var iIdx = 0
        for (y in 0 until segmentsY) {
            for (x in 0 until segmentsX) {
                val v0 = (y * (segmentsX + 1) + x).toShort()
                val v1 = (v0 + 1).toShort()
                val v2 = ((y + 1) * (segmentsX + 1) + x).toShort()
                val v3 = (v2 + 1).toShort()
                indices[iIdx++] = v0
                indices[iIdx++] = v2
                indices[iIdx++] = v1
                indices[iIdx++] = v1
                indices[iIdx++] = v2
                indices[iIdx++] = v3
            }
        }
        gridVertBuf = floatBufferOf(verts)
        gridTexBuf = floatBufferOf(tex)
        gridIdxBuf = shortBufferOf(indices)
    }

    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        GLES20.glClearColor(0f, 0f, 0f, 1f)
        GLES20.glEnable(GLES20.GL_BLEND)
        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA)

        copyProg = createProgram(copyVS, copyFS)
        videoProg = createProgram(videoVS, videoFS)
        inpaintProg = createProgram(inpaintVS, inpaintFS)
        drawProg = createProgram(drawVS, drawFS)

        val tex = IntArray(1)
        GLES20.glGenTextures(1, tex, 0)
        textureId = tex[0]
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)
        GLES20.glTexParameterf(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR.toFloat())
        GLES20.glTexParameterf(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR.toFloat())
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)

        surfaceTexture = SurfaceTexture(textureId)
        surfaceTexture.setOnFrameAvailableListener(this)
        Matrix.setIdentityM(stMatrix, 0)
        t0 = System.nanoTime()

        setupFBO(fbo, fboTex, extractWidth, extractHeight)
        setupFBO(videoFbo, videoFboTex, videoFboWidth, videoFboHeight)

        onSurfaceReady(surfaceTexture)
    }

    private fun setupFBO(fboArray: IntArray, texArray: IntArray, w: Int, h: Int) {
        if (fboArray[0] != 0) GLES20.glDeleteFramebuffers(1, fboArray, 0)
        if (texArray[0] != 0) GLES20.glDeleteTextures(1, texArray, 0)
        
        GLES20.glGenFramebuffers(1, fboArray, 0)
        GLES20.glGenTextures(1, texArray, 0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texArray[0])
        GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA, w, h, 0, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, null)
        GLES20.glTexParameterf(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR.toFloat())
        GLES20.glTexParameterf(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR.toFloat())
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, fboArray[0])
        GLES20.glFramebufferTexture2D(GLES20.GL_FRAMEBUFFER, GLES20.GL_COLOR_ATTACHMENT0, GLES20.GL_TEXTURE_2D, texArray[0], 0)
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        screenWidth = width
        screenHeight = height
        GLES20.glViewport(0, 0, width, height)
        setupFBO(bgFbo, bgFboTex, width, height)
        setupFBO(inpaintFbo, inpaintFboTex, width, height)
    }

    override fun onDrawFrame(gl: GL10?) {
        synchronized(this) {
            if (updateSurface) {
                surfaceTexture.updateTexImage()
                surfaceTexture.getTransformMatrix(stMatrix)
                updateSurface = false

                renderOesToFbo(videoFbo[0], videoFboWidth, videoFboHeight)
                if (onFrameBitmapExtracted != null && frameCount % 30 == 0) {
                    renderOesToFbo(fbo[0], extractWidth, extractHeight)
                    extractFrameBitmap()
                }
                frameCount++
            }
        }

        val t = (System.nanoTime() - t0) / 1e9f
        val ratio = screenWidth.toFloat() / screenHeight.toFloat()
        val camX = eyeOffsetX * 1.35f
        val camY = eyeOffsetY * 1.35f
        val camZ = 2.0f + eyeDistance * 1.5f

        val near = 0.5f
        val far  = 20f
        val left   = (-ratio - camX) * near / camZ
        val right  = ( ratio - camX) * near / camZ
        val bottom = (-1f    - camY) * near / camZ
        val top    = ( 1f    - camY) * near / camZ
        Matrix.frustumM(projectionMatrix, 0, left, right, bottom, top, near, far)
        Matrix.setIdentityM(viewMatrix, 0)
        Matrix.translateM(viewMatrix, 0, -camX, -camY, -camZ)

        if (videoFormat == 1) {
            // MULTI-PASS ARCHITECTURE FOR 3D TOPOGRAPHY

            // Pass 1: Render Background into bgFbo
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, bgFbo[0])
            GLES20.glViewport(0, 0, screenWidth, screenHeight)
            GLES20.glClearColor(0f, 0f, 0f, 0f) // Transparent clear
            GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)
            drawVolumetricVideo(t, layer = 1f) // BG only

            // Pass 2: Run Inpainting Shader to fill holes
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, inpaintFbo[0])
            GLES20.glViewport(0, 0, screenWidth, screenHeight)
            GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
            runInpaintingPass()

            // Pass 3: Draw Inpainted Background to Screen
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
            GLES20.glViewport(0, 0, screenWidth, screenHeight)
            GLES20.glClearColor(0f, 0f, 0f, 1f)
            GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)
            drawTextureToScreen(inpaintFboTex[0])

            // Pass 4: Render Foreground onto Screen
            drawVolumetricVideo(t, layer = 2f) // FG only

        } else {
            // STANDARD ARCHITECTURE
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
            GLES20.glViewport(0, 0, screenWidth, screenHeight)
            GLES20.glClearColor(0f, 0f, 0f, 1f)
            GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)
            drawVolumetricVideo(t, layer = 0f)
        }
    }

    private fun runInpaintingPass() {
        GLES20.glUseProgram(inpaintProg)
        val posH = GLES20.glGetAttribLocation(inpaintProg, "aPosition")
        val texH = GLES20.glGetAttribLocation(inpaintProg, "aTextureCoord")
        val pSizeH = GLES20.glGetUniformLocation(inpaintProg, "uPixelSize")

        quadVertBuf.position(0)
        quadTexBuf.position(0)
        GLES20.glEnableVertexAttribArray(posH)
        GLES20.glVertexAttribPointer(posH, 3, GLES20.GL_FLOAT, false, 12, quadVertBuf)
        GLES20.glEnableVertexAttribArray(texH)
        GLES20.glVertexAttribPointer(texH, 2, GLES20.GL_FLOAT, false, 8, quadTexBuf)
        
        GLES20.glUniform2f(pSizeH, 1f / screenWidth.toFloat(), 1f / screenHeight.toFloat())
        
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, bgFboTex[0])
        
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_FAN, 0, 4)
        
        GLES20.glDisableVertexAttribArray(posH)
        GLES20.glDisableVertexAttribArray(texH)
    }

    private fun drawTextureToScreen(texId: Int) {
        GLES20.glUseProgram(drawProg)
        val posH = GLES20.glGetAttribLocation(drawProg, "aPosition")
        val texH = GLES20.glGetAttribLocation(drawProg, "aTextureCoord")

        quadVertBuf.position(0)
        quadTexBuf.position(0)
        GLES20.glEnableVertexAttribArray(posH)
        GLES20.glVertexAttribPointer(posH, 3, GLES20.GL_FLOAT, false, 12, quadVertBuf)
        GLES20.glEnableVertexAttribArray(texH)
        GLES20.glVertexAttribPointer(texH, 2, GLES20.GL_FLOAT, false, 8, quadTexBuf)
        
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texId)
        
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_FAN, 0, 4)
        
        GLES20.glDisableVertexAttribArray(posH)
        GLES20.glDisableVertexAttribArray(texH)
    }

    private fun renderOesToFbo(fboId: Int, width: Int, height: Int) {
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, fboId)
        GLES20.glViewport(0, 0, width, height)
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
        GLES20.glUseProgram(copyProg)
        val posH = GLES20.glGetAttribLocation(copyProg, "aPosition")
        val texH = GLES20.glGetAttribLocation(copyProg, "aTextureCoord")
        val stH = GLES20.glGetUniformLocation(copyProg, "uSTMatrix")
        quadVertBuf.position(0)
        quadTexBuf.position(0)
        GLES20.glEnableVertexAttribArray(posH)
        GLES20.glVertexAttribPointer(posH, 3, GLES20.GL_FLOAT, false, 12, quadVertBuf)
        GLES20.glEnableVertexAttribArray(texH)
        GLES20.glVertexAttribPointer(texH, 2, GLES20.GL_FLOAT, false, 8, quadTexBuf)
        GLES20.glUniformMatrix4fv(stH, 1, false, stMatrix, 0)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_FAN, 0, 4)
        GLES20.glDisableVertexAttribArray(posH)
        GLES20.glDisableVertexAttribArray(texH)
    }

    private fun extractFrameBitmap() {
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, fbo[0])
        pixelBuffer.position(0)
        GLES20.glReadPixels(0, 0, extractWidth, extractHeight, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, pixelBuffer)
        pixelBuffer.position(0)
        val bitmap = Bitmap.createBitmap(extractWidth, extractHeight, Bitmap.Config.ARGB_8888)
        bitmap.copyPixelsFromBuffer(pixelBuffer)
        val matrix = android.graphics.Matrix()
        matrix.preScale(1f, -1f)
        val flipped = Bitmap.createBitmap(bitmap, 0, 0, extractWidth, extractHeight, matrix, false)
        bitmap.recycle()
        onFrameBitmapExtracted?.invoke(flipped)
    }

    override fun onFrameAvailable(surfaceTexture: SurfaceTexture?) {
        synchronized(this) { updateSurface = true }
    }

    private fun drawVolumetricVideo(t: Float, layer: Float) {
        GLES20.glUseProgram(videoProg)

        val posH = GLES20.glGetAttribLocation(videoProg, "aPosition")
        val texH = GLES20.glGetAttribLocation(videoProg, "aTextureCoord")
        val mvpH = GLES20.glGetUniformLocation(videoProg, "uMVPMatrix")
        val timeH = GLES20.glGetUniformLocation(videoProg, "uTime")
        val alphaH = GLES20.glGetUniformLocation(videoProg, "uAlpha")
        val profileH = GLES20.glGetUniformLocation(videoProg, "uProfile")
        val ambientTintH = GLES20.glGetUniformLocation(videoProg, "uAmbientTint")
        val ambientStrengthH = GLES20.glGetUniformLocation(videoProg, "uAmbientStrength")
        val subjectCenterH = GLES20.glGetUniformLocation(videoProg, "uSubjectCenter")
        val subjectScaleH = GLES20.glGetUniformLocation(videoProg, "uSubjectScale")
        val subjectBoostH = GLES20.glGetUniformLocation(videoProg, "uSubjectBoost")
        val formatH = GLES20.glGetUniformLocation(videoProg, "uVideoFormat")
        val layerH = GLES20.glGetUniformLocation(videoProg, "uLayer")

        gridVertBuf.position(0)
        gridTexBuf.position(0)
        gridIdxBuf.position(0)
        GLES20.glEnableVertexAttribArray(posH)
        GLES20.glVertexAttribPointer(posH, 3, GLES20.GL_FLOAT, false, 12, gridVertBuf)
        GLES20.glEnableVertexAttribArray(texH)
        GLES20.glVertexAttribPointer(texH, 2, GLES20.GL_FLOAT, false, 8, gridTexBuf)
        
        GLES20.glUniform1f(timeH, t)
        GLES20.glUniform1f(profileH, if (profile == DisplayProfile.LCD) 1f else 0f)
        GLES20.glUniform3f(ambientTintH, ambientR, ambientG, ambientB)
        GLES20.glUniform1f(ambientStrengthH, ambientStrength)
        GLES20.glUniform2f(subjectCenterH, subjectCenterX, subjectCenterY - tableModeBlend * 0.06f)
        GLES20.glUniform2f(subjectScaleH, subjectScaleX, subjectScaleY + tableModeBlend * 0.08f)
        GLES20.glUniform1f(subjectBoostH, subjectBoost + tableModeBlend * 0.32f)
        GLES20.glUniform1f(formatH, videoFormat.toFloat())
        GLES20.glUniform1f(layerH, layer)
        
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, videoFboTex[0])

        for (slice in slices) {
            Matrix.setIdentityM(modelMatrix, 0)
            val baseDepth = 0.12f + tableModeBlend * 0.42f
            val sliceDepth = (baseDepth + slice[0] * 1.35f).coerceIn(-0.08f, 0.95f)
            val lift = tableModeBlend * 0.02f
            Matrix.translateM(modelMatrix, 0, 0f, lift, sliceDepth)
            Matrix.scaleM(modelMatrix, 0, slice[1], slice[1], 1f)
            Matrix.rotateM(modelMatrix, 0, sin(t * 0.22f) * 0.9f, 0f, 0f, 1f)

            Matrix.multiplyMM(tempMatrix, 0, viewMatrix, 0, modelMatrix, 0)
            Matrix.multiplyMM(mvpMatrix, 0, projectionMatrix, 0, tempMatrix, 0)
            GLES20.glUniformMatrix4fv(mvpH, 1, false, mvpMatrix, 0)
            GLES20.glUniform1f(alphaH, slice[2])
            
            gridIdxBuf.position(0)
            GLES20.glDrawElements(GLES20.GL_TRIANGLES, gridIndexCount, GLES20.GL_UNSIGNED_SHORT, gridIdxBuf)
            
            if (videoFormat == 1) break
        }

        GLES20.glDisableVertexAttribArray(posH)
        GLES20.glDisableVertexAttribArray(texH)
    }

    private fun createProgram(vs: String, fs: String): Int {
        val vertexShader = GLES20.glCreateShader(GLES20.GL_VERTEX_SHADER).also {
            GLES20.glShaderSource(it, vs)
            GLES20.glCompileShader(it)
        }
        val fragmentShader = GLES20.glCreateShader(GLES20.GL_FRAGMENT_SHADER).also {
            GLES20.glShaderSource(it, fs)
            GLES20.glCompileShader(it)
        }
        return GLES20.glCreateProgram().also {
            GLES20.glAttachShader(it, vertexShader)
            GLES20.glAttachShader(it, fragmentShader)
            GLES20.glLinkProgram(it)
        }
    }

    private fun floatBufferOf(values: FloatArray): FloatBuffer =
        ByteBuffer.allocateDirect(values.size * 4).run {
            order(ByteOrder.nativeOrder())
            asFloatBuffer().apply { put(values); position(0) }
        }

    private fun shortBufferOf(values: ShortArray): ShortBuffer =
        ByteBuffer.allocateDirect(values.size * 2).run {
            order(ByteOrder.nativeOrder())
            asShortBuffer().apply { put(values); position(0) }
        }
}
