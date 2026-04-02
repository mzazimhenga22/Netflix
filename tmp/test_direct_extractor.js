/**
 * Direct Source Extractor — bypasses vidsrc middleman
 * 
 * Chain discovered:
 * vidsrc.cc → /api/source/{token} → vidbox.site → streameeeeee.site (Vidcloud) → cloudnestra CDN
 * 
 * This script traces the chain programmatically to extract the final m3u8 stream.
 */

const TMDB_ID = '24428'; // Avengers (2012)
const TYPE = 'movie';    // 'movie' or 'tv'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function extractDirect(tmdbId, type = 'movie', season, episode) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎬 Direct Source Extractor — TMDB ${tmdbId} (${type})`);
  console.log(`${'='.repeat(60)}`);

  // ============================
  // STAGE 1: Hit vidsrc.cc embed to get the source token
  // ============================
  console.log(`\n[Stage 1] Fetching vidsrc.cc embed page...`);
  
  let embedPath = type === 'tv' && season && episode
    ? `/v2/embed/tv/${tmdbId}/${season}/${episode}`
    : `/v2/embed/${type}/${tmdbId}`;
  
  const embedUrl = `https://vidsrc.cc${embedPath}`;
  console.log(`  → ${embedUrl}`);
  
  let embedRes;
  try {
    embedRes = await fetch(embedUrl, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10000)
    });
  } catch (e) {
    console.log(`  ❌ vidsrc.cc unreachable: ${e.message}`);
    return null;
  }
  
  const embedHtml = await embedRes.text();
  console.log(`  ✅ Got embed HTML (${embedHtml.length} bytes)`);

  // Extract the data-hash or source token from the HTML
  // vidsrc.cc uses a data attribute or an encoded source ID
  const hashMatch = embedHtml.match(/data-hash="([^"]+)"/i)
    || embedHtml.match(/data-id="([^"]+)"/i)
    || embedHtml.match(/sourcehash\s*=\s*['"]([^'"]+)['"]/i);
  
  // Also look for direct API endpoint in scripts
  const apiMatch = embedHtml.match(/\/api\/source\/([a-zA-Z0-9_-]+)/i);
  
  // Look for iframe sources directly  
  const iframeMatch = embedHtml.match(/<iframe[^>]+src="([^"]+)"/i);
  
  // Look for a source list/server list script
  const sourceListMatch = embedHtml.match(/sources?\s*[:=]\s*(\[[^\]]+\])/i);
  
  console.log(`  data-hash: ${hashMatch ? hashMatch[1] : 'none'}`);
  console.log(`  apiPath: ${apiMatch ? apiMatch[0] : 'none'}`);
  console.log(`  iframe: ${iframeMatch ? iframeMatch[1].substring(0, 80) : 'none'}`);
  console.log(`  sourceList: ${sourceListMatch ? 'found' : 'none'}`);

  // Try to find server/source buttons
  const serverMatches = [...embedHtml.matchAll(/data-(?:hash|id|src)="([^"]+)"/gi)];
  console.log(`  Server tokens found: ${serverMatches.length}`);
  for (const sm of serverMatches.slice(0, 5)) {
    console.log(`    → ${sm[0].substring(0, 80)}`);
  }

  // ============================
  // STAGE 2: Call the vidsrc.cc API to get actual source
  // ============================
  let sourceUrl = null;
  
  if (apiMatch) {
    console.log(`\n[Stage 2] Calling vidsrc.cc source API...`);
    const apiUrl = `https://vidsrc.cc${apiMatch[0]}`;
    try {
      const apiRes = await fetch(apiUrl, {
        headers: {
          'User-Agent': UA,
          'Referer': embedUrl
        },
        signal: AbortSignal.timeout(10000)
      });
      const apiData = await apiRes.json();
      console.log(`  ✅ API response:`, JSON.stringify(apiData).substring(0, 300));
      
      if (apiData?.data?.source) {
        sourceUrl = apiData.data.source;
      }
    } catch (e) {
      console.log(`  ❌ API call failed: ${e.message}`);
    }
  }
  
  // If no API path found, try hitting the hash-based endpoints
  if (!sourceUrl && hashMatch) {
    console.log(`\n[Stage 2b] Trying hash-based source API...`);
    const hashApiUrls = [
      `https://vidsrc.cc/api/source/${hashMatch[1]}`,
      `https://vidsrc.cc/api/e/${hashMatch[1]}`,
    ];
    
    for (const hUrl of hashApiUrls) {
      try {
        console.log(`  → Trying: ${hUrl}`);
        const hRes = await fetch(hUrl, {
          headers: { 'User-Agent': UA, 'Referer': embedUrl },
          signal: AbortSignal.timeout(8000)
        });
        const hData = await hRes.text();
        console.log(`  Response (${hData.length}): ${hData.substring(0, 200)}`);
        
        // Try to parse JSON
        try {
          const json = JSON.parse(hData);
          if (json?.data?.source || json?.source || json?.url || json?.data?.url) {
            sourceUrl = json?.data?.source || json?.source || json?.url || json?.data?.url;
            console.log(`  ✅ Got source URL: ${sourceUrl}`);
            break;
          }
        } catch { /* not json */ }
        
        // Check for m3u8 in raw text
        const m3u8Match = hData.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i);
        if (m3u8Match) {
          sourceUrl = m3u8Match[1];
          console.log(`  ✅ Found m3u8 directly: ${sourceUrl}`);
          break;
        }
      } catch (e) {
        console.log(`  ⚠️ Failed: ${e.message}`);
      }
    }
  }

  // If we got an iframe src directly, follow that
  if (!sourceUrl && iframeMatch) {
    sourceUrl = iframeMatch[1];
    if (sourceUrl.startsWith('//')) sourceUrl = 'https:' + sourceUrl;
    console.log(`\n[Stage 2c] Using iframe source: ${sourceUrl}`);
  }

  if (!sourceUrl) {
    console.log(`\n❌ Could not extract source URL from vidsrc.cc`);
    
    // Dump a snippet of the HTML for debugging
    console.log(`\nHTML snippet (first 1000 chars):`);
    console.log(embedHtml.substring(0, 1000));
    
    // Also dump script tags
    const scripts = [...embedHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
    for (let i = 0; i < Math.min(3, scripts.length); i++) {
      const code = scripts[i][1].trim();
      if (code.length > 30) {
        console.log(`\n--- Script ${i + 1} (${code.length} chars) ---`);
        console.log(code.substring(0, 400));
      }
    }
    return null;
  }

  // ============================
  // STAGE 3: Follow the source to the actual video host
  // ============================
  console.log(`\n[Stage 3] Following source: ${sourceUrl.substring(0, 80)}...`);
  
  try {
    const srcRes = await fetch(sourceUrl, {
      headers: {
        'User-Agent': UA,
        'Referer': 'https://vidsrc.cc/'
      },
      signal: AbortSignal.timeout(10000)
    });
    const srcHtml = await srcRes.text();
    console.log(`  ✅ Source response (${srcHtml.length} bytes)`);
    
    // Check if it's already an m3u8
    if (srcHtml.includes('#EXTM3U')) {
      console.log(`  🎉 Direct m3u8 manifest found!`);
      console.log(srcHtml.substring(0, 500));
      return { url: sourceUrl, type: 'hls' };
    }
    
    // Look for nested iframe (vidbox → streameeeeee)
    const nestedIframe = srcHtml.match(/<iframe[^>]+src="([^"]+)"/i);
    if (nestedIframe) {
      let nestedUrl = nestedIframe[1];
      if (nestedUrl.startsWith('//')) nestedUrl = 'https:' + nestedUrl;
      console.log(`  Found nested iframe: ${nestedUrl.substring(0, 80)}`);
      
      // Follow the nested iframe
      const nestedRes = await fetch(nestedUrl, {
        headers: {
          'User-Agent': UA,
          'Referer': sourceUrl
        },
        signal: AbortSignal.timeout(10000)
      });
      const nestedHtml = await nestedRes.text();
      console.log(`  Nested response (${nestedHtml.length} bytes)`);
      
      // Search for m3u8 URLs in the nested page
      const m3u8Urls = nestedHtml.match(/(https?:\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*)/gi);
      if (m3u8Urls) {
        console.log(`  🎉 Found m3u8 in nested page!`);
        for (const u of m3u8Urls) console.log(`    → ${u.substring(0, 100)}`);
        return { url: m3u8Urls[0], type: 'hls' };
      }
      
      // Search for file/source in script
      const fileMatch = nestedHtml.match(/['"]?file['"]?\s*[:=]\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i)
        || nestedHtml.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*['"]([^'"]+)['"]/i)
        || nestedHtml.match(/source\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i);
        
      if (fileMatch) {
        console.log(`  🎉 Found file source in script: ${fileMatch[1].substring(0, 100)}`);
        return { url: fileMatch[1], type: 'hls' };
      }
      
      // Look for encoded/obfuscated data that might contain the URL
      const encodedMatch = nestedHtml.match(/atob\s*\(\s*['"]([A-Za-z0-9+/=]+)['"]\s*\)/);
      if (encodedMatch) {
        try {
          const decoded = Buffer.from(encodedMatch[1], 'base64').toString();
          console.log(`  Found base64 encoded data: ${decoded.substring(0, 200)}`);
          const decodedM3u8 = decoded.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i);
          if (decodedM3u8) {
            console.log(`  🎉 Decoded m3u8: ${decodedM3u8[1]}`);
            return { url: decodedM3u8[1], type: 'hls' };
          }
        } catch {}
      }
      
      // Dump script content for analysis
      console.log(`\n  Nested page scripts:`);
      const nestedScripts = [...nestedHtml.matchAll(/<script[^>]*src="([^"]+)"/gi)];
      for (const ns of nestedScripts.slice(0, 10)) {
        console.log(`    script: ${ns[1]}`);
      }
      
      // Look for API/XHR endpoints in inline scripts
      const inlineScripts = [...nestedHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
      for (let i = 0; i < inlineScripts.length; i++) {
        const code = inlineScripts[i][1].trim();
        if (code.length > 50) {
          console.log(`\n  --- Nested Script ${i + 1} (${code.length} chars) ---`);
          console.log(`  ${code.substring(0, 500)}`);
        }
      }
    }
    
    // Look for m3u8 in the direct source HTML  
    const directM3u8 = srcHtml.match(/(https?:\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*)/gi);
    if (directM3u8) {
      console.log(`  🎉 Found m3u8: ${directM3u8[0]}`);
      return { url: directM3u8[0], type: 'hls' };
    }
    
    // Dump for manual inspection
    console.log(`\n  Source page scripts:`);
    const srcScripts = [...srcHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
    for (let i = 0; i < Math.min(5, srcScripts.length); i++) {
      const code = srcScripts[i][1].trim();
      if (code.length > 30) {
        console.log(`\n  --- Source Script ${i + 1} (${code.length} chars) ---`);
        console.log(`  ${code.substring(0, 500)}`);
      }
    }
    
  } catch (e) {
    console.log(`  ❌ Source fetch failed: ${e.message}`);
  }

  return null;
}

// Run it
extractDirect(TMDB_ID, TYPE).then(result => {
  console.log(`\n${'='.repeat(60)}`);
  if (result) {
    console.log(`🎉 EXTRACTED STREAM:`);
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`❌ Extraction failed — the source uses runtime JS decryption.`);
    console.log(`\n💡 RECOMMENDATION: Use these alternatives instead of vidsrc:`);
    console.log(`   1. VidLink (already working via WebView — keeps it)`);
    console.log(`   2. Build a pure-fetch extractor for the API chain`);
  }
  console.log(`${'='.repeat(60)}\n`);
}).catch(console.error);
