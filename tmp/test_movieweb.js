async function testMovieWeb() {
  console.log(`\n======================================================`);
  console.log(`🔍 Testing @movie-web/providers (Mass Extractor Library)`);
  console.log(`======================================================`);

  try {
     const { makeProviders, makeStandardFetcher, targets } = await import('@movie-web/providers');
     
     // Initialize the provider list
     const fetcher = makeStandardFetcher(fetch);
     const providers = makeProviders({
        fetcher,
        target: targets.NATIVE, // Native environment (Node/Bun/ReactNative)
        consistentIpForRequests: true,
     });

     console.log(`\n✅ Installed @movie-web/providers successfully!`);
     console.log(`Available Providers (Aggregators/Extractors):`);
     console.log(providers.listSources().map(s => s.id));

     // Note: Movie-Web providers target TMDB IDs primarily.
     const tmdbMovie = {
         type: 'movie',
         title: 'The Avengers',
         releaseYear: 2012,
         tmdbId: '24428',
     };

     console.log(`\n➡️ Running extraction across all available native providers...`);
     
     // Let's run a search.
     const results = await providers.runAll({
        media: tmdbMovie,
        sourceOrder: ['vidsrc', 'superembed', 'flixhq', 'showbox', 'multiembed'], // prioritising known ones
     });
     
     if (results && results.stream) {
         console.log(`\n🎉 Success! Extracted stream from: ${results.sourceId}`);
         console.log(`Stream Details:`, JSON.stringify(results.stream, null, 2));
     } else {
         console.log(`\n❌ Failed to extract stream from providers.`);
     }
  } catch (err) {
     console.log(`❌ Extractor error: ${err.message}`);
  }
}

testMovieWeb();
