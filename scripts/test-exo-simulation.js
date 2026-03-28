const axios = require('axios');

async function testExoPlayerSimulation() {
  const timestamp = Math.floor(Date.now() / 1000);
  const base = 'https://net22.cc';
  
  // 1. Generate token exactly like the app
  const USER_TOKEN = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const commonCookies = `user_token=${USER_TOKEN}; ott=nf;`;
  
  console.log(`\n[1] Searching... (Token: ${USER_TOKEN})`);
  const searchRes = await axios.get(`${base}/search.php`, {
    params: { s: 'Breaking Bad', t: timestamp },
    headers: { 'Cookie': commonCookies, 'X-Requested-With': 'XMLHttpRequest', 'Referer': `${base}/`, 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' }
  });

  const movie = searchRes.data?.searchResult?.[0] || searchRes.data[0];
  console.log(`Found: ${movie.title || movie.t}`);

  console.log(`\n[2] Getting play token...`);
  const playRes = await axios.post(`${base}/play.php`, `id=${movie.id}&ep=1`, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': commonCookies, 'X-Requested-With': 'XMLHttpRequest', 'Referer': `${base}/` }
  });
  
  const hToken = playRes.data.h;

  console.log(`\n[3] Fetching playlist...`);
  const playlistRes = await axios.get(`${base}/playlist.php`, {
    params: { id: movie.id, t: timestamp, h: hToken, ott: 'nf', ep: 1 },
    headers: { 'Cookie': `${commonCookies}; hd=on;`, 'Referer': `${base}/`, 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' }
  });

  const sources = playlistRes.data[0]?.sources || playlistRes.data?.sources;
  
  // Test invalidation directly! Fetch all 3 sources in sequence
  let cdnUrls = [];
  
  for (let i = 0; i < sources.length; i++) {
    let masterUrl = sources[i].file.startsWith('http') ? sources[i].file : `${base}${sources[i].file}`;
    masterUrl = masterUrl.replace(/nm-cdn(\d+)?\.top/gi, (m, p1) => p1 ? `freecdn${p1}.top` : `freecdn2.top`);
    if (hToken.startsWith('in=')) masterUrl = masterUrl.replace(/in=unknown[^&]*/g, hToken);

    console.log(`\n[4.${i}] Fetching master manifest for ${sources[i].label || 'idx '+i}...`);
    const masterRes = await axios.get(masterUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer', 'Cookie': `${commonCookies}; hd=on;` }
    });

    const content = masterRes.data.toString();
    const absoluteUrls = content.split('\n').filter(l => l.trim().startsWith('http') && l.includes('.m3u8'));
    let cdnUrl = absoluteUrls[0];
    cdnUrl = cdnUrl.replace(/nm-cdn(\d+)?\.top/gi, (m, p1) => p1 ? `freecdn${p1}.top` : `freecdn2.top`);
    
    console.log(`[4.${i}] CDN URL: ${cdnUrl}`);
    cdnUrls.push(cdnUrl);
  }

  const targetUrl = cdnUrls[0];
  const exoCookies = `${commonCookies}; hd=on;`; 
  
  console.log(`\n[5] Fetching CDN manifest exactly like ExoPlayer... (URL: ${targetUrl})`);
  let tsLines = [];
  try {
    const cdnRes = await axios.get(targetUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer',
        'Referer': `${base}/`,
        'Cookie': exoCookies 
      }
    });
    
    tsLines = cdnRes.data.toString().split('\n').filter(l => l.trim().endsWith('.ts') || l.trim().endsWith('.jpg') || l.trim().startsWith('http'));
    console.log(`FOUND ${tsLines.length} SEGMENTS!`);
  } catch (e) {
    console.log(`Fetch failed: ${e.message}`);
    return;
  }

  // LET'S FETCH THE FIRST TS CHUNK TO SEE IF IT IS THE 10 MINUTE ERROR VIDEO
  let firstChunkUrl = tsLines[0].trim();
  if (!firstChunkUrl.startsWith('http')) {
    const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
    firstChunkUrl = baseUrl + firstChunkUrl;
  }

  console.log(`\n[6] ExoPlayer is downloading first TS chunk: ${firstChunkUrl}`);
  try {
    const tsRes = await axios.get(firstChunkUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer',
        'Referer': `${base}/`,
        'Cookie': exoCookies
      }
    });
    const sizeInMB = (tsRes.data.length / (1024 * 1024)).toFixed(2);
    console.log(`✅ Downloaded TS Chunk! Size: ${sizeInMB} MB`);
    
    // An error video chunk is usually tiny (< 500KB)
    if (sizeInMB < 0.5) {
      console.log(`⚠️ WARNING: Chunk is very small (${sizeInMB} MB). This might be the rate limit video!`);
    } else {
      console.log(`✅ Chunk is large (${sizeInMB} MB). This is likely the real movie!`);
    }
  } catch (e) {
    console.log(`Fetch chunk failed: ${e.message}`);
  }
}

testExoPlayerSimulation().catch(console.error);
