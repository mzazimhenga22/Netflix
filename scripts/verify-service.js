const { fetchNetMirrorStream } = require('../services/netmirror');

// Mock console.log to capture service output if needed, or just let it print
async function runTests() {
  const tests = [
    { name: 'TV: One Piece Ep 1', title: 'One Piece', seasonEpisode: 1, year: '1999' },
    { name: 'TV: Beauty in Black S02E09', title: 'Beauty in Black', seasonEpisode: 9, year: '2024' },
    { name: 'Movie: Inception', title: 'Inception', year: '2010' },
    { name: 'Movie: Gimme Shelter', title: 'Gimme Shelter', year: '2013' },
    { name: 'Movie: Project Hail Mary', title: 'Project Hail Mary', year: '2026' }
  ];
  
  for (const t of tests) {
    console.log(`\n--- Testing: ${t.name} ---`);
    try {
      const result = await fetchNetMirrorStream(t.title, undefined, undefined, t.year, t.seasonEpisode);
      if (result) {
        console.log(`✅ SUCCESS: Found ${result.sources.length} sources`);
        console.log(`🔗 Top Source: ${result.sources[0].url.substring(0, 60)}...`);
      } else {
        console.log(`❌ FAILED: No valid links found.`);
      }
    } catch (e) {
      console.log(`💥 CRASH: ${e.message}`);
    }
  }
}

// We need to handle the fact that services/netmirror.ts is TS and uses ESM/CommonJS mix in this env
// Actually, I'll just run a simpler version that doesn't require complex imports if it fails
runTests().catch(console.error);
