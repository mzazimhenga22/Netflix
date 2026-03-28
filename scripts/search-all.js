const axios = require('axios');
const NETMIRROR_BASE = 'https://net22.cc';
const USER_TOKEN = '233123f803cf02184bf6c67e149cdd50';

async function searchAll(title) {
  const timestamp = Math.floor(Date.now() / 1000);
  const platforms = [
    { name: 'nf', path: '/search.php' },
    { name: 'hs', path: '/mobile/hs/search.php' },
    { name: 'pv', path: '/pv/search.php' }
  ];

  for (const p of platforms) {
    console.log(`\n--- Searching ${p.name.toUpperCase()} (Path: ${p.path}) ---`);
    try {
      const res = await axios.get(`${NETMIRROR_BASE}${p.path}`, {
        params: { s: title, t: timestamp },
        headers: {
          'Cookie': `user_token=${USER_TOKEN}; ott=${p.name};`,
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
        console.log('No results.');
      }
    } catch (e) {
      console.error('Error:', e.message);
    }
  }
}

searchAll('Beauty in Black');
