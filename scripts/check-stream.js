const axios = require('axios');

const url = process.argv[2];
const referer = process.argv[3] || 'https://net22.cc/';
const cookie = process.argv[4] || '';

async function check() {
  console.log(`Checking URL: ${url}`);
  console.log(`With Referer: ${referer}`);
  
  try {
    const res = await axios.get(url, {
      headers: {
        'Referer': referer,
        'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer',
        'Cookie': cookie
      },
      timeout: 5000
    });
    
    console.log('Status:', res.status);
    console.log('Headers:', res.headers);
    console.log('Body:');
    console.log(res.data.toString());
    
    if (res.data.toString().includes('#EXTM3U')) {
      console.log('\n✅ VALID M3U8 PLAYLIST FOUND!');
    } else {
      console.log('\n❌ NOT A VALID M3U8 PLAYLIST');
    }
  } catch (error) {
    console.log('💥 Error:', error.message);
    if (error.response) {
      console.log('Response Status:', error.response.status);
      console.log('Response Data:', error.response.data);
    }
  }
}

if (!url) {
  console.log('Usage: node scripts/check-stream.js <url> [referer] [cookie]');
} else {
  check();
}
