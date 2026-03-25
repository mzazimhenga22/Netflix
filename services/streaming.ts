import axios from 'axios';

// Using a more stable community mirror since the official instance is down (451 error)
const CONSUMET_MIRRORS = [
  'https://aninescraper.vercel.app/meta/tmdb',
  'https://api-anime-rouge.vercel.app/meta/tmdb'
];

export interface StreamSource {
  url: string;
  isM3U8: boolean;
  quality?: string;
}

export interface StreamData {
  sources: StreamSource[];
  subtitles?: { url: string; lang: string }[];
}

/**
 * Fetches streaming links for a movie or TV show using community mirrors.
 */
export const fetchStreamingLinks = async (
  id: string,
  type: 'movie' | 'tv' = 'movie',
  season?: number,
  episode?: number
): Promise<StreamData | null> => {
  for (const mirror of CONSUMET_MIRRORS) {
    try {
      // For TV shows, the route often requires season and episode in the ID or as params
      // Example for Meta providers: /watch/{episodeId}?id={tmdbId}
      // Since episodeId is provider-specific, we usually fetch movie/tv details first to get episode IDs
      // But for a simple fallback, many mirrors support a direct TMDB route
      
      const endpoint = type === 'movie' 
        ? `${mirror}/watch/${id}`
        : `${mirror}/watch/${id}-season-${season || 1}-episode-${episode || 1}`;

      const res = await axios.get(endpoint, { 
        params: { id },
        timeout: 8000 
      });

      if (res.data && res.data.sources && res.data.sources.length > 0) {
        return res.data;
      }
    } catch (error: any) {
      // Silently try next mirror if one fails
      if (error.response?.status === 451) {
        console.warn(`Streaming Mirror ${mirror} is restricted (451).`);
      }
      continue;
    }
  }
  
  return null;
};
