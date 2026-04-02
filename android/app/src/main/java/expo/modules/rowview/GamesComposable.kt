package expo.modules.rowview

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage

@Composable
fun GamesComposable(
    onSearchClick: () -> Unit,
    onGamePress: (id: String) -> Unit
) {
    val sections = listOf(
        GameSection(
            "Trending Now",
            listOf(
                GameItem("gta_sa", "GTA: San Andreas", "Action", "https://image.tmdb.org/t/p/w500/z0iCS5Znx7TeTivPEg4sW1O5BG.jpg", "Top 10", "Netflix Edition"),
                GameItem("hades", "Hades", "Action", "https://image.tmdb.org/t/p/w500/8c4a8kE7PizaGQQnditMmI1xbRp.jpg", "Top 10", "New"),
                GameItem("sonic", "Sonic Mania Plus", "Platformer", "https://image.tmdb.org/t/p/w500/5m1tIeG7oQ5g9rQ6XQ0q1Y4G3c.jpg", "Top 10", null)
            )
        ),
        GameSection(
            "Award-Winning Games",
            listOf(
                GameItem("dead_cells", "Dead Cells", "Roguelike", "https://image.tmdb.org/t/p/w500/x26YpY0izC7H6988pSAn9v9S9mo.jpg", null, "DLC Included"),
                GameItem("spiritfarer", "Spiritfarer", "Simulation", "https://image.tmdb.org/t/p/w500/8c4a8kE7PizaGQQnditMmI1xbRp.jpg", null, "Must Play"),
                GameItem("oxenfree2", "Oxenfree II", "Thriller", "https://image.tmdb.org/t/p/w500/5m1tIeG7oQ5g9rQ6XQ0q1Y4G3c.jpg", null, "Top Pick")
            )
        ),
        GameSection(
            "Action & Adventure",
            listOf(
                GameItem("tmnt", "TMNT: Shredder's Revenge", "Action", "https://image.tmdb.org/t/p/w500/z0iCS5Znx7TeTivPEg4sW1O5BG.jpg", "Top 10", "Multiplayer"),
                GameItem("transformers", "Transformers Forged to Fight", "Action", "https://image.tmdb.org/t/p/w500/x26YpY0izC7H6988pSAn9v9S9mo.jpg", null, "New Update"),
                GameItem("asphalt", "Asphalt Xtreme", "Racing", "https://image.tmdb.org/t/p/w500/5m1tIeG7oQ5g9rQ6XQ0q1Y4G3c.jpg", null, null)
            )
        ),
        GameSection(
            "Strategy & Puzzle",
            listOf(
                GameItem("bloons", "Bloons TD 6", "Strategy", "https://image.tmdb.org/t/p/w500/8c4a8kE7PizaGQQnditMmI1xbRp.jpg", "Top 10", null),
                GameItem("word_trails", "Word Trails", "Puzzle", "https://image.tmdb.org/t/p/w500/z0iCS5Znx7TeTivPEg4sW1O5BG.jpg", null, null),
                GameItem("puzzles", "Netflix Puzzles", "Brain", "https://image.tmdb.org/t/p/w500/x26YpY0izC7H6988pSAn9v9S9mo.jpg", null, "Updated")
            )
        ),
        GameSection(
            "Kids & Family",
            listOf(
                GameItem("peppa", "World of Peppa Pig", "Educational", "https://image.tmdb.org/t/p/w500/z0iCS5Znx7TeTivPEg4sW1O5BG.jpg", "Top 10", "New Update"),
                GameItem("spongebob", "SpongeBob: Get Cooking", "Simulation", "https://image.tmdb.org/t/p/w500/8c4a8kE7PizaGQQnditMmI1xbRp.jpg", null, null),
                GameItem("hello_kitty", "Hello Kitty Happiness", "Simulation", "https://image.tmdb.org/t/p/w500/5m1tIeG7oQ5g9rQ6XQ0q1Y4G3c.jpg", null, null)
            )
        ),
        GameSection(
            "More Mobile Games",
            listOf(
                GameItem("fm24", "Football Manager 2024", "Sports", "https://image.tmdb.org/t/p/w500/x26YpY0izC7H6988pSAn9v9S9mo.jpg", null, "New Season"),
                GameItem("raji", "Raji: An Ancient Epic", "Action", "https://image.tmdb.org/t/p/w500/z0iCS5Znx7TeTivPEg4sW1O5BG.jpg", null, null),
                GameItem("moonlighter", "Moonlighter", "Roguelike", "https://image.tmdb.org/t/p/w500/8c4a8kE7PizaGQQnditMmI1xbRp.jpg", null, null)
            )
        )
    )

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
    ) {
        item { HeaderSection(onSearchClick) }
        item { HeroSection() }
        items(sections) { section -> GameRail(section, onGamePress) }
        item { Spacer(modifier = Modifier.height(100.dp)) }
    }
}

