const fs = require('fs');

async function debugImdb() {
    const imdbId = 'tt4154796'; // Avengers Endgame
    console.log(`1. Fetching title page for ${imdbId}...`);
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5'
    };

    const titleRes = await fetch(`https://www.imdb.com/title/${imdbId}/`, { headers });
    const titleHtml = await titleRes.text();
    
    console.log(`Status: ${titleRes.status}, Length: ${titleHtml.length}`);
    fs.writeFileSync('imdb_debug.html', titleHtml);
    console.log(`Saved to imdb_debug.html`);
}

debugImdb();
