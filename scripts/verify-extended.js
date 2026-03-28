const axios = require('axios');
const NETMIRROR_BASE = 'https://net22.cc';
const NETMIRROR_PLAY = 'https://net52.cc';
const USER_TOKEN = '233123f803cf02184bf6c67e149cdd50';

async function testPlaylist(id, ott, ep) {
  const timestamp = Math.floor(Date.now() / 1000);
  const cookies = `user_token=${USER_TOKEN}; ott=${ott};`;
  
  try {
    // Get H-token with EP if provided
    let playData = `id=${id}`;
    if (ep !== undefined) playData += `&ep=${ep}`;
    
    const playRes = await axios.post(`${NETMIRROR_BASE}/play.php`, playData, {
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded', 
        'Cookie': `user_token=${USER_TOKEN}; ott=${ott};`, 
        'X-Requested-With': 'XMLHttpRequest', 
        'Referer': `${NETMIRROR_BASE}/` 
      }
    });
    const h = playRes.data.h;
    
    // Get Playlist
    const params = { id, t: timestamp, h, ott };
    if (ep !== undefined) params.ep = ep;
    
    const playlistRes = await axios.get(`${NETMIRROR_PLAY}/playlist.php`, {
      params,
      headers: { 'Cookie': `${cookies} hd=on;`, 'Referer': `${NETMIRROR_PLAY}/`, 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' }
    });
    
    const data = Array.isArray(playlistRes.data) ? playlistRes.data[0] : playlistRes.data;
    if (!data?.sources?.length) return 'FAILED (No Sources)';
    
    const src = data.sources[0].file;
    const testUrl = src.startsWith('http') ? src : `${NETMIRROR_PLAY}${src}`;
    
    const checkRes = await axios.get(testUrl, {
      headers: { 'Cookie': `${cookies} hd=on;`, 'Referer': `${NETMIRROR_PLAY}/`, 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' }
    });
    
    const content = checkRes.data.toString();
    const hasVideo = content.includes('#EXT-X-STREAM-INF');
    
    return hasVideo ? '✅ PASSED' : '❌ FAILED (No Video Track)';
  } catch (e) {
    return `❌ ERROR: ${e.message}`;
  }
}

async function runTests() {
  const tests = [
    { name: 'TV: One Piece Ep 1', id: '81116061', ott: 'nf', ep: 1 },
    { name: 'TV: Grey\'s Anatomy S1E1', id: '70140391', ott: 'nf', ep: 1 },
    { name: 'Movie: Inception', id: '70131314', ott: 'nf' },
    { name: 'Movie: The Dark Knight', id: '70079583', ott: 'nf' },
    { name: 'Movie: The Girl on the Train', id: '70305903', ott: 'nf' }
  ];
  
  for (const t of tests) {
    process.stdout.write(`Testing ${t.name}... `);
    const result = await testPlaylist(t.id, t.ott, t.ep);
    console.log(result);
  }
}

runTests().catch(console.error);
