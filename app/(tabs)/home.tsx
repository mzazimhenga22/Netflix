import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, Text, Pressable, useWindowDimensions, Modal, FlatList, ScrollView, NativeModules, Image, Alert, Platform } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { BlurView } from 'expo-blur';
import { NativeHeroCard } from '../../components/NativeHeroCard';
import { MyListService } from '../../services/MyListService';
import { HorizontalCarousel } from '../../components/HorizontalCarousel';
import { LandscapeContinueWatchingRow } from '../../components/LandscapeContinueWatchingRow';
import { LazyCarouselRow } from '../../components/LazyCarouselRow';
import { ClipsRow } from '../../components/ClipsRow';
import { QuickPreviewModal, QuickPreviewItem } from '../../components/QuickPreviewModal';
import { COLORS, SPACING } from '../../constants/theme';
import { fetchTrending, fetchPopular, fetchTopRated, fetchDiscoverByGenre, getBackdropUrl, getImageUrl, fetchTitleLogo, fetchNewAndHot } from '../../services/tmdb';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme, useTransition } from '../_layout';
import { useProfile } from '../../context/ProfileContext';
import { WatchHistoryService } from '../../services/WatchHistoryService';
import { FriendsService } from '../../services/friends';
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
/* ── Liquid Glass Pill Button Component for Categories/Tabs ── */
const GlassPillButton = React.memo(({ isFocused, onPress, children }: { isFocused: boolean; onPress: () => void; children: React.ReactNode }) => {
  return (
    <View style={homeStyles.glassPillContainer}>
      {/* Dynamic ambient color aura bleed behind the active pill */}
      {isFocused && (
        <View style={homeStyles.activePillAuraShadow} pointerEvents="none" />
      )}
      <Pressable onPress={onPress} style={homeStyles.glassPillBody}>
        {/* Real-time blur */}
        <BlurView
          intensity={Platform.OS === 'ios' ? 65 : 75}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <View style={homeStyles.glassPillTintFill} />
        {/* Convex dome – horizontal edge vignette */}
        <LinearGradient
          colors={[
            'rgba(0,0,0,0.18)',
            'rgba(0,0,0,0.06)',
            'transparent',
            'transparent',
            'rgba(0,0,0,0.06)',
            'rgba(0,0,0,0.18)',
          ]}
          locations={[0, 0.08, 0.22, 0.78, 0.92, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Convex dome – vertical center-bright band */}
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.20)', // brighter top sheen
            'rgba(255,255,255,0.06)',
            'transparent',
            'transparent',
            'rgba(255,255,255,0.05)',
            'rgba(255,255,255,0.12)',
          ]}
          locations={[0, 0.15, 0.40, 0.80, 0.90, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Specular Highlight */}
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.30)', // Top rim glint
            'rgba(255,255,255,0.05)', 
            'rgba(255,255,255,0.40)', // Cylindrical bright glint band
            'rgba(255,255,255,0.08)',
            'transparent',            // Face shadow
            'rgba(255,255,255,0.15)', // Bottom bounce light
          ]}
          locations={[0, 0.08, 0.18, 0.32, 0.85, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Inner shadow */}
        <LinearGradient
          colors={[
            'rgba(0,0,0,0.28)', // Top shadow roll
            'transparent',
            'transparent',
            'rgba(0,0,0,0.48)', // Bottom shadow roll curving away
          ]}
          locations={[0, 0.12, 0.78, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Refraction edge line */}
        <View style={homeStyles.glassPillRefraction} pointerEvents="none" />
        {/* Outer glass border */}
        <View style={homeStyles.glassPillBorder} pointerEvents="none" />
        {/* Active background glow */}
        {isFocused && (
          <View style={StyleSheet.absoluteFill}>
            <View style={homeStyles.activePillGlow} />
            <LinearGradient
              colors={[
                'rgba(229, 9, 20, 0.25)', // Soft Netflix Red glow inside
                'transparent',
                'rgba(229, 9, 20, 0.12)',
              ]}
              locations={[0, 0.5, 1]}
              style={StyleSheet.absoluteFill}
            />
          </View>
        )}
        <View style={homeStyles.glassPillContent}>
          {children}
        </View>
      </Pressable>
    </View>
  );
});
/* ── Liquid Glass Circular Icon Button ── */
const GlassCircularButton = React.memo(({ onPress, children }: { onPress: () => void; children: React.ReactNode }) => {
  return (
    <View style={homeStyles.glassCircleContainer}>
      <Pressable onPress={onPress} style={homeStyles.glassCircleBody}>
        {/* Real-time blur */}
        <BlurView
          intensity={Platform.OS === 'ios' ? 65 : 75}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <View style={homeStyles.glassPillTintFill} />
        {/* Convex dome – horizontal edge vignette */}
        <LinearGradient
          colors={[
            'rgba(0,0,0,0.20)',
            'rgba(0,0,0,0.07)',
            'transparent',
            'transparent',
            'rgba(0,0,0,0.07)',
            'rgba(0,0,0,0.20)',
          ]}
          locations={[0, 0.1, 0.25, 0.75, 0.9, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Convex dome – vertical center-bright */}
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.20)', // brighter top sheen
            'rgba(255,255,255,0.06)',
            'transparent',
            'transparent',
            'rgba(255,255,255,0.05)',
            'rgba(255,255,255,0.12)',
          ]}
          locations={[0, 0.15, 0.40, 0.80, 0.90, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Specular Highlight */}
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.30)', // Top rim glint
            'rgba(255,255,255,0.05)', 
            'rgba(255,255,255,0.40)', // Cylindrical bright glint band
            'rgba(255,255,255,0.08)',
            'transparent',            // Face shadow
            'rgba(255,255,255,0.15)', // Bottom bounce light
          ]}
          locations={[0, 0.08, 0.18, 0.32, 0.85, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Inner shadow */}
        <LinearGradient
          colors={[
            'rgba(0,0,0,0.28)', // Top shadow roll
            'transparent',
            'transparent',
            'rgba(0,0,0,0.48)', // Bottom shadow roll curving away
          ]}
          locations={[0, 0.12, 0.78, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Refraction edge line */}
        <View style={homeStyles.glassCircleRefraction} pointerEvents="none" />
        {/* Outer glass border */}
        <View style={homeStyles.glassCircleBorder} pointerEvents="none" />
        <View style={homeStyles.glassCircleContent}>
          {children}
        </View>
      </Pressable>
    </View>
  );
});
const MOODS = [
  {
    id: 'adrenaline',
    name: 'Adrenaline Rush',
    icon: 'zap',
    description: 'Heart-pounding action & thriller',
    tagline: 'FEEL THE RUSH',
    colors: ['#e50914', '#540307'],
  },
  {
    id: 'cozy',
    name: 'Cozy & Chill',
    icon: 'coffee',
    description: 'Feel-good comedies & family',
    tagline: 'UNWIND & LAUGH',
    colors: ['#d97706', '#4a2503'],
  },
  {
    id: 'mindbending',
    name: 'Mind-Bending',
    icon: 'brain',
    description: 'Sci-fi, mystery & thrillers',
    tagline: 'EXPLORE THE UNKNOWN',
    colors: ['#6d28d9', '#1e1b4b'],
  },
  {
    id: 'tearjerker',
    name: 'Tear-Jerker',
    icon: 'heart-broken',
    description: 'Deep, emotional dramas & romance',
    tagline: 'EMOTIONAL JOURNEY',
    colors: ['#0f766e', '#0f172a'],
  },
];

