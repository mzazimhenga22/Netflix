const axios = require('axios');

async function testTsSegments() {
  const timestamp = Math.floor(Date.now() / 1000);
  const base = 'https://net22.cc';
  const randomToken = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const cookieString = `user_token=${randomToken}; ott=nf;`;
  
  const searchRes = await axios.get(`${base}/search.php`, {
    params: { s: 'Breaking Bad', t: timestamp },
    headers: { 'Cookie': cookieString, 'X-Requested-With': 'XMLHttpRequest', 'Referer': `${base}/`, 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' }
  });

  const movie = searchRes.data?.searchResult?.[0] || searchRes.data[0];
  const playRes = await axios.post(`${base}/play.php`, `id=${movie.id}&ep=1`, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookieString, 'X-Requested-With': 'XMLHttpRequest', 'Referer': `${base}/` }
  });
  
  const hToken = playRes.data.h;

  const playlistRes = await axios.get(`${base}/playlist.php`, {
    params: { id: movie.id, t: timestamp, h: hToken, ott: 'nf', ep: 1 },
    headers: { 'Cookie': `${cookieString} hd=on;`, 'Referer': `${base}/`, 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' }
  });

  const sources = (Array.isArray(playlistRes.data) ? playlistRes.data[0] : playlistRes.data).sources;
  let masterUrl = sources[0].file.startsWith('http') ? sources[0].file : `${base}${sources[0].file}`;
  masterUrl = masterUrl.replace(/nm-cdn(\d+)?\.top/gi, (m, p1) => p1 ? `freecdn${p1}.top` : `freecdn2.top`);
  if (hToken.startsWith('in=')) masterUrl = masterUrl.replace(/in=unknown[^&]*/g, hToken);

  const masterRes = await axios.get(masterUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer', 'Cookie': `${cookieString} hd=on;` }
  });

  const content = masterRes.data.toString();
  const cdnUrls = content.split('\n').filter(l => l.startsWith('http') && l.includes('.m3u8'));
  
  let fixedCdnUrl = cdnUrls[0].replace(/nm-cdn(\d+)?\.top/gi, (m, p1) => p1 ? `freecdn${p1}.top` : `freecdn2.top`);
  if (hToken.startsWith('in=')) fixedCdnUrl = fixedCdnUrl.replace(/in=unknown[^\s&"']*/g, hToken);

  const cdnRes = await axios.get(fixedCdnUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' }
  });
  
  const cdnContent = cdnRes.data.toString();
  const tsSegments = cdnContent.split('\n').filter(l => l.trim().endsWith('.ts') || l.trim().endsWith('.jpg'));
  
  const cdnBase = fixedCdnUrl.substring(0, fixedCdnUrl.lastIndexOf('/'));
  const firstSegment = tsSegments[0].trim();
  
  console.log(`\nTesting TS Segment Fetching: ${firstSegment}`);
  
  // 1. Fetch exactly as ExoPlayer would (relative path resolved against base, no auth token attached)
  const plainTsUrl = `${cdnBase}/${firstSegment}`;
  console.log(`\nURL: ${plainTsUrl}`);
  
  try {
    const res1 = await axios.head(plainTsUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' } });
    console.log(`[NO TOKEN] Size: ${res1.headers['content-length']} bytes`);
  } catch(e) { console.log(`[NO TOKEN] Failed: ${e.response?.status}`); }
  
  // 2. Fetch with the hToken appended
  const tokenTsUrl = `${plainTsUrl}?${hToken}`;
  try {
    const res2 = await axios.head(tokenTsUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' } });
    console.log(`[WITH TOKEN] Size: ${res2.headers['content-length']} bytes`);
  } catch(e) { console.log(`[WITH TOKEN] Failed: ${e.response?.status}`); }

}

testTsSegments().catch(e => console.error(e.message));
