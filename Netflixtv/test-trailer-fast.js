async function scrapeImdbTrailer(imdb_id) {
  if (!imdb_id) return null;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    Accept: '*/*',
  };

  try {
    console.log(`1. Fetching title page for ${imdb_id}...`);
    const titleRes = await fetch(`https://www.imdb.com/title/${imdb_id}/`, { headers });
    if (!titleRes.ok) return null;
    const titleHtml = await titleRes.text();

    let videoId = null;
    const patterns = [
      /\/video\/(vi\d+)/,
      /\"video\":\s*\"(vi\d+)\"/,
      /\"videoId\":\s*\"(vi\d+)\"/,
      /data-video-id=\"(vi\d+)\"/,
      /href=\"\/video\/(vi\d+)/
    ];

    for (const p of patterns) {
      const m = titleHtml.match(p);
      if (m) {
        videoId = m[1];
        break;
      }
    }

    if (!videoId) {
      console.log(`   -> No videoId on title page, trying mediaindex...`);
      try {
        const mediaRes = await fetch(`https://www.imdb.com/title/${imdb_id}/mediaindex`, { headers });
        if (mediaRes.ok) {
          const mediaHtml = await mediaRes.text();
          const m = mediaHtml.match(/\/video\/(vi\d+)/);
          if (m) {
            videoId = m[1];
          } else {
            const m2 = mediaHtml.match(/data-video-id=\"(vi\d+)\"/);
            if (m2) videoId = m2[1];
          }
        }
      } catch (e) {}
    }

    if (!videoId) {
        console.log("   ❌ Could not find videoId anywhere.");
        return null;
    }
    console.log(`   -> Found Video ID: ${videoId}`);

    console.log(`2. Fetching embed page /videoembed/${videoId}...`);
    const embedRes = await fetch(`https://www.imdb.com/videoembed/${videoId}`, { headers });
    if (!embedRes.ok) {
        console.log(`   ❌ Embed page returned ${embedRes.status}`);
        return null;
    }
    const embedHtml = await embedRes.text();

    const candidates = [];

    const mp4Matches = embedHtml.match(/https:[^"' ]+\.mp4[^"' ]*/g);
    mp4Matches?.forEach((url) => candidates.push({ url, type: 'mp4' }));

    const m3u8Matches = embedHtml.match(/https:[^"' ]+\.m3u8[^"' ]*/g);
    m3u8Matches?.forEach((url) => candidates.push({ url, type: 'hls' }));

    const dashMatches = embedHtml.match(/https:[^"' ]+\.mpd[^"' ]*/g);
    dashMatches?.forEach((url) => candidates.push({ url, type: 'dash' }));

    if (candidates.length === 0) {
      console.log("   ❌ No media URLs found in embed HTML.");
      return null;
    }
    
    // Deduplicate
    const uniqueCandidates = [...new Map(candidates.map(item => [item.url, item])).values()];
    console.log(`   -> Found ${uniqueCandidates.length} potential streams.`);

    const sorted = [
      ...uniqueCandidates.filter(c => c.type === 'hls'),
      ...uniqueCandidates.filter(c => c.type === 'mp4'),
      ...uniqueCandidates.filter(c => c.type !== 'hls' && c.type !== 'mp4')
    ];

    for (const candidate of sorted) {
      try {
        console.log(`3. Validating ${candidate.type} stream...`);
        const check = await fetch(candidate.url, { method: 'HEAD', headers });
        if (check.ok) {
          console.log(`✅ Valid stream found: ${candidate.url.substring(0, 80)}...`);
          return candidate;
        }
      } catch (e) {
        console.warn('   ⚠️ Validation failed:', e.message);
      }
    }

    return null;
  } catch (err) {
    console.error('IMDb trailer scrape failed:', err);
    return null;
  }
}

async function runTest() {
    const tmdbId = 299534; // Avengers Endgame
    console.log(`0. Fetching TMDB external IDs for ${tmdbId}...`);
    const tmdbRes = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/external_ids?api_key=8baba8ab6b8bbe247645bcae7df63d0d`);
    const tmdbData = await tmdbRes.json();
    const imdbId = tmdbData.imdb_id;
    console.log(`   -> Found IMDb ID: ${imdbId}`);
    
    if (imdbId) {
        await scrapeImdbTrailer(imdbId);
    }
}

runTest();