const TIME_BUDGETS = [
  {
    id: 'quick',
    name: 'Quick Bite',
    duration: '< 22m',
    description: 'Short clips, animations & sitcoms',
    tagline: 'SNACKABLE WATCH',
    icon: 'hourglass-outline',
    minRuntime: undefined,
    maxRuntime: 22,
  },
  {
    id: 'standard',
    name: 'Standard Show',
    duration: '22m - 50m',
    description: 'Standard TV dramas & documentaries',
    tagline: 'PERFECT EPISODE',
    icon: 'time-outline',
    minRuntime: 22,
    maxRuntime: 50,
  },
  {
    id: 'feature',
    name: 'Feature Movie',
    duration: '50m - 120m',
    description: 'Standard feature-length films',
    tagline: 'CINEMATIC NIGHT',
    icon: 'film-outline',
    minRuntime: 50,
    maxRuntime: 120,
  },
  {
    id: 'epic',
    name: 'Epic Story',
    duration: '120m+',
    description: 'Extended blockbusters & movie epics',
    tagline: 'IMMERSIVE JOURNEY',
    icon: 'planet-outline',
    minRuntime: 120,
    maxRuntime: undefined,
  },
];

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const { selectedProfile } = useProfile();
  const { isTransitioning } = useTransition();
  const { setThemeColor } = useTheme();
  const [activeFilter, setActiveFilter] = useState<'home' | 'tv' | 'movies'>('home');
  const [showCategories, setShowCategories] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Moods state
  const [selectedMood, setSelectedMood] = useState<'adrenaline' | 'cozy' | 'mindbending' | 'tearjerker' | null>(null);
  const [showMoodDeck, setShowMoodDeck] = useState(false);

  // Time Budget state
  const [selectedTimeBudget, setSelectedTimeBudget] = useState<'quick' | 'standard' | 'feature' | 'epic' | null>(null);
  const [showTimeBudgetModal, setShowTimeBudgetModal] = useState(false);

  const insets = useSafeAreaInsets();
  // Root level data for Hero and initial rows (the first 1-2 rendered immediately for perceived performance)
  const [trending, setTrending] = useState<any[]>([]);
  const [continueWatching, setContinueWatching] = useState<any[]>([]);
  const [clips, setClips] = useState<any[]>([]);
  const [comingSoon, setComingSoon] = useState<any[]>([]);
  const [everyoneWatching, setEveryoneWatching] = useState<any[]>([]);
  const [friendsWatched, setFriendsWatched] = useState<any[]>([]);
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
  const flatListRef = useRef<any>(null);

  // continuous timer for lava lamp aura
  const auraTime = useSharedValue(0);
  useEffect(() => {
    auraTime.value = withRepeat(
      withTiming(1, { duration: 15000, easing: Easing.linear }),
      -1,
      true
    );
  }, [auraTime]);

  // Shared values for drifting blobs
  const blob1X = useSharedValue(0);
  const blob1Y = useSharedValue(0);
  const blob2X = useSharedValue(0);
  const blob2Y = useSharedValue(0);
  const blob3X = useSharedValue(0);
  const blob3Y = useSharedValue(0);

  useEffect(() => {
    blob1X.value = withRepeat(withTiming(1, { duration: 18000, easing: Easing.inOut(Easing.ease) }), -1, true);
    blob1Y.value = withRepeat(withTiming(1, { duration: 22000, easing: Easing.inOut(Easing.ease) }), -1, true);
    blob2X.value = withRepeat(withTiming(1, { duration: 25000, easing: Easing.inOut(Easing.ease) }), -1, true);
    blob2Y.value = withRepeat(withTiming(1, { duration: 19000, easing: Easing.inOut(Easing.ease) }), -1, true);
    blob3X.value = withRepeat(withTiming(1, { duration: 21000, easing: Easing.inOut(Easing.ease) }), -1, true);
    blob3Y.value = withRepeat(withTiming(1, { duration: 26000, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);

  // scroll to top when mood, category, or time budget changes
  useEffect(() => {
    if (flatListRef.current) {
      flatListRef.current.scrollToOffset({ offset: 0, animated: true });
    }
  }, [selectedMood, selectedCategory, selectedTimeBudget]);

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

  const getThemeColor = useCallback(() => {
    if (selectedMood === 'adrenaline') return '#2b0507';
    if (selectedMood === 'cozy') return '#2b1b05';
    if (selectedMood === 'mindbending') return '#1b052b';
    if (selectedMood === 'tearjerker') return '#052b21';
    
    return isKids ? '#004b87' : (activeFilter === 'tv' ? '#0a142b' : (activeFilter === 'movies' ? '#0a2b14' : '#2b0a14'));
  }, [selectedMood, activeFilter, isKids]);
  
  const themeColor = getThemeColor();
  
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

  const blob1Style = useAnimatedStyle(() => {
    const tx = interpolate(blob1X.value, [0, 1], [-width * 0.2, width * 0.3]);
    const ty = interpolate(blob1Y.value, [0, 1], [-height * 0.1, height * 0.2]);
    const scale = interpolate(blob1X.value, [0, 1], [0.9, 1.25]);
    
    let c1 = '#4a0e17', c2 = '#2e050a';
    if (selectedMood === 'adrenaline') { c1 = '#e50914'; c2 = '#540307'; }
    else if (selectedMood === 'cozy') { c1 = '#d97706'; c2 = '#4a2503'; }
    else if (selectedMood === 'mindbending') { c1 = '#7c3aed'; c2 = '#1e1b4b'; }
    else if (selectedMood === 'tearjerker') { c1 = '#0f766e'; c2 = '#0f172a'; }
    else {
      if (activeFilter === 'tv') { c1 = '#0f172a'; c2 = '#090d16'; }
      else if (activeFilter === 'movies') { c1 = '#0f2a1a'; c2 = '#09160e'; }
    }
    
    const color = interpolateColor(auraTime.value, [0, 1], [c1, c2]);
    
    return {
      transform: [{ translateX: tx }, { translateY: ty }, { scale }],
      backgroundColor: color,
    };
  });

  const blob2Style = useAnimatedStyle(() => {
    const tx = interpolate(blob2X.value, [0, 1], [-width * 0.35, width * 0.2]);
    const ty = interpolate(blob2Y.value, [0, 1], [height * 0.05, height * 0.35]);
    const scale = interpolate(blob2Y.value, [0, 1], [0.95, 1.2]);
    
    let c1 = '#260e4a', c2 = '#12032e';
    if (selectedMood === 'adrenaline') { c1 = '#d97706'; c2 = '#800000'; }
    else if (selectedMood === 'cozy') { c1 = '#eab308'; c2 = '#8a5e00'; }
    else if (selectedMood === 'mindbending') { c1 = '#0284c7'; c2 = '#003366'; }
    else if (selectedMood === 'tearjerker') { c1 = '#16a34a'; c2 = '#004d1a'; }
    else {
      if (activeFilter === 'tv') { c1 = '#132247'; c2 = '#000c24'; }
      else if (activeFilter === 'movies') { c1 = '#134722'; c2 = '#002409'; }
    }
    
    const color = interpolateColor(auraTime.value, [0, 1], [c1, c2]);
    
    return {
      transform: [{ translateX: tx }, { translateY: ty }, { scale }],
      backgroundColor: color,
    };
  });

  const blob3Style = useAnimatedStyle(() => {
    const tx = interpolate(blob3X.value, [0, 1], [-width * 0.1, width * 0.25]);
    const ty = interpolate(blob3Y.value, [0, 1], [height * 0.3, height * 0.65]);
    const scale = interpolate(blob3X.value, [0, 1], [0.85, 1.15]);
    
    let c1 = '#0e4a3b', c2 = '#032e23';
    if (selectedMood === 'adrenaline') { c1 = '#c2420a'; c2 = '#3a0c02'; }
    else if (selectedMood === 'cozy') { c1 = '#be185d'; c2 = '#500724'; }
    else if (selectedMood === 'mindbending') { c1 = '#c026d3'; c2 = '#4a044e'; }
    else if (selectedMood === 'tearjerker') { c1 = '#2563eb'; c2 = '#1e3a8a'; }
    else {
      if (activeFilter === 'tv') { c1 = '#1d4ed8'; c2 = '#1e1b4b'; }
      else if (activeFilter === 'movies') { c1 = '#15803d'; c2 = '#14532d'; }
    }
    
    const color = interpolateColor(auraTime.value, [0, 1], [c1, c2]);
    
    return {
      transform: [{ translateX: tx }, { translateY: ty }, { scale }],
      backgroundColor: color,
    };
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
  const headerBlurStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 80], [0, 1], 'clamp');
    return { opacity };
  });
  // Load only the initial viewport data to prevent blocking
  const loadInitialData = useCallback(async (filter: string) => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    try {
      const type = filter === 'home' ? 'all' : (filter === 'tv' ? 'tv' : 'movie');
      const safeType = type === 'all' ? 'movie' : type;

      let minR: number | undefined;
      let maxR: number | undefined;
      if (selectedTimeBudget) {
        const budget = TIME_BUDGETS.find(b => b.id === selectedTimeBudget);
        if (budget) {
          minR = budget.minRuntime;
          maxR = budget.maxRuntime;
        }
      }
      
      let trendingData;
      let comingSoonData: any[] = [];
      let everyoneWatchingData: any[] = [];
      let friendsData: any[] = [];

      if (selectedCategory && GENRE_MAP[selectedCategory]) {
        if (filter === 'home') {
          const [movieResults, tvResults, friendsRes] = await Promise.all([
            fetchDiscoverByGenre('movie', GENRE_MAP[selectedCategory], isKids, minR, maxR),
            fetchDiscoverByGenre('tv', GENRE_MAP[selectedCategory], isKids, minR, maxR),
            FriendsService.getFriendsWatchedRecommendations()
          ]);
          const mixed: any[] = [];
          const maxLen = Math.max(movieResults.length, tvResults.length);
          for (let i = 0; i < maxLen; i++) {
            if (movieResults[i]) mixed.push({ ...movieResults[i], media_type: 'movie' });
            if (tvResults[i]) mixed.push({ ...tvResults[i], media_type: 'tv' });
          }
          trendingData = mixed;
          friendsData = friendsRes;
        } else {
          const [trendingRes, friendsRes] = await Promise.all([
            fetchDiscoverByGenre(safeType as any, GENRE_MAP[selectedCategory], isKids, minR, maxR),
            FriendsService.getFriendsWatchedRecommendations()
          ]);
          trendingData = trendingRes;
          friendsData = friendsRes;
        }
      } else {
        if (filter === 'home') {
          const [trendingRes, comingRes, everyoneRes, friendsRes] = await Promise.all([
            selectedTimeBudget 
              ? fetchPopular(safeType as any, isKids, minR, maxR)
              : (isKids ? fetchDiscoverByGenre(safeType as any, 10751, isKids) : fetchTrending(type as any, isKids)),
            fetchNewAndHot(isKids),
            selectedTimeBudget
              ? fetchPopular('movie', isKids, minR, maxR)
              : fetchTrending('all', isKids),
            FriendsService.getFriendsWatchedRecommendations()
          ]);
          trendingData = trendingRes;
          comingSoonData = comingRes;
          everyoneWatchingData = everyoneRes;
          friendsData = friendsRes;
        } else {
          const [trendingRes, friendsRes] = await Promise.all([
            selectedTimeBudget
              ? fetchPopular(safeType as any, isKids, minR, maxR)
              : (isKids ? fetchDiscoverByGenre(safeType as any, 10751, isKids) : fetchTrending(type as any, isKids)),
            FriendsService.getFriendsWatchedRecommendations()
          ]);
          trendingData = trendingRes;
          friendsData = friendsRes;
        }
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
      const comingSoonFormatted = formatData(comingSoonData);
      const everyoneWatchingFormatted = formatData(everyoneWatchingData);
      
      const friendsFormatted = friendsData.map((item: any) => ({
        id: item.id.toString(),
        title: item.title || item.name,
        imageUrl: getImageUrl(item.poster_path),
        backdropUrl: getBackdropUrl(item.backdrop_path),
        synopsis: item.overview,
        categories: ['Watched by Friends'],
        type: item.media_type || (item.title ? 'movie' : 'tv'),
        friendsWatching: item.friendsWatching
      }));

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
      setComingSoon(comingSoonFormatted);
      setEveryoneWatching(everyoneWatchingFormatted);
      setFriendsWatched(friendsFormatted);
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
  }, [selectedCategory, isKids, selectedTimeBudget]);
  useEffect(() => {
    loadInitialData(activeFilter);
  }, [activeFilter, selectedCategory, isKids, selectedTimeBudget, loadInitialData]);
  // Real-time Watch History Subscription
  useEffect(() => {
    if (!selectedProfile) {
      setContinueWatching([]);
      return;
    }
    const unsubscribe = WatchHistoryService.subscribeToHistory(selectedProfile.id, (historyItems) => {
      if (!historyItems || !Array.isArray(historyItems)) {
        setContinueWatching([]);
        return;
      }
      
      // Deduplicate by item.id, keeping only the one with the latest lastUpdated timestamp
      const latestEpisodesMap: { [key: string]: any } = {};
      historyItems.forEach(item => {
        if (!item || !item.id) return;
        const baseId = item.id.toString();
        const existing = latestEpisodesMap[baseId];
        if (!existing || (item.lastUpdated || 0) > (existing.lastUpdated || 0)) {
          latestEpisodesMap[baseId] = item;
        }
      });
      
      const uniqueItems = Object.values(latestEpisodesMap);
      
      const formatted = uniqueItems
        .map((historyObj: any) => {
          const itemData = historyObj.item || {};
          return {
            ...historyObj,
            title: itemData.title || itemData.name || 'Unknown',
            imageUrl: itemData.poster_path
              ? getImageUrl(itemData.poster_path)
              : (itemData.backdrop_path ? getBackdropUrl(itemData.backdrop_path) : ''),
          };
        })
        .sort((a: any, b: any) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
        
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
    
    // If a mood is active, curate specific rows for that mood
    if (selectedMood) {
      if (continueWatching.length > 0) {
        rows.push({ id: 'cw', type: 'cw', data: continueWatching });
      }
      
      const moodRows: any[] = [];
      const baseType = activeFilter === 'tv' ? 'tv' : 'movie';
      
      if (selectedMood === 'adrenaline') {
        moodRows.push(
          { id: 'mood_popular', title: 'Trending Action & Thrills', typeInput: baseType, genreId: 'popular' },
          { id: 'mood_act', title: 'Heart-Pounding Action', typeInput: baseType, genreId: 28 },
          { id: 'mood_thr', title: 'Edge-of-Your-Seat Thrillers', typeInput: baseType, genreId: 53 },
          { id: 'mood_sci', title: 'Epic Sci-Fi Adventures', typeInput: baseType, genreId: 878 }
        );
      } else if (selectedMood === 'cozy') {
        moodRows.push(
          { id: 'mood_popular', title: 'Warm & Cozy Favourites', typeInput: baseType, genreId: 'popular' },
          { id: 'mood_com', title: 'Feel-Good Comedies', typeInput: baseType, genreId: 35 },
          { id: 'mood_fam', title: 'Family Night Favorites', typeInput: baseType, genreId: 10751 },
          { id: 'mood_ani', title: 'Imaginative Animations', typeInput: baseType, genreId: 16 }
        );
      } else if (selectedMood === 'mindbending') {
        moodRows.push(
          { id: 'mood_top', title: 'Mind-Bending Masterpieces', typeInput: baseType, genreId: 'top_rated' },
          { id: 'mood_mys', title: 'Enigmatic Mysteries', typeInput: baseType, genreId: 9648 },
          { id: 'mood_sci', title: 'Mind-Bending Sci-Fi', typeInput: baseType, genreId: 878 },
          { id: 'mood_thr', title: 'Psychological Thrillers', typeInput: baseType, genreId: 53 }
        );
      } else if (selectedMood === 'tearjerker') {
        moodRows.push(
          { id: 'mood_top', title: 'Highly Emotional Acclaim', typeInput: baseType, genreId: 'top_rated' },
          { id: 'mood_dra', title: 'Deeply Moving Dramas', typeInput: baseType, genreId: 18 },
          { id: 'mood_rom', title: 'Charming Romances', typeInput: baseType, genreId: 10749 }
        );
      }
      
      rows.push(...moodRows.map(r => ({ ...r, type: 'lazy_carousel' })));
      return rows;
    }
    
    if (activeFilter === 'home' && !selectedCategory) {
      if (continueWatching.length > 0) {
        rows.push({ id: 'cw', type: 'cw', data: continueWatching });
      }
      if (!isKids) {
        if (clips.length > 0) rows.push({ id: 'clips', type: 'clips', data: clips });
      }
      if (comingSoon.length > 0) {
        rows.push({ id: 'coming_soon', type: 'static_carousel', title: 'Coming Soon', data: comingSoon });
      }
      if (everyoneWatching.length > 0) {
        rows.push({ id: 'everyone_watching', type: 'static_carousel', title: "Everyone's Watching", data: everyoneWatching });
      }
      if (friendsWatched.length > 0) {
        rows.push({ id: 'friends_watched', type: 'static_carousel', title: "Watched by Friends", data: friendsWatched });
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
      { id: 'g_thr2', title: 'Chilling Horrors', typeInput: genericType, genreId: 27 }, // Changed duplicate key to thr2/hor
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
  }, [activeFilter, continueWatching, clips, comingSoon, everyoneWatching, trending, friendsWatched, selectedCategory, isKids, categorySubRows, selectedMood]);
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
          let minR: number | undefined;
          let maxR: number | undefined;
          if (selectedTimeBudget) {
            const budget = TIME_BUDGETS.find(b => b.id === selectedTimeBudget);
            if (budget) {
              minR = budget.minRuntime;
              maxR = budget.maxRuntime;
            }
          }
          if (item.genreId === 'popular') return fetchPopular(item.typeInput, isKids, minR, maxR);
          if (item.genreId === 'top_rated') return fetchTopRated(item.typeInput, isKids, minR, maxR);
          return fetchDiscoverByGenre(item.typeInput, item.genreId as number, isKids, minR, maxR);
        };
        return (
          <LazyCarouselRow
            title={item.title}
            fetchKey={`${item.id}:${item.typeInput}:${String(item.genreId)}:${selectedCategory || 'all'}:${selectedTimeBudget || 'any'}`}
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
      </View>
    ) : null
  );
  return (
    <Animated.View style={[styles.container, animatedBackgroundStyle]}>
      
      {/* Ambient Glass Aura Effect */}
      {heroItems.length > 0 && (
        <Animated.View style={[StyleSheet.absoluteFill, auraOpacityStyle, { zIndex: -1 }]}>
          {/* Organically animating GPU floating blobs backdrop */}
          <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', backgroundColor: 'transparent' }]}>
            <Animated.View style={[
              styles.floatingBlob,
              { width: width * 0.8, height: width * 0.8, borderRadius: width * 0.4 },
              blob1Style
            ]} />
            <Animated.View style={[
              styles.floatingBlob,
              { width: width * 0.75, height: width * 0.75, borderRadius: width * 0.375, position: 'absolute', right: -width * 0.2 },
              blob2Style
            ]} />
            <Animated.View style={[
              styles.floatingBlob,
              { width: width * 0.85, height: width * 0.85, borderRadius: width * 0.425, position: 'absolute', bottom: -height * 0.1 },
              blob3Style
            ]} />
          </View>
          
          <ExpoImage 
            source={{ uri: heroItems[0].imageUrl }} 
            style={[StyleSheet.absoluteFill, { width: undefined, height: height * 0.95, opacity: 0.34 }]} 
            contentFit="cover"
            blurRadius={80}
          />
          {/* Deeper gradient wash for a seamless hero→carousel blend */}
          <LinearGradient 
            colors={['rgba(10,10,10,0.02)', 'rgba(10,10,10,0.4)', 'rgba(10,10,10,0.85)', COLORS.background]} 
            locations={[0, 0.4, 0.7, 1.0]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}

      {/* Bottom Vignette for seamless tab bar transition */}
      <LinearGradient
        colors={['transparent', 'rgba(10,10,10,0.4)', 'rgba(0,0,0,0.92)', '#000000']}
        locations={[0, 0.3, 0.75, 1.0]}
        style={[StyleSheet.absoluteFill, { top: height - 110, height: 110, zIndex: 90 }]}
        pointerEvents="none"
      />
      {/* Absolute Transparent Header */}
      <View style={[styles.absoluteHeaderContainer, { paddingTop: insets.top }]}>
        
        {/* Subtle top shade for icon legibility */}
        <LinearGradient 
          colors={['rgba(0,0,0,0.75)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0)']} 
          style={StyleSheet.absoluteFill} 
          pointerEvents="none" 
        />
        
        <View style={styles.header}>
          <Pressable style={styles.headerLeft} onPress={() => { 
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveFilter('home');
            setSelectedCategory(null);
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ExpoImage 
                source={require('../../assets/images/netflix-n-logo.svg')} 
                style={styles.headerLogoImage} 
                contentFit="contain"
              />
              <Text style={{ color: 'white', fontSize: 22, fontWeight: '900', letterSpacing: -0.5 }}>Home</Text>
            </View>
          </Pressable>
          <View style={styles.headerIcons}>
            <GlassCircularButton onPress={handleCastPress}>
              <MaterialCommunityIcons name={isCasting ? "cast-connected" : "cast"} size={22} color={isCasting ? COLORS.primary : "white"} />
            </GlassCircularButton>
            <GlassCircularButton onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/downloads');
            }}>
              <Feather name="download" size={20} color="white" />
            </GlassCircularButton>
            <GlassCircularButton onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/notifications');
            }}>
              <Ionicons name="notifications-outline" size={22} color="white" />
            </GlassCircularButton>
          </View>
        </View>
        <Animated.View style={[styles.tabsRow, tabsStyle]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm, paddingHorizontal: SPACING.md }}>
            <GlassPillButton isFocused={activeFilter === 'home'} onPress={() => { Haptics.selectionAsync(); setActiveFilter('home'); setSelectedCategory(null); }}>
              <Text style={[styles.pillText, activeFilter === 'home' && styles.pillTextActive]}>All</Text>
            </GlassPillButton>
            <GlassPillButton isFocused={activeFilter === 'tv'} onPress={() => { Haptics.selectionAsync(); setActiveFilter('tv'); setSelectedCategory(null); }}>
              <Text style={[styles.pillText, activeFilter === 'tv' && styles.pillTextActive]}>Shows</Text>
            </GlassPillButton>
            <GlassPillButton isFocused={activeFilter === 'movies'} onPress={() => { Haptics.selectionAsync(); setActiveFilter('movies'); setSelectedCategory(null); }}>
              <Text style={[styles.pillText, activeFilter === 'movies' && styles.pillTextActive]}>Movies</Text>
            </GlassPillButton>
            <GlassPillButton isFocused={false} onPress={() => { Haptics.selectionAsync(); router.push('/games'); }}>
              <Text style={styles.pillText}>Games</Text>
            </GlassPillButton>
            <GlassPillButton isFocused={false} onPress={() => { Haptics.selectionAsync(); router.push('/new'); }}>
              <Text style={styles.pillText}>New & Hot</Text>
            </GlassPillButton>
            <GlassPillButton isFocused={false} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowCategories(true); }}>
              <Text style={styles.pillText}>{selectedCategory || 'Categories'}</Text>
              <Ionicons name="chevron-down" size={14} color="white" style={{ marginLeft: 4 }} />
            </GlassPillButton>
            <GlassPillButton isFocused={!!selectedMood} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowMoodDeck(true); }}>
              <Text style={[styles.pillText, selectedMood && styles.pillTextActiveMood]}>
                {selectedMood ? MOODS.find(m => m.id === selectedMood)?.name : 'Moods'}
              </Text>
              <Ionicons name="sparkles" size={14} color={selectedMood ? '#E50914' : 'white'} style={{ marginLeft: 4 }} />
            </GlassPillButton>
            <GlassPillButton isFocused={!!selectedTimeBudget} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowTimeBudgetModal(true); }}>
              <Text style={[styles.pillText, selectedTimeBudget && styles.pillTextActiveTimeBudget]}>
                {selectedTimeBudget ? TIME_BUDGETS.find(tb => tb.id === selectedTimeBudget)?.name : 'Time Budget'}
              </Text>
              <Ionicons name="hourglass" size={14} color={selectedTimeBudget ? '#E50914' : 'white'} style={{ marginLeft: 4 }} />
            </GlassPillButton>
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
              ref={flatListRef}
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
      {/* Mood Deck Curated Filter Modal */}
      <Modal visible={showMoodDeck} transparent animationType="fade" onRequestClose={() => setShowMoodDeck(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowMoodDeck(false)}>
          <Animated.View entering={FadeInDown.duration(350).easing(Easing.out(Easing.quad))} style={styles.moodModalContent}>
            <View style={styles.moodModalHeader}>
              <View>
                <Text style={styles.modalTitle}>Choose a Mood</Text>
                <Text style={styles.moodModalSubtitle}>Curate your experience instantly</Text>
              </View>
              <Pressable onPress={() => setShowMoodDeck(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={28} color="white" />
              </Pressable>
            </View>

            <View style={styles.moodGrid}>
              {MOODS.map((mood) => {
                const isSelected = selectedMood === mood.id;
                let iconComponent;
                if (mood.id === 'adrenaline') {
                  iconComponent = <Ionicons name="flash" size={24} color={isSelected ? 'white' : '#e50914'} />;
                } else if (mood.id === 'cozy') {
                  iconComponent = <Ionicons name="cafe" size={24} color={isSelected ? 'white' : '#d97706'} />;
                } else if (mood.id === 'mindbending') {
                  iconComponent = <MaterialCommunityIcons name="brain" size={24} color={isSelected ? 'white' : '#6d28d9'} />;
                } else {
                  iconComponent = <MaterialCommunityIcons name="heart-broken" size={24} color={isSelected ? 'white' : '#0f766e'} />;
                }

                return (
                  <Pressable
                    key={mood.id}
                    style={[
                      styles.moodCard,
                      isSelected && { backgroundColor: mood.colors[0], borderColor: 'rgba(255,255,255,0.45)' }
                    ]}
                    onPress={() => {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      setSelectedMood(isSelected ? null : mood.id as any);
                      setShowMoodDeck(false);
                    }}
                  >
                    {/* Glass reflection overlay */}
                    <View style={styles.moodCardSheen} />
                    <View style={styles.moodCardHeader}>
                      <View style={[styles.moodIconContainer, isSelected && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                        {iconComponent}
                      </View>
                      {isSelected && (
                        <View style={styles.moodActiveIndicator}>
                          <Ionicons name="checkmark-circle" size={18} color="white" />
                        </View>
                      )}
                    </View>
                    <Text style={styles.moodCardTagline}>{mood.tagline}</Text>
                    <Text style={styles.moodCardName}>{mood.name}</Text>
                    <Text style={styles.moodCardDesc}>{mood.description}</Text>
                  </Pressable>
                );
              })}
            </View>

            {selectedMood && (
              <Pressable
                style={styles.clearMoodBtn}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedMood(null);
                  setShowMoodDeck(false);
                }}
              >
                <Ionicons name="refresh" size={16} color="white" style={{ marginRight: 6 }} />
                <Text style={styles.clearMoodText}>Reset Mood Filter</Text>
              </Pressable>
            )}
          </Animated.View>
        </Pressable>
      </Modal>
      {/* Time Budget Curated Filter Modal */}
      <Modal visible={showTimeBudgetModal} transparent animationType="fade" onRequestClose={() => setShowTimeBudgetModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowTimeBudgetModal(false)}>
          <Animated.View entering={FadeInDown.duration(350).easing(Easing.out(Easing.quad))} style={styles.moodModalContent}>
            <View style={styles.moodModalHeader}>
              <View>
                <Text style={styles.modalTitle}>Time Budget</Text>
                <Text style={styles.moodModalSubtitle}>How much time do you have today?</Text>
              </View>
              <Pressable onPress={() => setShowTimeBudgetModal(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={28} color="white" />
              </Pressable>
            </View>

            <View style={styles.moodGrid}>
              {TIME_BUDGETS.map((budget) => {
                const isSelected = selectedTimeBudget === budget.id;
                let iconComponent;
                if (budget.id === 'quick') {
                  iconComponent = <Ionicons name="hourglass-outline" size={24} color={isSelected ? 'white' : '#e50914'} />;
                } else if (budget.id === 'standard') {
                  iconComponent = <Ionicons name="time-outline" size={24} color={isSelected ? 'white' : '#d97706'} />;
                } else if (budget.id === 'feature') {
                  iconComponent = <Ionicons name="film-outline" size={24} color={isSelected ? 'white' : '#6d28d9'} />;
                } else {
                  iconComponent = <Ionicons name="planet-outline" size={24} color={isSelected ? 'white' : '#0f766e'} />;
                }

                return (
                  <Pressable
                    key={budget.id}
                    style={[
                      styles.moodCard,
                      isSelected && { backgroundColor: '#E50914', borderColor: 'rgba(255,255,255,0.45)' }
                    ]}
                    onPress={() => {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      setSelectedTimeBudget(isSelected ? null : budget.id as any);
                      setShowTimeBudgetModal(false);
                    }}
                  >
                    {/* Glass reflection overlay */}
                    <View style={styles.moodCardSheen} />
                    <View style={styles.moodCardHeader}>
                      <View style={[styles.moodIconContainer, isSelected && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                        {iconComponent}
                      </View>
                      {isSelected && (
                        <View style={styles.moodActiveIndicator}>
                          <Ionicons name="checkmark-circle" size={18} color="white" />
                        </View>
                      )}
                    </View>
                    <Text style={styles.moodCardTagline}>{budget.tagline}</Text>
                    <Text style={styles.moodCardName}>{budget.name}</Text>
                    <Text style={styles.moodCardDesc}>{budget.duration} · {budget.description}</Text>
                  </Pressable>
                );
              })}
            </View>

            {selectedTimeBudget && (
              <Pressable
                style={styles.clearMoodBtn}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedTimeBudget(null);
                  setShowTimeBudgetModal(false);
                }}
              >
                <Ionicons name="refresh" size={16} color="white" style={{ marginRight: 6 }} />
                <Text style={styles.clearMoodText}>Reset Time Budget Filter</Text>
              </Pressable>
            )}
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
    width: 26, 
    height: 36, 
    resizeMode: 'contain' 
  },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  iconButton: { padding: 4 },
  avatarButton: { marginLeft: 4 },
  headerAvatar: { 
    width: 32, 
    height: 32, 
    borderRadius: 6, 
    borderWidth: 1.5, 
    borderColor: '#E50914',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3
  },
  tabsRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: SPACING.md, marginTop: 4 },
  pillButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 14, 
    paddingVertical: 6, 
    borderRadius: 20, 
    backgroundColor: 'rgba(255, 255, 255, 0.08)', 
    borderWidth: 1, 
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 2
  },
  pillButtonActive: { 
    backgroundColor: 'white',
    borderColor: 'white'
  },
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
  stopCastText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  pillTextActiveMood: {
    color: '#E50914',
    fontWeight: 'bold',
  },
  pillTextActiveTimeBudget: {
    color: '#E50914',
    fontWeight: 'bold',
  },
  moodModalContent: {
    width: '100%',
    backgroundColor: 'rgba(20, 20, 20, 0.88)',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 30,
    paddingHorizontal: 24,
    paddingBottom: 40,
    position: 'absolute',
    bottom: 0,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 24,
  },
  moodModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  moodModalSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 2,
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  moodCard: {
    width: '48%',
    height: 125,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  moodCardSheen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.015)',
  },
  moodCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
  },
  moodIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  moodActiveIndicator: {
    alignSelf: 'flex-start',
  },
  moodCardTagline: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  moodCardName: {
    color: 'white',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  moodCardDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    lineHeight: 13,
  },
  clearMoodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.35)',
    paddingVertical: 14,
    borderRadius: 12,
  },
  clearMoodText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
  floatingBlob: {
    position: 'absolute',
    opacity: 0.42,
  }
});
const homeStyles = StyleSheet.create({
  /* ── Liquid Glass Pill Button Styles ── */
  glassPillContainer: {
    height: 34,
    borderRadius: 17,
    position: 'relative',
  },
  glassPillBody: {
    flex: 1,
    borderRadius: 17,
    overflow: 'hidden',
  },
  glassPillTintFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 15, 15, 0.42)', // Darker, smokey glass body matching details screen
  },
  glassPillRefraction: {
    position: 'absolute',
    top: 1.2,
    left: 2,
    right: 2,
    height: 8,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    borderTopWidth: 1.2,
    borderTopColor: 'rgba(255,255,255,0.4)',
  },
  glassPillBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)', // Matching LiquidGlassPill border opacity
    borderTopColor: 'rgba(255,255,255,0.40)', // Matching LiquidGlassPill top border
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  activePillGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(229, 9, 20, 0.15)', // Enhanced Netflix Red active backdrop wash
  },
  activePillAuraShadow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 17,
    backgroundColor: 'rgba(229, 9, 20, 0.01)',
    shadowColor: '#E50914', // Vibrant Netflix Red aura bleed
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.8,
    shadowRadius: 14,
    elevation: 8,
  },
  glassPillContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: '100%',
    justifyContent: 'center',
  },
  /* ── Liquid Glass Circular Icon Button Styles ── */
  glassCircleContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
  },
  glassCircleBody: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassCircleRefraction: {
    position: 'absolute',
    top: 1.2,
    left: 2,
    right: 2,
    height: 10,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1.2,
    borderTopColor: 'rgba(255,255,255,0.4)',
  },
  glassCircleBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.20)', // Matching LiquidGlassCircle border opacity
    borderTopColor: 'rgba(255,255,255,0.50)', // Matching LiquidGlassCircle top border
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  glassCircleContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
});
