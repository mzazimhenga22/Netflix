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

const getKidsParams = (isKids?: boolean) => {
  return isKids ? {
    certification_country: 'US',
    'certification.lte': 'PG',
    without_genres: '27,53,80' // Exclude Horror, Thriller, Crime
  } : {};
};

export const fetchTrending = async (type: 'movie' | 'tv' | 'all' = 'all', isKids?: boolean) => {
  const { data } = await tmdb.get(`/trending/${type}/week`, {
    params: { ...getKidsParams(isKids) }
  });
  return data.results;
};

export const fetchPopular = async (type: 'movie' | 'tv' = 'movie', isKids?: boolean) => {
  const { data } = await tmdb.get(`/${type}/popular`, {
    params: { ...getKidsParams(isKids) }
  });
  return data.results;
};

export const fetchTopRated = async (type: 'movie' | 'tv' = 'movie', isKids?: boolean) => {
  const { data } = await tmdb.get(`/${type}/top_rated`, {
    params: { ...getKidsParams(isKids) }
  });
  return data.results;
};

export const fetchUpcoming = async (isKids?: boolean) => {
  const { data } = await tmdb.get('/movie/upcoming', {
    params: { ...getKidsParams(isKids) }
  });
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

export const searchMulti = async (query: string, isKids?: boolean) => {
  if (!query) return [];
  const { data } = await tmdb.get(`/search/multi`, {
    params: {
      query,
      include_adult: false,
      ...getKidsParams(isKids)
    },
  });
  // Filter out people, we only want movies and tv shows
  return data.results.filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv');
};

export const fetchDiscoverByGenre = async (type: 'movie' | 'tv', genreId: number, isKids?: boolean) => {
  const { data } = await tmdb.get(`/discover/${type}`, {
    params: {
      with_genres: genreId,
      sort_by: 'popularity.desc',
      ...getKidsParams(isKids)
    },
  });
  return data.results;
};
