import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, Text, Pressable, useWindowDimensions, Modal, FlatList, ScrollView, NativeModules, Image, Alert } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { NativeHeroCard } from '../../components/NativeHeroCard';
import { MyListService } from '../../services/MyListService';
import { HorizontalCarousel } from '../../components/HorizontalCarousel';
import { LandscapeContinueWatchingRow } from '../../components/LandscapeContinueWatchingRow';
import { LazyCarouselRow } from '../../components/LazyCarouselRow';
import { ClipsRow } from '../../components/ClipsRow';
import { QuickPreviewModal, QuickPreviewItem } from '../../components/QuickPreviewModal';
import { COLORS, SPACING } from '../../constants/theme';
import { fetchTrending, fetchPopular, fetchTopRated, fetchDiscoverByGenre, getBackdropUrl, getImageUrl, fetchTitleLogo } from '../../services/tmdb';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme, useTransition } from '../_layout';
import { useProfile } from '../../context/ProfileContext';
import { WatchHistoryService } from '../../services/WatchHistoryService';
import { SubscriptionService } from '../../services/SubscriptionService';
import { isContentLockedForFreePlan } from '../../services/AccessControl';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolateColor,
  interpolate,
  withTiming,
  withRepeat,
  FadeIn,
  FadeInDown,
  Easing,
  runOnJS
} from 'react-native-reanimated';

import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';

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

const GENRE_MAP: Record<string, number> = {
  'Action': 28,
  'Anime': 16,
  'Award-Winning': 18, // Drama mapping
  'Comedies': 35,
  'Documentaries': 99,
  'Dramas': 18,
  'Fantasy': 14,
  'Horror': 27,
  'International': 10751, // Family fallback
  'Kids & Family': 10751,
  'Music & Musicals': 10402,
  'Reality TV': 10770, // TV Movie mapping
  'Romance': 10749,
  'Sci-Fi': 878,
  'Stand-Up Comedy': 35, // Comedy mapping
  'Thriller': 53
};

const { MoviesModule } = NativeModules;

const HERO_LOGO_FETCH_LIMIT = 3;

// Removed static Dimensions measurement to prevent orientation-change distortion;
// using useWindowDimensions() inside components instead.

// We use an Animated.FlatList
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

