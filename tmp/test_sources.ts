
import axios from 'axios';

async function testSources() {
  const tmdbId = '550';
  const sources = [
    { name: 'VidLink', url: `https://vidlink.pro/embed/movie/${tmdbId}` },
    { name: 'Vidsrc.to', url: `https://vidsrc.to/embed/movie/${tmdbId}` },
    { name: 'Vidsrc.me', url: `https://vidsrc.me/embed/movie/${tmdbId}` },
    { name: 'Embed.su', url: `https://embed.su/embed/movie/${tmdbId}` },
  ];

  for (const s of sources) {
    try {
      const start = Date.now();
      const res = await axios.get(s.url, { timeout: 5000 });
      const duration = Date.now() - start;
      console.log(`[${s.name}] Status: ${res.status}, Time: ${duration}ms, Length: ${res.data.length}`);
      
      if (res.data.includes('.m3u8')) {
        console.log(`[${s.name}] Found M3U8 in HTML!`);
      }
    } catch (e: any) {
      console.log(`[${s.name}] Failed: ${e.message}`);
    }
  }
}

testSources();
