import { fetchNetMirrorStream } from '../services/netmirror';
import { fetchStreamingLinks } from '../services/streaming';
import axios from 'axios';

const TMDB_API_KEY = '8baba8ab6b8bbe247645bcae7df63d0d';

async function test() {
  try {
    const searchRes = await axios.get(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=Greenland+Migration`);
    const movie = searchRes.data.results[0];
    
    if (!movie) {
      console.log('Movie not found on TMDB');
      return;
    }
    
    console.log(`Testing for: ${movie.title} (ID: ${movie.id}, Year: ${movie.release_date.split('-')[0]})`);
    
    console.log('\n--- 1. Testing NetMirror ---');
    const netMirror = await fetchNetMirrorStream(movie.title, undefined, undefined, movie.release_date.split('-')[0]);
    if (netMirror) {
      console.log('✅ NetMirror found links!');
    } else {
      console.log('❌ NetMirror failed.');
    }
    
    console.log('\n--- 2. Testing Consumet/Mirrors ---');
    const stream = await fetchStreamingLinks(movie.id.toString(), 'movie');
    if (stream && stream.sources.length > 0) {
      console.log('✅ Consumet found links:', stream.sources);
    } else {
      console.log('❌ Consumet failed to find any links.');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

test();
