import axios from 'axios';

export interface TrailerSource {
  url: string;
  quality: string;
  type: 'mp4' | 'hls' | 'dash' | 'unknown';
}

/**
 * Trailer Service
 * 
 * Fetches trailers from high-speed CDNs.
 * Priority: High-quality IMDb direct links with validation.
 */

export async function fetchImdbTrailer(tmdbId: string | number, type: 'movie' | 'tv' = 'movie'): Promise<TrailerSource[] | null> {
  try {
    // 1. Get IMDb ID from TMDB
    const TMDB_API_KEY = '8baba8ab6b8bbe247645bcae7df63d0d';
    const externalIdsRes = await axios.get(`https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`);
    const imdbId = externalIdsRes.data.imdb_id;

    if (!imdbId) return null;

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      Accept: '*/*',
    };

    /** STEP 1 — Fetch title page */
    console.log(`[Trailers] 📥 Fetching title: ${imdbId}`);
    const titleRes = await fetch(`https://www.imdb.com/title/${imdbId}/`, { headers });
    if (!titleRes.ok) return null;
    const titleHtml = await titleRes.text();

    // Try multiple patterns to find video ID
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
      // Fallback: Try /mediaindex (Video Gallery)
      try {
        const mediaRes = await fetch(`https://www.imdb.com/title/${imdbId}/mediaindex`, { headers });
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
        console.warn(`[Trailers] ❌ Video ID not found for ${imdbId}`);
        return null;
    }
    console.log(`[Trailers] ✅ Video ID found: ${videoId}`);

    /** STEP 2 — Fetch embed page */
    const embedRes = await fetch(`https://www.imdb.com/videoembed/${videoId}`, { headers });
    if (!embedRes.ok) return null;
    const embedHtml = await embedRes.text();

    /** STEP 3 — Look for ANY media URLs (MP4 / HLS / DASH) */
    const candidates: TrailerSource[] = [];

    // MP4
    const mp4Matches = embedHtml.match(/https:[^"' ]+\.mp4[^"' ]*/g);
    mp4Matches?.forEach((url) => candidates.push({ url, type: 'mp4', quality: 'Auto' }));

    // HLS / M3U8
    const m3u8Matches = embedHtml.match(/https:[^"' ]+\.m3u8[^"' ]*/g);
    m3u8Matches?.forEach((url) => candidates.push({ url, type: 'hls', quality: 'Auto' }));

    // DASH
    const dashMatches = embedHtml.match(/https:[^"' ]+\.mpd[^"' ]*/g);
    dashMatches?.forEach((url) => candidates.push({ url, type: 'dash', quality: 'Auto' }));

    if (candidates.length === 0) return null;

    /** STEP 4 — Prefer best format & VALIDATE */
    const sorted = [
      ...candidates.filter(c => c.type === 'hls'),
      ...candidates.filter(c => c.type === 'mp4'),
      ...candidates.filter(c => c.type !== 'hls' && c.type !== 'mp4')
    ];

    for (const candidate of sorted) {
      try {
        console.log(`[Trailers] 🔍 Validating: ${candidate.type} source...`);
        const check = await fetch(candidate.url, { method: 'HEAD', headers });
        if (check.ok) {
          console.log(`[Trailers] ✨ Resolved trailer: ${candidate.url.substring(0, 50)}...`);
          return [candidate];
        }
      } catch (e) {
        console.warn('[Trailers] ⚠️ Validation failed:', e);
      }
    }

    return null;

  } catch (error) {
    console.error('[TrailerService] IMDb scrape failed:', error);
    return null;
  }
}

/**
 * Fallback to KinoCheck or other direct trailer providers if IMDb fails.
 */
export async function fetchKinoCheckTrailer(tmdbId: string | number): Promise<string | null> {
    try {
        const res = await axios.get(`https://kinocheck.com/movie/${tmdbId}`);
        return null; // Not implemented yet
    } catch (e) {
        return null;
    }
}
