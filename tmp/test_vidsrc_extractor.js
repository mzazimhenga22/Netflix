const tmdbId = '24428'; // Avengers

async function traceStreamDeep() {
  console.log(`\n======================================================`);
  console.log(`🕵️ DEEP TRACE: Tracking Vidsrc to the Raw CDN Video Source`);
  console.log(`======================================================`);

  try {
     const vidsrcScraper = await import('@definisi/vidsrc-scraper');
     const sc = vidsrcScraper.scrapeVidsrc;
     
     console.log(`\n[Stage 1] Decrypting Vidsrc embed to find HLS Manifest URL...`);
     const result = await sc(tmdbId);
     
     if (!result || !result.hlsUrl) {
         console.log(`❌ Failed to decrypt Vidsrc!`);
         return;
     }

     const hlsUrl = result.hlsUrl;
     console.log(`✅ Decrypted HLS Master Playlist: ${hlsUrl}`);

     console.log(`\n[Stage 2] Fetching the Master Playlist (.m3u8) to find resolutions...`);
     let masterRes = await fetch(hlsUrl, {
         headers: {
             'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
             'Referer': 'https://vidsrc.me/'
         }
     });
     let masterM3u8 = await masterRes.text();
     
     console.log(`\n=== Master Playlist Content ===`);
     console.log(masterM3u8.substring(0, 500) + '\n...');

     // Extract the sub-playlists
     let lines = masterM3u8.split('\n');
     let subPlaylistPaths = [];
     for(let l of lines) {
         if (l && !l.startsWith('#')) subPlaylistPaths.push(l);
     }

     if (subPlaylistPaths.length === 0) {
         console.log(`❌ No resolution sub-playlists found.`);
         return;
     }

     let subPath = subPlaylistPaths[subPlaylistPaths.length - 1];
     let absoluteSubUrl = subPath;
     if (!subPath.startsWith('http')) {
        const baseUrl = hlsUrl.substring(0, hlsUrl.lastIndexOf('/') + 1);
        absoluteSubUrl = baseUrl + subPath;
     }

     console.log(`\n✅ Targeting Resolution Sub-Playlist: ${absoluteSubUrl}`);

     console.log(`\n[Stage 3] Fetching the Sub-Playlist to find the raw CDN Video Chunks...`);
     let subRes = await fetch(absoluteSubUrl, {
         headers: {
             'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
             'Referer': 'https://vidsrc.me/'
         }
     });
     let subM3u8 = await subRes.text();

     console.log(`\n=== Sub-Playlist Content (Raw Video IPs/CDNs) ===`);
     let subParts = subM3u8.split('\n');
     for (let i = 0; i < Math.min(10, subParts.length); i++) {
         console.log(subParts[i]);
     }
     console.log(`...`);
     
     let cdnDomains = new Set();
     for (let l of subParts) {
         if (l.startsWith('http')) {
             try {
                let url = new URL(l);
                cdnDomains.add(url.hostname);
             } catch(e) {}
         }
     }

     console.log(`\n🎉 Deep Trace Complete! Vidsrc is streaming video chunks from the following direct CDNs:`);
     console.log(Array.from(cdnDomains));

  } catch (err) {
     console.log(`❌ Trace error: ${err.message}`);
  }
}

traceStreamDeep();
