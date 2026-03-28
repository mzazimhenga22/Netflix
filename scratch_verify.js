// d:\Netflix2026\Netflix\scratch_verify.js
const { Buffer } = require('buffer');

// Mimic the rewrite logic from netmirror.ts
function rewriteManifest(content, originalUrl, fallbackHostname) {
    // 1. Fix dead CDN domains
    let rewrittenContent = content.replace(/nm-cdn(\d+)?\.top/gi, (match, p1) => {
        return p1 ? `freecdn${p1}.top` : `freecdn2.top`;
    });
    
    // 2. Fix broken audio URIs
    if (fallbackHostname) {
        rewrittenContent = rewrittenContent.replace(/URI="https:\/\/\//g, `URI="https://${fallbackHostname}/`);
    }

    // 3. FIX RELATIVE PATHS
    const baseUrlMatch = originalUrl.match(/^(https?:\/\/[^?#]+\/)/);
    if (baseUrlMatch) {
        const baseUrl = baseUrlMatch[1];
        const lines = rewrittenContent.split('\n');
        const absoluteLines = lines.map(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('http')) {
                if (trimmed.startsWith('/')) {
                    const domainMatch = baseUrl.match(/^(https?:\/\/[^/]+)/);
                    return domainMatch ? `${domainMatch[1]}${trimmed}` : `${baseUrl}${trimmed.substring(1)}`;
                }
                return `${baseUrl}${trimmed}`;
            }
            if (trimmed.includes('URI="') && !trimmed.includes('URI="http')) {
                return line.replace(/URI="([^"]+)"/, (match, path) => {
                    const absolutePath = path.startsWith('/') 
                        ? (baseUrl.match(/^(https?:\/\/[^/]+)/)?.[1] + path)
                        : (baseUrl + path);
                    return `URI="${absolutePath}"`;
                });
            }
            return line;
        });
        rewrittenContent = absoluteLines.join('\n');
    }
    return rewrittenContent;
}

const testContent = `
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=1280x720,AUDIO="audio"
media.m3u8
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",URI="https:///audio/en.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=2560000,RESOLUTION=1920x1080
https://nm-cdn1.top/video/1080.m3u8
/absolute/path/segment.ts
relative/path/segment.ts
`;

const originalUrl = "https://freecdn1.top/nf/movie/master.m3u8";
const fallbackHostname = "freecdn2.top";

console.log("--- Original Content ---");
console.log(testContent);

const result = rewriteManifest(testContent, originalUrl, fallbackHostname);

console.log("\n--- Rewritten Content ---");
console.log(result);

// Assertions
const lines = result.split('\n');
const hasRelative = lines.some(line => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('http');
});

if (hasRelative) {
    console.error("\n❌ FAILED: Relative paths still exist!");
} else {
    console.log("\n✅ SUCCESS: All paths are absolute.");
}

if (result.includes("nm-cdn")) {
    console.error("❌ FAILED: Dead domains still exist!");
} else {
    console.log("✅ SUCCESS: Dead domains replaced.");
}

if (result.includes("https:///")) {
    console.error("❌ FAILED: Broken audio URIs still exist!");
} else {
    console.log("✅ SUCCESS: Broken audio URIs fixed.");
}
