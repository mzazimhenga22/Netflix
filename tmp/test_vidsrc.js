const tmdbId = '24428'; // Avengers

async function scrapeVidsrc() {
  console.log('Fetching vidsrc.to movie embed...');
  try {
    const embedUrl = `https://vidsrc.to/embed/movie/${tmdbId}`;
    let res = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    
    let text = await res.text();
    console.log(`Embed HTML length: ${text.length}`);
    
    // Check if it's cloudflare blocked
    if(text.includes('just a moment') || res.status !== 200) {
      console.log('Blocked by Cloudflare on vidsrc.to');
      return;
    }
    
    const iframeMatch = text.match(/<iframe[^>]+src="([^"]+)"/i);
    if (!iframeMatch) {
        console.log("No iframe found!");
        return;
    }
    
    let iframeUrl = iframeMatch[1];
    if (iframeUrl.startsWith('//')) iframeUrl = 'https:' + iframeUrl;
    console.log("Found iframe URL:", iframeUrl);
    
    res = await fetch(iframeUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Referer': embedUrl
        }
    });
    text = await res.text();
    console.log(`Iframe HTML length: ${text.length}`);
    
    // Look for m3u8 or video source
    const scriptMatch = text.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    if (scriptMatch) {
       for(let s of scriptMatch) {
         if (s.includes('m3u8')) {
           console.log("M3U8 found in script!");
           console.log(s.substring(0, 300));
         }
       }
    }
    
  } catch(e) {
    console.log('Error:', e.message);
  }
}

scrapeVidsrc();