@Composable
fun HeaderSection(onSearchClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text("Games", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black)
        IconButton(onClick = onSearchClick) {
            Icon(Icons.Default.Search, contentDescription = "Search", tint = Color.White, modifier = Modifier.size(28.dp))
        }
    }
}

@Composable
fun HeroSection() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(420.dp)
            .padding(horizontal = 16.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(Brush.verticalGradient(colors = listOf(Color(0xFF4A0E1A), Color(0xFF000000))))
    ) {
        TiltedGallery()
        Column(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Bottom
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(modifier = Modifier.size(18.dp, 28.dp).background(Color(0xFFE50914)))
                Spacer(modifier = Modifier.width(8.dp))
                Text("G A M E S", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
            }
            Spacer(modifier = Modifier.height(12.dp))
            Text("Unlimited access to exclusive games", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center, lineHeight = 28.sp)
            Spacer(modifier = Modifier.height(12.dp))
            Text("No ads. No extra fees. No in-app purchases. Included with your membership.", color = Color.White.copy(alpha = 0.7f), fontSize = 13.sp, textAlign = TextAlign.Center, lineHeight = 18.sp)
        }
    }
}

@Composable
fun TiltedGallery() {
    val icons = listOf(
        "https://image.tmdb.org/t/p/w500/z0iCS5Znx7TeTivPEg4sW1O5BG.jpg",
        "https://image.tmdb.org/t/p/w500/8c4a8kE7PizaGQQnditMmI1xbRp.jpg",
        "https://image.tmdb.org/t/p/w500/5m1tIeG7oQ5g9rQ6XQ0q1Y4G3c.jpg",
        "https://image.tmdb.org/t/p/w500/x26YpY0izC7H6988pSAn9v9S9mo.jpg",
        "https://image.tmdb.org/t/p/w500/8c4a8kE7PizaGQQnditMmI1xbRp.jpg",
        "https://image.tmdb.org/t/p/w500/z0iCS5Znx7TeTivPEg4sW1O5BG.jpg"
    )
    Box(modifier = Modifier.fillMaxWidth().height(260.dp).graphicsLayer { rotationZ = -15f; translationY = -30f }) {
        Column(modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                GameGalleryIcon(icons[0], -8.dp)
                GameGalleryIcon(icons[1], 8.dp)
                GameGalleryIcon(icons[2], -4.dp)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                GameGalleryIcon(icons[3], 15.dp)
                GameGalleryIcon(icons[4], 0.dp)
                GameGalleryIcon(icons[5], -10.dp)
            }
        }
    }
}

@Composable
fun GameGalleryIcon(url: String, offsetY: androidx.compose.ui.unit.Dp) {
    AsyncImage(model = url, contentDescription = null, modifier = Modifier.size(90.dp).offset(y = offsetY).graphicsLayer { rotationX = 25f; rotationY = 8f; shadowElevation = 15f; shape = RoundedCornerShape(16.dp); clip = true }.clip(RoundedCornerShape(16.dp)), contentScale = ContentScale.Crop)
}

@Composable
fun GameRail(section: GameSection, onGamePress: (id: String) -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)) {
        Text(section.title, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            items(section.items) { game -> GameCard(game, onGamePress) }
        }
    }
}

@Composable
fun GameCard(game: GameItem, onGamePress: (id: String) -> Unit) {
    Column(modifier = Modifier.width(130.dp).clickable { onGamePress(game.id) }) {
        Box {
            AsyncImage(model = game.posterUrl, contentDescription = null, modifier = Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(14.dp)), contentScale = ContentScale.Crop)
            if (game.badge1 != null) {
                Box(modifier = Modifier.align(Alignment.TopEnd).padding(5.dp).size(22.dp, 26.dp).background(Color(0xFFE50914), RoundedCornerShape(2.dp)), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("TOP", color = Color.White, fontSize = 5.sp, fontWeight = FontWeight.Black, lineHeight = 5.sp)
                        Text("10", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Black, lineHeight = 10.sp)
                    }
                }
            }
            if (game.badge2 != null) {
                Box(modifier = Modifier.align(Alignment.BottomStart).padding(6.dp).background(Color.White, RoundedCornerShape(3.dp)).padding(horizontal = 5.dp, vertical = 2.dp)) {
                    Text(game.badge2, color = Color(0xFFE50914), fontSize = 10.sp, fontWeight = FontWeight.Black)
                }
            }
        }
        Spacer(modifier = Modifier.height(6.dp))
        Text(game.title, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(game.subtitle, color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

data class GameSection(val title: String, val items: List<GameItem>)
data class GameItem(val id: String, val title: String, val subtitle: String, val posterUrl: String, val badge1: String?, val badge2: String?)