export default function HomeScreen() {
  const { height } = useWindowDimensions();
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
  const [isFreePlan, setIsFreePlan] = useState(false);

  // Bottom Sheet logic
  const bottomSheetRef = React.useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['40%'], []);
  const [isCasting, setIsCasting] = useState(false);
  const [activeDevice, setActiveDevice] = useState<string | null>(null);
  const [heroIsInList, setHeroIsInList] = useState(false);
  const [previewItem, setPreviewItem] = useState<QuickPreviewItem | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const loadRequestRef = useRef(0);

  useEffect(() => {
    const unsub = SubscriptionService.listenToSubscription((sub) => {
      setIsFreePlan(sub.status !== 'active');
    });
    return () => unsub();
  }, []);

  const handleCardLongPress = useCallback((item: QuickPreviewItem) => {
    setPreviewItem(item);
    setShowPreview(true);
  }, []);

  const handleCastPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    bottomSheetRef.current?.expand();
  }, []);

  const handleSurpriseMe = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (trending && trending.length > 0) {
      const randomIdx = Math.floor(Math.random() * trending.length);
      const randomItem = trending[randomIdx];
      if (isContentLockedForFreePlan(randomItem.id, isFreePlan)) {
        Alert.alert(
          'Upgrade Required',
          'This content is locked on the Free Plan. Upgrade your subscription to watch.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Upgrade', onPress: () => router.push('/subscription') }
          ]
        );
        return;
      }
      router.push({ 
        pathname: "/movie/[id]", 
        params: { id: randomItem.id, type: randomItem.type } 
      });
    }
  }, [trending, router, isFreePlan]);

  const showUpgradePrompt = useCallback(() => {
    Alert.alert(
      'Upgrade Required',
      'This content is locked on the Free Plan. Upgrade your subscription to watch.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Upgrade', onPress: () => router.push('/subscription') }
      ]
    );
  }, [router]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsAt={-1} appearsAt={0} opacity={0.7} />
    ),
    []
  );

  // Global Tilt Values
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);

  // For dynamic background
  const scrollY = useSharedValue(0);
  const isPastHero = useSharedValue(false);
  const isKids = selectedProfile?.isKids || false;
  const spatialEnabled = selectedProfile?.settings?.spatialMode !== false;
  const themeColor = isKids ? '#004b87' : (activeFilter === 'tv' ? '#0a142b' : (activeFilter === 'movies' ? '#0a2b14' : '#2b0a14'));
  
  const updateNavColor = useCallback((pastHero: boolean) => {
    setThemeColor(pastHero ? '#000000' : themeColor);
  }, [themeColor, setThemeColor]);

  useFocusEffect(
    useCallback(() => {
      setThemeColor(isPastHero.value ? '#000000' : themeColor);
    }, [themeColor, isPastHero, setThemeColor])
  );

  useEffect(() => {
    setThemeColor(isPastHero.value ? '#000000' : themeColor);
  }, [themeColor, isPastHero, setThemeColor]);

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
      [0, height * 0.6, height * 1.2],
      [themeColor, 'rgba(0,0,0,0.98)', COLORS.background]
    );
    return { backgroundColor };
  });

  const auraOpacityStyle = useAnimatedStyle(() => {
    // Fades out the aura smoothly as the user scrolls down — much longer fade
    const opacity = interpolate(scrollY.value, [0, height * 0.9], [0.55, 0], 'clamp');
    return { opacity };
  });

  const tabsStyle = useAnimatedStyle(() => {
    const translateY = interpolate(scrollY.value, [0, 90], [0, -55], 'clamp');
    const opacity = interpolate(scrollY.value, [0, 70], [1, 0], 'clamp');
    return { transform: [{ translateY }], opacity };
  });

  const heroParallaxStyle = useAnimatedStyle(() => {
    const translateY = interpolate(scrollY.value, [0, 400], [0, -80], 'clamp');
    const opacity = interpolate(scrollY.value, [0, 350], [1, 0.4], 'clamp');
    return { transform: [{ translateY }], opacity };
  });

  // Load only the initial viewport data to prevent blocking
  const loadInitialData = useCallback(async (filter: string) => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    try {
      const type = filter === 'home' ? 'all' : (filter === 'tv' ? 'tv' : 'movie');
      const safeType = type === 'all' ? 'movie' : type;
      
      let trendingData;
      if (selectedCategory && GENRE_MAP[selectedCategory]) {
        if (filter === 'home') {
          const [movieResults, tvResults] = await Promise.all([
            fetchDiscoverByGenre('movie', GENRE_MAP[selectedCategory], isKids),
            fetchDiscoverByGenre('tv', GENRE_MAP[selectedCategory], isKids),
          ]);

          const mixed: any[] = [];
          const maxLen = Math.max(movieResults.length, tvResults.length);
          for (let i = 0; i < maxLen; i++) {
            if (movieResults[i]) mixed.push({ ...movieResults[i], media_type: 'movie' });
            if (tvResults[i]) mixed.push({ ...tvResults[i], media_type: 'tv' });
          }
          trendingData = mixed;
        } else {
          trendingData = await fetchDiscoverByGenre(safeType as any, GENRE_MAP[selectedCategory], isKids);
        }
      } else {
        trendingData = isKids 
          ? await fetchDiscoverByGenre(safeType as any, 10751, isKids) 
          : await fetchTrending(type as any, isKids);
      }

      const formatData = (items: any[]) => items.map((item: any) => ({
        id: item.id.toString(),
        title: item.title || item.name,
        imageUrl: getImageUrl(item.poster_path),
        backdropUrl: getBackdropUrl(item.backdrop_path),
        synopsis: item.overview,
        categories: selectedCategory ? [selectedCategory, 'Trending'] : ['Trending'], 
        type: item.media_type || (item.title ? 'movie' : 'tv'),
        genre_ids: item.genre_ids
      }));

      const trendingFormatted = formatData(trendingData);

      // Fetch title logos only for the visible hero set to keep home startup light.
      const topHeroItems = trendingFormatted.slice(0, HERO_LOGO_FETCH_LIMIT);
      const topHeroItemsWithLogos = await Promise.all(topHeroItems.map(async (item: any) => {
        const titleLogoUrl = await fetchTitleLogo(item.id, item.type as any) || '';
        return { ...item, titleLogoUrl };
      }));

      // Merge the enhanced hero set back into the full feed.
      const finalTrending = [...topHeroItemsWithLogos, ...trendingFormatted.slice(HERO_LOGO_FETCH_LIMIT)];
      if (loadRequestRef.current !== requestId) return;

      setTrending(finalTrending);
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
      if (loadRequestRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [selectedCategory, isKids]);

  useEffect(() => {
    loadInitialData(activeFilter);
  }, [activeFilter, selectedCategory, isKids, loadInitialData]);

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

  // Legacy sensor/gesture code - preserved for future 3D tilt features
  // const _sensor = useAnimatedSensor(SensorType.ROTATION, { interval: 16 });
  // const _gesture = Gesture.Pan()...

  const heroItems = useMemo(() => {
    return trending.slice(0, 5).map(item => ({
      ...item,
      categories: selectedCategory ? [selectedCategory, 'Trending'] : ['Understated', 'Dark', 'Drama', 'Detectives'],
      nLogoUrl: Image.resolveAssetSource(require('../../assets/images/netflix-n-logo.svg')).uri
    }));
  }, [trending, selectedCategory]);

  useEffect(() => {
    if (!selectedProfile || heroItems.length === 0) return;
    
    // We only actively track My List for the first hero item to simplify the UI state 
    // for this proof-of-concept, but ideally we'd track all 5.
    const primaryHeroId = heroItems[0].id;
    MyListService.isInList(selectedProfile.id, primaryHeroId).then(setHeroIsInList);
    
    const unsubscribe = MyListService.subscribeToList(selectedProfile.id, (items) => {
      const exists = items.some(i => i.id.toString() === primaryHeroId.toString());
      setHeroIsInList(exists);
    });

    return () => unsubscribe();
  }, [selectedProfile, heroItems]);

  const [categorySubRows, setCategorySubRows] = useState<any[]>([]);

  useEffect(() => {
    if (selectedCategory && GENRE_MAP[selectedCategory]) {
      MoviesModule.getGenreSubCategories(GENRE_MAP[selectedCategory])
        .then(setCategorySubRows)
        .catch(console.error);
    } else {
      setCategorySubRows([]);
    }
  }, [selectedCategory]);

  // Master FlatList Configuration Map (Memoized to prevent LazyCarouselRow unmounts)
  const rowsConfig = useMemo(() => {
    const rows = [];
    
    if (activeFilter === 'home' && !selectedCategory) {
      if (continueWatching.length > 0) {
        rows.push({ id: 'cw', type: 'cw', data: continueWatching });
      }
      if (!isKids) {
        if (clips.length > 0) rows.push({ id: 'clips', type: 'clips', data: clips });
      }
    }

    // Static early rows (already loaded so zero stutter)
    rows.push({ id: 'trending', type: 'static_carousel', title: isKids ? 'Kids Trending Now' : (selectedCategory ? `${selectedCategory} Trending` : 'Trending Now'), data: trending });

    if (selectedCategory && categorySubRows.length > 0) {
      // In the "home" filter, alternate movie and TV rows so category mode
      // doesn't collapse into a uniform all-movie feed.
      categorySubRows.forEach((row, index) => {
        const resolvedType =
          activeFilter === 'home'
            ? (index % 2 === 0 ? 'movie' : 'tv')
            : (activeFilter === 'tv' ? 'tv' : 'movie');
        const resolvedTitle =
          activeFilter === 'home'
            ? `${row.title} ${resolvedType === 'tv' ? 'TV Shows' : 'Movies'}`
            : row.title;

        rows.push({
          id: `${selectedCategory}-${activeFilter}-${resolvedType}-${row.id}`,
          title: resolvedTitle,
          type: 'lazy_carousel',
          typeInput: resolvedType,
          genreId: row.genreId
        });
      });
      return rows;
    }

    // Curated lazy rows: broad enough to feel premium, light enough to avoid feed bloat.
    const baseType = activeFilter === 'tv' ? 'tv' : 'movie';
    const genericType = activeFilter === 'home' ? 'movie' : baseType;

    // Stable fetchFn closures through generic wrappers
    const lazyConfigs = [
      { id: 'lazy_pop', title: 'Popular Releases', typeInput: baseType, genreId: 'popular' },
      { id: 'lazy_top', title: 'Critically Acclaimed', typeInput: baseType, genreId: 'top_rated' },
      { id: 'g_act', title: 'Action Packed', typeInput: genericType, genreId: 28 },
      { id: 'g_com', title: 'Laugh-Out-Loud Comedies', typeInput: genericType, genreId: 35 },
      { id: 'g_dra', title: 'Award-Winning Dramas', typeInput: genericType, genreId: 18 },
      { id: 'g_sci', title: 'Sci-Fi Adventures', typeInput: genericType, genreId: 878 },
      { id: 'g_thr', title: 'Nail-Biting Thrillers', typeInput: genericType, genreId: 53 },
      { id: 'g_rom', title: 'Romantic Favorites', typeInput: genericType, genreId: 10749 },
      { id: 'g_hor', title: 'Chilling Horrors', typeInput: genericType, genreId: 27 },
      { id: 'g_doc', title: 'Real Life Documentaries', typeInput: genericType, genreId: 99 },
      { id: 'g_fam', title: 'Kids & Family', typeInput: genericType, genreId: 10751 },
      { id: 'g_cri', title: 'Crime Detectives', typeInput: genericType, genreId: 80 },
      { id: 'g_ani', title: 'Imaginative Animation', typeInput: genericType, genreId: 16 },
    ];

    if (isKids) {
      const kidsConfigs = lazyConfigs.filter(c => ['g_fam', 'g_ani'].includes(c.id));
      rows.push(...kidsConfigs.map(c => ({ ...c, type: 'lazy_carousel' })));
    } else {
      rows.push(...lazyConfigs.map(c => ({ ...c, type: 'lazy_carousel' })));
    }
    return rows;
  }, [activeFilter, continueWatching, clips, trending, selectedCategory, isKids, categorySubRows]);

  const renderItem = useCallback(({ item }: { item: any }) => {
    switch (item.type) {
      case 'cw':
        return <LandscapeContinueWatchingRow title="Continue Watching" data={item.data} tiltX={tiltX} tiltY={tiltY} onCardLongPress={handleCardLongPress} />;
      case 'clips':
        return <ClipsRow title="Fresh Clips for You" data={item.data} />;
      case 'static_carousel':
        return <HorizontalCarousel title={item.title} data={item.data} tiltX={tiltX} tiltY={tiltY} onCardLongPress={handleCardLongPress} />;
      case 'lazy_carousel':
        // Generate fetch closures on-the-fly inside the component mapping, rather than recreating in the memoized config array. 
        // This ensures the row IDs stay perfectly stable.
        const rowFetchFn = () => {
          if (item.genreId === 'popular') return fetchPopular(item.typeInput, isKids);
          if (item.genreId === 'top_rated') return fetchTopRated(item.typeInput, isKids);
          return fetchDiscoverByGenre(item.typeInput, item.genreId as number, isKids);
        };
        return (
          <LazyCarouselRow
            title={item.title}
            fetchKey={`${item.id}:${item.typeInput}:${String(item.genreId)}:${selectedCategory || 'all'}`}
            fetchFn={rowFetchFn}
            tiltX={tiltX}
            tiltY={tiltY}
            onCardLongPress={handleCardLongPress}
          />
        );
      default:
        return null;
    }
  }, [tiltX, tiltY, isKids, handleCardLongPress]);

  // The very top hero that used to be inside the ScrollView is now the ListHeaderComponent
  const renderHeader = () => (
    heroItems.length > 0 ? (
      <View style={styles.heroHeader}>
        <NativeHeroCard
          items={heroItems.map((item, index) => ({
            ...item,
            isInMyList: index === 0 ? heroIsInList : false 
          }))}
          spatialEnabled={spatialEnabled}
          onPlayPress={(e) => {
            if (e?.nativeEvent?.id) {
              const matched = heroItems.find(i => i.id.toString() === e.nativeEvent.id.toString());
              if (matched) {
                if (isContentLockedForFreePlan(matched.id, isFreePlan)) {
                  showUpgradePrompt();
                  return;
                }
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push({ pathname: "/movie/[id]", params: { id: matched.id, type: matched.type } });
              }
            }
          }}
          onListPress={async (e) => {
            if (!selectedProfile) return;
            if (e?.nativeEvent?.id) {
              const matched = heroItems.find(i => i.id.toString() === e.nativeEvent.id.toString());
              if (matched) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                await MyListService.toggleItem(selectedProfile.id, {
                  id: matched.id.toString(),
                  title: matched.title,
                  poster_path: matched.imageUrl,
                  backdrop_path: matched.backdropUrl || matched.imageUrl,
                  type: matched.type || 'movie'
                });
              }
            }
          }}
          onLongPress={(e) => {
            if (e?.nativeEvent?.id) {
              const matched = heroItems.find(i => i.id.toString() === e.nativeEvent.id.toString());
              if (matched) {
                if (isContentLockedForFreePlan(matched.id, isFreePlan)) {
                  showUpgradePrompt();
                  return;
                }
                handleCardLongPress({
                  id: matched.id,
                  title: matched.title,
                  imageUrl: matched.imageUrl,
                  type: matched.type,
                });
              }
            }
          }}
          style={heroParallaxStyle}
        />
        {/* Cinematic bottom blending gradient — fuses the Hero with the rows below */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.4)', 'black']}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 120, zIndex: 2 }}
        />
        <View style={styles.heroRowSpacer} />
      </View>
    ) : null
  );

  return (
    <Animated.View style={[styles.container, animatedBackgroundStyle]}>
      
      {/* Ambient Glass Aura Effect */}
      {heroItems.length > 0 && (
        <Animated.View style={[StyleSheet.absoluteFill, auraOpacityStyle, { zIndex: -1 }]}>
          <ExpoImage 
            source={{ uri: heroItems[0].imageUrl }} 
            style={[StyleSheet.absoluteFill, { width: undefined, height: height * 0.95 }]} 
            contentFit="cover"
            blurRadius={80}
          />
          {/* Deeper gradient wash for a seamless hero→carousel blend */}
          <LinearGradient 
            colors={['rgba(10,10,10,0.05)', 'rgba(10,10,10,0.6)', 'rgba(10,10,10,0.95)', COLORS.background]} 
            locations={[0, 0.4, 0.7, 1.0]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}

      {/* Absolute Translucent Header */}
      <View style={[styles.absoluteHeaderContainer, { paddingTop: insets.top }]}>
        {/* Subtle top shade for icon legibility */}
        <LinearGradient 
          colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0)']} 
          style={StyleSheet.absoluteFill} 
          pointerEvents="none" 
        />
        
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
            <Pressable style={styles.avatarButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.navigate('/(tabs)/my-netflix'); }}>
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
        {loading || isTransitioning ? (
          // Don't show skeleton if we are currently transitioning from the profile screen (the avatar is floating in)
          // to keep the visual entrance clean and unified.
          !isTransitioning && <HomeSkeleton />
        ) : (
          <Animated.View entering={FadeIn.duration(400)} style={{ flex: 1 }}>
          <AnimatedFlatList
              data={rowsConfig}
              keyExtractor={(item: any) => item.id}
              renderItem={renderItem}
              ListHeaderComponent={renderHeader}
              ListFooterComponent={<View style={{ height: 120 }} />}
              onScroll={scrollHandler}
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingTop: insets.top + 110 }}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={false} 
              initialNumToRender={4}
              maxToRenderPerBatch={4}
              windowSize={9}
              decelerationRate="normal"
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

      {/* Quick Preview Modal (Long Press) */}
      <QuickPreviewModal
        visible={showPreview}
        item={previewItem}
        onClose={() => {
          setShowPreview(false);
          setPreviewItem(null);
        }}
      />
    </Animated.View>
  );
}

