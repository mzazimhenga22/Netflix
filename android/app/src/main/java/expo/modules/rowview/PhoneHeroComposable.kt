package expo.modules.rowview

import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
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
import androidx.compose.ui.graphics.vector.ImageVector

@Composable
fun PhoneHeroComposable(
    id: String,
    title: String,
    imageUrl: String,
    nLogoUrl: String,
    categories: List<String>,
    isInMyList: Boolean,
    onPlayPress: () -> Unit,
    onListPress: () -> Unit
) {
    val context = LocalContext.current
    val sensorManager = remember { context.getSystemService(android.content.Context.SENSOR_SERVICE) as SensorManager }
    
    var roll by remember { mutableStateOf(0f) }
    var pitch by remember { mutableStateOf(0f) }

    val animatedRoll by animateFloatAsState(targetValue = roll, animationSpec = spring(stiffness = Spring.StiffnessLow))
    val animatedPitch by animateFloatAsState(targetValue = pitch, animationSpec = spring(stiffness = Spring.StiffnessLow))

    DisposableEffect(Unit) {
        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                if (event.sensor.type == Sensor.TYPE_ROTATION_VECTOR) {
                    val rotationMatrix = FloatArray(9)
                    SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
                    val orientation = FloatArray(3)
                    SensorManager.getOrientation(rotationMatrix, orientation)
                    
                    // roll is around Y, pitch is around X in our coordinate system for the card
                    roll = Math.toDegrees(orientation[2].toDouble()).toFloat().coerceIn(-15f, 15f)
                    pitch = Math.toDegrees(orientation[1].toDouble()).toFloat().coerceIn(-15f, 15f)
                }
            }
            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
        }
        
        sensorManager.registerListener(listener, sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR), SensorManager.SENSOR_DELAY_GAME)
        
        onDispose { sensorManager.unregisterListener(listener) }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .graphicsLayer {
                rotationY = animatedRoll * 0.8f
                rotationX = -animatedPitch * 0.8f
                cameraDistance = 12f * density
            }
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFF141414))
    ) {
        // Poster Layer (Parallax)
        AsyncImage(
            model = imageUrl,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxSize()
                .scale(1.2f)
                .graphicsLayer {
                    translationX = -animatedRoll * 2f
                    translationY = animatedPitch * 2f
                }
        )

        // Gradient Layer
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.5f), Color.Black),
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
                    translationX = animatedRoll * 10f
                    alpha = 0.3f
                }
                .background(
                    Brush.horizontalGradient(
                        colors = listOf(Color.Transparent, Color.White.copy(alpha = 0.2f), Color.Transparent)
                    )
                )
        )

        // Content Layer
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = 24.dp, start = 16.dp, end = 16.dp)
                .graphicsLayer {
                    translationX = animatedRoll * 1.5f
                    translationY = -animatedPitch * 1.5f
                },
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Bottom
        ) {
            // N SERIES logo
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
                Text(
                    "S E R I E S",
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
                Text(
                    "#1 in TV Shows Today",
                    color = Color.White,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            Text(
                title.uppercase(),
                color = Color.White,
                fontSize = 32.sp,
                fontWeight = FontWeight.Black,
                textAlign = TextAlign.Center,
                lineHeight = 36.sp,
                letterSpacing = (-1).sp
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                categories.joinToString(" • "),
                color = Color.White.copy(alpha = 0.95f),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold
            )

            Spacer(modifier = Modifier.height(28.dp))

            // Action Buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = onPlayPress,
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
                    onClick = onListPress,
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

private fun Modifier.scale(scale: Float): Modifier = this.graphicsLayer(scaleX = scale, scaleY = scale)
