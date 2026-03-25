import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, Text, Pressable, Dimensions, ScrollView, Modal, FlatList } from 'react-native';
import { NetflixHero } from '../../components/NetflixHero';
import { HorizontalCarousel } from '../../components/HorizontalCarousel';
import { ClipsRow } from '../../components/ClipsRow';
import { COLORS, SPACING } from '../../constants/theme';
import { fetchTrending, fetchPopular, fetchTopRated, getBackdropUrl, getImageUrl } from '../../services/tmdb';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { 
  useSharedValue, 
  useAnimatedScrollHandler, 
  useAnimatedStyle, 
  interpolateColor,
  withTiming,
  withRepeat,
  withSequence,
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';

const { height, width } = Dimensions.get('window');

const CATEGORIES = [
  'Action', 'Anime', 'Award-Winning', 'Comedies', 'Documentaries', 'Dramas', 
  'Fantasy', 'Horror', 'International', 'Kids & Family', 'Music & Musicals', 
  'Reality TV', 'Romance', 'Sci-Fi', 'Stand-Up Comedy', 'Thriller'
];

export default function HomeScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<'home' | 'tv' | 'movies'>('home');
  const [showCategories, setShowCategories] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const [trending, setTrending] = useState<any[]>([]);
  const [popularMovies, setPopularMovies] = useState<any[]>([]);
  const [topRated, setTopRated] = useState<any[]>([]);
  const [continueWatching, setContinueWatching] = useState<any[]>([]);
  const [clips, setClips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Global Tilt Values
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);
  const shineX = useSharedValue(-width);

  // For dynamic background
  const scrollY = useSharedValue(0);
  const themeColor = activeFilter === 'tv' ? '#0a142b' : (activeFilter === 'movies' ? '#0a2b14' : '#2b0a14');

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const animatedBackgroundStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      scrollY.value,
      [0, height * 0.4],
      [themeColor, COLORS.background]
    );
    return { backgroundColor };
  });

  const loadData = async (filter: string) => {
    setLoading(true);
    try {
      const type = filter === 'home' ? 'all' : (filter === 'tv' ? 'tv' : 'movie');
      
      const [trendingData, popularData, topRatedData] = await Promise.all([
        fetchTrending(type as any),
        fetchPopular(filter === 'tv' ? 'tv' : 'movie'),
        fetchTopRated(filter === 'tv' ? 'tv' : 'movie'),
      ]);

      const formatData = (items: any[]) => items.map((item: any) => ({
        id: item.id.toString(),
        title: item.title || item.name,
        imageUrl: getImageUrl(item.poster_path),
        backdropUrl: getBackdropUrl(item.backdrop_path),
        synopsis: item.overview,
        categories: ['Trending'], 
        type: item.media_type || (item.title ? 'movie' : 'tv'),
      }));

      setTrending(formatData(trendingData));
      setPopularMovies(formatData(popularData));
      setTopRated(formatData(topRatedData));

      // Mock clips data using trending items
      setClips(trendingData.slice(10, 16).map((item: any) => ({
        id: item.id.toString(),
        title: item.title || item.name,
        thumbnailUrl: getImageUrl(item.poster_path),
        videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', 
        type: item.media_type || (item.title ? 'movie' : 'tv'),
      })));

      if (filter === 'home') {
        setContinueWatching(trendingData.slice(1, 6).map((item: any) => ({
          id: item.id.toString(),
          title: item.title || item.name,
          imageUrl: getBackdropUrl(item.backdrop_path),
          synopsis: item.overview,
          type: item.media_type || (item.title ? 'movie' : 'tv'),
        })));
      }

    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setTimeout(() => setLoading(false), 600);
    }
  };

  useEffect(() => {
    loadData(activeFilter);
  }, [activeFilter]);

  const heroItem = useMemo(() => trending.length > 0 ? {
    ...trending[0],
    imageUrl: trending[0].imageUrl,
    categories: selectedCategory ? [selectedCategory, 'Trending'] : ['Understated', 'Dark', 'Drama', 'Detectives'],
  } : null, [trending, selectedCategory]);

  return (
    <Animated.View style={[styles.container, animatedBackgroundStyle]}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>For You</Text>
          <View style={styles.headerIcons}>
            <Pressable style={styles.iconButton}>
              <MaterialCommunityIcons name="cast" size={24} color="white" />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={() => router.push('/search')}>
              <Ionicons name="search" size={24} color="white" />
            </Pressable>
          </View>
        </View>

        <View style={styles.filterContainer}>
          <Pressable 
            onPress={() => { setActiveFilter('home'); setSelectedCategory(null); }}
            style={[styles.filterPill, activeFilter === 'home' && styles.filterPillActive]}
          >
            <Text style={[styles.filterText, activeFilter === 'home' && styles.filterTextActive]}>Home</Text>
          </Pressable>
          <Pressable 
            onPress={() => { setActiveFilter('tv'); setSelectedCategory(null); }}
            style={[styles.filterPill, activeFilter === 'tv' && styles.filterPillActive]}
          >
            <Text style={[styles.filterText, activeFilter === 'tv' && styles.filterTextActive]}>TV Shows</Text>
          </Pressable>
          <Pressable 
            onPress={() => { setActiveFilter('movies'); setSelectedCategory(null); }}
            style={[styles.filterPill, activeFilter === 'movies' && styles.filterPillActive]}
          >
            <Text style={[styles.filterText, activeFilter === 'movies' && styles.filterTextActive]}>Movies</Text>
          </Pressable>
          <Pressable 
            onPress={() => setShowCategories(true)}
            style={styles.filterPill}
          >
            <Text style={styles.filterText}>{selectedCategory || 'Categories'}</Text>
            <Ionicons name="chevron-down" size={14} color="white" style={{ marginLeft: 4 }} />
          </Pressable>
        </View>

        {loading ? (
          <HomeSkeleton />
        ) : (
          <Animated.View entering={FadeIn.duration(400)} style={{ flex: 1 }}>
            <Animated.ScrollView 
              onScroll={scrollHandler}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={true} 
            >
              {heroItem && (
                <NetflixHero 
                  item={heroItem} 
                  onPress={() => router.push({
                    pathname: `/movie/${heroItem.id}`,
                    params: { type: heroItem.type }
                  })}
                  tiltX={tiltX} 
                  tiltY={tiltY} 
                  shineX={shineX} 
                />
              )}
              
              {activeFilter === 'home' && (
                <HorizontalCarousel 
                  title="Continue Watching" 
                  data={continueWatching} 
                  variant="landscape"
                  tiltX={tiltX}
                  tiltY={tiltY}
                />
              )}

              {activeFilter === 'home' && clips.length > 0 && (
                <ClipsRow title="Fresh Clips for You" data={clips} />
              )}
              
              <HorizontalCarousel 
                title={selectedCategory ? `${selectedCategory} Trending` : "Trending Now"} 
                data={trending} 
                tiltX={tiltX} 
                tiltY={tiltY} 
              />
              <HorizontalCarousel 
                title={activeFilter === 'tv' ? "Popular Series" : "Popular Movies"} 
                data={popularMovies} 
                tiltX={tiltX} 
                tiltY={tiltY} 
              />
              <HorizontalCarousel 
                title="Critically Acclaimed" 
                data={topRated} 
                tiltX={tiltX} 
                tiltY={tiltY} 
              />
              
              <View style={{ height: 100 }} />
            </Animated.ScrollView>
          </Animated.View>
        )}
      </SafeAreaView>

      {/* Categories Dropdown Modal */}
      <Modal
        visible={showCategories}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCategories(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setShowCategories(false)}
        >
          <Animated.View entering={FadeInDown.duration(300)} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Categories</Text>
              <Pressable onPress={() => setShowCategories(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={28} color="white" />
              </Pressable>
            </View>
            
            <FlatList
              data={CATEGORIES}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable 
                  style={styles.categoryItem}
                  onPress={() => {
                    setSelectedCategory(item);
                    setShowCategories(false);
                    loadData(activeFilter);
                  }}
                >
                  <Text style={[
                    styles.categoryText,
                    selectedCategory === item && styles.categoryTextActive
                  ]}>
                    {item}
                  </Text>
                </Pressable>
              )}
              showsVerticalScrollIndicator={false}
            />
          </Animated.View>
        </Pressable>
      </Modal>
    </Animated.View>
  );
}

