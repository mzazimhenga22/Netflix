const axios = require('axios');
const { exec } = require('child_process');

const NETMIRROR_BASE = 'https://net22.cc';
const NETMIRROR_PLAY = 'https://net52.cc';
const USER_TOKEN = '233123f803cf02184bf6c67e149cdd50';

const extractCookies = (setCookieHeader) => {
  if (!setCookieHeader) return '';
  const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const cookies = [];
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

async function testPlaylist(id, ott, ep) {
  console.log(`\n--- Testing Playlist for ID: ${id}, OTT: ${ott}, EP: ${ep || 'default'} ---\n`);
  const timestamp = Math.floor(Date.now() / 1000);

  try {
    const sessionRes = await axios.post(`${NETMIRROR_PLAY}/tv/p.php`, `t=${timestamp}`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${NETMIRROR_PLAY}/`
      }
    });

    const sessionCookies = extractCookies(sessionRes.headers['set-cookie']);
    const commonCookies = `user_token=${USER_TOKEN}; ott=${ott}; ${sessionCookies}`;

    console.log(`[Step 1] Getting token via play.php...`);
    const playRes = await axios.post(`${NETMIRROR_BASE}/play.php`, `id=${id}`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': commonCookies,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${NETMIRROR_BASE}/`
      }
    });

    const hToken = playRes.data.h;
    if (!hToken || hToken === 'error') {
      console.log(`❌ Failed to get valid H-Token: ${JSON.stringify(playRes.data)}`);
      return;
    }
    console.log(`✅ H-Token: ${hToken}`);

    console.log(`[Step 2] Fetching playlist metadata...`);
    const params = { id, t: timestamp, h: hToken, ott: ott };
    if (ep) params.ep = ep;

    const playlistRes = await axios.get(`${NETMIRROR_PLAY}/playlist.php`, {
      params,
      headers: {
        'Cookie': `${commonCookies}; hd=on;`,
        'Referer': `${NETMIRROR_PLAY}/`,
        'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer'
      }
    });

    const playlistData = Array.isArray(playlistRes.data) ? playlistRes.data[0] : playlistRes.data;

    if (playlistData && playlistData.sources) {
      const s = playlistData.sources[0];
      let file = s.file;
      const fullUrl = file.startsWith('http') ? file : `${NETMIRROR_PLAY}${file}`;
      
      console.log(`[Step 2.5] Validating source content...`);
      const checkRes = await axios.get(fullUrl, {
        headers: {
          'Cookie': `${commonCookies}; hd=on;`,
          'Referer': `${NETMIRROR_PLAY}/`,
          'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer'
        }
      });
      
      if (checkRes.data.toString().includes('https:///')) {
        console.log(`⚠️ DUMMY PLAYLIST DETECTED (Audio-only with broken URI)`);
        console.log(`Content Preview: ${checkRes.data.toString().substring(0, 150)}`);
        return false;
      }

      console.log(`✨ SUCCESS! Found valid stream URL.`);
      const finalCookies = `${commonCookies}; hd=on;`;
      console.log(`\n[Step 3] Verifying content with check-stream.js...`);
      const cmd = `node scripts/check-stream.js "${fullUrl}" "https://net52.cc/" "${finalCookies}"`;
      exec(cmd, (err, stdout, stderr) => {
        console.log(stdout);
        if (err) console.error(stderr);
      });
      return true;
    } else {
      console.log(`⚠️ Playlist empty.`);
      return false;
    }
  } catch (error) {
    console.log(`💥 Error: ${error.message}`);
    return false;
  }
}

testPlaylist("70305903", "nf");
