import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, Text, Pressable, Dimensions, Modal, FlatList, Image as RNImage, ScrollView } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { NetflixHero } from '../../components/NetflixHero';
import { HorizontalCarousel } from '../../components/HorizontalCarousel';
import { LazyCarouselRow } from '../../components/LazyCarouselRow';
import { ClipsRow } from '../../components/ClipsRow';
import { COLORS, SPACING } from '../../constants/theme';
import { fetchTrending, fetchPopular, fetchTopRated, fetchDiscoverByGenre, getBackdropUrl, getImageUrl } from '../../services/tmdb';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme, useTransition } from '../_layout';
import { useProfile } from '../../context/ProfileContext';
import { WatchHistoryService } from '../../services/WatchHistoryService';
import Animated, { 
  useSharedValue, 
  useAnimatedScrollHandler, 
  useAnimatedStyle, 
  interpolateColor,
  interpolate,
  withTiming,
  withRepeat,
  withSequence,
  FadeIn,
  FadeInDown,
  SharedTransition,
  withSpring,
  Easing,
  runOnJS,
  useAnimatedSensor,
  SensorType,
  useAnimatedRef
} from 'react-native-reanimated';

import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { DeviceMotion } from 'expo-sensors';
import { LinearGradient } from 'expo-linear-gradient';
import {
  GestureHandlerRootView,
  Gesture,
  GestureDetector
} from 'react-native-gesture-handler';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const CAST_DEVICES = [
  { id: '1', name: 'Living Room TV', icon: 'television' },
  { id: '2', name: 'Bedroom Chromecast', icon: 'google-chrome' },
  { id: '3', name: 'Kitchen Hub', icon: 'tablet' },
  { id: '4', name: 'Office Monitor', icon: 'monitor' },
];

const CATEGORIES = [
  'Action', 'Anime', 'Award-Winning', 'Comedies', 'Documentaries', 'Dramas',
  'Fantasy', 'Horror', 'International', 'Kids & Family', 'Music & Musicals',
  'Reality TV', 'Romance', 'Sci-Fi', 'Stand-Up Comedy', 'Thriller'
];

