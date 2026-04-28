import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, ScrollView, Text, findNodeHandle } from 'react-native';
import { fetchPopular, fetchTopRated, fetchDiscoverByGenre } from '../../services/tmdb';
import { resolveStreamFromCloud, invalidateCacheEntry } from '../../services/cloudResolver';
import { useProfile } from '../../context/ProfileContext';
import NativeHeroBanner from '../../components/NativeHeroBanner';
import ExpandingRow from '../../components/ExpandingRow';
import HeroMeta from '../../components/HeroMeta';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { TV_TOP_NAV_TOTAL_OFFSET } from './_layout';
import LoadingSpinner from '../../components/LoadingSpinner';
import { usePageColor } from '../../context/PageColorContext';
import { useTvFocusBridge } from '../../context/TvFocusBridgeContext';

export default function MoviesScreen() {
  const router = useRouter();
  const { selectedProfile } = useProfile();
  const { pageColor, setPageColor } = usePageColor();
  const { setHeroFocusTag } = useTvFocusBridge();
  const [loading, setLoading] = useState(true);
  const [heroMovie, setHeroMovie] = useState<any>(null);
  const heroBannerRef = useRef<any>(null);
  // Stream state
  const [heroStreamUrl, setHeroStreamUrl] = useState<string | undefined>(undefined);
  const [heroStreamHeaders, setHeroStreamHeaders] = useState<string | undefined>(undefined);
  // Scoped: only the focused card's row ever gets a stream URL
  const [focusedCardStream, setFocusedCardStream] = useState<{ id: string; url: string; headers?: string } | null>(null);
  const [heroLogoUrl, setHeroLogoUrl] = useState<string | undefined>();

  const [popular, setPopular] = useState([]);
  const [topRated, setTopRated] = useState([]);
  const [action, setAction] = useState([]);
  const [comedy, setComedy] = useState([]);

  const heroUpdateTimeout = useRef<NodeJS.Timeout | null>(null);
  const heroStreamTimeout = useRef<NodeJS.Timeout | null>(null);
  const cardStreamTimeout = useRef<NodeJS.Timeout | null>(null);
  const currentHeroId = useRef<string | null>(null);
  const currentCardId = useRef<string | null>(null);

  useEffect(() => { 
    if (popular.length === 0) {
      loadData(); 
    }
  }, [selectedProfile]);

  useFocusEffect(
    useCallback(() => {
      const timeout = setTimeout(() => {
        const tag = findNodeHandle(heroBannerRef.current);
        setHeroFocusTag(typeof tag === 'number' ? tag : null);
      }, 0);
      return () => {
        clearTimeout(timeout);
        setHeroFocusTag(null);
      };
    }, [loading, setHeroFocusTag])
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const maturityLevel = selectedProfile?.maturityLevel;
      const [pop, trt, act, com] = await Promise.all([
        fetchPopular('movie', maturityLevel),
        fetchTopRated('movie', maturityLevel),
        fetchDiscoverByGenre('movie', 28, maturityLevel),
        fetchDiscoverByGenre('movie', 35, maturityLevel),
      ]);
      setPopular(pop); setTopRated(trt); setAction(act); setComedy(com);
      if (pop.length > 0) {
        setHeroMovie(pop[0]);
        fetchHeroBranding(pop[0]);
      }
    } catch (e) { console.error('Failed to load movies:', e); }
    finally { setLoading(false); }
  };

  const fetchHeroBranding = async (movie: any) => {
    if (!movie) return;
    try {
      const { fetchMovieImages, getLogoUrl } = require('../../services/tmdb');
      const images = await fetchMovieImages(movie.id, 'movie');
      if (images?.logos?.length > 0) {
        const enLogo = images.logos.find((l: any) => l.iso_639_1 === 'en');
        setHeroLogoUrl(getLogoUrl(enLogo?.file_path || images.logos[0].file_path));
      } else {
        setHeroLogoUrl(undefined);
      }
    } catch (e) { setHeroLogoUrl(undefined); }
  };

  const resolveStream = useCallback(async (movie: any, setUrl: Function, setHeaders: Function, idRef: React.MutableRefObject<string | null>) => {
    const tmdbId = String(movie.id);
    // Do NOT pre-clear — keep current video playing while new stream resolves.
    idRef.current = tmdbId;
    try {
      const result = await resolveStreamFromCloud(tmdbId, 'movie');
      if (idRef.current === tmdbId && result?.url) {
        setUrl(result.url);
        setHeaders(result.headers && Object.keys(result.headers).length > 0 ? JSON.stringify(result.headers) : undefined);
      }
    } catch (e) { console.log('[Movies] Stream resolve failed:', e); }
  }, []);

  const handleItemFocus = useCallback((movie: any) => {
    const movieId = String(movie.id);
    if (heroUpdateTimeout.current) clearTimeout(heroUpdateTimeout.current);
    heroUpdateTimeout.current = setTimeout(() => {
      setHeroMovie(movie);
      fetchHeroBranding(movie);
      if (heroStreamTimeout.current) clearTimeout(heroStreamTimeout.current);
      heroStreamTimeout.current = setTimeout(() => resolveStream(movie, setHeroStreamUrl, setHeroStreamHeaders, currentHeroId), 1500);
    }, 300);
    // Scoped card stream — clear old, then resolve only if focus stays
    if (cardStreamTimeout.current) clearTimeout(cardStreamTimeout.current);
    currentCardId.current = movieId;
    setFocusedCardStream(null);
    cardStreamTimeout.current = setTimeout(async () => {
      if (currentCardId.current !== movieId) return;
      try {
        const result = await resolveStreamFromCloud(movieId, 'movie');
        if (currentCardId.current === movieId && result?.url) {
          setFocusedCardStream({
            id: movieId, url: result.url,
            headers: result.headers && Object.keys(result.headers).length > 0 ? JSON.stringify(result.headers) : undefined,
          });
        }
      } catch (e) { console.log('[Movies] Card stream resolve failed:', e); }
    }, 1200);
  }, [resolveStream]);

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
    invalidateCacheEntry(String(movie.id), 'movie');
    router.push(`/movie/${movie.id}?type=movie` as any);
  }, [router]);

  if (loading) return <View style={[styles.loadingContainer, { backgroundColor: pageColor }]}><LoadingSpinner size={92} label="Loading movies" /></View>;

  return (
    <View style={styles.container}>

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.heroContainer}>
          <NativeHeroBanner 
            ref={heroBannerRef}
            movieData={JSON.stringify(heroMovie)} 
            streamUrl={heroStreamUrl}
            streamHeaders={heroStreamHeaders}
            placeholderColor={pageColor}
            onColorExtracted={setPageColor} 
            onFocus={handleHeroFocus}
            style={styles.hero} 
          />
          <View style={styles.heroOverlay}>
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.92)']}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.heroMetaWrapper}>
              <HeroMeta movie={heroMovie} logoUrl={heroLogoUrl} />
            </View>
          </View>
        </View>
        <View style={styles.rowsContainer}>
          {[['Popular Movies', popular], ['Highest Rated', topRated], ['Action & Adventure', action], ['Laugh-Out-Loud', comedy]].map(([title, content]: any) => {
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
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  pageGradient: { ...StyleSheet.absoluteFillObject, zIndex: 1, top: TV_TOP_NAV_TOTAL_OFFSET + 360 },
  scrollView: { flex: 1, zIndex: 2 },
  scrollContent: { paddingBottom: 80 },
  heroContainer: { 
    width: '100%', 
    height: 450, 
    position: 'relative',
    backgroundColor: '#000',
  },
  hero: { width: '100%', height: '100%' },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 180,
    justifyContent: 'flex-end',
  },
  heroMetaWrapper: {
    paddingBottom: 15,
    zIndex: 10,
  },
  rowsContainer: { marginTop: 0, zIndex: 10 },
});
