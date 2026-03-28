import axios from 'axios';

// NOTE: This is a demo API key often used in tutorials. 
// For production, please get your own from themoviedb.org and use environment variables.
const TMDB_API_KEY = '8baba8ab6b8bbe247645bcae7df63d0d';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE_URL = 'https://image.tmdb.org/t/p/original';

export const tmdb = axios.create({
  baseURL: BASE_URL,
  params: {
    api_key: TMDB_API_KEY,
    language: 'en-US',
  },
});

export const getImageUrl = (path: string | null) => path ? `${IMAGE_BASE_URL}${path}` : undefined;
export const getBackdropUrl = (path: string | null) => path ? `${BACKDROP_BASE_URL}${path}` : undefined;

export const fetchTrending = async (type: 'movie' | 'tv' | 'all' = 'all') => {
  const { data } = await tmdb.get(`/trending/${type}/week`);
  return data.results;
};

export const fetchPopular = async (type: 'movie' | 'tv' = 'movie', isKids: boolean = false) => {
  if (isKids) {
    return fetchDiscoverByGenre(type, 10751); // 10751 is Family
  }
  const { data } = await tmdb.get(`/${type}/popular`);
  return data.results;
};

export const fetchTopRated = async (type: 'movie' | 'tv' = 'movie') => {
  const { data } = await tmdb.get(`/${type}/top_rated`);
  return data.results;
};

export const fetchUpcoming = async () => {
  const { data } = await tmdb.get('/movie/upcoming');
  return data.results;
};

export const fetchVideos = async (id: number, type: 'movie' | 'tv' = 'movie') => {
  const { data } = await tmdb.get(`/${type}/${id}/videos`);
  return data.results;
};

export const fetchMovieDetails = async (id: string, type: 'movie' | 'tv' = 'movie') => {
  const { data } = await tmdb.get(`/${type}/${id}`, {
    params: {
      append_to_response: 'credits,similar,external_ids',
    },
  });
  return data;
};

export const fetchSeasonDetails = async (tvId: string, seasonNumber: number) => {
  const { data } = await tmdb.get(`/tv/${tvId}/season/${seasonNumber}`);
  return data;
};

export const fetchDiscoverByGenre = async (type: 'movie' | 'tv', genreId: number, page: number = 1) => {
  const { data } = await tmdb.get(`/discover/${type}`, {
    params: {
      with_genres: genreId,
      page,
      sort_by: 'popularity.desc'
    }
  });
  return data.results;
};

export const searchMulti = async (query: string, isKids: boolean = false) => {
  if (!query) return [];
  const { data } = await tmdb.get(`/search/multi`, {
    params: {
      query,
      include_adult: false,
    },
  });
  // Filter out people, we only want movies and tv shows
  let results = data.results.filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv');

  if (isKids) {
    results = results.filter((item: any) => {
      const genres = item.genre_ids || [];
      return genres.includes(16) || genres.includes(10751); // 16: Animation, 10751: Family
    });
  }
  
  return results;
};