const MOCK_GAMES = [
  { id: 'g1', title: 'GTA: San Andreas', isGame: true, imageUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co5z8n.jpg', type: 'game' },
  { id: 'g2', title: 'Hades', isGame: true, imageUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1tms.jpg', type: 'game' },
  { id: 'g3', title: 'TMNT: Shredder\'s Revenge', isGame: true, imageUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2wxy.jpg', type: 'game' },
  { id: 'g4', title: 'Oxenfree', isGame: true, imageUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1qnv.jpg', type: 'game' },
  { id: 'g5', title: 'Into the Breach', isGame: true, imageUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1iie.jpg', type: 'game' },
  { id: 'g6', title: 'Valiant Hearts', isGame: true, imageUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1w50.jpg', type: 'game' },
];

const { height, width } = Dimensions.get('window');

const HERO_H = width * 1.2;

// We use an Animated.FlatList
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

export default function HomeScreen() {
  const router = useRouter();
  const { selectedProfile } = useProfile();
  const { isTransitioning } = useTransition();
  const { setThemeColor } = useTheme();
  const [activeFilter, setActiveFilter] = useState<'home' | 'tv' | 'movies'>('home');
  const [showCategories, setShowCategories] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  // Root level data for Hero and initial rows (the first 1-2 rendered immediately for perceived performance)
  const [trending, setTrending] = useState<any[]>([]);
  const [continueWatching, setContinueWatching] = useState<any[]>([]);
  const [clips, setClips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Bottom Sheet logic
  const bottomSheetRef = React.useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['40%'], []);
  const [isCasting, setIsCasting] = useState(false);
  const [activeDevice, setActiveDevice] = useState<string | null>(null);

  const handleCastPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    bottomSheetRef.current?.expand();
  }, []);

  const handleSurpriseMe = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (trending && trending.length > 0) {
      const randomIdx = Math.floor(Math.random() * trending.length);
      const randomItem = trending[randomIdx];
      router.push({ 
        pathname: "/movie/[id]", 
        params: { id: randomItem.id, type: randomItem.type } 
      });
    }
  }, [trending, router]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsAt={-1} appearsAt={0} opacity={0.7} />
    ),
    []
  );

  // Global Tilt Values
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);
  const shineX = useSharedValue(-width);

  // For dynamic background
  const scrollY = useSharedValue(0);
  const isPastHero = useSharedValue(false);
  const isKids = selectedProfile?.isKids || false;
  const themeColor = isKids ? '#004b87' : (activeFilter === 'tv' ? '#0a142b' : (activeFilter === 'movies' ? '#0a2b14' : '#2b0a14'));
  
  const updateNavColor = useCallback((pastHero: boolean) => {
    setThemeColor(pastHero ? '#000000' : themeColor);
  }, [themeColor, setThemeColor]);

  useFocusEffect(
    useCallback(() => {
      setThemeColor(isPastHero.value ? '#000000' : themeColor);
    }, [themeColor, isPastHero.value])
  );

  useEffect(() => {
    setThemeColor(isPastHero.value ? '#000000' : themeColor);
  }, [themeColor, isPastHero.value]);

  const scrollHandler = useAnimatedScrollHandler((event: any) => {
    scrollY.value = event.contentOffset.y;
    
    const safelyPastHero = event.contentOffset.y > height * 0.7;
    if (isPastHero.value !== safelyPastHero) {
      isPastHero.value = safelyPastHero;
      runOnJS(updateNavColor)(safelyPastHero);
    }
  });

  const animatedBackgroundStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      scrollY.value,
      [0, height * 0.4, height * 0.8],
      [themeColor, themeColor, COLORS.background]
    );
    return { backgroundColor };
  });

  const headerOpacity = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 50, 100], [0, 0.4, 1], 'clamp');
    return { opacity: activeFilter === 'home' ? 0 : opacity };
  });

  const tabsStyle = useAnimatedStyle(() => {
    const translateY = interpolate(scrollY.value, [0, 80], [0, -60], 'clamp');
    const opacity = interpolate(scrollY.value, [0, 60], [1, 0], 'clamp');
    return { transform: [{ translateY }], opacity };
  });

  const heroParallaxStyle = useAnimatedStyle(() => {
    const translateY = interpolate(scrollY.value, [0, 400], [0, -100], 'clamp');
    const opacity = interpolate(scrollY.value, [0, 300], [1, 0.5], 'clamp');
    return { transform: [{ translateY }], opacity };
  });

  // Load only the initial viewport data to prevent blocking
  const loadInitialData = async (filter: string) => {
    setLoading(true);
    try {
      const type = filter === 'home' ? 'all' : (filter === 'tv' ? 'tv' : 'movie');
      const safeType = type === 'all' ? 'movie' : type;
      const trendingData = isKids 
        ? await fetchDiscoverByGenre(safeType as any, 10751, isKids) // Family genre fallback
        : await fetchTrending(type as any, isKids);

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

      setClips(trendingData.slice(10, 16).map((item: any) => ({
        id: item.id.toString(),
        title: item.title || item.name,
        thumbnailUrl: getImageUrl(item.poster_path),
        videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', 
        type: item.media_type || (item.title ? 'movie' : 'tv'),
      })));

      // Continue Watching is now handled by a dedicated real-time subscription
    } catch (error) {
      console.error("Error fetching initial data:", error);
    } finally {
      setTimeout(() => setLoading(false), 300);
    }
  };

  useEffect(() => {
    loadInitialData(activeFilter);
  }, [activeFilter, selectedCategory, isKids]);

  // Real-time Watch History Subscription
  useEffect(() => {
    if (!selectedProfile) {
      setContinueWatching([]);
      return;
    }

    const unsubscribe = WatchHistoryService.subscribeToHistory(selectedProfile.id, (historyItems) => {
      // Filter out items with very little progress or already finished (optional)
      // and map to the format expected by HorizontalCarousel
      const formatted = historyItems.map(historyObj => {
        const itemData = historyObj.item || {};
        return {
          ...historyObj,
          title: itemData.title || itemData.name || 'Unknown',
          imageUrl: itemData.poster_path 
            ? getImageUrl(itemData.poster_path) 
            : (itemData.backdrop_path ? getBackdropUrl(itemData.backdrop_path) : ''),
        };
      });
      setContinueWatching(formatted);
    });

    return () => unsubscribe();
  }, [selectedProfile]);

  const sensor = useAnimatedSensor(SensorType.ROTATION, { interval: 16 });

  // Use a derived effect to update tilt values on the UI thread
  useEffect(() => {
    // We don't need a manual listener anymore, Reanimated handles it.
    // However, if we want to apply springs, we can use useDerivedValue or just 
    // access sensor.sensor.value directly in NetflixHero (preferable for perf).
  }, []);

  const gesture = Gesture.Pan()
    .onUpdate((event) => {
      const centerX = width / 2;
      const centerY = height / 3;
      const dx = (event.y - centerY) / 20;
      const dy = -(event.x - centerX) / 20;
      tiltX.value = withSpring(dx, { damping: 15, stiffness: 100 });
      tiltY.value = withSpring(dy, { damping: 15, stiffness: 100 });
      shineX.value = withSpring((event.x - centerX) * 0.5, { damping: 15, stiffness: 100 });
    })
    .onEnd(() => {
      tiltX.value = withSpring(0);
      tiltY.value = withSpring(0);
      shineX.value = withSpring(-width);
    });

  const heroItem = useMemo(() => trending.length > 0 ? {
    ...trending[0],
    imageUrl: trending[0].imageUrl,
    categories: selectedCategory ? [selectedCategory, 'Trending'] : ['Understated', 'Dark', 'Drama', 'Detectives'],
  } : null, [trending, selectedCategory]);

  // Master FlatList Configuration Map (Memoized to prevent LazyCarouselRow unmounts)
  const rowsConfig = useMemo(() => {
    const rows = [];
    
    if (activeFilter === 'home') {
      if (continueWatching.length > 0) {
        rows.push({ id: 'cw', type: 'cw', data: continueWatching });
      }
      if (!isKids) {
        rows.push({ id: 'games', type: 'games', data: MOCK_GAMES });
        if (clips.length > 0) rows.push({ id: 'clips', type: 'clips', data: clips });
      }
    }

    // Static early rows (already loaded so zero stutter)
    rows.push({ id: 'trending', type: 'static_carousel', title: isKids ? 'Kids Trending Now' : (selectedCategory ? `${selectedCategory} Trending` : 'Trending Now'), data: trending });

    // The Endless Lazy Rows (20+ robust rows using strict TMDB genre mapping)
    const baseType = activeFilter === 'tv' ? 'tv' : 'movie';
    const genericType = activeFilter === 'home' ? 'movie' : baseType;

    // Stable fetchFn closures through generic wrappers
    const lazyConfigs = [
      { id: 'lazy_pop', title: 'Popular Releases', typeInput: baseType, genreId: 'popular' },
      { id: 'lazy_top', title: 'Critically Acclaimed', typeInput: baseType, genreId: 'top_rated' },
      { id: 'g_act', title: 'Action Packed', typeInput: genericType, genreId: 28 },
      { id: 'g_com', title: 'Laugh-Out-Loud Comedies', typeInput: genericType, genreId: 35 },
      { id: 'g_hor', title: 'Chilling Horrors', typeInput: genericType, genreId: 27 },
      { id: 'g_rom', title: 'Romantic Favorites', typeInput: genericType, genreId: 10749 },
      { id: 'g_sci', title: 'Sci-Fi Adventures', typeInput: genericType, genreId: 878 },
      { id: 'g_doc', title: 'Real Life Documentaries', typeInput: genericType, genreId: 99 },
      { id: 'g_fam', title: 'Kids & Family', typeInput: genericType, genreId: 10751 },
      { id: 'g_ani', title: 'Imaginative Animation', typeInput: genericType, genreId: 16 },
      { id: 'g_cri', title: 'Crime Detectives', typeInput: genericType, genreId: 80 },
      { id: 'g_mys', title: 'Mystery & Suspense', typeInput: genericType, genreId: 9648 },
      { id: 'g_dra', title: 'Award-Winning Dramas', typeInput: genericType, genreId: 18 },
      { id: 'g_fan', title: 'Fantasy Epics', typeInput: genericType, genreId: 14 },
      { id: 'g_his', title: 'Historical Events', typeInput: genericType, genreId: 36 },
      { id: 'g_mus', title: 'Music & Concerts', typeInput: genericType, genreId: 10402 },
      { id: 'g_thr', title: 'Nail-Biting Thrillers', typeInput: genericType, genreId: 53 },
      { id: 'g_war', title: 'War Action', typeInput: genericType, genreId: 10752 },
      { id: 'g_wes', title: 'Gritty Westerns', typeInput: genericType, genreId: 37 },
    ];

    if (isKids) {
      const kidsConfigs = lazyConfigs.filter(c => ['g_fam', 'g_ani'].includes(c.id));
      rows.push(...kidsConfigs.map(c => ({ ...c, type: 'lazy_carousel' })));
    } else {
      rows.push(...lazyConfigs.map(c => ({ ...c, type: 'lazy_carousel' })));
    }
    return rows;
  }, [activeFilter, continueWatching, clips, trending, selectedCategory, isKids]);

  const renderItem = useCallback(({ item }: { item: any }) => {
    switch (item.type) {
      case 'cw':
        return <HorizontalCarousel title="Continue Watching" data={item.data} variant="poster" tiltX={tiltX} tiltY={tiltY} isWatchHistory={true} />;
      case 'games':
        return <HorizontalCarousel title="Mobile Games" data={item.data} tiltX={tiltX} tiltY={tiltY} isGamesRow={true} />;
      case 'clips':
        return <ClipsRow title="Fresh Clips for You" data={item.data} />;
      case 'static_carousel':
        return <HorizontalCarousel title={item.title} data={item.data} tiltX={tiltX} tiltY={tiltY} />;
      case 'lazy_carousel':
        // Generate fetch closures on-the-fly inside the component mapping, rather than recreating in the memoized config array. 
        // This ensures the row IDs stay perfectly stable.
        const rowFetchFn = () => {
          if (item.genreId === 'popular') return fetchPopular(item.typeInput, isKids);
          if (item.genreId === 'top_rated') return fetchTopRated(item.typeInput, isKids);
          return fetchDiscoverByGenre(item.typeInput, item.genreId as number, isKids);
        };
        return <LazyCarouselRow title={item.title} fetchFn={rowFetchFn} tiltX={tiltX} tiltY={tiltY} />;
      default:
        return null;
    }
  }, [tiltX, tiltY]);

  // The very top hero that used to be inside the ScrollView is now the ListHeaderComponent
  const renderHeader = () => (
    heroItem ? (
      <View style={{ zIndex: 1 }}>
        <GestureDetector gesture={gesture}>
          <NetflixHero 
            item={heroItem} 
            onPress={() => router.push({ pathname: "/movie/[id]", params: { id: heroItem!.id, type: heroItem!.type } })}
            tiltX={tiltX} 
            tiltY={tiltY} 
            shineX={shineX} 
            sensor={sensor}
            style={heroParallaxStyle}
          />
        </GestureDetector>
        {/* We use a negative margin on the first row to tuck slightly under hero bottom, just like before */}
        <View style={{ marginTop: -20 }} /> 
      </View>
    ) : null
  );

  return (
    <Animated.View style={[styles.container, animatedBackgroundStyle]}>
      
      {/* Absolute Translucent Header */}
      <View style={[styles.absoluteHeaderContainer, { paddingTop: insets.top }]}>
        <Animated.View style={[StyleSheet.absoluteFill, headerOpacity]}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['rgba(0,0,0,0.8)', 'rgba(0,0,0,0)']} style={StyleSheet.absoluteFill} />
        </Animated.View>
        
        <View style={styles.header}>
          <Pressable style={styles.headerLeft} onPress={() => { 
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            // Logo action
          }}>
            <ExpoImage 
              source={require('../../assets/images/netflix-n-logo.svg')} 
              style={styles.headerLogoImage} 
              contentFit="contain"
            />
          </Pressable>
          <View style={styles.headerIcons}>
            <Pressable style={styles.iconButton} onPress={handleCastPress}>
              <MaterialCommunityIcons name={isCasting ? "cast-connected" : "cast"} size={24} color={isCasting ? COLORS.primary : "white"} />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={handleSurpriseMe}>
              <Ionicons name="shuffle" size={26} color="white" />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/search');
            }}>
              <Ionicons name="search" size={24} color="white" />
            </Pressable>
            <Pressable style={styles.avatarButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/my-netflix'); }}>
              <Animated.Image 
                source={selectedProfile?.avatar} 
                style={[styles.headerAvatar, isTransitioning && { opacity: 0 }]} 
              />
            </Pressable>
          </View>
        </View>

        <Animated.View style={[styles.tabsRow, tabsStyle]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm, paddingHorizontal: SPACING.md }}>
            <Pressable onPress={() => { Haptics.selectionAsync(); setActiveFilter('home'); setSelectedCategory(null); }} style={[styles.pillButton, activeFilter === 'home' && styles.pillButtonActive]}>
              <Text style={[styles.pillText, activeFilter === 'home' && styles.pillTextActive]}>Home</Text>
            </Pressable>
            <Pressable onPress={() => { Haptics.selectionAsync(); setActiveFilter('tv'); setSelectedCategory(null); }} style={[styles.pillButton, activeFilter === 'tv' && styles.pillButtonActive]}>
              <Text style={[styles.pillText, activeFilter === 'tv' && styles.pillTextActive]}>TV Shows</Text>
            </Pressable>
            <Pressable onPress={() => { Haptics.selectionAsync(); setActiveFilter('movies'); setSelectedCategory(null); }} style={[styles.pillButton, activeFilter === 'movies' && styles.pillButtonActive]}>
              <Text style={[styles.pillText, activeFilter === 'movies' && styles.pillTextActive]}>Movies</Text>
            </Pressable>
            <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowCategories(true); }} style={styles.pillButton}>
              <Text style={styles.pillText}>{selectedCategory || 'Categories'}</Text>
              <Ionicons name="chevron-down" size={14} color="white" style={{ marginLeft: 4 }} />
            </Pressable>
          </ScrollView>
        </Animated.View>
      </View>

      <View style={{ flex: 1 }}>
        {loading ? (
          <HomeSkeleton />
        ) : (
          <Animated.View entering={FadeIn.duration(400)} style={{ flex: 1 }}>
            <AnimatedFlatList
              data={rowsConfig}
              keyExtractor={(item: any) => item.id}
              renderItem={renderItem}
              ListHeaderComponent={renderHeader}
              ListFooterComponent={<View style={{ height: 100 }} />}
              onScroll={scrollHandler}
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingTop: insets.top + 120 }}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={false} 
              initialNumToRender={4}
              maxToRenderPerBatch={5}
              windowSize={7}
            />
          </Animated.View>
        )}
      </View>

      {/* Categories Dropdown Modal */}
      <Modal visible={showCategories} transparent animationType="fade" onRequestClose={() => setShowCategories(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowCategories(false)}>
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
                <Pressable style={styles.categoryItem} onPress={() => { 
                  Haptics.selectionAsync();
                  setSelectedCategory(item); 
                  setShowCategories(false); 
                  loadInitialData(activeFilter); 
                }}>
                  <Text style={[styles.categoryText, selectedCategory === item && styles.categoryTextActive]}>{item}</Text>
                </Pressable>
              )}
              showsVerticalScrollIndicator={false}
            />
          </Animated.View>
        </Pressable>
      </Modal>

      {/* Cast Bottom Sheet */}
      <BottomSheet ref={bottomSheetRef} index={-1} snapPoints={snapPoints} enablePanDownToClose backdropComponent={renderBackdrop} backgroundStyle={styles.bottomSheetBackground} handleIndicatorStyle={{ backgroundColor: 'rgba(255,255,255,0.3)' }}>
        <BottomSheetView style={styles.bottomSheetContent}>
          <Text style={styles.bottomSheetTitle}>Cast to Device</Text>
          {CAST_DEVICES.map((device) => (
            <Pressable key={device.id} style={[styles.deviceItem, activeDevice === device.id && styles.deviceItemActive]} onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setActiveDevice(device.id); setIsCasting(true); bottomSheetRef.current?.close(); }}>
              <MaterialCommunityIcons name={device.icon as any} size={24} color={activeDevice === device.id ? "white" : "rgba(255,255,255,0.6)"} />
              <Text style={[styles.deviceText, activeDevice === device.id && styles.deviceTextActive]}>{device.name}</Text>
              {activeDevice === device.id && <View style={styles.activeIndicator} />}
            </Pressable>
          ))}
          {isCasting && (
            <Pressable style={styles.stopCastBtn} onPress={() => { setIsCasting(false); setActiveDevice(null); bottomSheetRef.current?.close(); }}>
              <Text style={styles.stopCastText}>Stop Casting</Text>
            </Pressable>
          )}
        </BottomSheetView>
      </BottomSheet>
    </Animated.View>
  );
}

