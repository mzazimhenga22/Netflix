import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, ScrollView, Text, Alert, BackHandler, findNodeHandle, InteractionManager } from 'react-native';
import {
  fetchTrending, fetchTopRated, fetchPopular, fetchUpcoming,
  fetchSimilar, fetchDiscoverByGenre
} from '../../services/tmdb';
import { resolveStreamFromCloud, invalidateCacheEntry } from '../../services/cloudResolver';
import { WatchHistoryService, WatchHistoryItem } from '../../services/WatchHistoryService';
import { useProfile } from '../../context/ProfileContext';
import { usePageColor } from '../../context/PageColorContext';
import NativeHeroBanner from '../../components/NativeHeroBanner';
import ExpandingRow from '../../components/ExpandingRow';

import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { TV_TOP_NAV_TOTAL_OFFSET } from './_layout';
import HomeSkeleton from '../../components/HomeSkeleton';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useTvFocusBridge } from '../../context/TvFocusBridgeContext';

export default function HomeScreen() {
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
  // Scoped card stream — only the one focused card ever gets a stream URL.
  // This prevents multiple ExoPlayer instances spawning across all rows.
  const [focusedCardStream, setFocusedCardStream] = useState<{ id: string; url: string; headers?: string } | null>(null);


  // Categories
  const [trending, setTrending] = useState<any[]>([]);
  const [topRated, setTopRated] = useState<any[]>([]);
  const [popular, setPopular] = useState<any[]>([]);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [similarToLastWatched, setSimilarToLastWatched] = useState<any[]>([]);
  const [lastWatchedTitle, setLastWatchedTitle] = useState<string>('');

  // New genre-based rows
  const [trendingTv, setTrendingTv] = useState<any[]>([]);
  const [topRatedTv, setTopRatedTv] = useState<any[]>([]);
  const [popularTv, setPopularTv] = useState<any[]>([]);
  const [actionMovies, setActionMovies] = useState<any[]>([]);
  const [comedyMovies, setComedyMovies] = useState<any[]>([]);
  const [horrorMovies, setHorrorMovies] = useState<any[]>([]);
  const [sciFiMovies, setSciFiMovies] = useState<any[]>([]);
  const [documentaries, setDocumentaries] = useState<any[]>([]);
  const [dramaMovies, setDramaMovies] = useState<any[]>([]);
  const [romanceMovies, setRomanceMovies] = useState<any[]>([]);

  const [preferredRowTitle, setPreferredRowTitle] = useState<string | null>(null);
  const [preferredMovieId, setPreferredMovieId] = useState<string | null>(null);
  const [focusRequestToken, setFocusRequestToken] = useState(0);

  // Refs for debouncing
  const heroUpdateTimeout = useRef<NodeJS.Timeout | null>(null);
  const heroStreamTimeout = useRef<NodeJS.Timeout | null>(null);
  const cardStreamTimeout = useRef<NodeJS.Timeout | null>(null);
  const currentHeroId = useRef<string | null>(null);
  // Tracks the movie ID that last requested a card stream — used to discard
  // stale resolution results when the user moves focus quickly.
  const currentCardId = useRef<string | null>(null);
  const autoCycleInterval = useRef<NodeJS.Timeout | null>(null);
  const isUserBrowsingRows = useRef<boolean>(false);
  const currentHeroIndex = useRef<number>(0);
  const scrollY = useRef<number>(0);

  useEffect(() => {
    // Only load if trending is empty (first mount) or if selectedProfile actually changed
    // Tabs keep state, so this useEffect only runs when the component mounts or dependencies change.
    if (trending.length === 0) {
      InteractionManager.runAfterInteractions(() => {
        loadData();
      });
    }
  }, [selectedProfile]);

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

  useFocusEffect(
    useCallback(() => {
      if (preferredRowTitle && preferredMovieId) {
        isUserBrowsingRows.current = true;
        stopAutoCycle();
        setFocusRequestToken((token) => token + 1);
      } else if (scrollY.current <= 24) {
        isUserBrowsingRows.current = false;
        startAutoCycle();
      }

      return undefined;
    }, [preferredMovieId, preferredRowTitle, trending.length])
  );

  // Confirm Exit Handler for TV
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        Alert.alert(
          "Exit Netflix",
          "Are you sure you want to exit?",
          [
            { text: "Cancel", onPress: () => null, style: "cancel" },
            { text: "Exit", onPress: () => BackHandler.exitApp() }
          ],
          { cancelable: true }
        );
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [])
  );

  // Clean up auto cycle and all pending timeouts
  useEffect(() => {
    return () => {
      stopAutoCycle();
      if (heroStreamTimeout.current) clearTimeout(heroStreamTimeout.current);
      if (cardStreamTimeout.current) clearTimeout(cardStreamTimeout.current);
      if (heroUpdateTimeout.current) clearTimeout(heroUpdateTimeout.current);
    };
  }, []);

  const startAutoCycle = () => {
    // Guard: don't create a new interval if one is already running
    if (autoCycleInterval.current) return;
    autoCycleInterval.current = setInterval(() => {
      if (!isUserBrowsingRows.current && trending.length > 0) {
        currentHeroIndex.current = (currentHeroIndex.current + 1) % Math.min(10, trending.length);
        const nextHero = trending[currentHeroIndex.current];
        setHeroMovie(nextHero);

        // Resolve stream for auto-cycled hero
        if (heroStreamTimeout.current) clearTimeout(heroStreamTimeout.current);
        heroStreamTimeout.current = setTimeout(() => {
          resolveStream(nextHero, setHeroStreamUrl, setHeroStreamHeaders, currentHeroId);
        }, 1500);
      }
    }, 180000); // 3 minutes
  };



  const stopAutoCycle = () => {
    if (autoCycleInterval.current) {
      clearInterval(autoCycleInterval.current);
      autoCycleInterval.current = null;
    }
  };

  const resumeHeroAutoplay = useCallback(() => {
    isUserBrowsingRows.current = false;
    startAutoCycle();
  }, [trending.length]);

  const pauseHeroAutoplay = useCallback(() => {
    isUserBrowsingRows.current = true;
    stopAutoCycle();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const maturityLevel = selectedProfile?.maturityLevel;
      const isKids = selectedProfile?.isKids;
      const profileId = selectedProfile?.id;

      // Primary batch — essential rows
      const [tr, trt, pop, upc] = await Promise.all([
        fetchTrending('all', maturityLevel as any),
        fetchTopRated('movie', maturityLevel as any),
        fetchPopular('movie', maturityLevel as any),
        fetchUpcoming(maturityLevel as any),
      ]);

      let history: WatchHistoryItem[] = [];
      let similar: any[] = [];
      let lastTitle = '';

      if (profileId) {
        history = await WatchHistoryService.getAllHistory(profileId);
        if (history.length > 0) {
          const lastWatched = history[0];
          lastTitle = lastWatched.item?.title || lastWatched.item?.name || 'this';
          similar = await fetchSimilar(lastWatched.item?.id, lastWatched.type);
        }
      }

      setTrending(tr);
      setTopRated(trt);
      setPopular(pop);
      setUpcoming(upc);

      // Inject progress back into items for the Continuing Watching row
      const mappedHistory = history.map(h => ({
        ...h.item,
        media_type: h.type, // Ensure type is preserved correctly
        _progress: h.duration > 0 ? h.currentTime / h.duration : 0,
        _currentTime: h.currentTime,
        _duration: h.duration,
        _season: h.season,
        _episode: h.episode
      }));
      setHistoryItems(mappedHistory);
      setSimilarToLastWatched(similar);
      setLastWatchedTitle(lastTitle);

      if (tr.length > 0) {
        setHeroMovie(tr[0]);
        currentHeroIndex.current = 0;

        // Resolve initial hero stream
        setTimeout(() => {
          resolveStream(tr[0], setHeroStreamUrl, setHeroStreamHeaders, currentHeroId);
        }, 1500);
      }

      // Secondary batch — genre rows (loaded after primary to not block initial render)
      loadGenreRows(maturityLevel, isKids);
    } catch (e) {
      console.error('Failed to load home data:', e);
    } finally {
      setLoading(false);
      startAutoCycle();
    }
  };

  const loadGenreRows = async (maturityLevel: any, isKids: boolean | undefined) => {
    try {
      const [
        tTv, trTv, popTv,
        action, comedy, horror,
        sciFi, docs, drama, romance,
      ] = await Promise.all([
        fetchTrending('tv', maturityLevel as any),
        fetchTopRated('tv', maturityLevel as any),
        fetchPopular('tv', maturityLevel as any),
        fetchDiscoverByGenre('movie', 28, maturityLevel as any),   // Action
        fetchDiscoverByGenre('movie', 35, maturityLevel as any),   // Comedy
        (isKids || (maturityLevel !== 'MA' && maturityLevel !== 'TV-14')) ? Promise.resolve([]) : fetchDiscoverByGenre('movie', 27, maturityLevel as any),  // Horror (skip for kids/low maturity)
        fetchDiscoverByGenre('movie', 878, maturityLevel as any),  // Sci-Fi
        fetchDiscoverByGenre('movie', 99, maturityLevel as any),   // Documentary
        fetchDiscoverByGenre('movie', 18, maturityLevel as any),   // Drama
        fetchDiscoverByGenre('movie', 10749, maturityLevel as any), // Romance
      ]);

      setTrendingTv(tTv);
      setTopRatedTv(trTv);
      setPopularTv(popTv);
      setActionMovies(action);
      setComedyMovies(comedy);
      setHorrorMovies(horror);
      setSciFiMovies(sciFi);
      setDocumentaries(docs);
      setDramaMovies(drama);
      setRomanceMovies(romance);
    } catch (e) {
      console.log('[Home] Genre rows failed:', e);
    }
  };

  const resolveStream = useCallback(async (
    movie: any,
    setUrl: (v: string | undefined) => void,
    setHeaders: (v: string | undefined) => void,
    idRef: React.MutableRefObject<string | null>
  ) => {
    if (!movie) return;
    const tmdbId = String(movie.id);
    const mediaType = movie.media_type || 'movie';
    // Do NOT clear the URL here — the existing video keeps playing in the
    // banner while we wait for the new stream to resolve. Clearing immediately
    // would destroy the ExoPlayer and leave a blank banner for several seconds.
    idRef.current = tmdbId;

    try {
      const result = await resolveStreamFromCloud(
        tmdbId,
        mediaType as 'movie' | 'tv',
        mediaType === 'tv' ? movie.season : undefined,
        mediaType === 'tv' ? movie.episode : undefined,
        { title: movie.title || movie.name }
      );

      if (idRef.current === tmdbId && result?.url) {
        setUrl(result.url);
        setHeaders(
          result.headers && Object.keys(result.headers).length > 0
            ? JSON.stringify(result.headers)
            : undefined
        );
      }
    } catch (e) {
      console.log('[Home] Stream resolve failed:', e);
    }
  }, []);

  const handleItemFocus = useCallback((movie: any, rowTitle?: string) => {
    pauseHeroAutoplay();
    const movieId = String(movie.id);

    // Track which card is focused for focus restoration
    if (heroUpdateTimeout.current) clearTimeout(heroUpdateTimeout.current);
    heroUpdateTimeout.current = setTimeout(() => {
      setPreferredMovieId(movieId);
      setPreferredRowTitle(rowTitle || null);
    }, 300);

    // Clear any pending card stream resolution and drop the previous stream
    // immediately so the old card's ExoPlayer releases.
    if (cardStreamTimeout.current) clearTimeout(cardStreamTimeout.current);
    currentCardId.current = movieId;
    setFocusedCardStream(null);

    // Resolve stream for the newly focused card (plays inline in the expanded
    // card). 1200ms gives the user time to settle focus without firing on
    // every frame during fast scrolling, while still feeling responsive.
    cardStreamTimeout.current = setTimeout(async () => {
      if (currentCardId.current !== movieId) return; // focus moved on
      try {
        const type = movie.media_type || 'movie';
        const result = await resolveStreamFromCloud(
          movieId, type as 'movie' | 'tv',
          type === 'tv' ? movie._season : undefined,
          type === 'tv' ? movie._episode : undefined,
          { title: movie.title || movie.name }
        );
        // Guard again after async resolution — user may have moved focus
        if (currentCardId.current === movieId && result?.url) {
          setFocusedCardStream({
            id: movieId,
            url: result.url,
            headers: result.headers && Object.keys(result.headers).length > 0
              ? JSON.stringify(result.headers)
              : undefined,
          });
        }
      } catch (e) {
        console.log('[Home] Card stream resolve failed:', e);
      }
    }, 1200);
  }, [pauseHeroAutoplay]);

  const handleItemPress = useCallback((movie: any) => {
    const type = movie.media_type || 'movie';
    // Kill ALL preview streams so every ExoPlayer releases its connection
    // before the full-screen player starts.
    setHeroStreamUrl(undefined);
    setHeroStreamHeaders(undefined);
    setFocusedCardStream(null);
    currentCardId.current = null;
    // Clear any pending stream resolution timeouts
    if (heroStreamTimeout.current) clearTimeout(heroStreamTimeout.current);
    if (cardStreamTimeout.current) clearTimeout(cardStreamTimeout.current);
    // Invalidate cached URL so the full-screen player fetches a fresh one
    invalidateCacheEntry(String(movie.id), type);

    // Append metadata to params for instant rendering on details page
    const params: any = {
      type,
      title: movie.title || movie.name,
      poster: movie.poster_path,
      backdrop: movie.backdrop_path,
      overview: movie.overview,
      year: (movie.release_date || movie.first_air_date)?.split('-')[0],
      rating: movie.vote_average?.toString()
    };

    if (movie._season) params.season = movie._season.toString();
    if (movie._episode) params.episode = movie._episode.toString();
    if (movie._currentTime) params.resumeTime = movie._currentTime.toString();
    if (movie._duration) params.resumeDuration = movie._duration.toString();

    router.push({
      pathname: `/movie/${movie.id}`,
      params: params
    });
  }, [router]);

  const handleHeroFocus = useCallback(() => {
    isUserBrowsingRows.current = false;
    stopAutoCycle();
    if (heroMovie) {
      if (heroStreamTimeout.current) clearTimeout(heroStreamTimeout.current);
      heroStreamTimeout.current = setTimeout(() => {
        resolveStream(heroMovie, setHeroStreamUrl, setHeroStreamHeaders, currentHeroId);
      }, 800);
    }
  }, [heroMovie, resolveStream]);

  const handleScroll = useCallback((event: any) => {
    scrollY.current = event.nativeEvent.contentOffset.y;
    // Guard: only call resume/pause when transitioning between zones
    // to avoid creating/destroying intervals at scroll-event rate
    if (scrollY.current <= 24) {
      if (isUserBrowsingRows.current) resumeHeroAutoplay();
    } else {
      if (!isUserBrowsingRows.current) pauseHeroAutoplay();
    }
  }, [pauseHeroAutoplay, resumeHeroAutoplay]);

  // Memoize Top 10 lists to prevent unnecessary re-renders of native rows
  const top10Movies = React.useMemo(() => popular.slice(0, 10), [popular]);
  const top10Shows = React.useMemo(() => popularTv.slice(0, 10), [popularTv]);

  /** Helper to render a row with standard props */
  const renderRow = (title: string, content: any[], options?: { showRank?: boolean }) => {
    if (!content || content.length === 0) return null;
    // Only supply the stream URL to the row that owns the currently focused card.
    // All other rows receive null, preventing multiple ExoPlayers from starting.
    const isActiveRow = focusedCardStream !== null &&
      content.some((m: any) => String(m.id) === focusedCardStream.id);
    return (
      <ExpandingRow
        title={title}
        content={content}
        showRank={options?.showRank}
        focusedStreamUrl={isActiveRow ? focusedCardStream?.url : undefined}
        focusedStreamHeaders={isActiveRow ? focusedCardStream?.headers : undefined}
        preferredMovieId={preferredRowTitle === title ? preferredMovieId ?? undefined : undefined}
        focusRequestToken={preferredRowTitle === title ? focusRequestToken : 0}
        onItemFocus={(movie) => handleItemFocus(movie, title)}
        onItemPress={handleItemPress}
      />
    );
  };

  if (loading) return <HomeSkeleton />;

  return (
    <View style={styles.container}>


      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        onScrollBeginDrag={pauseHeroAutoplay}
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
          onPress={() => heroMovie && handleItemPress(heroMovie)}
          style={styles.hero}
        />
        {/* 1. Continue Watching */}
        {historyItems.length > 0 && renderRow(
          `Continue Watching for ${selectedProfile?.name || 'You'}`,
          historyItems
        )}

        {/* 2. Today's Top Picks */}
        {renderRow("Today's Top Picks for You", trending)}

        {/* 3. Top 10 Movies Today */}
        {renderRow('Top 10 Movies Today', top10Movies, { showRank: true })}

        {/* 4. Popular TV Shows */}
        {renderRow('Popular TV Shows', popularTv)}

        {/* 5. Because You Watched... */}
        {similarToLastWatched.length > 0 && renderRow(
          `Because You Watched ${lastWatchedTitle}`,
          similarToLastWatched
        )}

        {/* 6. Trending TV Shows */}
        {renderRow('Trending Now in Shows', trendingTv)}

        {/* 7. Action & Adventure */}
        {renderRow('Action & Adventure', actionMovies)}

        {/* 8. Critically Acclaimed */}
        {renderRow('Critically Acclaimed', topRated)}

        {/* 9. Top 10 TV Shows Today */}
        {renderRow('Top 10 TV Shows Today', top10Shows, { showRank: true })}

        {/* 10. Comedy Movies */}
        {renderRow('Comedy Movies', comedyMovies)}

        {/* 11. Sci-Fi & Fantasy */}
        {renderRow('Sci-Fi & Fantasy', sciFiMovies)}

        {/* 12. New Releases */}
        {renderRow('New Releases', upcoming)}

        {/* 13. Award-Winning TV Shows */}
        {renderRow('Award-Winning TV Shows', topRatedTv)}

        {/* 14. Drama Movies */}
        {renderRow('Drama Movies', dramaMovies)}

        {/* 15. Horror Movies (hidden for kids) */}
        {renderRow('Horror Movies', horrorMovies)}

        {/* 16. Romantic Movies */}
        {renderRow('Romantic Movies', romanceMovies)}

        {/* 17. Documentaries */}
        {renderRow('Documentaries', documentaries)}

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
