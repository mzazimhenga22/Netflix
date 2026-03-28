
// @ts-ignore
require('ts-node').register({
  compilerOptions: {
    module: 'commonjs',
    esModuleInterop: true,
    allowJs: true
  }
});

const { fetchNetMirrorStream } = require('../services/netmirror');
const { Buffer } = require('buffer');

async function test() {
  console.log("🚀 Testing Breaking Bad S3 E2 with ts-node/register...");
  
  try {
    const result = await fetchNetMirrorStream("Breaking Bad - S3 E2", 2, undefined, "2008", 2);
    
    if (result && result.sources.length > 0) {
      console.log("✅ Found result!");
      const source = result.sources[0].url;
      console.log(`🔗 URL Prefix: ${source.substring(0, 100)}...`);
      
      if (source.startsWith('data:')) {
        console.log("📦 Data URI found, decoding manifest...");
        const base64 = source.split(',')[1].split('#')[0];
        const decoded = Buffer.from(base64, 'base64').toString();
        process.stdout.write("--- DECODED MANIFEST ---\n");
        process.stdout.write(decoded + "\n");
        process.stdout.write("--- END DECODED MANIFEST ---\n");
        
        if (decoded.includes('https:///')) {
          console.log("❌ ERROR: Broken audio URI still present!");
        } else {
          console.log("✅ SUCCESS: Fixed audio URIs found.");
        }
        
        if (decoded.includes('http')) {
          console.log("✅ SUCCESS: Absolute paths found.");
        }

        if (source.includes('#index.m3u8')) {
            console.log("✅ SUCCESS: Format hint found.");
        }
      } else {
        console.log("🔗 Direct URL found:", source);
      }
    } else {
      console.log("❌ No result found.");
    }
  } catch (e) {
    console.error("💥 Test failed:", e.message);
  }
}

test();
