import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { 
  View, 
  StyleSheet, 
  FlatList, 
  ActivityIndicator,
  Text,
  Dimensions
} from 'react-native';
import { 
  fetchTrending, 
  fetchPopular, 
  fetchTopRated, 
  fetchDiscoverByGenre,
  fetchUpcoming,
  getImageUrl, 
  getBackdropUrl,
  getLogoUrl,
  fetchMovieImages
} from '../../services/tmdb';
import NativeHeroBanner from '../../components/NativeHeroBanner';
import ColorExtractor from '../../components/ColorExtractor';
import ExpandingRow from '../../components/ExpandingRow';
import HomeSkeleton from '../../components/HomeSkeleton';
import { useRouter, useFocusEffect } from 'expo-router';
import { useFilter } from '../../context/FilterContext';
import { useProfile } from '../../context/ProfileContext';
import { WatchHistoryService, WatchHistoryItem } from '../../services/WatchHistoryService';
import { MyListService } from '../../services/MyListService';
import Animated, { FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

export default function HomeScreen() {
  const { filter } = useFilter();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [history, setHistory] = useState<WatchHistoryItem[]>([]);
  const [myList, setMyList] = useState<any[]>([]);
  
  const router = useRouter();
  // const { filter } = useFilter(); // Already declared above
  const { selectedProfile } = useProfile();

  const loadHistory = useCallback(async () => {
    if (selectedProfile?.id) {
       await WatchHistoryService.syncWithFirestore(selectedProfile.id);
       const data = await WatchHistoryService.getAllHistory(selectedProfile.id);
       setHistory(data);
    } else {
       setHistory([]);
    }
  }, [selectedProfile?.id]);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  // My List Subscription
  useEffect(() => {
    if (selectedProfile?.id) {
      const unsub = MyListService.subscribeToList(selectedProfile.id, (items) => {
        setMyList(items);
      });
      return () => unsub();
    }
  }, [selectedProfile?.id]);

  const [data, setData] = useState<{
    trending: any[],
    popular: any[],
    topRated: any[],
    action: any[],
    comedy: any[],
    upcoming: any[],
    scifi: any[],
  }>({
    trending: [],
    popular: [],
    topRated: [],
    action: [],
    comedy: [],
    upcoming: [],
    scifi: [],
  });
  const [loading, setLoading] = useState(true);
  const [heroMovie, setHeroMovie] = useState<any>(null);
  const [heroLogo, setHeroLogo] = useState<string | null>(null);
  const [heroColors, setHeroColors] = useState<readonly [string, string, string]>(['rgba(20, 20, 20, 0.8)', 'rgba(10, 10, 10, 0.9)', '#000']);
  // const router = useRouter(); // Already declared above

  const handleColorExtracted = useCallback((color: string) => {
    // Making background color more vibrant and deep
    setHeroColors([`${color}CC`, `${color}66`, '#000000']);
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!heroMovie) {
        setHeroLogo(null);
        return;
      }
      try {
        const type = heroMovie.media_type || (filter === 'all' ? 'movie' : filter);
        const images = await fetchMovieImages(heroMovie.id, type as any);
        if (images?.logos?.length > 0) {
          const engLogo = images.logos.find((l: any) => l.iso_639_1 === 'en');
          const logoToUse = engLogo || images.logos[0];
          setHeroLogo(getLogoUrl(logoToUse.file_path) || null);
        } else {
          setHeroLogo(null);
        }
      } catch (error) {
        setHeroLogo(null);
      }
    }, 1000); // 1s delay for logo loading
    return () => clearTimeout(timer);
  }, [heroMovie?.id, filter]);

  const isKids = selectedProfile?.isKids;

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const type = filter === 'all' ? 'movie' : filter;
        const trendingType = filter === 'all' ? 'all' : filter;

        const [trendingData, popularData, topRatedData, actionData, comedyData, upcomingData, scifiData] = await Promise.all([
          fetchTrending(trendingType as any, isKids),
          fetchPopular(type as any, isKids),
          fetchTopRated(type as any, isKids),
          fetchDiscoverByGenre(type as any, filter === 'tv' ? 10759 : 28, isKids),
          fetchDiscoverByGenre(type as any, 35, isKids),
          fetchUpcoming(isKids),
          fetchDiscoverByGenre(type as any, filter === 'tv' ? 10765 : 878, isKids),
        ]);

        setData({
          trending: trendingData,
          popular: popularData,
          topRated: topRatedData,
          action: actionData,
          comedy: comedyData,
          upcoming: upcomingData,
          scifi: scifiData,
        });
        
        setHeroMovie(trendingData[0]);
      } catch (error) {
        console.error('Error fetching TV data:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [filter, isKids]);

  const titleLabel = useMemo(() => filter === 'all' ? 'on Netflix' : filter === 'tv' ? 'TV Shows' : 'Movies', [filter]);

  const rowData = useMemo(() => [
    ...(history.length > 0 && filter === 'all' ? [{
      id: 'continue-watching',
      title: 'Continue Watching',
      data: history.map(h => ({ 
        ...h.item,
        media_type: h.type, 
        progressPercentage: (h.currentTime / h.duration) * 100 
      })),
      type: 'history'
    }] : []),
    ...(myList.length > 0 && filter === 'all' ? [{
      id: 'my-list',
      title: 'My List',
      data: myList,
      type: 'mylist'
    }] : []),
    {
      id: 'trending',
      title: 'Top 10 in your Country Today',
      isTop10: true,
      data: data.trending
    },
    {
      id: 'popular',
      title: `Popular ${titleLabel}`,
      data: data.popular
    },
    {
      id: 'upcoming',
      title: `Upcoming ${titleLabel}`,
      data: data.upcoming
    },
    {
      id: 'top-rated',
      title: `Top Rated ${titleLabel}`,
      data: data.topRated
    },
    {
      id: 'scifi',
      title: filter === 'tv' ? "Sci-Fi & Fantasy" : "Sci-Fi Movies",
      data: data.scifi
    },
    {
      id: 'action',
      title: filter === 'tv' ? "Action & Adventure" : "Adrenaline-Pumping Action",
      data: data.action
    },
    {
      id: 'comedy',
      title: `Comedy ${titleLabel}`,
      data: data.comedy
    }
  ], [filter, titleLabel, history, myList, data]);
 
  const isInMyList = useMemo(() => {
    if (!heroMovie || !myList) return false;
    return myList.some(item => String(item.id) === String(heroMovie.id));
  }, [heroMovie?.id, myList]);

  const handleToggleMyList = useCallback(async () => {
    if (!heroMovie || !selectedProfile?.id) return;
    try {
      await MyListService.toggleItem(selectedProfile.id, heroMovie);
    } catch (error) {
      console.error('Error toggling my list:', error);
    }
  }, [heroMovie, selectedProfile?.id]);

  const renderRow = useCallback(({ item: row }: { item: any }) => (
    <ExpandingRow 
      title={row.title}
      isTop10={row.isTop10}
      data={row.data} 
      onSelect={(id, type) => router.push({ 
        pathname: `/movie/${id}`, 
        params: { type: type || (filter === 'all' ? 'movie' : filter) } 
      })} 
    />
  ), [filter, router]);

  const ListHeader = useCallback(() => (
    <Animated.View key={heroMovie?.id} entering={FadeIn.duration(1000)}>
      {heroMovie && (
        <NativeHeroBanner
          title={heroMovie.title || heroMovie.name}
          description={heroMovie.overview}
          imageUrl={getBackdropUrl(heroMovie.backdrop_path) || ''}
          logoUrl={heroLogo || ''}
          item={heroMovie}
          top10={data.trending.slice(0, 10).some(m => m.id === heroMovie.id)}
          isInMyList={isInMyList}
          onPlay={() => router.push({ pathname: `/movie/${heroMovie.id}`, params: { type: heroMovie.media_type || (filter === 'all' ? 'movie' : filter) } })}
          onMyList={handleToggleMyList}
          onInfo={() => router.push({ pathname: `/movie/${heroMovie.id}`, params: { type: heroMovie.media_type || (filter === 'all' ? 'movie' : filter) } })}
        />
      )}
    </Animated.View>
  ), [heroMovie, heroLogo, heroColors, data.trending, filter, router]);

  if (loading) {
    return <HomeSkeleton />;
  }

  return (
    <View style={styles.masterContainer}>
      {/* Ambient Background Layer — Fixed position for the whole screen */}
      <View style={[StyleSheet.absoluteFill, { zIndex: 0 }]} pointerEvents="none">
        <LinearGradient
          colors={heroColors}
          style={[StyleSheet.absoluteFill, { height: '100%' }]}
        />
      </View>

      {heroMovie && (
        <ColorExtractor 
          imageUrl={getBackdropUrl(heroMovie?.backdrop_path) || ''} 
          onColorExtracted={handleColorExtracted}
        />
      )}

      <FlatList
        data={rowData}
        renderItem={renderRow}
        keyExtractor={item => item.id}
        ListHeaderComponent={ListHeader}
        style={[styles.container, { zIndex: 1, elevation: 1 }]}
        contentContainerStyle={styles.contentContainer}
        // Low-RAM optimization: render fewer items at once
        initialNumToRender={2}
        maxToRenderPerBatch={1}
        windowSize={3}
        removeClippedSubviews={true}
      />
    </View>
  );
}

const SCREEN_HEIGHT = Dimensions.get('window').height;

const styles = StyleSheet.create({
  masterContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  contentContainer: {
    paddingTop: 40, // Small native safe area padding so it's not flush with the screen top
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowsContainer: {
    marginTop: 20,
    paddingLeft: 60,
    zIndex: 1,
  },
  row: {
    marginBottom: 40,
  },
  rowTitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 15,
  },
  rowContent: {
    paddingRight: 60,
  }
});
