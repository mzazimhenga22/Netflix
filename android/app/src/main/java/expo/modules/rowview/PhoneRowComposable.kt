package expo.modules.rowview

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import coil.compose.AsyncImage

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun PhoneRowComposable(
    items: List<Map<String, Any>>,
    variant: String,
    onItemSelect: (String, String) -> Unit,
    onItemLongPress: ((String, String) -> Unit)? = null
) {
    val configuration = LocalConfiguration.current
    val screenWidth = configuration.screenWidthDp.dp

    val baseWidth = when (variant) {
        "landscape" -> screenWidth * 0.35f
        "square" -> screenWidth * 0.28f
        else -> screenWidth * 0.28f // poster is default
    }

    val baseHeight = when (variant) {
        "landscape" -> baseWidth * 1.4f
        "square" -> baseWidth
        else -> baseWidth * 1.5f
    }

    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxSize()
    ) {
        itemsIndexed(items) { index, item ->
            val id = item["id"] as? String ?: return@itemsIndexed
            val type = item["type"] as? String ?: "movie"
            val title = item["title"] as? String ?: ""
            val imageUrl = item["imageUrl"] as? String ?: ""
            val isLocked = item["isLocked"] as? Boolean ?: false

            val isSquare = variant == "square"

            Card(
                shape = RoundedCornerShape(if (isSquare) 16.dp else 12.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF141414)),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                modifier = Modifier
                    .width(baseWidth)
                    .height(baseHeight)
                    .clip(RoundedCornerShape(if (isSquare) 16.dp else 12.dp))
                    .combinedClickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = { onItemSelect(id, type) },
                        onLongClick = { onItemLongPress?.invoke(id, type) }
                    )
            ) {
                Box(modifier = Modifier.fillMaxSize()) {
                    AsyncImage(
                        model = imageUrl,
                        contentDescription = title,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )

                    if (isLocked) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(Color.Black.copy(alpha = 0.5f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = androidx.compose.material.icons.Icons.Default.Lock,
                                contentDescription = "Locked",
                                tint = Color.White,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}
