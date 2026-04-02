package expo.modules.rowview

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.outlined.ThumbUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage

@Composable
fun GameDetailsComposable(
    id: String,
    title: String,
    subtitle: String,
    description: String,
    heroUrl: String,
    posterUrl: String,
    onBackClick: () -> Unit
) {
    val context = LocalContext.current

    val moreGames = listOf(
        GameItem("dead_cells", "Dead Cells", "Action", "https://image.tmdb.org/t/p/w500/z0iCS5Znx7TeTivPEg4sW1O5BG.jpg", null, null),
        GameItem("sonic", "Sonic Mania Plus", "Action", "https://image.tmdb.org/t/p/w500/8c4a8kE7PizaGQQnditMmI1xbRp.jpg", null, null),
        GameItem("tmnt", "TMNT: Shredder's Revenge", "Action", "https://image.tmdb.org/t/p/w500/5m1tIeG7oQ5g9rQ6XQ0q1Y4G3c.jpg", null, null),
        GameItem("hades", "Hades", "Action", "https://image.tmdb.org/t/p/w500/z0iCS5Znx7TeTivPEg4sW1O5BG.jpg", null, null)
    )

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
    ) {
        // Hero Header
        item {
            Box(modifier = Modifier.fillMaxWidth().height(300.dp)) {
                AsyncImage(model = heroUrl, contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                IconButton(onClick = onBackClick, modifier = Modifier.padding(16.dp).statusBarsPadding().size(40.dp).background(Color.Black.copy(alpha = 0.3f), CircleShape)) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                }
                Box(modifier = Modifier.fillMaxSize().background(Brush.verticalGradient(colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.6f), Color.Black), startY = 300f)))
                AsyncImage(model = posterUrl, contentDescription = null, modifier = Modifier.align(Alignment.BottomCenter).offset(y = 40.dp).size(120.dp).clip(RoundedCornerShape(24.dp)).border(2.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(24.dp)), contentScale = ContentScale.Crop)
            }
            Spacer(modifier = Modifier.height(48.dp))
        }

        // Title and Metadata
        item {
            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(title, color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center, lineHeight = 32.sp)
                Spacer(modifier = Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(subtitle, color = Color.White.copy(alpha = 0.7f), fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.width(8.dp))
                    Box(modifier = Modifier.border(1.dp, Color.White.copy(alpha = 0.5f), RoundedCornerShape(2.dp)).padding(horizontal = 4.dp, vertical = 1.dp)) {
                        Text("12+", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // Action Buttons
        item {
            Column(modifier = Modifier.fillMaxWidth().padding(24.dp)) {
                Button(onClick = {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("market://search?q=$title"))
                    context.startActivity(intent)
                }, modifier = Modifier.fillMaxWidth().height(54.dp), colors = ButtonDefaults.buttonColors(containerColor = Color.White), shape = RoundedCornerShape(4.dp)) {
                    Text("Get Game", color = Color.Black, fontSize = 18.sp, fontWeight = FontWeight.Black)
                }
                Spacer(modifier = Modifier.height(16.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    SecondaryAction(Icons.Default.Add, "My List")
                    SecondaryAction(Icons.Outlined.ThumbUp, "Rate")
                    SecondaryAction(Icons.Default.Share, "Share")
                }
            }
        }

        // Description
        item {
            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp)) {
                Text(description, color = Color.White, fontSize = 15.sp, lineHeight = 22.sp)
                Spacer(modifier = Modifier.height(12.dp))
                Text("Modes: Single Player, Multiplayer", color = Color.White.copy(alpha = 0.5f), fontSize = 14.sp)
            }
        }

        // More Mobile Games Rail
        item {
            Column(modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp)) {
                Text("More Mobile Games", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(horizontal = 24.dp, vertical = 16.dp))
                LazyRow(contentPadding = PaddingValues(horizontal = 24.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    items(moreGames) { game ->
                        Column(modifier = Modifier.width(140.dp)) {
                            AsyncImage(model = game.posterUrl, contentDescription = null, modifier = Modifier.size(140.dp).clip(RoundedCornerShape(16.dp)), contentScale = ContentScale.Crop)
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(game.title, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(game.subtitle, color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp)
                        }
                    }
                }
            }
        }

        // More Details Section
        item {
            Column(modifier = Modifier.fillMaxWidth().padding(24.dp)) {
                Text("More Details", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(bottom = 16.dp))
                DetailRow("Category", "Action", false)
                DetailRow("Maturity Rating", "12+", true)
                DetailRow("Modes", "Single Player (+2 More)", true)
                DetailRow("Internet Required", "Yes", false)
                DetailRow("Compatibility", "Details", true)
                DetailRow("Languages", "English (+32 More)", true)
            }
        }

        item { Spacer(modifier = Modifier.height(100.dp)) }
    }
}

@Composable
fun DetailRow(label: String, value: String, hasChevron: Boolean) {
    Column(modifier = Modifier.fillMaxWidth()) {
        HorizontalDivider(color = Color.White.copy(alpha = 0.1f), thickness = 1.dp)
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(label, color = Color.White.copy(alpha = 0.5f), fontSize = 15.sp)
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (label == "Maturity Rating") {
                    Box(modifier = Modifier.border(1.dp, Color.White.copy(alpha = 0.5f), RoundedCornerShape(2.dp)).padding(horizontal = 4.dp, vertical = 1.dp)) {
                        Text(value, color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                } else {
                    Text(value, color = Color.White, fontSize = 15.sp)
                }
                if (hasChevron) {
                    Icon(Icons.Default.KeyboardArrowRight, contentDescription = null, tint = Color.White.copy(alpha = 0.5f), modifier = Modifier.size(24.dp))
                }
            }
        }
    }
}

@Composable
fun SecondaryAction(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String) {
    Column(modifier = Modifier.width(80.dp).clickable { /* Action */ }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Icon(icon, contentDescription = label, tint = Color.White, modifier = Modifier.size(24.dp))
        Spacer(modifier = Modifier.height(8.dp))
        Text(label, color = Color.White.copy(alpha = 0.6f), fontSize = 12.sp)
    }
}
