const axios = require('axios');

async function testSearch(title) {
  const mirrors = ['https://netfree.cc', 'https://net23.cc', 'https://net22.cc'];
  const userToken = '233123f803cf02184bf6c67e149cdd50';
  
  for (const base of mirrors) {
    try {
      console.log(`\n--- Testing ${base} ---`);
      // Try search directly with cookies
      const res = await axios.get(`${base}/search.php`, {
        params: { s: title, t: Math.floor(Date.now() / 1000) },
        headers: {
          'Cookie': `user_token=${userToken}; ott=nf;`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `${base}/`
        },
        timeout: 5000
      });
      
      const results = res.data.searchResult || res.data;
      if (Array.isArray(results) && results.length > 0) {
        console.log(`✅ SUCCESS on ${base}: Found ${results.length} results`);
        console.log(`First result: ${results[0].t || results[0].title} (${results[0].y || results[0].year})`);
      } else {
        console.log(`❌ No results on ${base}. Data type: ${typeof res.data}`);
        if (typeof res.data === 'string' && res.data.includes('Cloudflare')) {
          console.log(`⚠️ Cloudflare detected!`);
        }
      }
    } catch (e) {
      console.log(`💥 Error on ${base}: ${e.message}`);
    }
  }
}

testSearch('One Piece').catch(console.error);
