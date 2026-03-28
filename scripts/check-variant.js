const axios = require('axios');

async function checkVariant() {
  // Use a known variant URL from the master manifest check earlier
  const url = 'https://s21.freecdn4.top/files/220884/720p/720p.m3u8?in=unknown::ek';
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

checkVariant();