function HomeSkeleton() {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 800 }),
        withTiming(0.3, { duration: 800 })
      ),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <View style={{ flex: 1 }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.skeletonHero, animatedStyle]} />
        <View style={styles.skeletonRow}>
          <View style={styles.skeletonSectionTitle} />
          <View style={styles.skeletonCardsRow}>
            <View style={styles.skeletonCardLandscape} />
            <View style={styles.skeletonCardLandscape} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: 'bold',
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  iconButton: {
    padding: 4,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  filterPillActive: {
    backgroundColor: 'white',
    borderColor: 'white',
  },
  filterText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '500',
  },
  filterTextActive: {
    color: 'black',
    fontWeight: 'bold',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '100%',
    height: '100%',
    paddingTop: 60,
    paddingHorizontal: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 40,
  },
  modalTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  closeBtn: {
    padding: 8,
  },
  categoryItem: {
    paddingVertical: 15,
    alignItems: 'center',
  },
  categoryText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
    fontWeight: '500',
  },
  categoryTextActive: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
  },
  // Skeleton
  skeletonHero: {
    width: width * 0.9,
    height: width * 1.2,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    alignSelf: 'center',
    marginVertical: SPACING.lg,
  },
  skeletonRow: {
    marginTop: 20,
    paddingHorizontal: SPACING.md,
  },
  skeletonSectionTitle: {
    width: 150,
    height: 18,
    backgroundColor: '#1a1a1a',
    borderRadius: 4,
    marginBottom: 12,
  },
  skeletonCardsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  skeletonCardLandscape: {
    width: width * 0.35,
    height: width * 0.5,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
  }
});
