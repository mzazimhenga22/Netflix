import React, { useMemo } from 'react';
import { View, StyleSheet, requireNativeComponent, Dimensions, ViewStyle } from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface TvHeroBannerViewProps {
  data: any;
  onPlay: (event: any) => void;
  onMyList: (event: any) => void;
  onInfo: (event: any) => void;
  onFocusState?: (event: any) => void;
  style?: ViewStyle;
}

const NativeTvHeroBanner = requireNativeComponent<TvHeroBannerViewProps>('TvHeroBannerView');

interface NativeHeroBannerProps {
  title: string;
  description: string;
  imageUrl: string;
  logoUrl?: string;
  item?: any;
  top10?: boolean;
  isInMyList?: boolean;
  onPlay: () => void;
  onMyList: () => void;
  onInfo: () => void;
  onFocusChange?: (focused: boolean) => void;
}

/**
 * NativeHeroBanner — Thin JS wrapper around Jetpack Compose TvHeroBannerView.
 * Replaces the old React Native HomeHero component with a native Kotlin implementation
 * that includes ExoPlayer trailer autoplay on remote focus.
 */
function NativeHeroBanner({ 
  title, 
  description, 
  imageUrl, 
  logoUrl, 
  item, 
  top10, 
  isInMyList,
  onPlay, 
  onMyList,
  onInfo,
  onFocusChange 
}: NativeHeroBannerProps) {
  
  const mediaType = item?.media_type || (item?.first_air_date ? 'tv' : 'movie');
  const isTv = mediaType === 'tv';
  const year = item?.release_date?.split('-')[0] || item?.first_air_date?.split('-')[0] || '';
  
  // Build metadata
  const episodeCount = isTv ? `${item?.number_of_episodes || 8} Episodes` : '';
  const rating = 'TV-PG';
  const genres = item?.genre_ids 
    ? getGenreNames(item.genre_ids, mediaType).slice(0, 2).join(', ')
    : '';
  const cast = item?.credits?.cast?.slice(0, 3).map((c: any) => c.name).join(', ') || '';

  // Marshal data for native
  const bannerData = useMemo(() => ({
    title: title || item?.title || item?.name || '',
    backdropUrl: imageUrl || '',
    logoUrl: logoUrl || '',
    mediaType,
    year,
    overview: description || '',
    tmdbId: String(item?.id || ''),
    top10: !!top10,
    isInMyList: !!isInMyList,
    cast,
    genres,
    episodeCount,
    rating,
  }), [title, imageUrl, logoUrl, mediaType, year, description, item?.id, top10, isInMyList, cast, genres, episodeCount]);

  return (
    <View style={styles.container}>
      <NativeTvHeroBanner
        data={bannerData}
        style={styles.heroView}
        onPlay={() => onPlay()}
        onMyList={() => onMyList()}
        onInfo={() => onInfo()}
        onFocusState={(e) => {
          onFocusChange?.(e.nativeEvent?.focused);
        }}
      />
    </View>
  );
}

export default React.memo(NativeHeroBanner, (prev, next) => {
  return prev.item?.id === next.item?.id &&
    prev.imageUrl === next.imageUrl &&
    prev.logoUrl === next.logoUrl &&
    prev.top10 === next.top10 &&
    prev.isInMyList === next.isInMyList;
});

// Simple genre ID → name mapping (same subset used in the app)
const MOVIE_GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
  80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
  14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie',
  53: 'Thriller', 10752: 'War', 37: 'Western',
};

const TV_GENRES: Record<number, string> = {
  10759: 'Action & Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 10762: 'Kids',
  9648: 'Mystery', 10763: 'News', 10764: 'Reality', 10765: 'Sci-Fi & Fantasy',
  10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics', 37: 'Western',
};

function getGenreNames(ids: number[], mediaType: string): string[] {
  const map = mediaType === 'tv' ? TV_GENRES : MOVIE_GENRES;
  return ids.map(id => map[id]).filter(Boolean) as string[];
}

const styles = StyleSheet.create({
  container: {
    height: SCREEN_HEIGHT * 0.78,
    width: '100%',
    backgroundColor: 'transparent',
  },
  heroView: {
    width: '100%',
    height: '100%',
  },
});
