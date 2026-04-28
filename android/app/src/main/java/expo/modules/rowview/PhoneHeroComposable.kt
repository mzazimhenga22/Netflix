package expo.modules.rowview

import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import kotlinx.coroutines.delay

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun PhoneHeroComposable(
    items: List<Map<String, Any>>,
    spatialEnabled: Boolean = true,
    onPlayPress: (String) -> Unit,
    onListPress: (String) -> Unit,
    onLongPress: (String) -> Unit
) {
    if (items.isEmpty()) return

    val context = LocalContext.current
    val sensorManager = remember { context.getSystemService(android.content.Context.SENSOR_SERVICE) as SensorManager }
    
    var roll by remember { mutableStateOf(0f) }
    var pitch by remember { mutableStateOf(0f) }

    val animatedRoll by animateFloatAsState(
        targetValue = roll,
        animationSpec = spring(dampingRatio = 0.92f, stiffness = 55f),
        label = "hero_roll"
    )
    val animatedPitch by animateFloatAsState(
        targetValue = pitch,
        animationSpec = spring(dampingRatio = 0.92f, stiffness = 55f),
        label = "hero_pitch"
    )
    val cardRotationY by animateFloatAsState(
        targetValue = animatedRoll * 1.15f,
        animationSpec = spring(dampingRatio = 0.88f, stiffness = 65f),
        label = "hero_card_rotation_y"
    )
    val cardRotationX by animateFloatAsState(
        targetValue = -animatedPitch * 1.1f,
        animationSpec = spring(dampingRatio = 0.88f, stiffness = 65f),
        label = "hero_card_rotation_x"
    )
    val imageOffsetX by animateFloatAsState(
        targetValue = -animatedRoll * 6.5f,
        animationSpec = spring(dampingRatio = 0.94f, stiffness = 48f),
        label = "hero_image_offset_x"
    )
    val imageOffsetY by animateFloatAsState(
        targetValue = animatedPitch * 4.5f,
        animationSpec = spring(dampingRatio = 0.94f, stiffness = 48f),
        label = "hero_image_offset_y"
    )
    val contentOffsetX by animateFloatAsState(
        targetValue = animatedRoll * 2.4f,
        animationSpec = spring(dampingRatio = 0.9f, stiffness = 62f),
        label = "hero_content_offset_x"
    )
    val contentOffsetY by animateFloatAsState(
        targetValue = -animatedPitch * 2.6f,
        animationSpec = spring(dampingRatio = 0.9f, stiffness = 62f),
        label = "hero_content_offset_y"
    )
    val ambientHighlightOffsetX by animateFloatAsState(
        targetValue = animatedRoll * 14f,
        animationSpec = spring(dampingRatio = 0.95f, stiffness = 40f),
        label = "hero_highlight_offset_x"
    )
    val ambientHighlightOffsetY by animateFloatAsState(
        targetValue = -animatedPitch * 8f,
        animationSpec = spring(dampingRatio = 0.95f, stiffness = 40f),
        label = "hero_highlight_offset_y"
    )
    val shineOffsetX by animateFloatAsState(
        targetValue = animatedRoll * 18f,
        animationSpec = spring(dampingRatio = 0.96f, stiffness = 38f),
        label = "hero_shine_offset_x"
    )
    val shineOffsetY by animateFloatAsState(
        targetValue = animatedPitch * 6f,
        animationSpec = spring(dampingRatio = 0.96f, stiffness = 38f),
        label = "hero_shine_offset_y"
    )

    DisposableEffect(spatialEnabled) {
        if (!spatialEnabled) {
            roll = 0f
            pitch = 0f
            return@DisposableEffect onDispose {}
        }

        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                if (event.sensor.type == Sensor.TYPE_ROTATION_VECTOR) {
                    val rotationMatrix = FloatArray(9)
                    SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
                    val orientation = FloatArray(3)
                    SensorManager.getOrientation(rotationMatrix, orientation)
                    
                    roll = (Math.toDegrees(orientation[2].toDouble()).toFloat() * 0.72f).coerceIn(-10f, 10f)
                    pitch = (Math.toDegrees(orientation[1].toDouble()).toFloat() * 0.68f).coerceIn(-10f, 10f)
                }
            }
            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
        }
        
        sensorManager.registerListener(listener, sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR), SensorManager.SENSOR_DELAY_GAME)
        
        onDispose { sensorManager.unregisterListener(listener) }
    }

    var currentIndex by remember(items) { mutableIntStateOf(0) }

    // Auto-advance every 5 seconds with a full-card crossfade.
    LaunchedEffect(items, currentIndex) {
        delay(5000L)
        currentIndex = (currentIndex + 1) % items.size
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .shadow(
                elevation = if (spatialEnabled) 22.dp else 12.dp,
                shape = RoundedCornerShape(12.dp),
                ambientColor = Color.Black.copy(alpha = 0.65f),
                spotColor = Color.Black.copy(alpha = 0.85f)
            )
            .graphicsLayer {
                rotationY = cardRotationY
                rotationX = cardRotationX
                scaleX = 1.01f
                scaleY = 1.01f
                cameraDistance = if (spatialEnabled) 18f * density else 12f * density
            }
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFF141414))
    ) {
        Crossfade(
            targetState = currentIndex,
            animationSpec = tween(durationMillis = 700, easing = FastOutSlowInEasing),
            modifier = Modifier.fillMaxSize(),
            label = "hero_card_crossfade"
        ) { page ->
            val item = items[page.coerceIn(0, items.lastIndex)]
            val id = item["id"] as? String ?: ""
            val title = item["title"] as? String ?: ""
            val imageUrl = item["imageUrl"] as? String ?: ""
            val nLogoUrl = item["nLogoUrl"] as? String ?: ""
            val titleLogoUrl = item["titleLogoUrl"] as? String ?: ""
            
            // Casting the categories field carefully because it comes from JS
            val categoriesUncast = item["categories"]
            val categories = if (categoriesUncast is List<*>) {
                categoriesUncast.filterIsInstance<String>()
            } else {
                emptyList()
            }
            
            val isInMyList = item["isInMyList"] as? Boolean ?: false
            val type = item["type"] as? String ?: "tv"

            val interactionSource = remember { MutableInteractionSource() }

            Box(modifier = Modifier
                .fillMaxSize()
                .graphicsLayer { clip = true }
                .combinedClickable(
                    interactionSource = interactionSource,
                    indication = null,
                    onClick = {},
                    onLongClick = { onLongPress(id) }
                )
            ) {
                // Poster Layer (Parallax)
                AsyncImage(
                    model = imageUrl,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxSize()
                        .scale(1.28f)
                        .graphicsLayer {
                            translationX = imageOffsetX
                            translationY = imageOffsetY
                        }
                )

                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .graphicsLayer {
                            translationX = ambientHighlightOffsetX
                            translationY = ambientHighlightOffsetY
                            alpha = if (spatialEnabled) 0.22f else 0.12f
                        }
                        .background(
                            Brush.radialGradient(
                                colors = listOf(
                                    Color.White.copy(alpha = 0.58f),
                                    Color.White.copy(alpha = 0.12f),
                                    Color.Transparent
                                ),
                                radius = 820f
                            )
                        )
                )

                // Gradient Layer
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    Color.Black.copy(alpha = 0.04f),
                                    Color.Transparent,
                                    Color.Black.copy(alpha = 0.42f),
                                    Color.Black.copy(alpha = 0.9f)
                                ),
                                startY = 0f,
                                endY = Float.POSITIVE_INFINITY
                            )
                        )
                )

                // Shine Effect Layer
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .graphicsLayer {
                            translationX = shineOffsetX
                            translationY = shineOffsetY
                            alpha = if (spatialEnabled) 0.18f else 0.08f
                        }
                        .background(
                            Brush.linearGradient(
                                colors = listOf(
                                    Color.Transparent,
                                    Color.White.copy(alpha = 0.28f),
                                    Color.Transparent
                                )
                            )
                        )
                )

                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    Color.Transparent,
                                    Color.Transparent,
                                    Color.Black.copy(alpha = 0.22f)
                                )
                            )
                        )
                )

                // Content Layer
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(bottom = 24.dp, start = 16.dp, end = 16.dp)
                        .graphicsLayer {
                            translationX = contentOffsetX
                            translationY = contentOffsetY
                        },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Bottom
                ) {
                    // N SERIES / F I L M logo
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(bottom = 8.dp)
                    ) {
                        AsyncImage(
                            model = nLogoUrl,
                            contentDescription = null,
                            modifier = Modifier.size(width = 18.dp, height = 28.dp),
                            contentScale = ContentScale.Fit
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        val typeText = if (type.lowercase() == "movie") "F I L M" else "S E R I E S"
                        Text(
                            typeText,
                            color = Color.White.copy(alpha = 0.9f),
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp,
                            letterSpacing = 3.sp
                        )
                    }

                    // TOP 10 Badge
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(bottom = 12.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(22.dp)
                                .background(Color(0xFFE50914), RoundedCornerShape(2.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("TOP", color = Color.White, fontSize = 5.sp, fontWeight = FontWeight.Black, lineHeight = 5.sp)
                                Text("10", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Black, lineHeight = 11.sp)
                            }
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        val categoryText = if (type.lowercase() == "movie") "Movies" else "TV Shows"
                        Text(
                            "#1 in $categoryText Today",
                            color = Color.White,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    // Title OR Logo Art
                    if (titleLogoUrl.isNotEmpty()) {
                        AsyncImage(
                            model = titleLogoUrl,
                            contentDescription = title,
                            contentScale = ContentScale.Fit,
                            modifier = Modifier
                                .fillMaxWidth(0.9f)
                                .height(85.dp)
                        )
                    } else {
                        Text(
                            title.uppercase(),
                            color = Color.White,
                            fontSize = 32.sp,
                            fontWeight = FontWeight.Black,
                            textAlign = TextAlign.Center,
                            lineHeight = 36.sp,
                            letterSpacing = (-1).sp
                        )
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Text(
                        categories.joinToString(" • "),
                        color = Color.White.copy(alpha = 0.95f),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold
                    )

                    Spacer(modifier = Modifier.height(26.dp))

                    // Action Buttons
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = { onPlayPress(id) },
                            colors = ButtonDefaults.buttonColors(containerColor = Color.White),
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(4.dp),
                            contentPadding = PaddingValues(vertical = 12.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.PlayArrow, 
                                contentDescription = null, 
                                tint = Color.Black,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                "Play", 
                                color = Color.Black, 
                                fontWeight = FontWeight.Black, 
                                fontSize = 17.sp
                            )
                        }

                        Button(
                            onClick = { onListPress(id) },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2A2A2A).copy(alpha = 0.9f)),
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(4.dp),
                            contentPadding = PaddingValues(vertical = 12.dp)
                        ) {
                            Icon(
                                imageVector = if (isInMyList) Icons.Default.Check else Icons.Default.Add,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                "My List", 
                                color = Color.White, 
                                fontWeight = FontWeight.Black, 
                                fontSize = 17.sp
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun Modifier.scale(scale: Float): Modifier = this.graphicsLayer(scaleX = scale, scaleY = scale)
