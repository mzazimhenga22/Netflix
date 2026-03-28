const axios = require('axios');

async function testRateLimit() {
  const timestamp = Math.floor(Date.now() / 1000);
  const base = 'https://net22.cc';
  
  const randomToken = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const cookieString = `user_token=${randomToken}; ott=nf;`;
  
  console.log(`\n[2] Searching with cookies: ${cookieString}`);
  const searchRes = await axios.get(`${base}/search.php`, {
    params: { s: 'Breaking Bad', t: timestamp },
    headers: { 'Cookie': cookieString, 'X-Requested-With': 'XMLHttpRequest', 'Referer': `${base}/`, 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' }
  });

  const results = searchRes.data?.searchResult || searchRes.data;
  const movie = results[0];
  if (!movie) return console.log('No movie found');
  console.log(`Found: ${movie.title || movie.t} (ID: ${movie.id})`);

  console.log(`\n[3] Getting play token...`);
  const playRes = await axios.post(`${base}/play.php`, `id=${movie.id}&ep=1`, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookieString, 'X-Requested-With': 'XMLHttpRequest', 'Referer': `${base}/` }
  });
  
  const hToken = playRes.data.h;
  console.log(`hToken: ${hToken}`);

  console.log(`\n[4] Getting playlist...`);
  const playlistRes = await axios.get(`${base}/playlist.php`, {
    params: { id: movie.id, t: timestamp, h: hToken, ott: 'nf', ep: 1 },
    headers: { 'Cookie': `${cookieString} hd=on;`, 'Referer': `${base}/`, 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' }
  });

  const playlistData = Array.isArray(playlistRes.data) ? playlistRes.data[0] : playlistRes.data;
  const sources = playlistData?.sources;
  if (!sources?.length) return console.log('No sources');

  // get first source, apply token
  let masterUrl = sources[0].file.startsWith('http') ? sources[0].file : `${base}${sources[0].file}`;
  masterUrl = masterUrl.replace(/nm-cdn(\d+)?\.top/gi, (m, p1) => p1 ? `freecdn${p1}.top` : `freecdn2.top`);
  if (hToken.startsWith('in=')) masterUrl = masterUrl.replace(/in=unknown[^&]*/g, hToken);

  console.log(`\n[5] Fetching master manifest: ${masterUrl}`);
  const masterRes = await axios.get(masterUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer', 'Cookie': `${cookieString} hd=on;` }
  });

  const content = masterRes.data.toString();
  const cdnUrls = content.split('\n').filter(l => l.startsWith('http') && l.includes('.m3u8'));
  
  if (!cdnUrls.length) return console.log('No CDN URLs found');
  
  let fixedCdnUrl = cdnUrls[0].replace(/nm-cdn(\d+)?\.top/gi, (m, p1) => p1 ? `freecdn${p1}.top` : `freecdn2.top`);
  if (hToken.startsWith('in=')) fixedCdnUrl = fixedCdnUrl.replace(/in=unknown[^\s&"']*/g, hToken);

  console.log(`\n[6] Fetching CDN sub-manifest: ${fixedCdnUrl}`);
  const cdnRes = await axios.get(fixedCdnUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' }
  });
  
  const cdnContent = cdnRes.data.toString();
  console.log(`Valid M3U8: ${cdnContent.startsWith('#EXTM3U')}`);
  
  // Look for .ts segments or .jpg
  const tsSegments = cdnContent.split('\n').filter(l => l.trim().endsWith('.ts') || l.trim().endsWith('.jpg'));
  console.log(`Found ${tsSegments.length} segments`);
  if (tsSegments.length > 0) {
    if (tsSegments.length < 10) {
      console.log(`⚠️ LESS THAN 10 SEGMENTS FOUND! This is the 'Too many requests' error video (10-15s short video)`);
      console.log(tsSegments.join('\n'));
    } else {
      console.log(`✅ Full movie/episode found (${tsSegments.length} segments)`);
    }
  }
}

testRateLimit().catch(e => console.error(e.message));
