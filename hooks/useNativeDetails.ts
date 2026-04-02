import { useState, useEffect } from 'react';
import { NativeModules } from 'react-native';

const { DetailsModule } = NativeModules;

export interface NativeDetails {
  formattedYear: string;
  formattedRuntime: string;
  castList: string;
  matchScore: number;
}

export interface NativePalette {
  vibrant: string;
  darkVibrant: string;
  dominant: string;
  muted: string;
  lightVibrant: string;
}

export const useNativeDetails = (movie: any) => {
  const [details, setDetails] = useState<NativeDetails | null>(null);
  const [palette, setPalette] = useState<NativePalette | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!movie || !DetailsModule) return;

    const processData = async () => {
      try {
        setLoading(true);
        
        // 1. Format metadata
        const formatted = await DetailsModule.formatDetailsData(JSON.stringify(movie));
        setDetails(formatted);

        // 2. Extract palette if backdrop exists
        if (movie.backdrop_path || movie.poster_path) {
          const imageUrl = `https://image.tmdb.org/t/p/w500${movie.backdrop_path || movie.poster_path}`;
          const colors = await DetailsModule.getVibrantPalette(imageUrl);
          setPalette(colors);
        }
      } catch (e) {
        console.error("Native Details Optimization Error:", e);
      } finally {
        setLoading(false);
      }
    };

    processData();
  }, [movie?.id]);

  return { details, palette, loading };
};
