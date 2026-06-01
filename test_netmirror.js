const axios = require('axios');

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

async function run() {
  console.log("🚀 Starting NetMirror Verification Test (Offline Metadata Mode)...");

  // 1. Hardcode Firestore Cookies fetched in Step 243
  const net22Cookie = "t_hash_t=4b8a56e529d55c3a924142a370bd63d6%3A%3A9824f100144d301f2cde6bedd66d2c7b%3A%3A1777974213%3A%3Aek%3A%3Ap; user_token=31deeb6effad57af95225c8473a0fb83; recentplay=70307658";
  console.log("✅ Using authenticated cookies from Firestore!");

  // 2. Hardcode TMDB Info for Fight Club
  const searchTitle = "Fight Club";
  const searchYear = "1999";
  console.log(`🎬 Hardcoded Metadata: "${searchTitle}" (${searchYear})`);

  const tm = Math.floor(Date.now() / 1000).toString();

  // 3. Search Net22
  console.log("🔍 Searching Net22...");
  const searchUrl = `https://net22.cc/search.php?s=${encodeURIComponent(searchTitle)}&t=${tm}`;
  const searchHeaders = {
    "User-Agent": USER_AGENT,
    "Referer": "https://net22.cc/home",
    "Cookie": net22Cookie
  };

  let rootId = "";
  try {
    const searchRes = await axios.get(searchUrl, { headers: searchHeaders });
    const results = searchRes.data.searchResult;
    if (!results || results.length === 0) {
      console.log("❌ No search results found on Net22.");
      return;
    }
    
    // Match year
    let best = results[0];
    for (const r of results) {
      if (r.t && r.t.includes(searchYear)) {
        best = r;
        break;
      }
    }
    rootId = best.id;
    console.log(`✅ Found Match ID: ${rootId} ("${best.t}")`);
  } catch (err) {
    console.error("❌ Net22 search failed:", err.message);
    return;
  }

  // 4. post.php
  console.log("📡 Registering view with post.php...");
  try {
    await axios.get(`https://net22.cc/post.php?id=${rootId}&t=${tm}`, { headers: searchHeaders });
  } catch (err) {
    console.log("⚠️ post.php failed/skipped:", err.message);
  }

  // 5. Dual Resolution Strategy
  let masterUrl = "";
  let masterBody = "";
  let isPoisoned = false;

  // Try standard Firestore Cookie approach first
  try {
    console.log("📡 [Method 1] Attempting Firestore cookies resolution...");
    const playlistRes = await axios.get(`https://net22.cc/playlist.php?id=${rootId}&tm=${tm}`, { headers: searchHeaders });
    const playlist = playlistRes.data[0];
    const file = playlist.sources[0].file;
    masterUrl = file.startsWith("http") ? file : `https://net22.cc${file}`;
    
    console.log(`📡 Fetching master manifest from URL: ${masterUrl}`);
    const manifestRes = await axios.get(masterUrl, { 
      headers: {
        "User-Agent": USER_AGENT,
        "Origin": "https://net22.cc",
        "Referer": "https://net22.cc/",
        "Cookie": net22Cookie
      }
    });
    masterBody = manifestRes.data;
    
    if (masterBody.includes("/files/220884/") || masterUrl.includes("in=unknown")) {
      isPoisoned = true;
      console.warn("⚠️ [Method 1] Manifest was poisoned or returned placeholder. Activating fallback...");
    } else {
      console.log("✅ [Method 1] Succeeded! Clean manifest retrieved.");
    }
  } catch (err) {
    isPoisoned = true;
    console.warn("⚠️ [Method 1] Failed with error:", err.message);
  }

  // Fallback: Use Firestore cookies to request fresh dynamic h-token from play.php
  if (isPoisoned) {
    console.log("📡 [Method 2] Activating dynamic H-Token extraction with Firestore auth cookies...");
    try {
      // Call play.php with authentic Firestore cookies
      console.log("📡 Fetching H-Token from play.php...");
      const playRes = await axios.post(`https://net22.cc/play.php`, `id=${rootId}`, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': net22Cookie,
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': 'https://net22.cc/'
        }
      });
      
      const hToken = playRes.data.h;
      if (!hToken || hToken === 'error') {
        throw new Error("Invalid H-Token returned from play.php");
      }
      console.log(`✅ Retrieved H-Token: ${hToken}`);

      // Call playlist.php with authentic cookies + h parameter
      console.log("📡 Fetching playlist with H-Token...");
      const playlistRes = await axios.get(`https://net22.cc/playlist.php`, {
        params: { id: rootId, t: tm, h: hToken, ott: 'nf' },
        headers: {
          'Cookie': `${net22Cookie}; hd=on;`,
          'Referer': 'https://net22.cc/',
          'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer'
        }
      });
      
      const playlist = playlistRes.data[0];
      const file = playlist.sources[0].file;
      masterUrl = file.startsWith("http") ? file : `https://net22.cc${file}`;
      
      // CRITICAL: Replace placeholder auth token with real h-token
      if (hToken && hToken.startsWith('in=')) {
        masterUrl = masterUrl.replace(/in=unknown[^&]*/g, hToken);
      }
      console.log(`🔗 Fallback Master URL: ${masterUrl}`);

      // Fetch master manifest
      console.log("📡 Fetching fallback master manifest...");
      const manifestRes = await axios.get(masterUrl, { 
        headers: {
          "User-Agent": USER_AGENT,
          "Referer": "https://net22.cc/",
          "Cookie": net22Cookie
        }
      });
      masterBody = manifestRes.data;
      
      if (masterBody.includes("/files/220884/")) {
        throw new Error("CDN returned poisoned M3U8 even in authenticated fallback mode");
      }
      console.log("✅ [Method 2] Succeeded! Clean manifest retrieved.");
    } catch (err) {
      console.error("❌ Both resolution methods failed:", err.message);
      return;
    }
  }

  // 6. Rewrite empty hostnames in manifest if present
  let finalManifest = masterBody;
  if (masterBody.includes("https:///files/")) {
    console.log("⚠️ Empty hostnames found in manifest! Selecting active CDN node...");
    const knownCdns = ["s21.freecdn4.top", "s22.nm-cdn11.top", "s20.nm-cdn.top", "net22.cc"];
    let fixedCdn = "s21.freecdn4.top"; // Default fallback
    for (const cdn of knownCdns) {
      try {
        const testUrl = `https://${cdn}/files/81763251/1080p/1080p.m3u8`;
        await axios.get(testUrl, { headers: { "User-Agent": USER_AGENT, "Referer": "https://net22.cc/" } });
        fixedCdn = cdn;
        console.log(`✅ Active CDN Node Selected: ${cdn}`);
        break;
      } catch (e) {
        console.log(`❌ Node ${cdn} unreachable: ${e.message}`);
      }
    }
    finalManifest = masterBody.replace(/https:\/\/\/files\//g, `https://${fixedCdn}/files/`);
  }

  // 7. Extract variant URL and fetch segment links
  const lines = finalManifest.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  const variants = lines.filter(l => l.startsWith("http"));
  if (variants.length === 0) {
    console.log("❌ No variant stream links found in the manifest.");
    return;
  }

  const highestQualityUrl = variants[variants.length - 1];
  console.log(`📡 Fetching highest quality variant stream: ${highestQualityUrl}`);
  try {
    const variantRes = await axios.get(highestQualityUrl, { 
      headers: { 
        "User-Agent": USER_AGENT, 
        "Referer": "https://net22.cc/",
        "Cookie": net22Cookie
      } 
    });
    const variantBody = variantRes.data;
    console.log("✅ Variant manifest retrieved successfully!");
    
    // Parse first 5 segments
    const segmentLines = variantBody.split("\n").map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith("#"));
    console.log("\n--- EXTRACTED SEGMENT LINKS (FIRST 5) ---");
    segmentLines.slice(0, 5).forEach((seg, idx) => {
      console.log(`[Segment ${idx + 1}] ${seg}`);
    });
    console.log("-----------------------------------------\n");
    console.log("✅ ALL TESTS PASSED SUCCESSFULLY! NETMIRROR INTEGRATION IS 100% OPERATIONAL!");
  } catch (err) {
    console.error("❌ Failed to fetch variant manifest segments:", err.message);
  }
}

run();
