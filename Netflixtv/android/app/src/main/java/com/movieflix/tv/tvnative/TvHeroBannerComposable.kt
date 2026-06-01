package com.movieflix.tv.tvnative

import android.graphics.drawable.BitmapDrawable
import android.os.Handler
import android.os.Looper
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.blur
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.SeekParameters
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import androidx.palette.graphics.Palette
import androidx.tv.material3.*
import coil.compose.AsyncImage
import coil.request.ImageRequest
import coil.request.SuccessResult
import coil.ImageLoader
import coil.decode.SvgDecoder
import org.json.JSONObject

/**
 * Skeleton loading state — matches the React Native HeroSkeleton.tsx shimmer.
 * Shown while movie data is null / loading.
 */
@Composable
private fun HeroBannerSkeleton() {
    val transition = rememberInfiniteTransition(label = "shimmer")
    val alpha by transition.animateFloat(
        initialValue = 0.3f,
        targetValue = 0.6f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200),
            repeatMode = RepeatMode.Reverse
        ),
        label = "shimmer_alpha"
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 40.dp, vertical = 12.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .shadow(20.dp, RoundedCornerShape(24.dp))
                .clip(RoundedCornerShape(24.dp))
                .background(Color.White.copy(alpha = 0.05f))
        ) {
            // Shimmer background fill
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.White.copy(alpha = alpha * 0.08f))
            )

            // Gradient overlay
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color.Transparent,
                                Color.Black.copy(alpha = 0.4f),
                                Color.Black.copy(alpha = 0.8f)
                            )
                        )
                    )
            )

            // Content placeholders — bottom-left
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(start = 40.dp, bottom = 40.dp)
            ) {
                // N logo + series badge row
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // N logo placeholder
                    Box(
                        modifier = Modifier
                            .width(24.dp)
                            .height(36.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(Color.White.copy(alpha = alpha * 0.25f))
                    )
                    // "SERIES" text placeholder
                    Box(
                        modifier = Modifier
                            .width(100.dp)
                            .height(14.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(Color.White.copy(alpha = alpha * 0.2f))
                    )
                }

                Spacer(modifier = Modifier.height(15.dp))

                // Title line 1
                Box(
                    modifier = Modifier
                        .width(400.dp)
                        .height(40.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(Color.White.copy(alpha = alpha * 0.3f))
                )

                Spacer(modifier = Modifier.height(8.dp))

                // Title line 2
                Box(
                    modifier = Modifier
                        .width(250.dp)
                        .height(40.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(Color.White.copy(alpha = alpha * 0.3f))
                )

                Spacer(modifier = Modifier.height(20.dp))

                // Metadata pills row
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    listOf(120, 60, 80, 50).forEach { w ->
                        Box(
                            modifier = Modifier
                                .width(w.dp)
                                .height(16.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(Color.White.copy(alpha = alpha * 0.2f))
                        )
                    }
                }
            }

            // Bottom-right badge placeholders
            Column(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 40.dp, bottom = 40.dp),
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Box(
                    modifier = Modifier
                        .width(140.dp)
                        .height(36.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color.White.copy(alpha = alpha * 0.2f))
                )
                Box(
                    modifier = Modifier
                        .width(220.dp)
                        .height(36.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color.White.copy(alpha = alpha * 0.2f))
                )
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
@Composable
fun TvHeroBanner(
    movieData: String?,
    streamUrl: String? = null,
    streamHeaders: String? = null,
    isFocused: Boolean = false,
    isScreenActive: Boolean = true,
    onColorExtracted: ((Int) -> Unit)? = null,
    onPlayClick: (() -> Unit)? = null,
    onMyListClick: (() -> Unit)? = null
) {
    val context = LocalContext.current
    var movie by remember { mutableStateOf<JSONObject?>(null) }
    var dominantColor by remember { mutableStateOf(Color.Black) }
    var logoUrl by remember { mutableStateOf<String?>(null) }
    var isVideoReady by remember { mutableStateOf(false) }
    val mainHandler = remember { Handler(Looper.getMainLooper()) }

    LaunchedEffect(movieData) {
        isVideoReady = false
        logoUrl = null
        if (!movieData.isNullOrEmpty()) {
            try {
                movie = JSONObject(movieData)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    LaunchedEffect(movie) {
        val currentMovie = movie ?: return@LaunchedEffect
        val id = currentMovie.optString("id", "")
        val mediaType = currentMovie.optString("media_type", "movie")
        if (id.isNotEmpty()) {
            val apiKey = "8baba8ab6b8bbe247645bcae7df63d0d"
            val url = "https://api.themoviedb.org/3/$mediaType/$id/images?api_key=$apiKey&include_image_language=en,null"
            
            Thread {
                try {
                    val response = java.net.URL(url).readText()
                    val json = JSONObject(response)
                    val logos = json.optJSONArray("logos")
                    if (logos != null && logos.length() > 0) {
                        var bestPath = ""
                        for (i in 0 until logos.length()) {
                            val l = logos.getJSONObject(i)
                            if (l.optString("iso_639_1") == "en") {
                                bestPath = l.optString("file_path", "")
                                break
                            }
                        }
                        if (bestPath.isEmpty()) bestPath = logos.getJSONObject(0).optString("file_path", "")
                        
                        if (bestPath.isNotEmpty()) {
                            mainHandler.post {
                                logoUrl = "https://image.tmdb.org/t/p/original$bestPath"
                            }
                        }
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }.start()
        }
    }

    // Extract dominant color from backdrop
    LaunchedEffect(movie) {
        val imagePath = movie?.optString("backdrop_path", "").takeUnless { it.isNullOrEmpty() }
            ?: movie?.optString("poster_path", "")
        if (!imagePath.isNullOrEmpty()) {
            try {
                // Use w185 (tiny thumbnail) instead of w780 for color extraction.
                // It's 10x smaller, so it downloads instantly over the network
                // without sacrificing any color palette accuracy.
                val imageUrl = "https://image.tmdb.org/t/p/w185$imagePath"
                val loader = ImageLoader(context)
                val request = ImageRequest.Builder(context)
                    .data(imageUrl)
                    .allowHardware(false)
                    .build()
                val result = loader.execute(request)
                if (result is SuccessResult) {
                    val bitmap = (result.drawable as? BitmapDrawable)?.bitmap
                    if (bitmap != null) {
                        val palette = Palette.from(bitmap).generate()
                        val extracted = palette.getDarkMutedColor(
                            palette.getMutedColor(
                                palette.getDominantColor(android.graphics.Color.BLACK)
                            )
                        )
                        dominantColor = Color(extracted)
                        onColorExtracted?.invoke(extracted)
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    // ExoPlayer for teaser playback — lifecycle managed by DisposableEffect
    var exoPlayer by remember { mutableStateOf<ExoPlayer?>(null) }

    DisposableEffect(streamUrl) {
        val player = if (!streamUrl.isNullOrEmpty()) {
            // Large buffer prevents stutter and rebuffering
            val loadControl = DefaultLoadControl.Builder()
                .setBufferDurationsMs(
                    30_000,  // min buffer before playback starts
                    60_000,  // max buffer to keep in memory
                    2_500,   // buffer required for playback after initial load
                    5_000    // buffer required for playback after rebuffer
                )
                .setPrioritizeTimeOverSizeThresholds(true)
                .build()

            ExoPlayer.Builder(context)
                .setLoadControl(loadControl)
                .build().apply {
                volume = 1f // Full audio for preview
                videoScalingMode = C.VIDEO_SCALING_MODE_SCALE_TO_FIT_WITH_CROPPING
                setSeekParameters(SeekParameters.CLOSEST_SYNC) // Always snap to keyframes

                // Parse headers
                val headers = mutableMapOf<String, String>()
                if (!streamHeaders.isNullOrEmpty()) {
                    try {
                        val hJson = JSONObject(streamHeaders)
                        hJson.keys().forEach { key ->
                            headers[key] = hJson.optString(key, "")
                        }
                    } catch (e: Exception) { /* ignore */ }
                }

                val dataSourceFactory = DefaultHttpDataSource.Factory()
                    .setDefaultRequestProperties(headers)
                    .setConnectTimeoutMs(15_000)
                    .setReadTimeoutMs(15_000)

                val mediaSource = if (streamUrl.contains(".m3u8")) {
                    HlsMediaSource.Factory(dataSourceFactory)
                        .setAllowChunklessPreparation(true)
                        .createMediaSource(MediaItem.fromUri(streamUrl))
                } else {
                    ProgressiveMediaSource.Factory(dataSourceFactory)
                        .createMediaSource(MediaItem.fromUri(streamUrl))
                }

                setMediaSource(mediaSource)

                addListener(object : Player.Listener {
                    override fun onPlaybackStateChanged(playbackState: Int) {
                        if (playbackState == Player.STATE_READY && !isVideoReady) {
                            // Seek to ~2min mark using keyframe snap (no stutter)
                            val dur = duration
                            if (dur > 150_000) {
                                seekTo(120_000L)
                            }
                            play()
                            isVideoReady = true

                            // Stop after 45 seconds
                            mainHandler.postDelayed({
                                try { pause() } catch (e: Exception) { /* ignore */ }
                            }, 45_000)
                        }
                    }
                })

                prepare()
            }
        } else null

        exoPlayer = player

        onDispose {
            player?.release()
            exoPlayer = null
            isVideoReady = false
        }
    }

    var videoProgress by remember { mutableStateOf(0f) }
    LaunchedEffect(isVideoReady, exoPlayer) {
        val player = exoPlayer
        if (isVideoReady && player != null) {
            while (true) {
                val dur = player.duration
                if (dur > 0) {
                    videoProgress = (player.currentPosition.toFloat() / dur.toFloat()).coerceIn(0f, 1f)
                }
                kotlinx.coroutines.delay(100)
            }
        } else {
            videoProgress = 0f
        }
    }

    // Pause / resume based on screen visibility (tab switches)
    LaunchedEffect(isScreenActive, exoPlayer) {
        val player = exoPlayer ?: return@LaunchedEffect
        if (!isScreenActive) {
            try { player.pause() } catch (_: Exception) {}
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(dominantColor)
    ) {
        // Show skeleton while movie data is loading
        if (movie == null) {
            HeroBannerSkeleton()
            return@Box
        }
        Crossfade(targetState = movie, animationSpec = tween(1000), label = "hero_bg") { currentMovie ->
            if (currentMovie != null) {
                val backdropPath = currentMovie.optString("backdrop_path", "")
                val posterPath = currentMovie.optString("poster_path", "")
                val imageUrl = if (backdropPath.isNotEmpty()) {
                    "https://image.tmdb.org/t/p/original$backdropPath"
                } else if (posterPath.isNotEmpty()) {
                    "https://image.tmdb.org/t/p/w780$posterPath"
                } else ""

                val kenBurnsTransition = rememberInfiniteTransition(label = "kenBurns")
                val kenBurnsScale by kenBurnsTransition.animateFloat(
                    initialValue = 1.0f,
                    targetValue = 1.08f,
                    animationSpec = infiniteRepeatable(
                        animation = tween(25000),
                        repeatMode = RepeatMode.Reverse
                    ),
                    label = "kenBurns_scale"
                )

                var contentVisible by remember { mutableStateOf(false) }
                LaunchedEffect(currentMovie) {
                    contentVisible = true
                }

                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 40.dp, vertical = 12.dp)
                        .shadow(20.dp, RoundedCornerShape(24.dp))
                        .border(
                            width = if (isFocused) 2.5.dp else 0.dp,
                            color = if (isFocused) Color.White.copy(alpha = 0.92f) else Color.Transparent,
                            shape = RoundedCornerShape(24.dp)
                        )
                        .clip(RoundedCornerShape(24.dp))
                ) {
                    // Static backdrop image (always visible as fallback)
                    AsyncImage(
                        model = ImageRequest.Builder(context)
                            .data(imageUrl)
                            .crossfade(true)
                            .build(),
                        contentDescription = null,
                        modifier = Modifier.fillMaxSize().scale(kenBurnsScale),
                        contentScale = ContentScale.Crop
                    )

                    // Bottom gradient for readability
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(
                                Brush.verticalGradient(
                                    colors = listOf(
                                        Color.Transparent,
                                        Color.Transparent,
                                        Color.Black.copy(alpha = 0.4f),
                                        Color.Black.copy(alpha = 0.85f)
                                    )
                                )
                            )
                    )

                    // Left gradient
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(
                                Brush.horizontalGradient(
                                    colors = listOf(
                                        Color.Black.copy(alpha = 0.7f),
                                        Color.Black.copy(alpha = 0.3f),
                                        Color.Transparent,
                                        Color.Transparent
                                    ),
                                    startX = 0f,
                                    endX = 1200f
                                )
                            )
                    )

                    // Content overlay
                    currentMovie.let { m ->
                        val title = m.optString("title", m.optString("name", ""))
                        val overview = m.optString("overview", "")
                        val releaseDate = m.optString("release_date", m.optString("first_air_date", ""))
                        val year = if (!releaseDate.isNullOrEmpty() && releaseDate.length >= 4) {
                            try { releaseDate.substring(0, 4) } catch (_: Exception) { "" }
                        } else ""
                        val voteAvg = m.optDouble("vote_average", 0.0)
                        val mediaType = m.optString("media_type", "movie")
                        val popularity = m.optDouble("popularity", 0.0)

                        // Left side: N SERIES badge + title + metadata
                        AnimatedVisibility(
                            visible = contentVisible,
                            enter = slideInVertically(initialOffsetY = { 30 }, animationSpec = tween(800, delayMillis = 150)) + fadeIn(tween(800, delayMillis = 150)),
                            modifier = Modifier
                                .fillMaxHeight()
                                .width(520.dp)
                                .padding(start = 32.dp, bottom = 32.dp)
                                .align(Alignment.BottomStart)
                        ) {
                            Column(
                                verticalArrangement = Arrangement.Bottom
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    AsyncImage(
                                        model = ImageRequest.Builder(LocalContext.current)
                                            .data("file:///android_asset/images/netflix-n-logo.svg")
                                            .decoderFactory(SvgDecoder.Factory())
                                            .build(),
                                        contentDescription = null,
                                        modifier = Modifier.size(24.dp, 36.dp),
                                        contentScale = ContentScale.Fit
                                    )
                                    Text(
                                        text = if (mediaType == "tv") "S E R I E S" else "F I L M",
                                        style = MaterialTheme.typography.labelLarge.copy(
                                            color = Color.White.copy(alpha = 0.9f),
                                            fontWeight = FontWeight.SemiBold,
                                            letterSpacing = 4.sp,
                                            fontSize = 12.sp
                                        )
                                    )
                                }

                                Spacer(modifier = Modifier.height(12.dp))

                                if (!logoUrl.isNullOrEmpty()) {
                                    AsyncImage(
                                        model = ImageRequest.Builder(LocalContext.current)
                                            .data(logoUrl)
                                            .crossfade(true)
                                            .build(),
                                        contentDescription = title,
                                        modifier = Modifier
                                            .height(100.dp)
                                            .widthIn(max = 400.dp),
                                        contentScale = ContentScale.Fit,
                                        alignment = Alignment.CenterStart
                                    )
                                } else {
                                    Text(
                                        text = title,
                                        style = MaterialTheme.typography.headlineLarge.copy(
                                            color = Color.White,
                                            fontWeight = FontWeight.Black,
                                            fontSize = 32.sp,
                                            lineHeight = 36.sp,
                                            shadow = androidx.compose.ui.graphics.Shadow(
                                                color = Color.Black,
                                                blurRadius = 12f
                                            )
                                        ),
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }

                                Spacer(modifier = Modifier.height(10.dp))

                                // Metadata line
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    val genres = mutableListOf<String>()
                                    val genreIds = m.optJSONArray("genre_ids")
                                    if (genreIds != null) {
                                        for (gi in 0 until minOf(genreIds.length(), 2)) {
                                            val genreMap = mapOf(
                                                28 to "Action", 12 to "Adventure", 16 to "Animation",
                                                35 to "Comedy", 80 to "Crime", 99 to "Documentary",
                                                18 to "Drama", 10751 to "Family", 14 to "Fantasy",
                                                27 to "Horror", 9648 to "Mystery", 10749 to "Romance",
                                                878 to "Sci-Fi", 53 to "Thriller", 10752 to "War"
                                            )
                                            genreMap[genreIds.optInt(gi)]?.let { genres.add(it) }
                                        }
                                    }
                                    Text(
                                        text = genres.joinToString(" · ") + if (year.isNotEmpty()) " · $year" else "",
                                        style = MaterialTheme.typography.bodyMedium.copy(
                                            color = Color.White.copy(alpha = 0.8f),
                                            fontSize = 14.sp
                                        )
                                    )
                                    Box(
                                        modifier = Modifier
                                            .background(Color.White.copy(alpha = 0.1f), RoundedCornerShape(4.dp))
                                            .padding(horizontal = 6.dp, vertical = 2.dp)
                                    ) {
                                        Text(
                                            text = "HD",
                                            style = MaterialTheme.typography.labelSmall.copy(color = Color.White, fontSize = 10.sp)
                                        )
                                    }
                                }

                                // Play and My List buttons
                                Row(
                                    modifier = Modifier.padding(top = 20.dp),
                                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    // Play Button
                                    Surface(
                                        onClick = { onPlayClick?.invoke() },
                                        shape = ClickableSurfaceDefaults.shape(shape = RoundedCornerShape(4.dp)),
                                        colors = ClickableSurfaceDefaults.colors(
                                            containerColor = Color.White,
                                            contentColor = Color.Black,
                                            focusedContainerColor = Color.White,
                                            focusedContentColor = Color.Black
                                        ),
                                        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.1f)
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 24.dp, vertical = 10.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            Text("▶", color = Color.Black, fontSize = 16.sp)
                                            Text(
                                                "Play",
                                                style = MaterialTheme.typography.labelLarge.copy(
                                                    color = Color.Black,
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 16.sp
                                                )
                                            )
                                        }
                                    }
                                    
                                    // My List Button
                                    Surface(
                                        onClick = { onMyListClick?.invoke() },
                                        shape = ClickableSurfaceDefaults.shape(shape = RoundedCornerShape(4.dp)),
                                        colors = ClickableSurfaceDefaults.colors(
                                            containerColor = Color.White.copy(alpha = 0.15f),
                                            contentColor = Color.White,
                                            focusedContainerColor = Color.White,
                                            focusedContentColor = Color.Black
                                        ),
                                        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.1f)
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 24.dp, vertical = 10.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            Text("+", fontSize = 20.sp, fontWeight = FontWeight.Medium)
                                            Text(
                                                "My List",
                                                style = MaterialTheme.typography.labelLarge.copy(
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 16.sp
                                                )
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        // Right side: Badges area (Bottom End)
                        AnimatedVisibility(
                            visible = contentVisible,
                            enter = slideInVertically(initialOffsetY = { 30 }, animationSpec = tween(800, delayMillis = 300)) + fadeIn(tween(800, delayMillis = 300)),
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .padding(end = 32.dp, bottom = 32.dp)
                        ) {
                            Column(
                                horizontalAlignment = Alignment.End,
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                // Top 10 / Popularity badge
                                if (popularity > 100) {
                                    Row(
                                        modifier = Modifier
                                            .background(Color.White.copy(alpha = 0.15f), RoundedCornerShape(4.dp))
                                            .border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(4.dp))
                                            .padding(horizontal = 10.dp, vertical = 6.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Text(text = "🔟", style = MaterialTheme.typography.labelSmall.copy(fontSize = 12.sp))
                                        Text(
                                            text = if (mediaType == "tv") "#1 in TV Shows" else "#1 in Movies",
                                            style = MaterialTheme.typography.labelMedium.copy(
                                                color = Color.White,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 12.sp
                                            )
                                        )
                                    }
                                }

                                // Cast badge (mimicking the image)
                                Row(
                                    modifier = Modifier
                                        .background(Color.White.copy(alpha = 0.15f), RoundedCornerShape(4.dp))
                                        .border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(4.dp))
                                        .padding(horizontal = 10.dp, vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Text(text = "★", style = MaterialTheme.typography.labelSmall.copy(color = Color.White, fontSize = 12.sp))
                                    Text(
                                        text = "Top Choice for You",
                                        style = MaterialTheme.typography.labelMedium.copy(
                                            color = Color.White,
                                            fontSize = 12.sp
                                        )
                                    )
                                }
                            }
                        }

                        // Trailer Progress Indicator
                        AnimatedVisibility(
                            visible = isVideoReady,
                            enter = fadeIn(tween(600)),
                            exit = fadeOut(tween(400)),
                            modifier = Modifier
                                .align(Alignment.BottomStart)
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp, vertical = 12.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(2.dp)
                                    .clip(RoundedCornerShape(1.dp))
                                    .background(Color.White.copy(alpha = 0.2f))
                            ) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxHeight()
                                        .fillMaxWidth(videoProgress.coerceIn(0f, 1f))
                                        .background(Color(0xFFE50914))
                                )
                            }
                        }

                        if (isFocused) {
                            Box(
                                modifier = Modifier
                                    .align(Alignment.CenterStart)
                                    .padding(start = 14.dp)
                                    .width(7.dp)
                                    .height(116.dp)
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(Color.White.copy(alpha = 0.95f))
                            )

                            Box(
                                modifier = Modifier
                                    .align(Alignment.CenterEnd)
                                    .padding(end = 14.dp)
                                    .width(7.dp)
                                    .height(116.dp)
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(Color.White.copy(alpha = 0.95f))
                            )
                        }
                    }
                }
            }
        }

        // Video overlay sits OUTSIDE the Crossfade so the PlayerView is never
        // re-created when the movie changes. AnimatedVisibility controls visibility,
        // and the update{} lambda keeps the PlayerView synced with the current player.
        AnimatedVisibility(
            visible = isVideoReady && exoPlayer != null,
            enter = fadeIn(animationSpec = tween(800)),
            exit = fadeOut(animationSpec = tween(400)),
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 40.dp, vertical = 12.dp)
                .clip(RoundedCornerShape(24.dp))
        ) {
            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        player = exoPlayer
                        useController = false
                        resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                        setShutterBackgroundColor(android.graphics.Color.TRANSPARENT)
                    }
                },
                update = { playerView ->
                    // Keep PlayerView in sync if exoPlayer reference changes
                    if (playerView.player !== exoPlayer) {
                        playerView.player = exoPlayer
                    }
                },
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}
