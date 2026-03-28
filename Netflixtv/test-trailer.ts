import { fetchImdbTrailer } from './services/trailers';

async function testTrailer() {
  const tmdbId = 299534; // Avengers: Endgame
  console.log(`fetching trailer for TMDB ID: ${tmdbId}...`);
  const startTime = Date.now();
  
  const trailers = await fetchImdbTrailer(tmdbId, 'movie');
  
  const endTime = Date.now();
  
  if (trailers) {
    console.log(`✅ Success in ${endTime - startTime}ms`);
    console.log(`Found ${trailers.length} streams:`);
    trailers.forEach(t => console.log(`- ${t.quality} (${t.type}): ${t.url.substring(0, 80)}...`));
  } else {
    console.log(`❌ Failed or no trailers found (took ${endTime - startTime}ms)`);
  }
}

testTrailer();
