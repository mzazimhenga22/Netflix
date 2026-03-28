const axios = require('axios');

const NETMIRROR_BASE = 'https://net22.cc';
const NETMIRROR_PLAY = 'https://net52.cc';
const USER_TOKEN = '233123f803cf02184bf6c67e149cdd50';

async function dumpPlaylist(showId, ott, ep) {
  const timestamp = Math.floor(Date.now() / 1000);

  const sessionRes = await axios.post(`${NETMIRROR_PLAY}/tv/p.php`, `t=${timestamp}`, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${NETMIRROR_PLAY}/`
    }
  });
  const setCookie = sessionRes.headers['set-cookie'];
  const sessionCookies = setCookie
    ? (Array.isArray(setCookie) ? setCookie : [setCookie]).map(h => h.split(';')[0]).join('; ')
    : '';
  const commonCookies = `user_token=${USER_TOKEN}; ott=${ott}; ${sessionCookies}`;

  const playRes = await axios.post(`${NETMIRROR_BASE}/play.php`, `id=${showId}`, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': commonCookies,
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${NETMIRROR_BASE}/`
    }
  });
  const hToken = playRes.data.h;

  const playlistRes = await axios.get(`${NETMIRROR_PLAY}/playlist.php`, {
    params: { id: showId, t: timestamp, h: hToken, ott, ep },
    headers: {
      'Cookie': `${commonCookies}; hd=on;`,
      'Referer': `${NETMIRROR_PLAY}/`,
      'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer'
    }
  });

  const data = Array.isArray(playlistRes.data) ? playlistRes.data[0] : playlistRes.data;
  console.log('\n=== RAW PLAYLIST RESPONSE (Metadata) ===');
  console.log(`Title: ${data.title}`);
  console.log(`Tracks count: ${data.tracks?.length || 0}`);
  if (data.tracks?.length) {
    console.log('Tracks (Subtitles):', JSON.stringify(data.tracks, null, 2));
  }
  
  if (data?.sources?.length) {
    const src = data.sources[0].file;
    const testUrl = src.startsWith('http') ? src : `${NETMIRROR_PLAY}${src}`;
    console.log(`\n=== M3U8 URL: ${testUrl} ===\n`);

    const checkRes = await axios.get(testUrl, {
      headers: {
        'Cookie': `${commonCookies}; hd=on;`,
        'Referer': `${NETMIRROR_PLAY}/`,
        'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer'
      },
      timeout: 5000
    });

    console.log('=== FULL M3U8 CONTENT ===');
    console.log(checkRes.data.toString());
  }
}

const [,, id, ott, ep] = process.argv;
if (!id) {
  console.log('Usage: node scripts/dump-playlist.js <id> <ott> <ep>');
  process.exit(1);
}

dumpPlaylist(id, ott, ep ? parseInt(ep) : undefined).catch(e => console.error('Error:', e.message));
