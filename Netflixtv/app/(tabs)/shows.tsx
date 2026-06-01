import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, ScrollView, Text, findNodeHandle } from 'react-native';
import { fetchPopular, fetchTopRated, fetchDiscoverByGenre } from '../../services/tmdb';
import { resolveStreamFromCloud, invalidateCacheEntry } from '../../services/cloudResolver';
import { useProfile } from '../../context/ProfileContext';
import NativeHeroBanner from '../../components/NativeHeroBanner';
import ExpandingRow from '../../components/ExpandingRow';

import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { TV_TOP_NAV_TOTAL_OFFSET } from './_layout';
import LoadingSpinner from '../../components/LoadingSpinner';
import { usePageColor } from '../../context/PageColorContext';
import { useTvFocusBridge } from '../../context/TvFocusBridgeContext';

export default function ShowsScreen() {
  const router = useRouter();
  const { selectedProfile } = useProfile();
  const { pageColor, setPageColor } = usePageColor();
  const { setHeroFocusTag } = useTvFocusBridge();
  const [loading, setLoading] = useState(true);
  const [isScreenActive, setIsScreenActive] = useState(true);
  const [heroMovie, setHeroMovie] = useState<any>(null);
  const heroBannerRef = useRef<any>(null);
  // Stream state
  const [heroStreamUrl, setHeroStreamUrl] = useState<string | undefined>(undefined);
  const [heroStreamHeaders, setHeroStreamHeaders] = useState<string | undefined>(undefined);
  // Scoped: only the focused card's row ever gets a stream URL
  const [focusedCardStream, setFocusedCardStream] = useState<{ id: string; url: string; headers?: string } | null>(null);


  const [popular, setPopular] = useState([]);
  const [topRated, setTopRated] = useState([]);
  const [drama, setDrama] = useState([]);
  const [scifi, setScifi] = useState([]);

  const heroStreamTimeout = useRef<NodeJS.Timeout | null>(null);
  const cardStreamTimeout = useRef<NodeJS.Timeout | null>(null);
  const currentHeroId = useRef<string | null>(null);
  const currentCardId = useRef<string | null>(null);

  useEffect(() => {
    if (popular.length === 0) {
      loadData();
    }
  }, [selectedProfile]);

  // Clean up all pending timeouts on unmount
  useEffect(() => {
    return () => {
      if (heroStreamTimeout.current) clearTimeout(heroStreamTimeout.current);
      if (cardStreamTimeout.current) clearTimeout(cardStreamTimeout.current);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      setIsScreenActive(true);
      const timeout = setTimeout(() => {
        const tag = findNodeHandle(heroBannerRef.current);
        setHeroFocusTag(typeof tag === 'number' ? tag : null);
      }, 0);
      return () => {
        setIsScreenActive(false);
        clearTimeout(timeout);
        setHeroFocusTag(null);
        // Release ExoPlayer instances when leaving tab
        if (cardStreamTimeout.current) clearTimeout(cardStreamTimeout.current);
        if (heroStreamTimeout.current) clearTimeout(heroStreamTimeout.current);
        setFocusedCardStream(null);
        currentCardId.current = null;
        setHeroStreamUrl(undefined);
        setHeroStreamHeaders(undefined);
      };
    }, [loading, setHeroFocusTag])
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const maturityLevel = selectedProfile?.maturityLevel;
      const [pop, trt, dra, sci] = await Promise.all([
        fetchPopular('tv', maturityLevel),
        fetchTopRated('tv', maturityLevel),
        fetchDiscoverByGenre('tv', 18, maturityLevel),
        fetchDiscoverByGenre('tv', 10765, maturityLevel),
      ]);
      setPopular(pop); setTopRated(trt); setDrama(dra); setScifi(sci);
      if (pop.length > 0) {
        setHeroMovie(pop[0]);

      }
    } catch (e) { console.error('Failed to load shows:', e); }
    finally { setLoading(false); }
  };



  const resolveStream = useCallback(async (movie: any, setUrl: Function, setHeaders: Function, idRef: React.MutableRefObject<string | null>) => {
    const tmdbId = String(movie.id);
    // Do NOT pre-clear — keep current video playing while new stream resolves.
    idRef.current = tmdbId;
    try {
      const result = await resolveStreamFromCloud(tmdbId, 'tv', 1, 1, { title: movie.title || movie.name });
      if (idRef.current === tmdbId && result?.url) {
        setUrl(result.url);
        setHeaders(result.headers && Object.keys(result.headers).length > 0 ? JSON.stringify(result.headers) : undefined);
      }
    } catch (e) { console.log('[Shows] Stream resolve failed:', e); }
  }, []);

  const handleItemFocus = useCallback((movie: any) => {
    const movieId = String(movie.id);

    // Card stream — clear old, then resolve only if focus stays
    if (cardStreamTimeout.current) clearTimeout(cardStreamTimeout.current);
    currentCardId.current = movieId;
    setFocusedCardStream(null);
    cardStreamTimeout.current = setTimeout(async () => {
      if (currentCardId.current !== movieId) return;
      try {
        const result = await resolveStreamFromCloud(movieId, 'tv', 1, 1, { title: movie.title || movie.name });
        if (currentCardId.current === movieId && result?.url) {
          setFocusedCardStream({
            id: movieId, url: result.url,
            headers: result.headers && Object.keys(result.headers).length > 0 ? JSON.stringify(result.headers) : undefined,
          });
        }
      } catch (e) { console.log('[Shows] Card stream resolve failed:', e); }
    }, 1200);
  }, []);

  const handleHeroFocus = useCallback(() => {
    if (heroMovie) {
      if (heroStreamTimeout.current) clearTimeout(heroStreamTimeout.current);
      heroStreamTimeout.current = setTimeout(() => resolveStream(heroMovie, setHeroStreamUrl, setHeroStreamHeaders, currentHeroId), 800);
    }
  }, [heroMovie, resolveStream]);

  const handleItemPress = useCallback((movie: any) => {
    setHeroStreamUrl(undefined);
    setHeroStreamHeaders(undefined);
    setFocusedCardStream(null);
    currentCardId.current = null;
    if (heroStreamTimeout.current) clearTimeout(heroStreamTimeout.current);
    if (cardStreamTimeout.current) clearTimeout(cardStreamTimeout.current);
    invalidateCacheEntry(String(movie.id), 'tv');

    // Pass metadata for instant rendering on details page
    router.push({
      pathname: `/movie/${movie.id}`,
      params: {
        type: 'tv',
        title: movie.title || movie.name,
        poster: movie.poster_path,
        backdrop: movie.backdrop_path,
        overview: movie.overview,
        year: (movie.release_date || movie.first_air_date)?.split('-')[0],
        rating: movie.vote_average?.toString()
      }
    });
  }, [router]);

  if (loading) return <View style={[styles.loadingContainer, { backgroundColor: pageColor }]}><LoadingSpinner size={92} label="Loading shows" /></View>;

  return (
    <View style={styles.container}>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <NativeHeroBanner
          ref={heroBannerRef}
          movieData={JSON.stringify(heroMovie)}
          streamUrl={heroStreamUrl}
          streamHeaders={heroStreamHeaders}
          isScreenActive={isScreenActive}
          placeholderColor={pageColor}
          useSkeleton={false}
          onColorExtracted={setPageColor}
          onFocus={handleHeroFocus}
          style={styles.hero}
        />
        {[['Popular TV Shows', popular], ['Award-Winning', topRated], ['Binge-Worthy Dramas', drama], ['Sci-Fi & Fantasy', scifi]].map(([title, content]: any) => {
          const isActive = focusedCardStream !== null && content.some((m: any) => String(m.id) === focusedCardStream!.id);
          return (
            <ExpandingRow
              key={title}
              title={title}
              content={content}
              focusedStreamUrl={isActive ? focusedCardStream!.url : undefined}
              focusedStreamHeaders={isActive ? focusedCardStream!.headers : undefined}
              onItemFocus={handleItemFocus}
              onItemPress={handleItemPress}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  pageGradient: { ...StyleSheet.absoluteFillObject, zIndex: 1, top: TV_TOP_NAV_TOTAL_OFFSET + 360 },
  scrollView: { flex: 1, zIndex: 2 },
  scrollContent: {
    paddingTop: TV_TOP_NAV_TOTAL_OFFSET,
    paddingBottom: 80
  },
  hero: { width: '100%', height: 500, marginBottom: 40 },
});