// Skeleton Components intact
function Shimmer({ width, height, borderRadius = 4, style }: { width: any, height: any, borderRadius?: number, style?: any }) {
  const translateX = useSharedValue(-width);
  useEffect(() => { translateX.value = withRepeat(withTiming(width, { duration: 1500, easing: Easing.bezier(0.4, 0, 0.6, 1) }), -1, false); }, [width]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  return (
    <View style={[{ width, height, borderRadius, backgroundColor: '#141414', overflow: 'hidden' }, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
        <LinearGradient colors={['transparent', 'rgba(255,255,255,0.06)', 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

function HomeSkeleton() {
  const HERO_W = width * 0.9;
  const HERO_H = HERO_W * 1.35;
  const POSTER_W = width * 0.28;
  const POSTER_H = POSTER_W * 1.5;
  const LANDSCAPE_W = width * 0.35;
  const LANDSCAPE_H = LANDSCAPE_W * 1.4;
  
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.skeletonHeroContainer}><Shimmer width={HERO_W} height={HERO_H} borderRadius={12} /></View>
        <View style={styles.skeletonRow}>
          <Shimmer width={150} height={18} style={{ marginBottom: 12 }} />
          <View style={styles.skeletonCardsRow}>
            <Shimmer width={LANDSCAPE_W} height={LANDSCAPE_H} borderRadius={8} />
            <Shimmer width={LANDSCAPE_W} height={LANDSCAPE_H} borderRadius={8} />
            <Shimmer width={LANDSCAPE_W} height={LANDSCAPE_H} borderRadius={8} />
          </View>
        </View>
        <View style={styles.skeletonRow}>
          <Shimmer width={120} height={18} style={{ marginBottom: 12 }} />
          <View style={styles.skeletonCardsRow}>
            <Shimmer width={POSTER_W} height={POSTER_H} borderRadius={8} />
            <Shimmer width={POSTER_W} height={POSTER_H} borderRadius={8} />
            <Shimmer width={POSTER_W} height={POSTER_H} borderRadius={8} />
            <Shimmer width={POSTER_W} height={POSTER_H} borderRadius={8} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  absoluteHeaderContainer: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, paddingBottom: 10 },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: SPACING.md, 
    paddingRight: SPACING.lg, 
    paddingVertical: SPACING.sm, 
    height: 65 
  },
  headerLeft: { 
    justifyContent: 'center', 
    marginLeft: -SPACING.sm,
    padding: 4,
  },
  headerLogoImage: { 
    width: 45, 
    height: 45, 
    resizeMode: 'contain' 
  },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  iconButton: { padding: 4 },
  avatarButton: { marginLeft: 4 },
  headerAvatar: { width: 28, height: 28, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  tabsRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: SPACING.md },
  pillButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  pillButtonActive: { backgroundColor: 'white', borderColor: 'white' },
  pillText: { color: 'white', fontSize: 14, fontWeight: '600' },
  pillTextActive: { color: 'black' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '100%', height: '100%', paddingTop: 60, paddingHorizontal: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 },
  modalTitle: { color: 'white', fontSize: 24, fontWeight: 'bold' },
  closeBtn: { padding: 8 },
  categoryItem: { paddingVertical: 15, alignItems: 'center' },
  categoryText: { color: 'rgba(255,255,255,0.6)', fontSize: 18, fontWeight: '500' },
  categoryTextActive: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  skeletonHeroContainer: { alignItems: 'center', marginVertical: SPACING.lg },
  skeletonRow: { marginBottom: SPACING.lg, paddingHorizontal: SPACING.md },
  skeletonCardsRow: { flexDirection: 'row', gap: 10 },
  bottomSheetBackground: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  bottomSheetContent: { flex: 1, padding: 24 },
  bottomSheetTitle: { color: 'white', fontSize: 20, fontWeight: 'bold', marginBottom: 24, textAlign: 'center' },
  deviceItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', gap: 16 },
  deviceItemActive: { backgroundColor: 'rgba(229, 9, 20, 0.1)' },
  deviceText: { color: 'white', fontSize: 16, fontWeight: '500' },
  deviceTextActive: { color: COLORS.primary, fontWeight: 'bold' },
  activeIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary, marginLeft: 'auto' },
  stopCastBtn: { marginTop: 24, backgroundColor: 'rgba(255,255,255,0.1)', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  stopCastText: { color: 'white', fontSize: 16, fontWeight: 'bold' }
});
