
import axios from 'axios';

async function checkSubPlaylist() {
  const url = "https://s21.freecdn4.top/files/220884/1080p/1080p.m3u8?in=unknown::ek";
  console.log(`🚀 Fetching sub-playlist: ${url}`);
  
  try {
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' }
    });
    const content = res.data.toString();
    console.log("--- SUB-PLAYLIST CONTENT ---");
    console.log(content.substring(0, 500));
    console.log("--- END ---");
    
    if (content.includes('AUDIO')) {
      console.log("✅ Audio track reference found in sub-playlist.");
    } else {
      console.log("ℹ️ No explicit audio track in sub-playlist. It might be interleaved in TS segments.");
    }
    
    if (content.includes('.ts')) {
        console.log("✅ TS segments found.");
    }
  } catch (e: any) {
    console.error("❌ Failed to fetch sub-playlist:", e.message);
  }
}

checkSubPlaylist();
