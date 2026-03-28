import axios from 'axios';

async function test() {
  const url = 'https://s21.freecdn4.top/files/220884/1080p/1080p.m3u8?in=unknown::ek';
  const headers = {
    'Referer': 'https://net22.cc/',
    'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer',
    'Cookie': 'user_token=233123f803cf02184bf6c67e149cdd50; ott=nf; hd=on;'
  };

  try {
    console.log('--- FETCHING WITH HEADERS ---');
    console.log('URL:', url);
    const res = await axios.get(url, { headers });
    console.log('Status:', res.status);
    console.log('Content Start:', res.data.toString().substring(0, 200));
    
    console.log('\n--- FETCHING WITHOUT COOKIE ---');
    const resNoCookie = await axios.get(url, { 
      headers: { 
        'Referer': 'https://net22.cc/',
        'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer'
      } 
    });
    console.log('Status (No Cookie):', resNoCookie.status);
    
    console.log('\n--- FETCHING WITHOUT REFERER ---');
    const resNoReferer = await axios.get(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer'
      } 
    });
    console.log('Status (No Referer):', resNoReferer.status);

  } catch (e: any) {
    console.error('Error:', e.message);
    if (e.response) {
      console.log('Error Status:', e.response.status);
      console.log('Error Data:', e.response.data.toString().substring(0, 200));
    }
  }
}

test();