// Skeleton Components intact
function Shimmer({ width, height, borderRadius = 4, style }: { width: any, height: any, borderRadius?: number, style?: any }) {
  const translateX = useSharedValue(-width);
  useEffect(() => { translateX.value = withRepeat(withTiming(width, { duration: 1500, easing: Easing.bezier(0.4, 0, 0.6, 1) }), -1, false); }, [width, translateX]);
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
  const { width } = useWindowDimensions();
  const HERO_W = width * 0.9;
  const HERO_H_SKELETON = HERO_W * 1.35;
  const POSTER_W = width * 0.28;
  const POSTER_H = POSTER_W * 1.5;
  const LANDSCAPE_W = width * 0.35;
  const LANDSCAPE_H = LANDSCAPE_W * 1.4;
  
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.skeletonHeroContainer}><Shimmer width={HERO_W} height={HERO_H_SKELETON} borderRadius={12} /></View>
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
  heroHeader: { zIndex: 1, marginBottom: SPACING.lg },
  heroRowSpacer: { height: 12 },
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
  headerAvatar: { width: 30, height: 30, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  tabsRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: SPACING.md, marginTop: 4 },
  pillButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 16, 
    paddingVertical: 8, 
    borderRadius: 20, 
    backgroundColor: 'rgba(100,100,100,0.4)', 
    borderWidth: 1, 
    borderColor: 'transparent' 
  },
  pillButtonActive: { backgroundColor: 'white' },
  pillText: { color: 'white', fontSize: 13, fontWeight: '700' },
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
