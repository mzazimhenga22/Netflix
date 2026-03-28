const axios = require('axios');

async function checkM3U8() {
  const url = 'https://net22.cc/hls/70221509.m3u8?in=unknown::ek';
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer'
      }
    });
    console.log(`--- Content of ${url} ---`);
    console.log(res.data.toString().substring(0, 1000));
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

checkM3U8();
