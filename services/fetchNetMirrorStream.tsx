import axios from 'axios';
import { Buffer } from 'buffer';

const NETMIRROR_MIRRORS = [
  'https://netfree.cc',
  'https://net23.cc',
  'https://net22.cc',
  'https://net24.cc',
  'https://netmirror.vip'
];
const generateSessionToken = () => {
  // Generate a random 32-character hex string (MD5-like) to bypass shared user token rate limits
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
};

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
  usedMirror?: string; // The mirror base URL used for this session
  fallbackHostname?: string;
  isRateLimited?: boolean; // True if CDN is serving error slideshow
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
export const fetchNetMirrorStream = async (
  title: string, 
  episode?: number, 
  primaryId?: string, 
  year?: string,
  seasonEpisode?: number  // The per-season episode number (e.g., E3 of Season 2)
): Promise<NetMirrorResponse | null> => {
  const platforms: OTTType[] = ['nf', 'pv', 'hs'];
  const timestamp = Math.floor(Date.now() / 1000);
  
  // Every time we fetch a stream, generate a brand new token to bypass API burst connection rate limits
  // React 18 Strict Mode mounts twice, meaning if we used a shared token, 2 parallel requests would
  // hit the API with the same token, instantly getting banned and returning a "Too many requests" video.
  const USER_TOKEN = generateSessionToken();

  // Aggressive cleaning: Remove S1E1, Season 1, Episode 1, etc.
  // ALSO: Remove "Tyler Perry's" and similar prefixes that break search results
  let cleanTitle = title
    .replace(/Tyler Perry's\s+/gi, '')
    .replace(/Tyler Perry presents\s+/gi, '')
    .replace(/\s+S\d+E\d+/gi, '')
    .replace(/\s+S\d+/gi, '')
    .replace(/\s+E\d+/gi, '')
    .replace(/\s+Season\s+\d+/gi, '')
    .replace(/\s+Episode\s+\d+/gi, '')
    .replace(/\s+-\s*$/g, '') // Remove trailing hyphen with leading space
    .replace(/[:\-]$/g, '')   // Remove any remaining trailing colon or hyphen
    .trim();
    
  // Build list of episode numbers to try, in priority order:
  // 1. Per-season episode number (what OTT platforms typically use)
  // 2. Absolute episode number (fallback)
  const epCandidates: (number | undefined)[] = [];
  if (seasonEpisode) epCandidates.push(seasonEpisode);
  if (episode && episode !== seasonEpisode) epCandidates.push(episode);

  // Fallback: If nothing was passed, try to extract from the title
  if (epCandidates.length === 0) {
    const epMatch = title.match(/E(\d+)/i) || title.match(/Episode\s(\d+)/i);
    if (epMatch) epCandidates.push(parseInt(epMatch[1]));
  }
  if (epCandidates.length === 0) epCandidates.push(undefined);

  console.log(`[NetMirror V2] 🔍 Searching: "${cleanTitle}" (Year: ${year || 'Any'}, SeasonEp: ${seasonEpisode || 'N/A'}, AbsEp: ${episode || 'N/A'}, PrimaryID: ${primaryId || 'N/A'})`);

  for (const ott of platforms) {
    try {
      console.log(`[NetMirror] 🚀 Trying platform: ${ott.toUpperCase()}`);
      
      const commonCookies = `user_token=${USER_TOKEN}; ott=${ott};`;
      const searchPath = ott === 'pv' ? '/pv/search.php' : (ott === 'hs' ? '/mobile/hs/search.php' : '/search.php');

      let searchRes = null;
      let usedBase = '';
      
      for (const base of NETMIRROR_MIRRORS) {
        try {
          console.log(`[NetMirror] 🔍 Trying mirror search: ${base}${searchPath}`);
          searchRes = await axios.get(`${base}${searchPath}`, {
            params: { s: cleanTitle, t: timestamp },
            headers: {
              'Cookie': commonCookies,
              'X-Requested-With': 'XMLHttpRequest',
              'Referer': `${base}/`,
              'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer'
            },
            timeout: 10000
          });
          
          const data = searchRes.data && (searchRes.data.searchResult || searchRes.data);
          if (Array.isArray(data) && data.length > 0) {
            usedBase = base;
            break; // Found working mirror with results
          }
          console.log(`[NetMirror] ℹ️ Mirror ${base} responded but no results for "${cleanTitle}"`);
        } catch (e: any) {
          console.log(`[NetMirror] ⚠️ Mirror ${base} failed: ${e.message}`);
        }
      }

      if (!usedBase || !searchRes || !searchRes.data) {
        console.log(`[NetMirror] ❌ All mirrors failed for ${ott.toUpperCase()}`);
        continue;
      }

      let results = searchRes.data && (searchRes.data.searchResult || searchRes.data);

      if (!Array.isArray(results) || results.length === 0) {
        console.log(`[NetMirror] 🔄 Clean search failed on ${usedBase}, trying original: "${title}"`);
        searchRes = await axios.get(`${usedBase}${searchPath}`, {
          params: { s: title, t: timestamp },
          headers: {
            'Cookie': commonCookies,
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': `${usedBase}/`
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

        // TITLE VALIDATION: Search term must appear at the START of the result title
        // This prevents "Gimme Shelter" from matching "Shelter"
        if (!isPrimary) {
          const normalizedMovie = movieTitle.toLowerCase().trim();
          const normalizedSearch = cleanTitle.toLowerCase().trim();
          // Strip common leading articles for comparison
          const stripArticle = (s: string) => s.replace(/^(the|a|an)\s+/i, '');
          const movieStripped = stripArticle(normalizedMovie);
          const searchStripped = stripArticle(normalizedSearch);
          
          const isReasonableMatch = 
            normalizedMovie === normalizedSearch ||
            movieStripped === searchStripped ||
            // Title starts with the search term (e.g. "Shelter Island" matches "Shelter")
            movieStripped.startsWith(searchStripped + ' ') ||
            movieStripped.startsWith(searchStripped + ':') ||
            movieStripped.startsWith(searchStripped + ' -') ||
            // Search starts with result title (abbreviated title in DB)
            searchStripped.startsWith(movieStripped + ' ') ||
            searchStripped.startsWith(movieStripped + ':');
          
          if (!isReasonableMatch) {
            console.log(`[NetMirror] ⏭️ Skipping title mismatch: "${movieTitle}" doesn't match "${cleanTitle}"`);
            continue;
          }
        }

        // STRICT MATCHING: If we have a primaryId and it doesn't match this result, 
        // AND we have a year mismatch, skip it. This prevents playing Anime instead of Live Action.
        if (primaryId && !isPrimary && year && movieYear) {
          const yearNum = year.toString();
          const movieYearNum = movieYear.toString();
          const currentYear = new Date().getFullYear();
          
          // If the requested year is in the future, don't be too strict
          const isFutureYear = parseInt(yearNum) > currentYear;

          if (!isFutureYear && !movieYearNum.includes(yearNum) && !yearNum.includes(movieYearNum)) {
             console.log(`[NetMirror] ⏭️ Skipping year mismatch: Expected ${year}, got ${movieYear}`);
             continue;
          }
        }

        // CRITICAL FIX: TV shows require the 'ep' parameter in play.php to generate the correct 'h' token.
        // If we have episode info, pass it here.
        let playData = `id=${movie.id}`;
        const firstEp = epCandidates.length > 0 ? epCandidates[0] : undefined;
        if (firstEp !== undefined) {
          playData += `&ep=${firstEp}`;
        }

        const playRes = await axios.post(`${usedBase}/play.php`, playData, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': `user_token=${USER_TOKEN}; ott=${ott};`,
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': `${usedBase}/`
          }
        });

        const hToken = playRes.data.h;
        if (!hToken || hToken === 'error') {
          console.log(`[NetMirror] ⚠️ Invalid H-Token for ID: ${movie.id}`);
          continue;
        }

        console.log(`[NetMirror] 🔗 Trying ${epCandidates.length} episode candidate(s) for ID: ${movie.id}...`);
        
        for (const candidateEp of epCandidates) {
          console.log(`[NetMirror] 🎯 Trying ep=${candidateEp ?? 'default'} for ID: ${movie.id}`);
          const playlistRes = await axios.get(`${usedBase}/playlist.php`, {
            params: { id: movie.id, t: timestamp, h: hToken, ott: ott, ep: candidateEp },
            headers: {
              'Cookie': `${commonCookies}; hd=on;`,
              'Referer': `${usedBase}/`,
              'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer'
            }
          });

          const playlistData = Array.isArray(playlistRes.data) ? playlistRes.data[0] : playlistRes.data;

          if (playlistData && playlistData.sources && playlistData.sources.length > 0) {
            try {
              const normalizeUrl = (url: string) => {
                let finalUrl = url.startsWith('//') ? `https:${url}` : (url.startsWith('http') ? url : `${usedBase}${url}`);
                // Fix for known dead CDN domains
                finalUrl = finalUrl.replace(/nm-cdn(\d+)?\.top/gi, (match: string, p1?: string) => {
                  return p1 ? `freecdn${p1}.top` : `freecdn2.top`;
                });
                // CRITICAL: Replace placeholder auth token with real h-token from play.php
                if (hToken && hToken.startsWith('in=')) {
                  finalUrl = finalUrl.replace(/in=unknown[^&]*/g, hToken);
                }
                return finalUrl;
              };

              // Extract a fallback hostname from the video sources (useful for fixing broken audio URIs)
              let fallbackHostname = '';
              for (const src of playlistData.sources) {
                const originalUrl = normalizeUrl(src.file);
                const match = originalUrl.match(/^https?:\/\/([^/]+)/);
                if (match && !match[1].includes('net22.cc') && !match[1].includes('netfree.cc')) {
                  fallbackHostname = match[1];
                  break;
                }
              }

              // Fetch the master manifest ONCE, rewrite it, and validate the CDN stream
              const src0 = playlistData.sources[0];
              const masterUrl = normalizeUrl(src0.file);
              
              console.log(`[NetMirror] 🛠️ Fetching master manifest: ${masterUrl.substring(0, 60)}...`);
              const m3u8Res = await axios.get(masterUrl, {
                headers: { 
                  'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer',
                  'Cookie': `${commonCookies}; hd=on;`,
                  'Referer': `${usedBase}/`
                },
                timeout: 10000
              });
              
              let content = m3u8Res.data.toString().trim();
              console.log(`[NetMirror] 🔍 Manifest start: "${content.substring(0, 20).replace(/\n/g, '\\n')}"`);
              
              if (!content.startsWith('#EXTM3U')) {
                console.log(`[NetMirror] ⚠️ Manifest invalid (No #EXTM3U). Skipping.`);
                continue;
              }

              // 0. Remove BOM
              content = content.replace(/^\uFEFF/, '');

              // 1. Fix dead CDN domains
              let rewrittenContent = content.replace(/nm-cdn(\d+)?\.top/gi, (match: string, p1?: string) => {
                return p1 ? `freecdn${p1}.top` : `freecdn2.top`;
              });
              
              // 2. Replace placeholder auth token with real h-token
              if (hToken && hToken.startsWith('in=')) {
                rewrittenContent = rewrittenContent.replace(/in=unknown[^\s&"']*/g, hToken);
              }
              
              // 3. Fix broken audio URIs
              if (fallbackHostname) {
                rewrittenContent = rewrittenContent.replace(/https:\/\/\//g, `https://${fallbackHostname}/`);
              }

              // Extract CDN stream URLs from the rewritten manifest
              const manifestLines = rewrittenContent.split('\n');
              const cdnStreamUrls = manifestLines.map((l: string) => l.trim()).filter((l: string) => l.startsWith('http') && l.includes('.m3u8'));
              
              if (cdnStreamUrls.length === 0) {
                console.log(`[NetMirror] ⚠️ No CDN stream URLs found in manifest. Skipping.`);
                continue;
              }

              // CRITICAL: Validate one CDN stream to detect rate-limit error playlists
              // The CDN serves a fake .jpg slideshow instead of real .ts segments when rate-limited
              const testStreamUrl = cdnStreamUrls[0];
              console.log(`[NetMirror] 🧪 Validating CDN stream: ${testStreamUrl.substring(0, 60)}...`);
              
              let isRateLimited = false;
              try {
                const streamCheck = await axios.get(testStreamUrl, {
                  headers: { 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' },
                  timeout: 8000
                });
                const streamContent = streamCheck.data.toString();
                
                // DETECTION: Rate-limited playlists contain .jpg segments instead of .ts
                // They serve a pre-rendered "too many requests" slideshow video
                const hasJpgSegments = streamContent.includes('.jpg') || streamContent.includes('.jpeg') || streamContent.includes('.png');
                const hasTsSegments = streamContent.includes('.ts');
                
                if (hasJpgSegments && !hasTsSegments) {
                  console.log(`[NetMirror] 🚨 RATE LIMITED! CDN is serving .jpg error slideshow instead of .ts video segments`);
                  console.log(`[NetMirror] 🚨 This IP is temporarily blocked for content ID: ${movie.id} on ${ott.toUpperCase()}`);
                  isRateLimited = true;
                } else if (hasTsSegments) {
                  console.log(`[NetMirror] ✅ CDN stream validated - contains real .ts video segments`);
                } else if (streamContent.includes('#EXTM3U')) {
                  console.log(`[NetMirror] ✅ CDN returned valid HLS playlist`);
                } else {
                  console.log(`[NetMirror] ⚠️ CDN stream content unclear, proceeding cautiously`);
                }
              } catch (streamErr: any) {
                console.log(`[NetMirror] ⚠️ CDN validation failed: ${streamErr.message}. Proceeding with URL.`);
              }

              // If rate-limited, the CDN is blocking this IP for ALL content
              // Return immediately with the rate-limit flag so the player can show a friendly message
              if (isRateLimited) {
                console.log(`[NetMirror] 🚨 CDN rate limit detected! IP is temporarily blocked.`);
                console.log(`[NetMirror] 🕐 User should wait 2-5 minutes before retrying.`);
                return {
                  sources: [],
                  cookies: '',
                  tracks: [],
                  isRateLimited: true,
                  usedMirror: usedBase
                };
              }

              // SUCCESS: Build the final source using a data URI of the full rewritten master manifest
              // This gives ExoPlayer the complete adaptive bitrate manifest with all quality variants
              const sources = [];
              const base64Manifest = Buffer.from(rewrittenContent).toString('base64');
              const dataUri = `data:application/x-mpegURL;base64,${base64Manifest}`;
              
              console.log(`[NetMirror] ✨ SUCCESS! Serving full master manifest as data URI (${rewrittenContent.length} bytes)`);
              console.log(`[NetMirror] 📊 Qualities: ${cdnStreamUrls.length} variants, Audio tracks in manifest`);
              
              sources.push({
                url: dataUri,
                quality: 'Auto',
                isDirect: false
              });
              
              // Also provide direct CDN URL as fallback (in case data URI doesn't work with player)
              sources.push({
                url: cdnStreamUrls[0],
                quality: src0.label || '1080p',
                isDirect: true
              });

              const tracks: NetMirrorTrack[] = (playlistData.tracks || []).map((t: any) => ({
                file: normalizeUrl(t.file),
                label: t.label || 'Unknown',
                kind: t.kind || 'captions'
              }));


              // Filter out null (broken) sources
              const validSources = sources.filter((s: any): s is NetMirrorSource => s !== null);
              
              if (validSources.length === 0) {
                console.log(`[NetMirror] ⚠️ All sources broken for ID: ${movie.id}, trying next...`);
                continue; // Try next episode candidate
              }

              console.log(`[NetMirror] 📤 Returning sources:`, validSources.map((s: NetMirrorSource) => s.url.substring(0, 60)));
              return {
                sources: validSources,
                cookies: `${commonCookies}; hd=on;`,
                tracks: tracks,
                fallbackHostname: fallbackHostname,
                usedMirror: usedBase
              };
            } catch (e: any) {
              console.log(`[NetMirror] ⚠️ Source check failed for ep=${candidateEp ?? 'default'}, ID: ${movie.id} - ${e.message}`);
              continue; // Try next episode candidate
            }
          } else {
            console.log(`[NetMirror] ⚠️ Playlist empty for ep=${candidateEp ?? 'default'}, ID: ${movie.id}`);
          }
        } // end epCandidates loop
      }
    } catch (error: any) {
      console.log(`[NetMirror] 💥 Error on ${ott.toUpperCase()}: ${error.message}`);
      continue;
    }
  }

  console.log(`[NetMirror] 🏁 Finished search. No valid links found.`);
  return null;
};
