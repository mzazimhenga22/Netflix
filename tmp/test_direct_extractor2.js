/**
 * Direct Source Extractor v2 — decode vidsrc.cc's client-side tokens
 * 
 * From Stage 1 we found:
 *   v = base64("The Avengers_2012_null")  → title_year_episode
 *   userId = "BB0IMAUjAD4GGn16ByB9MAcY"  → encrypted session token
 *   data-id="24428" (server 1), data-id="8272" (server 2)
 * 
 * The JS client calls /api/source/{hash} with these + a signature.
 * Let's figure out the exact API call needed.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function extractVidsrcCC(tmdbId, type = 'movie') {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎬 Vidsrc.cc Deep Extractor — TMDB ${tmdbId}`);
  console.log(`${'='.repeat(60)}`);

  // Step 1: Get the embed page and extract all tokens
  const embedUrl = `https://vidsrc.cc/v2/embed/${type}/${tmdbId}`;
  console.log(`\n[1] Fetching embed: ${embedUrl}`);
  
  const embedRes = await fetch(embedUrl, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(10000)
  });
  const html = await embedRes.text();
  
  // Extract the encoded variables
  const vMatch = html.match(/var\s+v\s*=\s*"([^"]+)"/);
  const clientMatch = html.match(/var\s+client\s*=\s*"([^"]+)"/);
  const userIdMatch = html.match(/var\s+userId\s*=\s*"([^"]+)"/);
  const movieIdMatch = html.match(/var\s+movieId\s*=\s*"([^"]+)"/);
  const imdbIdMatch = html.match(/var\s+imdbId\s*=\s*"([^"]+)"/);
  
  const v = vMatch?.[1];
  const client = clientMatch?.[1];
  const userId = userIdMatch?.[1];
  
  console.log(`  v (base64): ${v}`);
  console.log(`  v (decoded): ${v ? Buffer.from(v, 'base64').toString() : 'N/A'}`);
  console.log(`  client (base64): ${client}`);
  console.log(`  client (decoded): ${client ? Buffer.from(client, 'base64').toString() : 'N/A'}`);
  console.log(`  userId: ${userId}`);
  console.log(`  movieId: ${movieIdMatch?.[1]}`);
  console.log(`  imdbId: ${imdbIdMatch?.[1]}`);
  
  // Extract source server IDs from buttons
  const serverIds = [...html.matchAll(/data-id="([^"]+)"/g)].map(m => m[1]);
  console.log(`  Server IDs: ${JSON.stringify(serverIds)}`);
  
  // Find the JS bundle that handles the API calls
  const jsSrcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/gi)].map(m => m[1]);
  console.log(`  JS Files: ${JSON.stringify(jsSrcs)}`);
  
  // Look for the embed.min.js or similar that contains the API logic
  const embedJsUrl = jsSrcs.find(s => s.includes('embed') && s.includes('.js'));
  
  if (embedJsUrl) {
    console.log(`\n[2] Fetching embed JS: ${embedJsUrl}`);
    const fullJsUrl = embedJsUrl.startsWith('http') ? embedJsUrl : `https://vidsrc.cc${embedJsUrl}`;
    
    try {
      const jsRes = await fetch(fullJsUrl, {
        headers: { 'User-Agent': UA, 'Referer': embedUrl },
        signal: AbortSignal.timeout(10000)
      });
      const jsCode = await jsRes.text();
      console.log(`  ✅ Got JS (${jsCode.length} bytes)`);
      
      // Look for API endpoint patterns
      const apiPatterns = jsCode.match(/['"]\/api\/[^'"]+['"]/gi); 
      if (apiPatterns) {
        console.log(`  API endpoints found:`);
        for (const p of [...new Set(apiPatterns)]) console.log(`    → ${p}`);
      }
      
      // Look for fetch/ajax calls
      const fetchCalls = jsCode.match(/fetch\s*\(\s*['"`][^'"`]+['"`]/gi);
      if (fetchCalls) {
        console.log(`  Fetch calls found:`);
        for (const f of fetchCalls.slice(0, 10)) console.log(`    → ${f.substring(0, 80)}`);
      }
      
      // Look for axios/XHR patterns  
      const xhrCalls = jsCode.match(/\.(?:get|post)\s*\(\s*['"`][^'"`]+['"`]/gi);
      if (xhrCalls) {
        console.log(`  XHR calls found:`);
        for (const x of xhrCalls.slice(0, 10)) console.log(`    → ${x.substring(0, 80)}`);
      }
      
      // Look for source/hash API construction
      const sourceApiPattern = jsCode.match(/['"](\/api\/[^\s'"]+source[^\s'"]*)['"]/gi)
        || jsCode.match(/api.*source/gi);
      if (sourceApiPattern) {
        console.log(`  Source API patterns:`);
        for (const p of sourceApiPattern.slice(0, 5)) console.log(`    → ${p.substring(0, 100)}`);
      }
      
      // Look for how the hash/token is constructed  
      const hashConstruction = jsCode.match(/hash\s*[:=][^;]{5,80}/gi);
      if (hashConstruction) {
        console.log(`  Hash construction:`);
        for (const h of hashConstruction.slice(0, 5)) console.log(`    → ${h}`);
      }
      
      // Find the function that handles server button clicks
      const clickHandler = jsCode.match(/(?:click|server|source)[^{]*\{[^}]{100,500}\}/gi);
      if (clickHandler) {
        console.log(`\n  Click/Source handler snippet:`);
        console.log(`    ${clickHandler[0].substring(0, 400)}`);
      }
      
      // Dump a chunk centered around 'api' mentions for manual analysis
      const apiIndex = jsCode.indexOf('/api/');
      if (apiIndex > -1) {
        console.log(`\n  JS context around '/api/' call:`);
        const start = Math.max(0, apiIndex - 200);
        const end = Math.min(jsCode.length, apiIndex + 400);
        console.log(`  ...${jsCode.substring(start, end)}...`);
      }
      
    } catch (e) {
      console.log(`  ❌ Failed: ${e.message}`);
    }
  }
  
  // Step 3: Try all the API variations with different parameters
  console.log(`\n[3] Brute-force API variations...`);
  
  const apiVariations = [
    { url: `/api/source/${serverIds[0]}`, method: 'GET' },
    { url: `/api/source/${serverIds[1]}`, method: 'GET' },
    { url: `/api/source/${serverIds[0]}`, method: 'POST', body: `v=${v}&client=${client}&userId=${userId}` },
    { url: `/api/source/${serverIds[0]}`, method: 'POST', body: JSON.stringify({v, client, userId}), ct: 'application/json' },
    { url: `/v2/embed/source/${serverIds[0]}?token=${userId}`, method: 'GET' },
  ];
  
  for (const api of apiVariations) {
    const fullUrl = `https://vidsrc.cc${api.url}`;
    console.log(`\n  → ${api.method} ${fullUrl}`);
    try {
      const opts = {
        method: api.method,
        headers: {
          'User-Agent': UA,
          'Referer': embedUrl,
          'X-Requested-With': 'XMLHttpRequest',
        },
        signal: AbortSignal.timeout(8000)
      };
      if (api.body) {
        opts.body = api.body;
        opts.headers['Content-Type'] = api.ct || 'application/x-www-form-urlencoded';
      }
      const res = await fetch(fullUrl, opts);
      const text = await res.text();
      console.log(`  Status: ${res.status}, Response: ${text.substring(0, 300)}`);
      
      // Check for successful source extraction
      try {
        const json = JSON.parse(text);
        if (json?.data?.source || json?.data?.url || json?.url || json?.source) {
          const src = json?.data?.source || json?.data?.url || json?.url || json?.source;
          console.log(`\n  🎉 SUCCESS! Source: ${src}`);
          return src;
        }
      } catch {}
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }
  
  return null;
}

extractVidsrcCC('24428', 'movie').then(result => {
  console.log(`\n${'='.repeat(60)}`);
  if (result) {
    console.log(`🎉 EXTRACTED: ${result}`);
  } else {
    console.log(`❌ The API requires client-side JS execution for token generation`);
    console.log(`💡 But we now know the exact chain and can build a WebView-based version`);
  }
  console.log(`${'='.repeat(60)}\n`);
}).catch(e => console.error('Fatal:', e.message));
