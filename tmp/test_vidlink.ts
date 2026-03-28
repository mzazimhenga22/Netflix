import crypto from 'crypto';

async function testFetch() {
  const url = 'https://storm.vodvidl.site/proxy/slh-eerht/l9YRGCBrsZhZzP+N0jF741gXjLACpQkeXThat5USrK4Do-+2G2+YCzZU1mhsau9H6D4ewKEtfYF-ee8c5Yp7r5W7uGylvG9d-7B3gqON3j9l2b8S40+A5eTqf0jI8UaDBr2-VnN70Pof9W5GItI7l72S9f5o=';
  
  const headers = {
    'Referer': 'https://vidlink.pro/',
    'Origin': 'https://vidlink.pro',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Accept': '*/*, application/x-mpegURL',
    'Connection': 'keep-alive'
  };

  console.log('Testing raw URL...');
  let res = await fetch(url, { headers });
  console.log('RAW URL STATUS:', res.status);
  
  console.log('Testing encoded URL...');
  // Encode the token part
  const baseUrl = 'https://storm.vodvidl.site/proxy/slh-eerht/';
  const tokenPart = url.replace(baseUrl, '');
  const encodedUrl = baseUrl + encodeURIComponent(tokenPart);
  res = await fetch(encodedUrl, { headers });
  console.log('ENCODED URL STATUS:', res.status);
}

testFetch().catch(console.error);
