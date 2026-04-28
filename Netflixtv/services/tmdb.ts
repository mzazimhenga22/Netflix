import axios from 'axios';

// NOTE: This is a demo API key often used in tutorials. 
// For production, please get your own from themoviedb.org and use environment variables.
const TMDB_API_KEY = '8baba8ab6b8bbe247645bcae7df63d0d';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE_URL = 'https://image.tmdb.org/t/p/original';

export const tmdb = axios.create({
  baseURL: BASE_URL,
  timeout: 6000,
  params: {
    api_key: TMDB_API_KEY,
    language: 'en-US',
  },
});

export const getImageUrl = (path: string | null) => path ? `${IMAGE_BASE_URL}${path}` : undefined;
export const getBackdropUrl = (path: string | null) => path ? `${BACKDROP_BASE_URL}${path}` : undefined;
export const getLogoUrl = (path: string | null) => path ? `${BACKDROP_BASE_URL}${path}` : undefined;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableError = (error: any) => {
  const status = error?.response?.status;
  return (
    error?.code === 'ECONNABORTED' ||
    !error?.response ||
    (typeof status === 'number' && status >= 500)
  );
};

async function getWithRetry<T>(url: string, options?: any, retries = 1): Promise<T> {
  try {
    const { data } = await tmdb.get<T>(url, options);
    return data;
  } catch (error) {
    if (retries > 0 && isRetryableError(error)) {
      await sleep(800);
      return getWithRetry<T>(url, options, retries - 1);
    }
    throw error;
  }
}

const getMaturityParams = (maturityLevel: 'G' | 'PG' | 'TV-14' | 'MA' = 'MA') => {
  const levelToCert: Record<string, string> = {
    'G': 'G',
    'PG': 'PG',
    'TV-14': 'PG-13',
    'MA': 'R'
  };
  
  const params: any = {
    certification_country: 'US',
  };

  if (maturityLevel !== 'MA') {
    params['certification.lte'] = levelToCert[maturityLevel];
  }

  // Extra filtering for kids
  if (maturityLevel === 'G' || maturityLevel === 'PG') {
    params.without_genres = '27,53,80'; // Exclude Horror, Thriller, Crime
  }

  return params;
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
    const data = await getWithRetry<any>(`/${type}/${id}/images`, {
      params: { include_image_language: 'en,null' }
    });
    return data;
  } catch(e) {
    return { logos: [], backdrops: [], posters: [] };
  }
};

export const fetchTrending = async (type: 'movie' | 'tv' | 'all' = 'all', maturityLevel?: 'G' | 'PG' | 'TV-14' | 'MA') => {
  try {
    const data = await getWithRetry<any>(`/trending/${type}/week`, {
      params: { ...getMaturityParams(maturityLevel) }
    });
    return filterReleased(data.results);
  } catch (e) {
    return [];
  }
};

export const fetchPopular = async (type: 'movie' | 'tv' = 'movie', maturityLevel?: 'G' | 'PG' | 'TV-14' | 'MA') => {
  const data = await getWithRetry<any>(`/${type}/popular`, {
    params: { ...getMaturityParams(maturityLevel) }
  });
  return filterReleased(data.results, type);
};

export const fetchTopRated = async (type: 'movie' | 'tv' = 'movie', maturityLevel?: 'G' | 'PG' | 'TV-14' | 'MA') => {
  const data = await getWithRetry<any>(`/${type}/top_rated`, {
    params: { ...getMaturityParams(maturityLevel) }
  });
  return filterReleased(data.results, type);
};

export const fetchUpcoming = async (maturityLevel?: 'G' | 'PG' | 'TV-14' | 'MA') => {
  const data = await getWithRetry<any>('/movie/upcoming', {
    params: { ...getMaturityParams(maturityLevel) }
  });
  return filterReleased(data.results, 'movie');
};

export const fetchVideos = async (id: number, type: 'movie' | 'tv' = 'movie') => {
  const data = await getWithRetry<any>(`/${type}/${id}/videos`);
  return data.results;
};

export const fetchMovieDetails = async (id: string, type: 'movie' | 'tv' = 'movie') => {
  const data = await getWithRetry<any>(`/${type}/${id}`, {
    params: {
      append_to_response: 'credits,similar,external_ids',
    },
  });
  return data;
};

export const fetchSeasonDetails = async (tvId: string, seasonNumber: number) => {
  const data = await getWithRetry<any>(`/tv/${tvId}/season/${seasonNumber}`);
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

export const fetchDiscoverByGenre = async (type: 'movie' | 'tv', genreId: number, maturityLevel?: 'G' | 'PG' | 'TV-14' | 'MA', page: number = 1) => {
  const data = await getWithRetry<any>(`/discover/${type}`, {
    params: {
      with_genres: genreId,
      page,
      sort_by: 'popularity.desc',
      ...getMaturityParams(maturityLevel)
    }
  });
  return filterReleased(data.results, type);
};

export const searchMulti = async (query: string, maturityLevel: 'G' | 'PG' | 'TV-14' | 'MA' = 'MA') => {
  if (!query) return [];
  try {
    const data = await getWithRetry<any>(`/search/multi`, {
      params: {
        query,
        include_adult: false,
      },
    });

    // Manual filtering because search/multi doesn't support certification.lte
    const filteredResults = data.results.filter((item: any) => {
      if (item.media_type !== 'movie' && item.media_type !== 'tv') return false;
      
      // If G or PG, block certain genres regardless of what the API says
      if (maturityLevel === 'G' || maturityLevel === 'PG') {
         const blockedGenres = [27, 53, 80]; // Horror, Thriller, Crime
         const itemGenres = item.genre_ids || [];
         if (itemGenres.some((id: number) => blockedGenres.includes(id))) return false;
         
         // If G specifically, be even more strict
         if (maturityLevel === 'G') {
           const kidsGenres = [16, 10751, 10762]; // Animation, Family, Kids
           if (!itemGenres.some((id: number) => kidsGenres.includes(id))) {
             // If it's not a kid genre, check if it's at least "safe" (Comedy/Adventure)
             const safeGenres = [35, 12];
             if (!itemGenres.some((id: number) => safeGenres.includes(id))) return false;
           }
         }
      }
      
      return true;
    });

    return filterReleased(filteredResults);
  } catch (e) {
    return [];
  }
};

export const fetchSimilar = async (id: string | number | undefined, type: 'movie' | 'tv' = 'movie'): Promise<any[]> => {
  if (!id) return [];
  try {
    const data = await getWithRetry<any>(`/${type}/${id}/similar`);
    return filterReleased(data.results || [], type);
  } catch (e) {
    return [];
  }
};
