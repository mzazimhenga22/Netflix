package com.movieflix.tv.tvnative

import android.graphics.drawable.BitmapDrawable
import android.os.Handler
import android.os.Looper
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import org.json.JSONObject

@OptIn(ExperimentalTvMaterial3Api::class)
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
@Composable
fun TvHeroBanner(
    movieData: String?,
    streamUrl: String? = null,
    streamHeaders: String? = null,
    isFocused: Boolean = false,
    onColorExtracted: ((Int) -> Unit)? = null
) {
    val context = LocalContext.current
    var movie by remember { mutableStateOf<JSONObject?>(null) }
    var dominantColor by remember { mutableStateOf(Color.Black) }
    var isVideoReady by remember { mutableStateOf(false) }
    val mainHandler = remember { Handler(Looper.getMainLooper()) }

    LaunchedEffect(movieData) {
        isVideoReady = false
        if (!movieData.isNullOrEmpty()) {
            try {
                movie = JSONObject(movieData)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    // Extract dominant color from backdrop
    LaunchedEffect(movie) {
        val imagePath = movie?.optString("backdrop_path", "").takeUnless { it.isNullOrEmpty() }
            ?: movie?.optString("poster_path", "")
        if (!imagePath.isNullOrEmpty()) {
            try {
                val imageUrl = "https://image.tmdb.org/t/p/w780$imagePath"
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

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(450.dp)
            .background(dominantColor)
            .padding(top = 6.dp)
    ) {
        Crossfade(targetState = movie, animationSpec = tween(1000), label = "hero_bg") { currentMovie ->
            if (currentMovie != null) {
                val backdropPath = currentMovie.optString("backdrop_path", "")
                val posterPath = currentMovie.optString("poster_path", "")
                val imageUrl = if (backdropPath.isNotEmpty()) {
                    "https://image.tmdb.org/t/p/original$backdropPath"
                } else if (posterPath.isNotEmpty()) {
                    "https://image.tmdb.org/t/p/w780$posterPath"
                } else ""

                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 40.dp, vertical = 12.dp)
                        .border(
                            width = if (isFocused) 2.5.dp else 0.dp,
                            color = if (isFocused) Color.White.copy(alpha = 0.92f) else Color.Transparent,
                            shape = RoundedCornerShape(16.dp)
                        )
                        .clip(RoundedCornerShape(16.dp))
                ) {
                    // Static backdrop image (always visible as fallback)
                    AsyncImage(
                        model = ImageRequest.Builder(context)
                            .data(imageUrl)
                            .crossfade(true)
                            .build(),
                        contentDescription = null,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )

                    // Bottom gradient
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(
                                Brush.verticalGradient(
                                    colors = listOf(
                                        Color.Transparent,
                                        Color.Transparent,
                                        Color.Black.copy(alpha = 0.3f),
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
                        Column(
                            modifier = Modifier
                                .fillMaxHeight()
                                .width(520.dp)
                                .padding(start = 40.dp, bottom = 24.dp),
                            verticalArrangement = Arrangement.Bottom
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Text(
                                    text = "N",
                                    style = MaterialTheme.typography.titleLarge.copy(
                                        color = Color(0xFFE50914),
                                        fontWeight = FontWeight.Black,
                                        fontSize = 28.sp
                                    )
                                )
                                Text(
                                    text = if (mediaType == "tv") "S E R I E S" else "F I L M",
                                    style = MaterialTheme.typography.labelLarge.copy(
                                        color = Color.White.copy(alpha = 0.9f),
                                        fontWeight = FontWeight.SemiBold,
                                        letterSpacing = 4.sp,
                                        fontSize = 14.sp
                                    )
                                )
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            Text(
                                text = title,
                                style = MaterialTheme.typography.headlineLarge.copy(
                                    color = Color.White,
                                    fontWeight = FontWeight.Black,
                                    fontSize = 36.sp,
                                    lineHeight = 40.sp,
                                    shadow = androidx.compose.ui.graphics.Shadow(
                                        color = Color.Black,
                                        blurRadius = 12f
                                    )
                                ),
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                            )

                            Spacer(modifier = Modifier.height(10.dp))

                            // Metadata line: Genre • Year • Rating
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                // Genre
                                val genreIds = m.optJSONArray("genre_ids")
                                val genreMap = mapOf(
                                    28 to "Action", 12 to "Adventure", 16 to "Animation",
                                    35 to "Comedy", 80 to "Crime", 99 to "Documentary",
                                    18 to "Drama", 10751 to "Family", 14 to "Fantasy",
                                    27 to "Horror", 9648 to "Mystery", 10749 to "Romance",
                                    878 to "Sci-Fi", 53 to "Thriller", 10752 to "War",
                                    10759 to "Action", 10762 to "Kids", 10765 to "Sci-Fi"
                                )
                                val genres = mutableListOf<String>()
                                if (genreIds != null) {
                                    for (gi in 0 until minOf(genreIds.length(), 2)) {
                                        genreMap[genreIds.optInt(gi)]?.let { genres.add(it) }
                                    }
                                }
                                if (genres.isNotEmpty()) {
                                    Text(
                                        text = genres.joinToString(" · "),
                                        style = MaterialTheme.typography.bodyMedium.copy(
                                            color = Color.White.copy(alpha = 0.7f),
                                            fontSize = 13.sp
                                        )
                                    )
                                    Text(text = "•", style = MaterialTheme.typography.bodyMedium.copy(color = Color.White.copy(alpha = 0.4f)))
                                }
                                if (year.isNotEmpty()) {
                                    Text(text = year, style = MaterialTheme.typography.bodyMedium.copy(color = Color.White.copy(alpha = 0.7f), fontSize = 13.sp))
                                    Text(text = "•", style = MaterialTheme.typography.bodyMedium.copy(color = Color.White.copy(alpha = 0.4f)))
                                }
                                if (voteAvg > 0) {
                                    Text(
                                        text = "★ ${String.format("%.1f", voteAvg)}",
                                        style = MaterialTheme.typography.bodyMedium.copy(
                                            color = Color(0xFFFFD700),
                                            fontSize = 13.sp
                                        )
                                    )
                                }
                            }
                        }

                        AnimatedVisibility(
                            visible = isFocused,
                            enter = fadeIn(animationSpec = tween(180)),
                            exit = fadeOut(animationSpec = tween(120))
                        ) {
                            Row(
                                modifier = Modifier
                                    .align(Alignment.BottomStart)
                                    .padding(start = 40.dp, bottom = 28.dp),
                                horizontalArrangement = Arrangement.spacedBy(14.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(999.dp))
                                        .background(Color.White)
                                        .padding(horizontal = 26.dp, vertical = 14.dp)
                                ) {
                                    Text(
                                        text = "Play",
                                        style = MaterialTheme.typography.titleMedium.copy(
                                            color = Color(0xFF090909),
                                            fontWeight = FontWeight.ExtraBold,
                                            fontSize = 18.sp
                                        )
                                    )
                                }

                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(999.dp))
                                        .background(Color.White.copy(alpha = 0.16f))
                                        .border(
                                            width = 1.dp,
                                            color = Color.White.copy(alpha = 0.34f),
                                            shape = RoundedCornerShape(999.dp)
                                        )
                                        .padding(horizontal = 24.dp, vertical = 14.dp)
                                ) {
                                    Text(
                                        text = "My List",
                                        style = MaterialTheme.typography.titleMedium.copy(
                                            color = Color.White,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 18.sp
                                        )
                                    )
                                }
                            }
                        }

                    // Bottom-right badges area
                    Row(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(end = 50.dp, bottom = 28.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            // Top 10 badge (show for high popularity)
                            if (popularity > 100) {
                                Row(
                                    modifier = Modifier
                                        .background(
                                            Color(0xFF333333).copy(alpha = 0.85f),
                                            RoundedCornerShape(4.dp)
                                        )
                                        .padding(horizontal = 10.dp, vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Text(
                                        text = "🔟",
                                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 12.sp)
                                    )
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
                .clip(RoundedCornerShape(16.dp))
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
