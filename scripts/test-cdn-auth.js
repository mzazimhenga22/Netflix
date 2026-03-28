// Verification script: test that the h-token replaces in=unknown in CDN URLs
const axios = require('axios');

const MIRRORS = ['https://net22.cc', 'https://net21.cc'];
const USER_TOKEN = '233123f803cf02184bf6c67e149cdd50';

async function testStream(title, ep) {
  const timestamp = Math.floor(Date.now() / 1000);
  const commonCookies = `user_token=${USER_TOKEN}; ott=nf;`;
  
  console.log(`\nTesting: "${title}" (ep=${ep || 'none'})`);
  console.log('='.repeat(60));

  for (const base of MIRRORS) {
    try {
      const searchRes = await axios.get(`${base}/search.php`, {
        params: { s: title, t: timestamp },
        headers: { 'Cookie': commonCookies, 'X-Requested-With': 'XMLHttpRequest', 'Referer': `${base}/`, 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' },
        timeout: 10000
      });

      const results = searchRes.data?.searchResult || searchRes.data;
      if (!Array.isArray(results) || results.length === 0) continue;

      const movie = results[0];
      console.log(`Found: "${movie.t}" (ID: ${movie.id})`);

      let playData = `id=${movie.id}`;
      if (ep) playData += `&ep=${ep}`;

      const playRes = await axios.post(`${base}/play.php`, playData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': commonCookies, 'X-Requested-With': 'XMLHttpRequest', 'Referer': `${base}/` },
        timeout: 10000
      });

      const hToken = playRes.data.h;
      console.log(`hToken: ${hToken}`);
      if (!hToken || hToken === 'error') continue;

      const playlistRes = await axios.get(`${base}/playlist.php`, {
        params: { id: movie.id, t: timestamp, h: hToken, ott: 'nf', ep: ep || undefined },
        headers: { 'Cookie': `${commonCookies} hd=on;`, 'Referer': `${base}/`, 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' },
        timeout: 10000
      });

      const playlistData = Array.isArray(playlistRes.data) ? playlistRes.data[0] : playlistRes.data;
      if (!playlistData?.sources?.length) continue;

      // Get the first source, normalize it like our code does
      const src = playlistData.sources[0];
      let sourceUrl = src.file.startsWith('http') ? src.file : `${base}${src.file}`;
      // Apply nm-cdn fix
      sourceUrl = sourceUrl.replace(/nm-cdn(\d+)?\.top/gi, (m, p1) => p1 ? `freecdn${p1}.top` : `freecdn2.top`);
      // Apply hToken replacement
      if (hToken.startsWith('in=')) {
        sourceUrl = sourceUrl.replace(/in=unknown[^&]*/g, hToken);
      }
      
      console.log(`\nFixed source URL: ${sourceUrl}`);
      
      // Fetch the manifest with the fixed URL
      const m3u8Res = await axios.get(sourceUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer', 'Cookie': `${commonCookies} hd=on;` },
        timeout: 10000
      });
      
      let content = m3u8Res.data.toString();
      console.log(`Master manifest valid: ${content.startsWith('#EXTM3U')}`);
      
      // Apply fixes to content
      content = content.replace(/nm-cdn(\d+)?\.top/gi, (m, p1) => p1 ? `freecdn${p1}.top` : `freecdn2.top`);
      if (hToken.startsWith('in=')) {
        content = content.replace(/in=unknown[^\s&"']*/g, hToken);
      }
      
      // Extract CDN URLs from fixed manifest
      const cdnUrls = content.split('\n').map(l => l.trim()).filter(l => l.startsWith('http') && l.includes('.m3u8'));
      
      console.log(`\nFixed CDN URLs (${cdnUrls.length}):`);
      for (const url of cdnUrls) {
        console.log(`  ${url}`);
      }
      
      // Test first CDN URL
      if (cdnUrls.length > 0) {
        console.log(`\nTesting first CDN URL...`);
        try {
          const cdnRes = await axios.get(cdnUrls[0], {
            headers: { 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' },
            timeout: 5000
          });
          const cdnContent = cdnRes.data.toString();
          console.log(`  Valid M3U8: ${cdnContent.startsWith('#EXTM3U') || cdnContent.startsWith('#EXT')}`);
          console.log(`  First 200 chars: ${cdnContent.substring(0, 200)}`);
        } catch (e) {
          console.log(`  Failed: ${e.message}`);
        }
      }
      
      // Also show the full fixed manifest
      console.log(`\n--- FIXED MANIFEST ---`);
      console.log(content.substring(0, 1000));
      
      return;
    } catch (e) {
      console.log(`  Mirror ${base} failed: ${e.message}`);
    }
  }
}

(async () => {
  await testStream('Breaking Bad', 1);
})();
