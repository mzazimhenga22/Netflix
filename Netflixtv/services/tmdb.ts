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
export const getLogoUrl = (path: string | null) => path ? `${BACKDROP_BASE_URL}${path}` : undefined;

const getKidsParams = (isKids?: boolean) => {
  return isKids ? {
    certification_country: 'US',
    'certification.lte': 'PG',
    without_genres: '27,53,80' // Exclude Horror, Thriller, Crime
  } : {};
};

/**
 * Filter out content that hasn't been released yet.
 * Also injects `media_type` if missing (non-trending endpoints don't include it).
 * Detection: movies have `title`, TV shows have `name` (without `title`).
 */
function filterReleased(items: any[], forcedType?: 'movie' | 'tv'): any[] {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return items
    .map((item: any) => ({
      ...item,
      media_type: item.media_type || forcedType || (item.title ? 'movie' : 'tv'),
    }))
    .filter((item: any) => {
      const releaseDate = item.release_date || item.first_air_date;
      if (!releaseDate) return true;
      return releaseDate <= today;
    });
}

export const fetchMovieImages = async (id: string | number, type: 'movie' | 'tv' = 'movie') => {
  try {
    const { data } = await tmdb.get(`/${type}/${id}/images`, {
      params: { include_image_language: 'en,null' }
    });
    return data;
  } catch(e) {
    return { logos: [], backdrops: [], posters: [] };
  }
};

export const fetchTrending = async (type: 'movie' | 'tv' | 'all' = 'all', isKids?: boolean) => {
  const { data } = await tmdb.get(`/trending/${type}/week`, {
    params: { ...getKidsParams(isKids) }
  });
  return filterReleased(data.results);
};

export const fetchPopular = async (type: 'movie' | 'tv' = 'movie', isKids?: boolean) => {
  const { data } = await tmdb.get(`/${type}/popular`, {
    params: { ...getKidsParams(isKids) }
  });
  return filterReleased(data.results, type);
};

export const fetchTopRated = async (type: 'movie' | 'tv' = 'movie', isKids?: boolean) => {
  const { data } = await tmdb.get(`/${type}/top_rated`, {
    params: { ...getKidsParams(isKids) }
  });
  return filterReleased(data.results, type);
};

export const fetchUpcoming = async (isKids?: boolean) => {
  const { data } = await tmdb.get('/movie/upcoming', {
    params: { ...getKidsParams(isKids) }
  });
  return filterReleased(data.results, 'movie');
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
  // Filter out unaired episodes
  if (data.episodes) {
    const today = new Date().toISOString().split('T')[0];
    data.episodes = data.episodes.filter((ep: any) => {
      if (!ep.air_date) return true;
      return ep.air_date <= today;
    });
  }
  return data;
};

export const fetchDiscoverByGenre = async (type: 'movie' | 'tv', genreId: number, isKids?: boolean, page: number = 1) => {
  const { data } = await tmdb.get(`/discover/${type}`, {
    params: {
      with_genres: genreId,
      page,
      sort_by: 'popularity.desc',
      ...getKidsParams(isKids)
    }
  });
  return filterReleased(data.results, type);
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
  // Filter out people and unreleased content
  return filterReleased(
    data.results.filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv')
  );
};

export const fetchSimilar = async (id: string | number | undefined, type: 'movie' | 'tv' = 'movie'): Promise<any[]> => {
  if (!id) return [];
  try {
    const { data } = await tmdb.get(`/${type}/${id}/similar`);
    return filterReleased(data.results || [], type);
  } catch (e) {
    return [];
  }
};
