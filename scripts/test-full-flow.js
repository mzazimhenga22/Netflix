const axios = require('axios');

const userToken = '233123f803cf02184bf6c67e149cdd50';
const mirror = 'https://net22.cc';

async function testFullFlow(title) {
  try {
    console.log(`\n--- Testing Search: ${title} ---`);
    const searchRes = await axios.get(`${mirror}/search.php`, {
      params: { s: title, t: Math.floor(Date.now() / 1000) },
      headers: {
        'Cookie': `user_token=${userToken}; ott=nf;`,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${mirror}/`
      }
    });
    
    const results = searchRes.data.searchResult || searchRes.data;
    if (!Array.isArray(results) || results.length === 0) {
      console.log(`❌ No results found for ${title}`);
      return;
    }
    
    const movie = results[0];
    console.log(`✅ Found: ${movie.t || movie.title} (ID: ${movie.id})`);
    
    console.log(`\n--- Testing play.php: ${movie.id} ---`);
    const playRes = await axios.post(`${mirror}/play.php`, `id=${movie.id}`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': `user_token=${userToken}; ott=nf;`,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${mirror}/`
      }
    });
    
    console.log(`Play Response:`, playRes.data);
    
    if (playRes.data.h) {
      console.log(`✅ Got H-Token: ${playRes.data.h}`);
      
      console.log(`\n--- Testing playlist.php ---`);
      // Warning: playlist.php might be on a different domain like netmirror.app or net52.cc
      // But let's try netfree.cc or net22.cc if they host it
      const playlistRes = await axios.get(`${mirror}/playlist.php`, {
        params: { id: movie.id, t: Math.floor(Date.now() / 1000), h: playRes.data.h, ott: 'nf' },
        headers: {
          'Cookie': `user_token=${userToken}; ott=nf;`,
          'Referer': `${mirror}/`
        }
      });
      
      console.log(`Playlist Source:`, playlistRes.data.sources?.[0]?.file || 'No Sources');
    } else {
      console.log(`❌ Failed to get H-Token`);
    }
    
  } catch (e) {
    console.log(`💥 Error: ${e.message}`);
    if (e.response) console.log(`Response:`, e.response.data);
  }
}

testFullFlow('One Piece').catch(console.error);
