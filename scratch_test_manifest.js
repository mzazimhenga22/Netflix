// scratch/test_manifest.js
const axios = require('axios');

const USER_TOKEN = '233123f803cf02184bf6c67e149cdd50';
const base = 'https://netfree.cc';

async function test() {
  const commonCookies = `user_token=${USER_TOKEN}; ott=nf;`;
  const url = 'https://nm-cdn1.top/nf/3/82/10000000/1000/1000.m3u8'; // Example
  
  try {
    const res = await axios.get(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer',
        'Cookie': `${commonCookies}; hd=on;`
      }
    });
    console.log('--- Manifest Content ---');
    console.log(res.data);
    
    // Check for relative paths or dead domains
    const lines = res.data.split('\n');
    const sources = lines.filter(l => l && !l.startsWith('#'));
    console.log('\n--- Sources detected ---');
    sources.forEach(s => console.log(s));
    
  } catch (e) {
    console.error('Fetch failed:', e.message);
  }
}

test();
