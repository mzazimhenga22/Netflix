/**
 * CDN Probe V4 - Test different mirrors for different CDN routing
 * Also determine the actual rate-limit duration
 */
const https = require('https');
function generateToken() {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
function request(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = { hostname: u.hostname, port: 443, path: u.pathname + u.search, method: opts.method || 'GET', headers: opts.headers || {}, timeout: 15000 };
    const req = https.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redir = res.headers.location;
        if (!redir.startsWith('http')) redir = `${u.protocol}//${u.host}${redir}`;
        return request(redir, opts).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => { resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }); });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}
const delay = ms => new Promise(r => setTimeout(r, ms));

async function testMirror(base, title) {
  const token = generateToken();
  const ts = Math.floor(Date.now() / 1000);
  const cookies = `user_token=${token}; ott=nf;`;
  
  console.log(`\n=== Mirror: ${base} (token: ${token.substring(0, 8)}...) ===`);
  
  try {
    // Search
    const searchRes = await request(`${base}/search.php?s=${encodeURIComponent(title)}&t=${ts}`, {
      headers: { 'Cookie': cookies, 'X-Requested-With': 'XMLHttpRequest', 'Referer': `${base}/`, 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' }
    });
    let data;
    try { data = JSON.parse(searchRes.body); } catch { console.log(`  Search returned non-JSON (status ${searchRes.status})`); return; }
    const arr = data.searchResult || data;
    if (!Array.isArray(arr) || arr.length === 0) { console.log('  No results'); return; }
    
    const movie = arr[0];
    console.log(`  Movie: "${movie.t}" ID: ${movie.id}`);
    
    // play.php
    await delay(500);
    const playRes = await request(`${base}/play.php`, {
      method: 'POST', body: `id=${movie.id}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookies, 'X-Requested-With': 'XMLHttpRequest', 'Referer': `${base}/` }
    });
    const hToken = JSON.parse(playRes.body).h;
    if (!hToken) { console.log('  No h-token'); return; }
    console.log(`  h-token: ${hToken.substring(0, 30)}...`);
    
    // playlist.php
    await delay(500);
    const plRes = await request(`${base}/playlist.php?id=${movie.id}&t=${ts}&h=${encodeURIComponent(hToken)}&ott=nf`, {
      headers: { 'Cookie': `${cookies} hd=on;`, 'Referer': `${base}/`, 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' }
    });
    let plData = JSON.parse(plRes.body);
    if (Array.isArray(plData)) plData = plData[0];
    if (!plData?.sources?.length) { console.log('  No playlist sources'); return; }
    
    // Fetch master manifest
    let rawUrl = plData.sources[0].file;
    if (!rawUrl.startsWith('http')) rawUrl = `${base}${rawUrl}`;
    // Replace nm-cdn and in=unknown
    rawUrl = rawUrl.replace(/nm-cdn(\d+)?\.top/gi, (m, p) => p ? `freecdn${p}.top` : `freecdn2.top`);
    if (hToken.startsWith('in=')) rawUrl = rawUrl.replace(/in=unknown[^&]*/g, hToken);
    
    console.log(`  Manifest URL: ${rawUrl.substring(0, 70)}...`);
    
    await delay(1000);
    const m3u8Res = await request(rawUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer', 'Cookie': `${cookies} hd=on;`, 'Referer': `${base}/` }
    });
    
    let manifest = m3u8Res.body;
    manifest = manifest.replace(/nm-cdn(\d+)?\.top/gi, (m, p) => p ? `freecdn${p}.top` : `freecdn2.top`);
    if (hToken.startsWith('in=')) manifest = manifest.replace(/in=unknown[^\s&"']*/g, hToken);
    
    // Extract CDN URLs
    const cdnUrls = manifest.split('\n').map(l => l.trim()).filter(l => l.startsWith('http') && l.includes('.m3u8'));
    if (cdnUrls.length === 0) { console.log('  No CDN URLs in manifest'); return; }
    
    // Check the CDN hostname
    const cdnHost = new URL(cdnUrls[0]).hostname;
    console.log(`  CDN Host: ${cdnHost}`);
    console.log(`  CDN URL: ${cdnUrls[0].substring(0, 70)}...`);
    
    // Validate stream
    await delay(2000);
    const streamRes = await request(cdnUrls[0], {
      headers: { 'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer' }
    });
    
    const body = streamRes.body;
    const hasJpg = body.includes('.jpg') || body.includes('.jpeg');
    const hasTs = body.includes('.ts');
    
    if (hasJpg && !hasTs) {
      console.log(`  🚨 RATE LIMITED (.jpg slideshow)`);
    } else if (hasTs) {
      console.log(`  ✅ VALID STREAM (.ts segments found)`);
      // Show first line of segments
      const segments = body.split('\n').filter(l => l.includes('.ts')).slice(0, 3);
      segments.forEach(s => console.log(`    ${s.trim()}`));
    } else {
      console.log(`  ⚠ Unknown content`);
      console.log(`  First 200 chars: ${body.substring(0, 200)}`);
    }
    
    // Extract the audio tracks too
    const audioUrls = manifest.split('\n').filter(l => l.includes('URI="https')).map(l => {
      const m = l.match(/URI="([^"]+)"/);
      return m ? m[1] : null;
    }).filter(Boolean);
    if (audioUrls.length > 0) {
      console.log(`  Audio tracks: ${audioUrls.length}`);
      audioUrls.forEach(u => console.log(`    ${u.substring(0, 60)}...`));
    }
    
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}`);
  }
}

async function main() {
  const mirrors = ['https://net22.cc', 'https://net24.cc', 'https://netmirror.vip'];
  
  for (const mirror of mirrors) {
    await testMirror(mirror, 'Mercy');
    await delay(2000);
  }
  
  console.log('\n=== ALL DONE ===');
}

main().catch(e => console.error('Fatal:', e));
