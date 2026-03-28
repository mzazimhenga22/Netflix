const axios = require('axios');

async function search(title) {
  const mirrors = ['https://net22.cc', 'https://net23.cc', 'https://netfree.cc'];
  const userToken = '233123f803cf02184bf6c67e149cdd50';
  
  for (const base of mirrors) {
    try {
      console.log(`\n--- Searching ${title} on ${base} ---`);
      const res = await axios.get(`${base}/search.php`, {
        params: { s: title, t: Math.floor(Date.now() / 1000) },
        headers: {
          'Cookie': `user_token=${userToken}; ott=nf;`,
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `${base}/`
        },
        timeout: 5000
      });
      
      const results = res.data.searchResult || res.data;
      if (Array.isArray(results) && results.length > 0) {
        console.log(`✅ SUCCESS on ${base}: Found ${results.length} results`);
        results.forEach(r => console.log(` - ${r.t || r.title} (${r.y || r.year}) (ID: ${r.id})`));
      } else {
        console.log(`❌ No results on ${base}.`);
      }
    } catch (e) {
      console.log(`💥 Error on ${base}: ${e.message}`);
    }
  }
}

search('Project Hail Mary').catch(console.error);
