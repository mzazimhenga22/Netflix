async function testSmashy() {
  const tmdbId = '24428';
  console.log('Fetching smashystream...');
  try {
    let res = await fetch(`https://embed.smashystream.com/playere.php?tmdb=${tmdbId}`);
    let text = await res.text();
    console.log(`Length: ${text.length}`);
    
    // Smashystream embeds have source tags or m3u8 in javascript variables.
    if(text.includes('m3u8')) {
        console.log("Found m3u8!");
        const lines = text.split('\n');
        for(let a of lines) if(a.includes('m3u8')) console.log(a.substring(0, 200));
    } else {
        console.log("No m3u8 found immediately, looking for iframes...");
        const iframeMatch = text.match(/<iframe[^>]+src="([^"]+)"/ig);
        if(iframeMatch) console.log(iframeMatch);
    }
    
    // Also test an open API endpoint:
    res = await fetch(`https://vidsrc.su/embed/movie/${tmdbId}`);
    text = await res.text();
    console.log(`\n\nvidsrc.su Length: ${text.length}`);
    if (text.includes('m3u8')) console.log('Found m3u8 in vidsrc.su');
    else console.log('No m3u8 in vidsrc.su');

  } catch(e) { console.log("Error:", e); }
}
testSmashy();
