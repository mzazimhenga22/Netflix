package com.movieflix.tv.tvnative

import android.os.Handler
import android.os.Looper
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.zIndex
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
import androidx.tv.material3.*
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter

import org.json.JSONArray
import org.json.JSONObject

@OptIn(ExperimentalTvMaterial3Api::class)
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
@Composable
fun TvRow(
    viewId: Int,
    title: String?,
    content: String?,
    focusedStreamUrl: String? = null,
    focusedStreamHeaders: String? = null,
    showRank: Boolean = false,
    preferredMovieId: String? = null,
    focusRequestToken: Int = 0,
    reactContext: ReactContext
) {
    var movies by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    val listState = rememberLazyListState()
    var focusedMovieId by remember { mutableStateOf<String?>(null) }
    var focusedMovie by remember { mutableStateOf<JSONObject?>(null) }

    LaunchedEffect(content) {
        if (!content.isNullOrEmpty()) {
            try {
                val array = JSONArray(content)
                val list = mutableListOf<JSONObject>()
                for (i in 0 until array.length()) {
                    list.add(array.getJSONObject(i))
                }
                movies = list
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    // Derive metadata from the focused movie for the info area below the row
    val focusedTitle = focusedMovie?.optString("title", focusedMovie?.optString("name", "") ?: "") ?: ""
    val focusedOverview = focusedMovie?.optString("overview", "") ?: ""
    val focusedReleaseDate = focusedMovie?.optString("release_date", focusedMovie?.optString("first_air_date", "") ?: "") ?: ""
    val focusedYear = if (!focusedReleaseDate.isNullOrEmpty() && focusedReleaseDate.length >= 4) {
        try { focusedReleaseDate.substring(0, 4) } catch (_: Exception) { "" }
    } else ""
    val focusedMediaType = focusedMovie?.optString("media_type", "movie") ?: "movie"
    val focusedRating = focusedMovie?.optString("certification", if (focusedMediaType == "tv") "TV-MA" else "PG-13") ?: "PG-13"
    val focusedGenre = if (focusedMovie != null) primaryGenre(focusedMovie!!) else ""
    val focusedProgress = focusedMovie?.optDouble("_progress", -1.0) ?: -1.0
    val focusedSeasons = focusedMovie?.optInt("number_of_seasons", 0) ?: 0

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
    ) {
        // Row title
        if (!title.isNullOrEmpty()) {
            Text(
                text = title,
                style = MaterialTheme.typography.headlineSmall.copy(
                    color = Color.White.copy(alpha = 0.85f),
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp
                ),
                modifier = Modifier.padding(start = 58.dp, bottom = 10.dp)
            )
        }

        // Card row
        LazyRow(
            state = listState,
            contentPadding = PaddingValues(horizontal = 58.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier
                .fillMaxWidth()
                .height(280.dp)
        ) {
            itemsIndexed(movies, key = { index, item -> item.optString("id", index.toString()) }) { index, movie ->
                val movieId = movie.optString("id", index.toString())
                val isFocusedCard = focusedMovieId == movieId
                val cardStreamUrl = if (isFocusedCard) focusedStreamUrl else null
                val cardStreamHeaders = if (isFocusedCard) focusedStreamHeaders else null
                val progress = movie.optDouble("_progress", -1.0)

                Row(verticalAlignment = Alignment.Top) {
                    if (showRank) {
                        Text(
                            text = "${index + 1}",
                            style = MaterialTheme.typography.displayLarge.copy(
                                color = Color.White.copy(alpha = 0.12f),
                                fontWeight = FontWeight.Black,
                                fontSize = 110.sp
                            ),
                            modifier = Modifier
                                .width(65.dp)
                                .offset(y = 18.dp)
                        )
                    }

                    MovieCard(
                        movie = movie,
                        index = index,
                        streamUrl = cardStreamUrl,
                        streamHeaders = cardStreamHeaders,
                        progress = if (progress >= 0) progress.toFloat() else null,
                        shouldRequestFocus = preferredMovieId == movieId && focusRequestToken > 0,
                        focusRequestToken = focusRequestToken,
                        showRank = showRank,
                        isLocked = movie.optBoolean("isLocked", false),
                        onFocus = {
                            focusedMovieId = movieId
                            focusedMovie = movie
                            emitEvent(reactContext, viewId, "onItemFocus", movie)
                        },
                        onBlur = {
                            if (focusedMovieId == movieId) {
                                focusedMovieId = null
                            }
                        },
                        onClick = {
                            emitEvent(reactContext, viewId, "onItemPress", movie)
                        }
                    )
                }
            }
        }

        // Metadata area below the row (only visible when a card is focused)
        AnimatedVisibility(
            visible = focusedMovie != null,
            enter = expandVertically(animationSpec = tween(400, easing = FastOutSlowInEasing)) +
                    fadeIn(animationSpec = tween(400)),
            exit = shrinkVertically(animationSpec = tween(300, easing = FastOutSlowInEasing)) +
                   fadeOut(animationSpec = tween(300))
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 58.dp, end = 58.dp, top = 10.dp)
            ) {
                // Metadata line: TV Show • Thriller • 2023 • 2 Seasons • TV-MA
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    InfoText(if (focusedMediaType == "tv") "TV Show" else "Movie")
                    DotSeparator()
                    if (focusedGenre.isNotEmpty()) {
                        InfoText(focusedGenre)
                        DotSeparator()
                    }
                    if (focusedYear.isNotEmpty()) {
                        InfoText(focusedYear)
                        DotSeparator()
                    }
                    if (focusedSeasons > 0 && focusedMediaType == "tv") {
                        InfoText("$focusedSeasons Season${if (focusedSeasons > 1) "s" else ""}")
                        DotSeparator()
                    }
                    InfoText(focusedRating)
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Overview text
                if (focusedOverview.isNotEmpty()) {
                    Text(
                        text = focusedOverview,
                        style = MaterialTheme.typography.bodyMedium.copy(
                            color = Color.White.copy(alpha = 0.65f),
                            fontSize = 13.sp,
                            lineHeight = 19.sp
                        ),
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.widthIn(max = 600.dp)
                    )
                }

                // Progress bar for Continue Watching
                if (focusedProgress >= 0 && focusedProgress > 0) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Box(
                        modifier = Modifier
                            .width(200.dp)
                            .height(3.dp)
                            .clip(RoundedCornerShape(2.dp))
                            .background(Color.DarkGray)
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxHeight()
                                .fillMaxWidth(focusedProgress.toFloat().coerceIn(0f, 1f))
                                .background(Color(0xFFE50914))
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
@Composable
fun MovieCard(
    movie: JSONObject,
    index: Int = 0,
    streamUrl: String? = null,
    streamHeaders: String? = null,
    progress: Float? = null,
    shouldRequestFocus: Boolean = false,
    focusRequestToken: Int = 0,
    showRank: Boolean = false,
    isLocked: Boolean = false,
    onFocus: () -> Unit,
    onBlur: () -> Unit,
    onClick: () -> Unit
) {
    val context = LocalContext.current
    var isFocused by remember { mutableStateOf(false) }
    var isVideoReady by remember { mutableStateOf(false) }
    val mainHandler = remember { Handler(Looper.getMainLooper()) }
    val focusRequester = remember { FocusRequester() }

    // Focused card = wide landscape (backdrop), unfocused = portrait poster
    val cardWidth by animateDpAsState(
        targetValue = if (isFocused) 420.dp else 150.dp,
        animationSpec = tween(durationMillis = 380, easing = FastOutSlowInEasing),
        label = "card_width"
    )
    val cardHeight = 260.dp // Fixed height for all cards

    val posterPath = movie.optString("poster_path", "")
    val backdropPath = movie.optString("backdrop_path", "")
    val title = movie.optString("title", movie.optString("name", ""))
    val mediaType = movie.optString("media_type", "movie")

    // Focused = backdrop, unfocused = poster
    val imageUrl = if (isFocused && backdropPath.isNotEmpty()) {
        "https://image.tmdb.org/t/p/w780$backdropPath"
    } else {
        "https://image.tmdb.org/t/p/w500$posterPath"
    }

    var exoPlayer by remember { mutableStateOf<ExoPlayer?>(null) }

    // Only create an ExoPlayer when:
    //   1. This card is currently focused (isFocused == true)
    //   2. A non-empty stream URL has been supplied for this specific card
    //
    // Using only `streamUrl` as the key means the effect re-runs when the URL
    // changes (or goes null). `isFocused` is checked INSIDE the effect rather
    // than in the key — this prevents a spurious player creation on the
    // unfocus→refocus recompose that would otherwise happen if the URL was
    // already set from a previous focus cycle.
    DisposableEffect(streamUrl) {
        // Guard: abort immediately if the card isn't focused or has no URL.
        // This is the primary safety net against multiple simultaneous players.
        if (!isFocused || streamUrl.isNullOrEmpty()) {
            return@DisposableEffect onDispose {
                exoPlayer?.release()
                exoPlayer = null
                isVideoReady = false
            }
        }

        // Large buffer prevents stutter and rebuffering on card previews
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                30_000,  // min buffer
                60_000,  // max buffer
                2_500,   // buffer for playback
                5_000    // buffer for rebuffer
            )
            .setPrioritizeTimeOverSizeThresholds(true)
            .build()

        val player = ExoPlayer.Builder(context)
            .setLoadControl(loadControl)
            .build().apply {
            volume = 0.8f
            videoScalingMode = C.VIDEO_SCALING_MODE_SCALE_TO_FIT_WITH_CROPPING
            setSeekParameters(SeekParameters.CLOSEST_SYNC)

            val headers = mutableMapOf<String, String>()
            if (!streamHeaders.isNullOrEmpty()) {
                try {
                    val hJson = JSONObject(streamHeaders)
                    hJson.keys().forEach { key ->
                        headers[key] = hJson.optString(key, "")
                    }
                } catch (_: Exception) {
                }
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
                        val dur = duration
                        if (dur > 150_000) {
                            seekTo(120_000L)
                        }
                        play()
                        isVideoReady = true

                        // Auto-pause after 30 seconds
                        mainHandler.postDelayed({
                            try { pause() } catch (_: Exception) {}
                        }, 30_000)
                    }
                }
            })

            prepare()
        }

        exoPlayer = player

        onDispose {
            player.release()
            exoPlayer = null
            isVideoReady = false
        }
    }

    LaunchedEffect(shouldRequestFocus, focusRequestToken) {
        if (shouldRequestFocus) {
            try {
                focusRequester.requestFocus()
            } catch (_: Exception) {
            }
        }
    }

    Box(
        modifier = Modifier
            .padding(vertical = 4.dp)
            .zIndex(if (isFocused) 10f else 0f)
    ) {
        Surface(
            onClick = onClick,
            scale = ClickableSurfaceDefaults.scale(focusedScale = 1.08f),
            border = ClickableSurfaceDefaults.border(
                focusedBorder = Border(BorderStroke(2.5.dp, Color.White)),
                border = Border(BorderStroke(0.dp, Color.Transparent))
            ),
            shape = ClickableSurfaceDefaults.shape(shape = RoundedCornerShape(8.dp)),
            modifier = Modifier
                .width(cardWidth)
                .height(cardHeight)
                .clip(RoundedCornerShape(8.dp))
                .focusRequester(focusRequester)
                .onFocusChanged {
                    val wasFocused = isFocused
                    isFocused = it.isFocused
                    if (it.isFocused) onFocus()
                    if (wasFocused && !it.isFocused) onBlur()
                }
        ) {
            Box(modifier = Modifier.fillMaxSize()) {
                // Background image (poster or backdrop)
                AsyncImage(
                    model = ImageRequest.Builder(context)
                        .data(imageUrl)
                        .crossfade(true)
                        .build(),
                    contentDescription = title,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )

                if (isLocked) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color.Black.copy(alpha = 0.5f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "🔒",
                            style = MaterialTheme.typography.displayMedium.copy(
                                fontSize = 48.sp
                            )
                        )
                    }
                }

                // Video overlay when stream is ready (focused card only)
                if (isFocused) {
                    AnimatedVisibility(
                        visible = isVideoReady && exoPlayer != null,
                        enter = fadeIn(animationSpec = tween(600)),
                        exit = fadeOut(animationSpec = tween(300))
                    ) {
                        if (exoPlayer != null) {
                            AndroidView(
                                factory = { ctx ->
                                    PlayerView(ctx).apply {
                                        player = exoPlayer
                                        useController = false
                                        resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                                        setShutterBackgroundColor(android.graphics.Color.TRANSPARENT)
                                    }
                                },
                                modifier = Modifier.fillMaxSize()
                            )
                        }
                    }
                }

                // Gradients on focused card for title readability
                if (isFocused) {
                    // Left gradient
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(
                                Brush.horizontalGradient(
                                    colors = listOf(
                                        Color.Black.copy(alpha = 0.65f),
                                        Color.Black.copy(alpha = 0.25f),
                                        Color.Transparent
                                    )
                                )
                            )
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
                                        Color.Black.copy(alpha = 0.7f)
                                    )
                                )
                            )
                    )
                }

                // Title overlay on focused card (bottom-left, like Netflix reference)
                if (isFocused) {
                    Column(
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .padding(horizontal = 16.dp, vertical = 14.dp)
                    ) {
                        // N SERIES / N FILM badge
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(5.dp)
                        ) {
                            Text(
                                text = "N",
                                style = MaterialTheme.typography.labelLarge.copy(
                                    color = Color(0xFFE50914),
                                    fontWeight = FontWeight.Black,
                                    fontSize = 16.sp
                                )
                            )
                            Text(
                                text = if (mediaType == "tv") "S E R I E S" else "F I L M",
                                style = MaterialTheme.typography.labelSmall.copy(
                                    color = Color.White.copy(alpha = 0.85f),
                                    fontWeight = FontWeight.SemiBold,
                                    letterSpacing = 3.sp,
                                    fontSize = 9.sp
                                )
                            )
                        }

                        Spacer(modifier = Modifier.height(4.dp))

                        // Title text (large, bold — mimics title logo)
                        Text(
                            text = title.uppercase(),
                            style = MaterialTheme.typography.headlineMedium.copy(
                                color = Color.White,
                                fontWeight = FontWeight.Black,
                                fontSize = 22.sp,
                                lineHeight = 24.sp,
                                shadow = Shadow(
                                    color = Color.Black,
                                    blurRadius = 12f
                                )
                            ),
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    // Bottom-right badges: "New Episode", "#1 in TV Shows"
                    Row(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(horizontal = 12.dp, vertical = 14.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        if (mediaType == "tv") {
                            MetaBadge(text = "New Episode", accent = true)
                        }
                        if (showRank) {
                            MetaBadge(text = "#${index + 1} in ${if (mediaType == "tv") "TV Shows" else "Movies"}", isRank = true)
                        }
                    }
                }

                // Title overlay on unfocused cards (centered title text over poster)
                if (!isFocused) {
                    // Subtle bottom gradient for text readability on posters
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(
                                Brush.verticalGradient(
                                    colors = listOf(
                                        Color.Transparent,
                                        Color.Transparent,
                                        Color.Transparent,
                                        Color.Black.copy(alpha = 0.6f)
                                    )
                                )
                            )
                    )
                }

                // Progress bar (Continue Watching)
                if (progress != null && progress > 0f) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(3.dp)
                            .align(Alignment.BottomCenter)
                            .background(Color.DarkGray)
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxHeight()
                                .fillMaxWidth(progress.coerceIn(0f, 1f))
                                .background(Color(0xFFE50914))
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun MetaBadge(
    text: String,
    accent: Boolean = false,
    isRank: Boolean = false
) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .background(
                if (isRank) Color(0xFF333333).copy(alpha = 0.9f)
                else if (accent) Color.White.copy(alpha = 0.16f)
                else Color.White.copy(alpha = 0.1f)
            )
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        if (accent) {
            Canvas(modifier = Modifier.size(7.dp)) {
                drawCircle(
                    color = Color(0xFFE50914),
                    radius = size.minDimension / 2f,
                    center = Offset(size.width / 2f, size.height / 2f)
                )
            }
        }
        if (isRank) {
            // Top 10 icon text
            Text(
                text = "🔟",
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp)
            )
        }

        Text(
            text = text,
            style = MaterialTheme.typography.labelMedium.copy(
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 11.sp
            )
        )
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun InfoText(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall.copy(
            color = Color.White.copy(alpha = 0.7f),
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium
        )
    )
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun DotSeparator() {
    Text(
        text = "\u2022",
        style = MaterialTheme.typography.bodySmall.copy(
            color = Color.White.copy(alpha = 0.4f),
            fontSize = 13.sp
        )
    )
}

private fun primaryGenre(movie: JSONObject): String {
    val genreIds = movie.optJSONArray("genre_ids") ?: return ""
    val genreMap = mapOf(
        28 to "Action",
        12 to "Adventure",
        16 to "Animation",
        35 to "Comedy",
        80 to "Crime",
        99 to "Documentary",
        18 to "Drama",
        10751 to "Family",
        14 to "Fantasy",
        36 to "History",
        27 to "Horror",
        10402 to "Music",
        9648 to "Mystery",
        10749 to "Romance",
        878 to "Sci-Fi",
        53 to "Thriller",
        10752 to "War",
        37 to "Western",
        10759 to "Action",
        10762 to "Kids",
        10763 to "News",
        10764 to "Reality",
        10765 to "Sci-Fi",
        10766 to "Soap",
        10767 to "Talk",
        10768 to "Politics"
    )

    for (i in 0 until genreIds.length()) {
        val value = genreMap[genreIds.optInt(i)]
        if (!value.isNullOrEmpty()) return value
    }

    return ""
}

private fun emitEvent(reactContext: ReactContext, viewId: Int, eventName: String, movie: JSONObject) {
    val event = Arguments.createMap().apply {
        putString("movie", movie.toString())
    }
    reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(viewId, eventName, event)
}
