const TMDB_ID = '87108'; // Example ID
const SEASON = 1;
const EPISODE = 1;

async function checkVidLink() {
  const url = `https://vidlink.pro/tv/${TMDB_ID}/${SEASON}/${EPISODE}`;
  console.log(`\n============== VIDLINK ==============`);
  console.log(`Testing URL: ${url}`);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    console.log(`Status: ${res.status} ${res.statusText}`);
    console.log(`Final Redirected URL: ${res.url}`);
    
    // Check if the final URL contains our IDs
    if (res.url.includes(TMDB_ID)) {
      console.log('✅ Final URL contains TMDB ID');
    } else {
      console.log('❌ Final URL hides TMDB ID');
    }

    const text = await res.text();
    console.log(`Response length: ${text.length} bytes`);
    
    // Check if ID is in the script variables
    if (text.includes(TMDB_ID)) {
      console.log('✅ Found TMDB ID in page source');
    } else {
      console.log('❌ TMDB ID hidden in page source');
    }
  } catch (err) {
    console.error('Error fetching VidLink:', err.message);
  }
}

async function checkVidSrc() {
  const url = `https://vidsrc.cc/v2/embed/tv/${TMDB_ID}/${SEASON}/${EPISODE}`;
  console.log(`\n============== VIDSRC ==============`);
  console.log(`Testing URL: ${url}`);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    console.log(`Status: ${res.status} ${res.statusText}`);
    console.log(`Final Redirected URL: ${res.url}`);
    
    if (res.url.includes(TMDB_ID)) {
      console.log('✅ Final URL contains TMDB ID');
    } else {
      console.log('❌ Final URL hides TMDB ID');
    }

    const text = await res.text();
    console.log(`Response length: ${text.length} bytes`);
    
    if (text.includes(TMDB_ID)) {
      console.log('✅ Found TMDB ID in page source');
    } else {
      console.log('❌ TMDB ID hidden in page source');
    }
    
    // Check for tokens
    const tokenMatch = text.match(/token\s*=\s*['"]([^'"]+)['"]/i);
    if (tokenMatch) {
      console.log(`Found a stream token/hash in source (length ${tokenMatch[1].length})`);
    }

  } catch (err) {
    console.error('Error fetching VidSrc:', err.message);
  }
}

async function run() {
  await checkVidLink();
  await checkVidSrc();
  console.log('\n====================================');
}

run();
