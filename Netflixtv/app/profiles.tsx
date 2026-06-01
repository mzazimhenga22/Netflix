import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Pressable,
  Animated as RNAnimated,
  InteractionManager,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useProfile, Profile } from '../context/ProfileContext';
import { fetchTrending, getBackdropUrl } from '../services/tmdb';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Animated, { 
  FadeIn, 
  FadeOut, 
  SlideInDown, 
  SlideOutDown,
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  withTiming,
  Easing
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import LoadingSpinner from '../components/LoadingSpinner';

export { Profile };

const { width, height } = Dimensions.get('window');

// Cinematic UI constants
const LEFT_COLUMN_WIDTH = width * 0.35;
const FOCUSED_AVATAR_SIZE = 160;
const UNFOCUSED_AVATAR_SIZE = 64;
const AVATAR_RADIUS = 4;

type ProfileItem = Profile | { id: string; type: 'add' };

// ─── Profile Avatar Card ─────────────────────────────────────────────────────
function ProfileCard({
  item,
  isFocused,
  isManaging,
  isPlanLocked,
  onFocus,
  onPress,
}: {
  item: ProfileItem;
  isFocused: boolean;
  isManaging: boolean;
  isPlanLocked: boolean;
  onFocus: () => void;
  onPress: () => void;
}) {
  const isAdd = (item as any).type === 'add';
  const profile = item as Profile;

  const animatedScale = useSharedValue(1);
  const animatedOpacity = useSharedValue(0.7);

  useEffect(() => {
    animatedScale.value = withSpring(isFocused ? 1 : 0.8, { damping: 15 });
    animatedOpacity.value = withTiming(isFocused ? 1 : 0.7);
  }, [isFocused]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: animatedScale.value }],
    opacity: animatedOpacity.value,
  }));

  return (
    <Animated.View style={[styles.profileRowContainer, animatedStyle]}>
      <TouchableOpacity
        activeOpacity={1}
        onFocus={onFocus}
        onPress={onPress}
        style={styles.profileItemPressable}
      >
        {/* Left Indicator (Pencil icon if focused) */}
        <View style={styles.indicatorContainer}>
          {isFocused && (
            <MaterialIcons name="edit" size={24} color="white" style={styles.editIcon} />
          )}
        </View>

        {/* Avatar */}
        <View style={[
          styles.avatarWrapper,
          isFocused ? styles.avatarFocused : styles.avatarUnfocused,
        ]}>
          {isAdd ? (
            <View style={styles.addAvatar}>
              <Ionicons name="add" size={isFocused ? 64 : 32} color="#808080" />
            </View>
          ) : (
            <Image
              source={profile.avatar}
              style={styles.avatar}
              contentFit="cover"
            />
          )}
          
          {/* Lock badge */}
          {!isAdd && profile.isLocked && !isManaging && !isPlanLocked && (
            <View style={styles.lockBadge}>
              <Ionicons name="lock-closed" size={14} color="white" />
            </View>
          )}

          {isPlanLocked && !isAdd && (
            <View style={styles.planLockedOverlay}>
              <Ionicons name="lock-closed" size={18} color="white" />
              <Text style={styles.planLockedText}>Upgrade</Text>
            </View>
          )}

          {/* Edit overlay when managing */}
          {isManaging && !isAdd && (
            <View style={styles.editOverlay}>
              <MaterialIcons name="edit" size={24} color="white" />
            </View>
          )}
        </View>

        {/* Profile Name (Only visible when focused) */}
        <View style={styles.nameContainer}>
          {isFocused && (
            <Animated.Text 
              entering={FadeIn.duration(300)} 
              style={styles.profileName}
            >
              {isAdd ? 'Add Profile' : profile.name}
            </Animated.Text>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

const FEATURED_SHOWS = [
  {
    id: '117581',
    title: 'GINNY & GEORGIA',
    backdrop: 'https://image.tmdb.org/t/p/original/lPmUu3xkoksz3xsa1feIUoOBZrg.jpg',
    metadata: 'Soapy • Emotional • Teen',
    isKids: false
  },
  {
    id: '119051',
    title: 'WEDNESDAY',
    backdrop: 'https://image.tmdb.org/t/p/original/iH9v9LZqAV7h7feGr7987Y9PeC4.jpg',
    metadata: 'Wry • Fantasy • Mystery',
    isKids: false
  },
  {
    id: '66732',
    title: 'STRANGER THINGS',
    backdrop: 'https://image.tmdb.org/t/p/original/56v2KjHOKB6ka3vS6zB3S1rlp9n.jpg',
    metadata: 'Ominous • Sci-Fi • 1980s',
    isKids: false
  },
  {
    id: '560057',
    title: 'THE SEA BEAST',
    backdrop: 'https://image.tmdb.org/t/p/original/619586vKNoB6S9g9Z3XmDba5D70.jpg',
    metadata: 'Exciting • Family • Animation',
    isKids: true
  }
];

export default function ProfilesScreen() {
  const router = useRouter();
  const { 
    profiles, 
    selectProfile, 
    isLoading, 
    canAddProfile, 
    subscriptionStatus,
    maxProfilesAllowed 
  } = useProfile();
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [isManaging, setIsManaging] = useState(false);
  const [manageFocused, setManageFocused] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Background state
  const [showIdx, setShowIdx] = useState(0);
  const backgroundScale = useSharedValue(1);
  const backgroundTranslateX = useSharedValue(0);

  // Dynamic TMDB State
  const [dynamicShows, setDynamicShows] = useState<any[]>([]);
  const [dynamicKidsShows, setDynamicKidsShows] = useState<any[]>([]);

  // PIN state
  const [showPinModal, setShowPinModal] = useState(false);
  const [lockedProfile, setLockedProfile] = useState<Profile | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const profileItems: ProfileItem[] = useMemo(() => [
    ...profiles,
    ...(canAddProfile ? [{ id: 'add-profile', type: 'add' as const }] : []),
  ], [profiles, canAddProfile]);

  const isPlanRestricted = subscriptionStatus.status !== 'active';
  const isItemPlanLocked = (item: ProfileItem, idx: number) =>
    !((item as any).type === 'add') && isPlanRestricted && idx >= maxProfilesAllowed;

  // Update clock every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Ken Burns Effect Animation
  useEffect(() => {
    const startKenBurns = () => {
      backgroundScale.value = withTiming(1.15, { duration: 15000, easing: Easing.linear });
      backgroundTranslateX.value = withTiming(-30, { duration: 15000, easing: Easing.linear });
    };
    
    startKenBurns();
    const interval = setInterval(() => {
      backgroundScale.value = 1;
      backgroundTranslateX.value = 0;
      startKenBurns();
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  // Fetch Dynamic TMDB Content
  useEffect(() => {
    async function loadDynamicContent() {
      try {
        const [adultTrending, kidsTrending] = await Promise.all([
          fetchTrending('all', 'MA'),
          fetchTrending('all', 'PG'), // 'PG' automatically filters out Horror/Thriller in tmdb.ts
        ]);

        const mapToFeatured = (items: any[], isKids: boolean) => 
          items.filter(item => item.backdrop_path).slice(0, 10).map(item => ({
            id: item.id.toString(),
            title: item.title || item.name,
            backdrop: getBackdropUrl(item.backdrop_path),
            metadata: 'Trending Now',
            isKids
          }));

        if (adultTrending && adultTrending.length > 0) {
          setDynamicShows(mapToFeatured(adultTrending, false));
        }
        if (kidsTrending && kidsTrending.length > 0) {
          setDynamicKidsShows(mapToFeatured(kidsTrending, true));
        }
      } catch (e) {
        console.error('Failed to fetch dynamic profile backgrounds', e);
      }
    }
    loadDynamicContent();
  }, []);

  // Dynamic Content Logic
  const currentFeatured = useMemo(() => {
    const focusedProfile = profileItems[focusedIdx] as Profile;
    
    // Kids logic
    if (focusedProfile && focusedProfile.isKids) {
      if (dynamicKidsShows.length > 0) {
        return dynamicKidsShows[showIdx % dynamicKidsShows.length];
      }
      return FEATURED_SHOWS.find(s => s.isKids) || FEATURED_SHOWS[0];
    }
    
    // Adult logic (Rotate through non-kids shows)
    if (dynamicShows.length > 0) {
      return dynamicShows[showIdx % dynamicShows.length];
    }
    const nonKids = FEATURED_SHOWS.filter(s => !s.isKids);
    return nonKids[showIdx % nonKids.length];
  }, [focusedIdx, showIdx, profileItems, dynamicShows, dynamicKidsShows]);

  // Background Rotation
  useEffect(() => {
    const interval = setInterval(() => {
      setShowIdx(prev => prev + 1);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleSelect = (item: ProfileItem) => {
    if ((item as any).type === 'add') {
      if (isPlanRestricted) {
        router.push('/upgrade');
      } else {
        router.push('/edit-profile');
      }
      return;
    }
    const profile = item as Profile;
    const itemIdx = profileItems.findIndex((p) => p.id === item.id);
    if (itemIdx >= 0 && isItemPlanLocked(item, itemIdx)) {
      router.push('/upgrade');
      return;
    }
    if (isManaging) {
      router.push({
        pathname: '/edit-profile',
        params: { id: profile.id, name: profile.name, avatarId: profile.avatarId }
      });
      return;
    }
    if (profile.isLocked && profile.pin) {
      setLockedProfile(profile);
      setPinInput('');
      setPinError(false);
      setShowPinModal(true);
      return;
    }
    selectProfile(profile);
    InteractionManager.runAfterInteractions(() => {
      router.replace('/(tabs)');
    });
  };

  const handlePinPress = (digit: string) => {
    if (pinInput.length >= 4) return;
    setPinError(false);
    const next = pinInput + digit;
    setPinInput(next);
    if (next.length === 4) {
      if (next === lockedProfile?.pin) {
        setShowPinModal(false);
        selectProfile(lockedProfile!);
        InteractionManager.runAfterInteractions(() => {
          router.replace('/(tabs)');
        });
      } else {
        setPinError(true);
        setTimeout(() => setPinInput(''), 400);
      }
    }
  };

  const backgroundStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: backgroundScale.value },
      { translateX: backgroundTranslateX.value }
    ] as any
  }));

  if (isLoading) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <LoadingSpinner size={80} label="Loading profiles" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* ── Background Backdrop with Ken Burns Effect ── */}
      <Animated.View style={[StyleSheet.absoluteFill, backgroundStyle]}>
        <Image
          key={currentFeatured.backdrop}
          source={currentFeatured.backdrop}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={1500}
        />
      </Animated.View>
      
      {/* ── Cinematic Gradients ── */}
      <LinearGradient
        colors={['rgba(0,0,0,0.9)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.8)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        start={{ x: 0.5, y: 0.4 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* ── Top Header ── */}
      <View style={styles.topHeader}>
        <View style={styles.headerLeft}>
          <Text style={styles.netflixLogo}>NETFLIX</Text>
          <View style={styles.planRow}>
            <Text style={styles.title}>Choose a Profile</Text>
            {subscriptionStatus.status === 'loading' ? (
              <View style={styles.planBadge}>
                <Text style={styles.planBadgeText}>VERIFYING...</Text>
              </View>
            ) : subscriptionStatus.status === 'active' ? (
              <View style={styles.planBadge}>
                <Text style={styles.planBadgeText}>{(subscriptionStatus.planName || 'Standard').toUpperCase()}</Text>
              </View>
            ) : (
              <TouchableOpacity onPress={() => router.push('/upgrade')} style={styles.upgradeBadge}>
                <Text style={styles.upgradeBadgeText}>UPGRADE</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.clockText}>
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>

      {/* ── Profile Selection ── */}
      <View style={styles.leftColumn}>
        <View style={styles.profileList}>
          {profileItems.map((item, idx) => (
            <ProfileCard
              key={item.id}
              item={item}
              isFocused={idx === focusedIdx && !manageFocused}
              isManaging={isManaging}
              isPlanLocked={isItemPlanLocked(item, idx)}
              onFocus={() => { setFocusedIdx(idx); setManageFocused(false); }}
              onPress={() => handleSelect(item)}
            />
          ))}
        </View>

        <Pressable
          onFocus={() => setManageFocused(true)}
          onBlur={() => setManageFocused(false)}
          onPress={() => setIsManaging(v => !v)}
          style={({ focused }) => [
            styles.manageButton,
            (focused || manageFocused) && styles.manageButtonFocused,
          ]}
        >
          <Text style={[
            styles.manageButtonText,
            manageFocused && styles.manageButtonTextFocused,
          ]}>
            {isManaging ? 'DONE' : 'MANAGE PROFILES'}
          </Text>
        </Pressable>
      </View>

      {/* ── Right Section: Profile-Aware Content Metadata ── */}
      <View style={styles.rightContent}>
        <Animated.View key={currentFeatured.id} entering={FadeIn.duration(1000)}>
          <View style={styles.nSeriesRow}>
            <Text style={styles.nBadge}>N</Text>
            <Text style={styles.seriesLabel}>SERIES</Text>
          </View>
          <Text style={styles.showTitle}>{currentFeatured.title}</Text>
          <Text style={styles.metadata}>{currentFeatured.metadata}</Text>
          
          <View style={styles.ctaButton}>
            <Text style={styles.ctaText}>Watch Now</Text>
          </View>
        </Animated.View>
      </View>

      {/* ── D-Pad Navigation Hints ── */}
      <View style={styles.navHints}>
        <View style={styles.hintItem}>
          <View style={styles.hintIcon}><Ionicons name="arrow-up-outline" size={12} color="white" /></View>
          <View style={styles.hintIcon}><Ionicons name="arrow-down-outline" size={12} color="white" /></View>
          <Text style={styles.hintText}>Navigate</Text>
        </View>
        <View style={styles.hintItem}>
          <View style={styles.hintIcon}><Text style={styles.hintIconText}>OK</Text></View>
          <Text style={styles.hintText}>Select</Text>
        </View>
      </View>

      {/* ── PIN Modal ── */}
      {showPinModal && lockedProfile && (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={styles.pinOverlay}>
          <Animated.View entering={SlideInDown.springify()} exiting={SlideOutDown.duration(200)} style={styles.pinCard}>
            <Pressable style={styles.pinCloseBtn} onPress={() => setShowPinModal(false)}>
              <Ionicons name="close" size={26} color="rgba(255,255,255,0.5)" />
            </Pressable>

            <View style={styles.pinAvatarWrap}>
              <Image source={lockedProfile.avatar} style={styles.pinAvatar} contentFit="cover" />
            </View>

            <Text style={styles.pinProfileName}>{lockedProfile.name}</Text>
            <Text style={styles.pinPrompt}>Enter your 4-digit PIN</Text>

            <View style={styles.pinDots}>
              {[0,1,2,3].map(i => (
                <View key={i} style={[
                  styles.pinDot,
                  pinInput.length > i && styles.pinDotFilled,
                  pinError && styles.pinDotError,
                ]} />
              ))}
            </View>

            <View style={styles.pinGrid}>
              {['1','2','3','4','5','6','7','8','9','','0','del'].map((key, idx) => {
                if (key === '') return <View key={idx} style={styles.pinCell} />;
                return (
                  <Pressable
                    key={idx}
                    style={({ focused }) => [styles.pinBtn, focused && styles.pinBtnFocused]}
                    onPress={() => key === 'del' ? setPinInput(p => p.slice(0, -1)) : handlePinPress(key)}
                  >
                    {({ focused }) => key === 'del'
                      ? <Ionicons name="backspace-outline" size={26} color={focused ? '#141414' : '#fff'} />
                      : <Text style={[styles.pinBtnText, focused && { color: '#141414' }]}>{key}</Text>
                    }
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 60,
    paddingTop: 60,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  headerLeft: {},
  headerRight: {},
  clockText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '400',
    opacity: 0.6,
  },
  leftColumn: {
    width: LEFT_COLUMN_WIDTH,
    height: '100%',
    paddingLeft: 60,
    paddingTop: 160,
    zIndex: 10,
  },
  netflixLogo: {
    color: '#E50914',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '500',
    opacity: 0.8,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  planBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  planBadgeText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  upgradeBadge: {
    backgroundColor: '#E50914',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  upgradeBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  profileList: {
    flex: 1,
  },

  // Profile Item Styles
  profileRowContainer: {
    marginBottom: 20,
  },
  profileItemPressable: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  indicatorContainer: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editIcon: {
    marginRight: 10,
  },
  avatarWrapper: {
    borderRadius: AVATAR_RADIUS,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: '#222',
  },
  avatarFocused: {
    width: FOCUSED_AVATAR_SIZE,
    height: FOCUSED_AVATAR_SIZE,
    borderColor: '#FFFFFF',
    borderWidth: 4,
  },
  avatarUnfocused: {
    width: UNFOCUSED_AVATAR_SIZE,
    height: UNFOCUSED_AVATAR_SIZE,
    opacity: 0.6,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  addAvatar: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#333',
  },
  nameContainer: {
    marginLeft: 20,
    flex: 1,
  },
  profileName: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '600',
  },
  lockBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 4,
    borderRadius: 10,
  },
  planLockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  planLockedText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  editOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Right Content Styles
  rightContent: {
    position: 'absolute',
    right: 80,
    bottom: 120,
    alignItems: 'flex-end',
    width: width * 0.5,
  },
  nSeriesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    justifyContent: 'flex-end',
  },
  nBadge: {
    color: '#E50914',
    fontSize: 28,
    fontWeight: '900',
    marginRight: 6,
  },
  seriesLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 4,
    opacity: 0.8,
  },
  showTitle: {
    color: '#FFFFFF',
    fontSize: 64,
    fontWeight: '800',
    textAlign: 'right',
    marginBottom: 10,
  },
  metadata: {
    color: '#FFFFFF',
    fontSize: 20,
    opacity: 0.7,
    textAlign: 'right',
    marginBottom: 24,
  },
  ctaButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 4,
  },
  ctaText: {
    color: '#000000',
    fontSize: 20,
    fontWeight: '700',
  },

  // Nav Hints
  navHints: {
    position: 'absolute',
    bottom: 40,
    right: 80,
    flexDirection: 'row',
    gap: 30,
  },
  hintItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hintIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  hintIconText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  hintText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    opacity: 0.6,
  },

  // UI Utilities
  manageButton: {
    marginTop: 20,
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    marginBottom: 60,
  },
  manageButtonFocused: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  manageButtonText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 2,
  },
  manageButtonTextFocused: {
    color: '#000000',
  },

  // PIN Modal (Kept from original)
  pinOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  pinCard: {
    width: Math.min(400, width * 0.38),
    backgroundColor: '#1A1A1A',
    borderRadius: 6,
    overflow: 'hidden',
    alignItems: 'center',
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pinCloseBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    padding: 8,
  },
  pinAvatarWrap: {
    width: 80,
    height: 80,
    borderRadius: AVATAR_RADIUS,
    overflow: 'hidden',
    marginTop: 30,
    marginBottom: 14,
  },
  pinAvatar: {
    width: '100%',
    height: '100%',
  },
  pinProfileName: {
    color: '#E5E5E5',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  pinPrompt: {
    color: '#808080',
    fontSize: 14,
    marginBottom: 20,
  },
  pinDots: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 22,
  },
  pinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#808080',
  },
  pinDotFilled: {
    backgroundColor: '#E50914',
    borderColor: '#E50914',
  },
  pinDotError: {
    borderColor: '#B00020',
    backgroundColor: 'rgba(176,0,32,0.4)',
  },
  pinGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: 290,
    gap: 10,
    paddingHorizontal: 10,
  },
  pinCell: { width: 74, height: 74 },
  pinBtn: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pinBtnFocused: {
    backgroundColor: '#E5E5E5',
    borderColor: '#E5E5E5',
    transform: [{ scale: 1.05 }],
  },
  pinBtnText: {
    color: '#E5E5E5',
    fontSize: 22,
    fontWeight: '500',
  },
});


