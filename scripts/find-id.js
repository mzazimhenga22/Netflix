const axios = require('axios');
const NETMIRROR_BASE = 'https://net22.cc';
const USER_TOKEN = '233123f803cf02184bf6c67e149cdd50';

async function findId(title) {
  const timestamp = Math.floor(Date.now() / 1000);
  try {
    const res = await axios.get(`${NETMIRROR_BASE}/search.php`, {
      params: { s: title, t: timestamp },
      headers: {
        'Cookie': `user_token=${USER_TOKEN}; ott=nf;`,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${NETMIRROR_BASE}/`
      }
    });

    const results = res.data.searchResult || res.data;
    if (Array.isArray(results)) {
      results.forEach(r => {
        console.log(`ID: ${r.id} | Title: ${r.t || r.title} | Year: ${r.y || r.year}`);
      });
    } else {
      console.log('No results found or unexpected format:', res.data);
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

findId('Beauty in Black');
