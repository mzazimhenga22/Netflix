import axios from 'axios';

const NETMIRROR_BASE = 'https://net22.cc';
const NETMIRROR_PLAY = 'https://net52.cc';
const USER_TOKEN = '233123f803cf02184bf6c67e149cdd50';

export interface NetMirrorSource {
  url: string;
  quality: string;
}

type OTTType = 'nf' | 'pv' | 'hs';

export interface NetMirrorTrack {
  file: string;
  label: string;
  kind: string;
}

export interface NetMirrorResponse {
  sources: NetMirrorSource[];
  cookies: string;
  tracks: NetMirrorTrack[];
}

const extractCookies = (setCookieHeader: string | string[] | undefined): string => {
  if (!setCookieHeader) return '';
  const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const cookies: string[] = [];
  headers.forEach(header => {
    const parts = header.split(/,(?=\s*[a-zA-Z0-9_]+=)/);
    parts.forEach(part => {
      const cookie = part.trim().split(';')[0];
      if (cookie && cookie.includes('=')) {
        cookies.push(cookie);
      }
    });
  });
  return cookies.join('; ');
};

/**
 * NetMirror Service for fetching high-speed streams.
 */
export const fetchNetMirrorStream = async (title: string, episode?: number, primaryId?: string, year?: string): Promise<NetMirrorResponse | null> => {
  const platforms: OTTType[] = ['nf', 'pv', 'hs'];
  const timestamp = Math.floor(Date.now() / 1000);

  // Aggressive cleaning: Remove S1E1, Season 1, Episode 1, etc.
  let cleanTitle = title
    .replace(/\sS\d+E\d+/gi, '')
    .replace(/\sS\d+/gi, '')
    .replace(/\sE\d+/gi, '')
    .replace(/\sSeason\s\d+/gi, '')
    .replace(/\sEpisode\s\d+/gi, '')
    .trim();
    
  let targetEp = episode;

  // Fallback: If episode wasn't passed, try to extract it from the title
  if (!targetEp) {
    const epMatch = title.match(/E(\d+)/i) || title.match(/Episode\s(\d+)/i);
    if (epMatch) targetEp = parseInt(epMatch[1]);
  }

  console.log(`[NetMirror V2] 🔍 Searching: "${cleanTitle}" (Year: ${year || 'Any'}, Target Ep: ${targetEp || 'default'}, PrimaryID: ${primaryId || 'N/A'})`);

  for (const ott of platforms) {
    try {
      console.log(`[NetMirror] 🚀 Trying platform: ${ott.toUpperCase()}`);
      
      const sessionRes = await axios.post(`${NETMIRROR_PLAY}/tv/p.php`, `t=${timestamp}`, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `${NETMIRROR_PLAY}/`
        }
      });
      const sessionCookies = extractCookies(sessionRes.headers['set-cookie']);
      const commonCookies = `user_token=${USER_TOKEN}; ott=${ott}; ${sessionCookies}`;

      const searchPath = ott === 'pv' ? '/pv/search.php' : (ott === 'hs' ? '/mobile/hs/search.php' : '/search.php');

      let searchRes = await axios.get(`${NETMIRROR_BASE}${searchPath}`, {
        params: { s: cleanTitle, t: timestamp },
        headers: {
          'Cookie': commonCookies,
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `${NETMIRROR_BASE}/`
        }
      });

      let results = searchRes.data && (searchRes.data.searchResult || searchRes.data);

      if (!Array.isArray(results) || results.length === 0) {
        console.log(`[NetMirror] 🔄 Clean search failed, trying original: "${title}"`);
        searchRes = await axios.get(`${NETMIRROR_BASE}${searchPath}`, {
          params: { s: title, t: timestamp },
          headers: {
            'Cookie': commonCookies,
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': `${NETMIRROR_BASE}/`
          }
        });
        results = searchRes.data && (searchRes.data.searchResult || searchRes.data);
      }

      if (!Array.isArray(results) || results.length === 0) {
        console.log(`[NetMirror] ❌ No results on ${ott.toUpperCase()}`);
        continue;
      }

      // Re-order results to prioritize primaryId if provided
      if (primaryId) {
        const primaryMatch = results.find((r: any) => r.id === primaryId);
        if (primaryMatch) {
          results = [primaryMatch, ...results.filter((r: any) => r.id !== primaryId)];
        }
      }

      // Try matching IDs that actually contain the content.
      for (const movie of results) {
        const movieTitle = movie.t || movie.title || '';
        const movieYear = movie.y || movie.year || '';
        const isPrimary = primaryId && movie.id === primaryId;
        
        console.log(`[NetMirror] 🧐 Testing Match: "${movieTitle}" (${movieYear}) (ID: ${movie.id})${isPrimary ? ' [PRIMARY]' : ''}`);

        // STRICT MATCHING: If we have a primaryId and it doesn't match this result, 
        // AND we have a year mismatch, skip it. This prevents playing Anime instead of Live Action.
        if (primaryId && !isPrimary && year && movieYear) {
          const yearNum = year.toString();
          const movieYearNum = movieYear.toString();
          if (!movieYearNum.includes(yearNum) && !yearNum.includes(movieYearNum)) {
             console.log(`[NetMirror] ⏭️ Skipping year mismatch: Expected ${year}, got ${movieYear}`);
             continue;
          }
        }

        const playRes = await axios.post(`${NETMIRROR_BASE}/play.php`, `id=${movie.id}`, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': commonCookies,
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': `${NETMIRROR_BASE}/`
          }
        });

        const hToken = playRes.data.h;
        if (!hToken || hToken === 'error') {
          console.log(`[NetMirror] ⚠️ Invalid H-Token for ID: ${movie.id}`);
          continue;
        }

        console.log(`[NetMirror] 🔗 Fetching playlist for ID: ${movie.id}, EP: ${targetEp || 'default'}...`);
        const playlistRes = await axios.get(`${NETMIRROR_PLAY}/playlist.php`, {
          params: { id: movie.id, t: timestamp, h: hToken, ott: ott, ep: targetEp },
          headers: {
            'Cookie': `${commonCookies}; hd=on;`,
            'Referer': `${NETMIRROR_PLAY}/`,
            'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer'
          }
        });

        const playlistData = Array.isArray(playlistRes.data) ? playlistRes.data[0] : playlistRes.data;

        if (playlistData && playlistData.sources && playlistData.sources.length > 0) {
          // Validation: Detect dummy playlists
          const testSource = playlistData.sources[0].file;
          const testUrl = testSource.startsWith('http') ? testSource : `${NETMIRROR_PLAY}${testSource}`;
          
          try {
            const checkRes = await axios.get(testUrl, {
              headers: {
                'Cookie': `${commonCookies}; hd=on;`,
                'Referer': `${NETMIRROR_PLAY}/`,
                'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer'
              },
              timeout: 3000
            });
            
            const content = checkRes.data.toString();
            const isDummy = content.includes('https:///');
            const hasVideo = content.includes('#EXT-X-STREAM-INF');
            
            if (isDummy || !hasVideo) {
              console.log(`[NetMirror] ⚠️ Dummy playlist detected for ID: ${movie.id}`);
              // If this was our primary ID and it failed, we might want to be careful about falling back
              // to a completely different show (like Anime vs Live Action).
              // However, title matching usually keeps us in the same "brand".
              continue;
            }
            
            console.log(`[NetMirror] ✨ SUCCESS! Valid stream found for ID: ${movie.id}`);
            
            const tracks: NetMirrorTrack[] = (playlistData.tracks || []).map((t: any) => ({
              file: t.file.startsWith('//') ? `https:${t.file}` : (t.file.startsWith('http') ? t.file : `${NETMIRROR_PLAY}${t.file}`),
              label: t.label || 'Unknown',
              kind: t.kind || 'captions'
            }));

            return {
              sources: playlistData.sources.map((src: any) => ({
                url: src.file.startsWith('http') ? src.file : `${NETMIRROR_PLAY}${src.file}`,
                quality: src.label || 'HD'
              })),
              cookies: `${commonCookies}; hd=on;`,
              tracks: tracks
            };
          } catch (e: any) {
            console.log(`[NetMirror] ⚠️ Source check failed for ID: ${movie.id} - ${e.message}`);
            continue;
          }
        } else {
          console.log(`[NetMirror] ⚠️ Playlist empty or invalid for ID: ${movie.id}`);
        }
      }
    } catch (error: any) {
      console.log(`[NetMirror] 💥 Error on ${ott.toUpperCase()}: ${error.message}`);
      continue;
    }
  }

  console.log(`[NetMirror] 🏁 Finished search. No valid links found.`);
  return null;
};
