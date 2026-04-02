const tmdbId = '24428'; // Avengers
const baseUrl = `https://vidsrc.xyz/embed/movie/${tmdbId}`;

async function reverseEngineerVidsrc() {
    console.log(`\n=================================================`);
    console.log(`🔍 [1] Fetching Main Wrapper: ${baseUrl}`);
    let res = await fetch(baseUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    let html = await res.text();
    
    // Check for iframe
    const iframeMatch = html.match(/<iframe[^>]+src="([^"]+)"/i);
    if (!iframeMatch) {
        console.log(`❌ No iframe found. HTML Excerpt:`, html.substring(0, 500));
        return;
    }
    
    let iframeUrl = iframeMatch[1];
    if (iframeUrl.startsWith('//')) iframeUrl = 'https:' + iframeUrl;
    console.log(`✅ Found Player Wrapper Iframe -> ${iframeUrl}`);
    
    console.log(`\n🔍 [2] Fetching Player Wrapper...`);
    res = await fetch(iframeUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': baseUrl
        }
    });
    html = await res.text();
    
    // In Vidsrc, the actual player script is usually heavily obfuscated.
    // Let's look for script tags that might contain RC4/Base64 tokens or source arrays.
    console.log(`➡️ Scanning Player Wrapper for Source Tokens...`);
    
    const srcrcp = html.match(/srcrcp\s*=\s*'([^']+)'/);
    const hiddenUrls = html.match(/(https:\/\/[A-Za-z0-9.-]+\/[\w-]+\/.*?\.m3u8)/g);
    
    if (hiddenUrls) {
        console.log(`🎉 Found raw hidden M3U8 string! ->`, hiddenUrls[0]);
        return;
    }
    
    // Look for data-hash or embedded JSON payloads
    const hashMatch = html.match(/data-hash="([^"]+)"/);
    if (hashMatch) {
       console.log(`✅ Found Data-Hash attribute ->`, hashMatch[1]);
    }
    
    // Dump scripts for manual inspection
    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
    console.log(`\nFound ${scripts.length} script tags.`);
    for (let i = 0; i < scripts.length; i++) {
        let code = scripts[i][1].trim();
        if (code.length > 50) {
            console.log(`\n--- Script ${i+1} Snippet ---`);
            console.log(code.substring(0, 300) + '...');
        }
    }
}

reverseEngineerVidsrc();
