import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  FlatList,
  Platform,
  useWindowDimensions,
  Alert,
  ActivityIndicator,
  Keyboard
} from 'react-native';
import { auth } from '../../services/firebase';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  useAnimatedScrollHandler,
  interpolate,
  interpolateColor,
  useAnimatedReaction,
  runOnJS,
  Easing
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfile, AVATAR_MAP } from '../../context/ProfileContext';
import {
  FriendsService,
  Friend,
  SharedMovie,
  WatchParty,
  CollaborativeWatchlist
} from '../../services/friends';
import { COLORS, SPACING } from '../../constants/theme';
import { getImageUrl, getBackdropUrl, fetchMovieDetails, searchMulti } from '../../services/tmdb';
import { LiquidGlassCircle, LiquidGlassPill } from '../../components/LiquidGlass';
import { MessagingService } from '../../services/messaging';

// ── SUBCOMPONENT 1: Premium Scheduled Party Card ──
function ScheduledPartyCard({ item, currentUid, onJoin }: { item: WatchParty; currentUid: string; onJoin: (party: WatchParty) => void }) {
  const [countdown, setCountdown] = useState('');
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.6, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const pulseAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: interpolate(pulseScale.value, [1, 1.6], [1, 0.3]),
  }));

  useEffect(() => {
    const updateCountdown = () => {
      const target = new Date(item.scheduledTime);
      const diff = target.getTime() - Date.now();
      if (diff <= 0) {
        setCountdown('Starting Now');
        return;
      }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      if (hours > 0) {
        setCountdown(`Starts in ${hours}h ${mins}m`);
      } else {
        setCountdown(`Starts in ${mins}m ${secs}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [item.scheduledTime]);

  const formattedTime = useMemo(() => {
    try {
      const date = new Date(item.scheduledTime);
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  }, [item.scheduledTime]);

  const isHost = item.hostId === currentUid;

  return (
    <View style={styles.premiumScheduledCardContainer}>
      <LiquidGlassPill borderRadius={18} style={styles.scheduledPartyCardPremium}>
        <LinearGradient
          colors={['rgba(139, 92, 246, 0.18)', 'rgba(236, 72, 153, 0.06)', 'transparent']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.partyCardHeader}>
          <View style={styles.partyHost}>
            <ExpoImage source={AVATAR_MAP[item.hostAvatar] || AVATAR_MAP.avatar1} style={styles.partyHostAvatar} />
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.partyHostName} numberOfLines={1}>{item.hostName}</Text>
              <Text style={styles.scheduledTimeText} numberOfLines={1}>📅 {formattedTime}</Text>
            </View>
          </View>
          <Pressable style={styles.preJoinBtnPremium} onPress={() => onJoin(item)}>
            <LinearGradient
              colors={['#8B5CF6', '#EC4899']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.joinBtnGradient}
            >
              <Ionicons name="enter-outline" size={14} color="white" />
              <Text style={styles.joinBtnText}>{isHost ? 'Start' : 'Enter'}</Text>
            </LinearGradient>
          </Pressable>
        </View>

        <View style={{ flexGrow: 1, justifyContent: 'center', marginVertical: 4 }}>
          <Text style={styles.partyMovieTitlePremium} numberOfLines={2}>{item.title}</Text>
          {item.seasonNum && (
            <Text style={styles.partyEpisodeText}>Season {item.seasonNum} Episode {item.episodeNum}</Text>
          )}
        </View>

        <View style={styles.countdownContainerPremium}>
          <View style={styles.countdownDotWrapper}>
            <Animated.View style={[styles.countdownPulseRing, pulseAnimStyle]} />
            <LinearGradient
              colors={['#8B5CF6', '#EC4899']}
              style={styles.countdownIndicatorPremium}
            />
          </View>
          <Text style={styles.countdownTextPremium}>{countdown}</Text>
        </View>
      </LiquidGlassPill>
    </View>
  );
}

// ── SUBCOMPONENT 2: Cinematic Social Hero Card ──
function SocialHeroCard({
  featured,
  backdropUrl,
  width,
  onJoin,
  onOpenWatchlist,
  onShareCode
}: {
  featured: any;
  backdropUrl: string | null;
  width: number;
  onJoin: (party: WatchParty) => void;
  onOpenWatchlist: (watchlist: CollaborativeWatchlist) => void;
  onShareCode: () => void;
}) {
  const router = useRouter();
  const cardHeight = 440;

  const themeColors = useMemo(() => {
    switch (featured.type) {
      case 'live':
        return {
          primary: '#E50914',
          badgeText: '🟢 LIVE NOW',
          badgeColors: ['#E50914', '#F43F5E'],
          btnColors: ['#E50914', '#F43F5E'],
          btnLabel: 'Join Live Party',
          subtitle: 'Watching together in real-time',
          iconName: 'play-circle'
        };
      case 'scheduled':
        return {
          primary: '#8B5CF6',
          badgeText: '📅 UPCOMING',
          badgeColors: ['#8B5CF6', '#EC4899'],
          btnColors: ['#8B5CF6', '#EC4899'],
          btnLabel: 'Enter Lobby',
          subtitle: 'Get ready to watch together',
          iconName: 'time'
        };
      case 'watchlist':
        return {
          primary: '#3B82F6',
          badgeText: '🎬 BINGE LIST',
          badgeColors: ['#3B82F6', '#10B981'],
          btnColors: ['#3B82F6', '#10B981'],
          btnLabel: 'Open Binge List',
          subtitle: 'Collaborate & vote with friends',
          iconName: 'film'
        };
      default:
        return {
          primary: '#E50914',
          badgeText: '👋 CONNECT',
          badgeColors: ['#E50914', '#8B5CF6'],
          btnColors: ['#E50914', '#8B5CF6'],
          btnLabel: 'Invite Friends',
          subtitle: 'Connect and watch together',
          iconName: 'people'
        };
    }
  }, [featured.type]);

  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    if (featured.type !== 'scheduled' || !featured.party?.scheduledTime) return;
    const updateCountdown = () => {
      const target = new Date(featured.party.scheduledTime);
      const diff = target.getTime() - Date.now();
      if (diff <= 0) {
        setCountdown('Starting Now');
        return;
      }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      if (hours > 0) {
        setCountdown(`Starts in ${hours}h ${mins}m`);
      } else {
        setCountdown(`Starts in ${mins}m ${secs}s`);
      }
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [featured.party?.scheduledTime, featured.type]);

  const formattedTime = useMemo(() => {
    if (featured.type !== 'scheduled' || !featured.party?.scheduledTime) return '';
    try {
      const date = new Date(featured.party.scheduledTime);
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  }, [featured.party?.scheduledTime, featured.type]);

  const participantsList = useMemo(() => {
    if (!featured.party?.participants) return [];
    return Object.values(featured.party.participants).slice(0, 4);
  }, [featured.party?.participants]);

  const handleActionPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (featured.type === 'live' || featured.type === 'scheduled') {
      onJoin(featured.party);
    } else if (featured.type === 'watchlist') {
      onOpenWatchlist(featured.watchlist);
    } else {
      onShareCode();
    }
  };

  return (
    <View style={[styles.heroCardContainer, { height: cardHeight }]}>
      <View style={StyleSheet.absoluteFill}>
        {backdropUrl ? (
          <ExpoImage
            source={{ uri: backdropUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <LinearGradient
            colors={['#1F1F1F', '#000000']}
            style={StyleSheet.absoluteFill}
          />
        )}
        <LinearGradient
          colors={[
            'rgba(0, 0, 0, 0.65)',
            'rgba(0, 0, 0, 0.25)',
            'rgba(0, 0, 0, 0.68)',
            '#000000'
          ]}
          locations={[0, 0.35, 0.72, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={styles.heroRefractionBorder} pointerEvents="none" />
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.12)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.22 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.heroContentContainer}>
        <Animated.View entering={FadeIn.delay(100)} style={styles.heroBadgeRow}>
          <LinearGradient
            colors={themeColors.badgeColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.heroBadgeGradient}
          >
            <Text style={styles.heroBadgeText}>{themeColors.badgeText}</Text>
          </LinearGradient>
          {featured.type === 'scheduled' && countdown && (
            <View style={styles.heroBadgeClock}>
              <Text style={styles.heroBadgeClockText}>{countdown}</Text>
            </View>
          )}
        </Animated.View>

        <View style={styles.heroTitleSection}>
          <Text numberOfLines={2} style={styles.heroTitleText}>
            {featured.title}
          </Text>
          <Text style={styles.heroSubtitleText}>{themeColors.subtitle}</Text>
        </View>

        {featured.type === 'scheduled' && (
          <View style={styles.heroMetaRow}>
            <Ionicons name="calendar-outline" size={14} color="#A3A3A3" />
            <Text style={styles.heroMetaText}>{formattedTime}</Text>
          </View>
        )}

        {featured.type === 'watchlist' && (
          <View style={styles.heroMetaRow}>
            <Ionicons name="film-outline" size={14} color="#A3A3A3" />
            <Text style={styles.heroMetaText}>
              {Object.keys(featured.watchlist?.movies || {}).length} Curated Titles
            </Text>
          </View>
        )}

        {participantsList.length > 0 && (
          <View style={styles.heroParticipantsRow}>
            <View style={styles.heroAvatarsOverlap}>
              {participantsList.map((user: any, idx) => (
                <ExpoImage
                  key={idx}
                  source={AVATAR_MAP[user.avatarId] || AVATAR_MAP.avatar1}
                  style={[
                    styles.heroOverlapAvatar,
                    { left: idx * 14, zIndex: 10 - idx }
                  ]}
                />
              ))}
            </View>
            <Text style={styles.heroParticipantsCountText}>
              {participantsList.length === 1
                ? `${participantsList[0].name} in lobby`
                : `${participantsList[0].name} & ${participantsList.length - 1} more active`}
            </Text>
          </View>
        )}

        <View style={styles.heroActionsRow}>
          <Pressable style={styles.heroMainBtnContainer} onPress={handleActionPress}>
            <LinearGradient
              colors={themeColors.btnColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.heroMainBtnGradient}
            >
              <Ionicons name={themeColors.iconName as any} size={20} color="white" />
              <Text style={styles.heroMainBtnText}>{themeColors.btnLabel}</Text>
            </LinearGradient>
          </Pressable>

          <LiquidGlassCircle size={46}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (featured.type === 'live' || featured.type === 'scheduled') {
                  router.push({
                    pathname: '/movie/[id]',
                    params: { id: featured.tmdbId, type: featured.mediaType }
                  });
                } else {
                  onShareCode();
                }
              }}
            >
              <Ionicons name={featured.type === 'default' ? "share-social" : "information-circle"} size={22} color="white" style={{ alignSelf: 'center', marginTop: 11 }} />
            </Pressable>
          </LiquidGlassCircle>
        </View>
      </View>
    </View>
  );
}

// ── SUBCOMPONENT 3: Friend Presence Bubble with Haptics and Animation ──
function FriendPresenceBubble({ item, onPress, onWatchPress }: { item: Friend; onPress: () => void; onWatchPress: () => void }) {
  const isOnline = item.status === 'online' || item.status === 'watching';
  const isWatching = item.status === 'watching';
  const scale = useSharedValue(1);
  const statusPulse = useSharedValue(1);

  useEffect(() => {
    if (isOnline) {
      statusPulse.value = withRepeat(
        withSequence(
          withTiming(1.5, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    }
  }, [isOnline]);

  const statusPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: statusPulse.value }],
    opacity: interpolate(statusPulse.value, [1, 1.5], [0.6, 0]),
  }));

  const handlePressIn = () => {
    scale.value = withTiming(0.9, { duration: 100 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 10, stiffness: 200 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={isWatching ? onWatchPress : onPress}
    >
      <Animated.View style={[styles.friendBubbleContainer, animatedStyle]}>
        <View style={styles.avatarGlowContainer}>
          {isWatching ? (
            <LinearGradient
              colors={['#E50914', '#EC4899', '#E50914']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarGradientRing}
            >
              <View style={styles.avatarGradientRingInner}>
                <ExpoImage
                  source={AVATAR_MAP[item.avatarId] || AVATAR_MAP.avatar1}
                  style={styles.friendAvatar}
                />
              </View>
            </LinearGradient>
          ) : (
            <ExpoImage
              source={AVATAR_MAP[item.avatarId] || AVATAR_MAP.avatar1}
              style={[
                styles.friendAvatar,
                {
                  borderColor: isOnline ? '#FBBF24' : 'rgba(255,255,255,0.15)'
                }
              ]}
            />
          )}
          <View style={styles.statusIndicatorWrapper}>
            {isOnline && (
              <Animated.View
                style={[
                  styles.statusPulseRing,
                  {
                    backgroundColor: isWatching ? '#10B981' : '#F59E0B',
                  },
                  statusPulseStyle
                ]}
              />
            )}
            <View
              style={[
                styles.statusIndicator,
                {
                  backgroundColor: isWatching ? '#10B981' : (isOnline ? '#F59E0B' : '#9CA3AF'),
                  borderColor: '#000',
                  borderWidth: 2
                }
              ]}
            />
          </View>
        </View>
        {/* Shadow glow beneath avatar */}
        <View style={[
          styles.avatarShadowGlow,
          isWatching && { shadowColor: '#E50914', backgroundColor: 'rgba(229, 9, 20, 0.15)' },
          isOnline && !isWatching && { shadowColor: '#F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.1)' },
        ]} />
        <Text numberOfLines={1} style={styles.friendNameText}>{item.name.split(' ')[0]}</Text>
        {isWatching && (
          <Text numberOfLines={1} style={styles.watchingText}>{item.watchingTitle || 'Watching...'}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ── SUBCOMPONENT 4: Glass Binge List row ticket ──
function BingeListRow({ list, onPress }: { list: CollaborativeWatchlist; onPress: () => void }) {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withTiming(0.97, { duration: 100 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 12, stiffness: 200 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const titlesCount = Object.keys(list.movies || {}).length;
  const memberCount = Object.keys(list.members || {}).length;
  const posterPreviews = useMemo(() => {
    return Object.values(list.movies || {}).slice(0, 3);
  }, [list.movies]);

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      style={{ marginBottom: 12 }}
    >
      <Animated.View style={animatedStyle}>
        <LiquidGlassPill borderRadius={16} style={styles.watchlistRowPremium}>
          <LinearGradient
            colors={['rgba(59, 130, 246, 0.12)', 'rgba(16, 185, 129, 0.05)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.watchlistRowHeader}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.watchlistRowTitle} numberOfLines={1}>{list.name}</Text>
              <Text style={styles.watchlistRowCreator} numberOfLines={1} ellipsizeMode="tail">Shared Binge List • Created by {list.createdByName}</Text>
              {/* Member count badge */}
              <View style={styles.memberCountRow}>
                <Ionicons name="people" size={10} color="#A3A3A3" />
                <Text style={styles.memberCountText}>{memberCount} {memberCount === 1 ? 'member' : 'members'}</Text>
              </View>
            </View>
            <View style={styles.bingeListRightSection}>
              {/* Stacked poster thumbnails */}
              {posterPreviews.length > 0 && (
                <View style={styles.stackedPostersContainer}>
                  {posterPreviews.map((movie: any, idx: number) => (
                    <ExpoImage
                      key={movie.tmdbId || idx}
                      source={{ uri: movie.posterPath }}
                      style={[
                        styles.stackedPoster,
                        {
                          right: idx * 14,
                          zIndex: 10 - idx,
                          opacity: 1 - idx * 0.2,
                        }
                      ]}
                    />
                  ))}
                </View>
              )}
              <View style={styles.bingeListBadgeChevronRow}>
                <LinearGradient
                  colors={['#3B82F6', '#10B981']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.watchlistMetaBadge}
                >
                  <Ionicons name="film" size={12} color="white" />
                  <Text style={styles.watchlistMetaBadgeText}>
                    {titlesCount} {titlesCount === 1 ? 'title' : 'titles'}
                  </Text>
                </LinearGradient>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
              </View>
            </View>
          </View>
        </LiquidGlassPill>
      </Animated.View>
    </Pressable>
  );
}

export default function SocialScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { selectedProfile } = useProfile();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [inbox, setInbox] = useState<SharedMovie[]>([]);
  const [watchlists, setWatchlists] = useState<CollaborativeWatchlist[]>([]);
  const [parties, setParties] = useState<WatchParty[]>([]);
  const [scheduledParties, setScheduledParties] = useState<WatchParty[]>([]);

  // Reanimated scroll state for header blending and parallax
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  // Color theme gradients based on featured item
  const [featuredBackdrop, setFeaturedBackdrop] = useState<string | null>(null);

  const featuredItem = useMemo(() => {
    if (parties.length > 0) {
      return {
        type: 'live',
        title: parties[0].title,
        tmdbId: parties[0].tmdbId,
        mediaType: parties[0].type,
        party: parties[0]
      };
    } else if (scheduledParties.length > 0) {
      return {
        type: 'scheduled',
        title: scheduledParties[0].title,
        tmdbId: scheduledParties[0].tmdbId,
        mediaType: scheduledParties[0].type,
        party: scheduledParties[0]
      };
    } else if (watchlists.length > 0) {
      const keys = Object.keys(watchlists[0].movies || {});
      const movie = keys.length > 0 ? watchlists[0].movies[keys[0]] : null;
      return {
        type: 'watchlist',
        title: watchlists[0].name,
        tmdbId: movie?.tmdbId || null,
        mediaType: movie?.type || 'movie',
        watchlist: watchlists[0]
      };
    }
    return {
      type: 'default',
      title: 'Social Circle',
      tmdbId: '60735', // Wednesday TMDB id as fallback
      mediaType: 'tv'
    };
  }, [parties, scheduledParties, watchlists]);

  // Fetch TMDB backdrop dynamically for featured item
  useEffect(() => {
    if (!featuredItem.tmdbId) {
      setFeaturedBackdrop(null);
      return;
    }
    let active = true;
    const loadBackdrop = async () => {
      try {
        const details = await fetchMovieDetails(featuredItem.tmdbId!, featuredItem.mediaType);
        if (active) {
          const url = getBackdropUrl(details.backdrop_path) || getImageUrl(details.poster_path);
          if (url) setFeaturedBackdrop(url);
        }
      } catch (err) {
        console.log('Error fetching featured backdrop:', err);
      }
    };
    loadBackdrop();
    return () => {
      active = false;
    };
  }, [featuredItem.tmdbId, featuredItem.mediaType]);

  const featuredThemeColors = useMemo(() => {
    switch (featuredItem.type) {
      case 'live':
        return ['rgba(229, 9, 20, 0.45)', 'rgba(244, 63, 94, 0.15)', 'transparent'];
      case 'scheduled':
        return ['rgba(139, 92, 246, 0.45)', 'rgba(236, 72, 153, 0.15)', 'transparent'];
      case 'watchlist':
        return ['rgba(59, 130, 246, 0.45)', 'rgba(16, 185, 129, 0.15)', 'transparent'];
      default:
        return ['rgba(229, 9, 20, 0.3)', 'rgba(139, 92, 246, 0.1)', 'transparent'];
    }
  }, [featuredItem.type]);

  // Comparative Genre Affinity Match Generator
  const genreAffinities = useMemo(() => {
    if (!selectedFriend) return [];
    const name = selectedFriend.name;
    const seedValue = name.charCodeAt(0) + name.charCodeAt(name.length - 1);
    
    return [
      { name: 'Action', user: 78, friend: (seedValue % 25) + 60, colors: ['#FF4500', '#FF8C00'] },
      { name: 'Comedy', user: 62, friend: ((seedValue + 12) % 35) + 45, colors: ['#FBBF24', '#F59E0B'] },
      { name: 'Dramas', user: 85, friend: ((seedValue + 24) % 20) + 70, colors: ['#EC4899', '#D946EF'] },
      { name: 'Sci-Fi', user: 45, friend: ((seedValue + 36) % 45) + 40, colors: ['#8B5CF6', '#3B82F6'] },
      { name: 'Horror', user: seedValue % 2 === 0 ? 80 : 35, friend: ((seedValue + 48) % 35) + 35, colors: ['#EF4444', '#E50914'] },
    ];
  }, [selectedFriend]);

  // Shared watchlist match scanning resolution
  const sharedWatchlistMatch = useMemo(() => {
    if (!selectedFriend) return null;
    const name = selectedFriend.name.split(' ')[0];
    const matchingTitle = selectedFriend.status === 'watching' && selectedFriend.watchingTitle
      ? selectedFriend.watchingTitle
      : (name === 'Alex' ? 'Stranger Things' : 'Wednesday');
    
    return {
      title: matchingTitle,
      tmdbId: name === 'Alex' ? '66732' : '119051',
      mediaType: 'tv'
    };
  }, [selectedFriend]);

  // Seed mock Friend Activity Feed for "Live Friend Buzz"
  const friendBuzzList = useMemo(() => {
    return [
      {
        id: 'buzz_1',
        friendName: 'Sarah Jenkins',
        avatarId: 'avatar2',
        action: 'reacted',
        emoji: '🔥',
        movieTitle: 'Wednesday',
        comment: 'This new episode is insane! The dance scene is legendary.',
        tmdbId: '119051',
        mediaType: 'tv',
        time: '2m ago'
      },
      {
        id: 'buzz_2',
        friendName: 'Alex Rodriguez',
        avatarId: 'avatar3',
        action: 'reviewed',
        emoji: '⭐',
        rating: '4.8',
        movieTitle: 'Stranger Things',
        comment: 'Season 4 finale blew my mind. Max and Lucas are amazing.',
        tmdbId: '66732',
        mediaType: 'tv',
        time: '15m ago'
      },
      {
        id: 'buzz_3',
        friendName: 'David Kim',
        avatarId: 'avatar4',
        action: 'sticker',
        emoji: '🍿',
        movieTitle: 'Wednesday',
        comment: 'Binge-watching all night, who is with me?',
        tmdbId: '119051',
        mediaType: 'tv',
        time: '1h ago'
      },
      {
        id: 'buzz_4',
        friendName: 'Emily Watson',
        avatarId: 'avatar5',
        action: 'reacted',
        emoji: '😱',
        movieTitle: 'Wednesday',
        comment: 'Omg, the ending of episode 4!! Pls no spoilers.',
        tmdbId: '119051',
        mediaType: 'tv',
        time: '3h ago'
      }
    ];
  }, []);

  // Modals / Overlays
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [tasteMatch, setTasteMatch] = useState<{ score: number; matchingGenres: string[]; recommendedTitles: any[] } | null>(null);
  const [selectedWatchlist, setSelectedWatchlist] = useState<CollaborativeWatchlist | null>(null);
  const [showCreateWatchlist, setShowCreateWatchlist] = useState(false);
  const [newWatchlistName, setNewWatchlistName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [watchlistSearchQuery, setWatchlistSearchQuery] = useState('');
  const [watchlistSearchResults, setWatchlistSearchResults] = useState<any[]>([]);

  // Binge Decider Wheel States
  const [showWheelOverlay, setShowWheelOverlay] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [winningMovie, setWinningMovie] = useState<any | null>(null);
  const [showWinningOverlay, setShowWinningOverlay] = useState(false);
  const wheelRotation = useSharedValue(0);

  // Friends bottom sheet premium state and functions
  const [showQuickRecommendRow, setShowQuickRecommendRow] = useState(false);
  
  const handleRecommendMovie = useCallback(async (moviePayload: { id: string; title: string; poster_path: string; type: 'movie' | 'tv' }) => {
    if (!selectedFriend) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await FriendsService.shareMovieWithFriend(selectedFriend.uid, moviePayload, selectedProfile);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Shared!', `Recommended "${moviePayload.title}" to ${selectedFriend.name.split(' ')[0]}!`);
      setShowQuickRecommendRow(false);
    } catch (e) {
      Alert.alert('Error', 'Failed to share movie.');
    }
  }, [selectedFriend, selectedProfile]);

  // Incremental haptic tick trigger
  const triggerHapticTick = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // React to wheel rotation for ticks
  useAnimatedReaction(
    () => {
      if (!selectedWatchlist) return 0;
      const movies = Object.values(selectedWatchlist.movies || {});
      const N = movies.length || 1;
      const angleStep = 360 / N;
      return Math.floor(wheelRotation.value / angleStep);
    },
    (currentSegment, previousSegment) => {
      if (currentSegment !== previousSegment && currentSegment > 0) {
        runOnJS(triggerHapticTick)();
      }
    },
    [selectedWatchlist]
  );

  const handleSpinComplete = useCallback((movie: any) => {
    setSpinning(false);
    setWinningMovie(movie);
    setShowWinningOverlay(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const wheelAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${wheelRotation.value}deg` }]
    };
  });

  const handleSpinWheel = useCallback(() => {
    if (!selectedWatchlist || spinning) return;
    const movies = Object.values(selectedWatchlist.movies || {});
    if (movies.length === 0) return;

    setSpinning(true);
    setWinningMovie(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Weighted random selection based on voteCount
    const totalVotes = movies.reduce((sum, m) => sum + Math.max(1, m.voteCount), 0);
    let randomWeight = Math.random() * totalVotes;
    let winningIdx = 0;
    for (let i = 0; i < movies.length; i++) {
      const weight = Math.max(1, movies[i].voteCount);
      if (randomWeight < weight) {
        winningIdx = i;
        break;
      }
      randomWeight -= weight;
    }

    const N = movies.length;
    const angleStep = 360 / N;
    wheelRotation.value = 0;

    // Spin 6 full rotations plus offset to the winning segment
    const targetAngle = 360 * 6 - (winningIdx * angleStep) + (angleStep * 0.1);

    wheelRotation.value = withTiming(
      targetAngle,
      {
        duration: 4500,
        easing: Easing.bezier(0.1, 0.8, 0.25, 1)
      },
      (finished) => {
        if (finished) {
          runOnJS(handleSpinComplete)(movies[winningIdx]);
        }
      }
    );
  }, [selectedWatchlist, spinning, handleSpinComplete]);

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleSearchQuery, setScheduleSearchQuery] = useState('');
  const [scheduleSearchResults, setScheduleSearchResults] = useState<any[]>([]);
  const [selectedScheduleMovie, setSelectedScheduleMovie] = useState<any | null>(null);
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  const [selectedHour, setSelectedHour] = useState(20);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const scheduleSearchTimeoutRef = useRef<any>(null);
  const watchlistSearchTimeoutRef = useRef<any>(null);

  // Subscriptions
  useEffect(() => {
    const unsubFriends = FriendsService.subscribeToFriends((data) => {
      setFriends(data);
    });

    const unsubInbox = FriendsService.subscribeToSharedInbox((data) => {
      setInbox(data);
    });

    const unsubWatchlists = FriendsService.subscribeToCollaborativeWatchlists((data) => {
      setWatchlists(data);
    });

    // Fetch active & scheduled watch parties initially and poll every 10 seconds
    const fetchParties = async () => {
      const activeParties = await FriendsService.getActiveWatchParties();
      setParties(activeParties);
      const scheduled = await FriendsService.getScheduledWatchParties();
      setScheduledParties(scheduled);
    };
    fetchParties();
    const interval = setInterval(fetchParties, 10000);

    return () => {
      unsubFriends();
      unsubInbox();
      unsubWatchlists();
      clearInterval(interval);
    };
  }, []);

  // Handle Taste Match Open
  const handleFriendPress = async (friend: Friend) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedFriend(friend);
    const match = await FriendsService.getTasteMatchScore(friend.uid);
    setTasteMatch(match);
  };

  // Join watch party
  const handleJoinParty = (party: WatchParty) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push({
      pathname: '/movie/[id]',
      params: { id: party.tmdbId, type: party.type, watchPartyId: party.id, isHost: 'false' }
    });
  };

  // Join/Start scheduled party early
  const handleJoinScheduledParty = (party: WatchParty) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const currentUid = auth.currentUser?.uid || 'guest';
    const isHost = party.hostId === currentUid;
    router.push({
      pathname: '/movie/[id]',
      params: { id: party.tmdbId, type: party.type, watchPartyId: party.id, isHost: isHost.toString() }
    });
  };

  // Movie search for scheduled party (debounced to avoid network thrashing)
  const searchMoviesForSchedule = (q: string) => {
    setScheduleSearchQuery(q);
    if (q.trim().length < 2) {
      setScheduleSearchResults([]);
      return;
    }
    
    if (scheduleSearchTimeoutRef.current) {
      clearTimeout(scheduleSearchTimeoutRef.current);
    }
    
    scheduleSearchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await searchMulti(q);
        const moviesOnly = res.filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv');
        setScheduleSearchResults(moviesOnly.slice(0, 5));
      } catch (_) {}
    }, 400);
  };

  // Select movie for schedule
  const handleSelectScheduleMovie = (movie: any) => {
    setSelectedScheduleMovie(movie);
    setScheduleSearchQuery('');
    setScheduleSearchResults([]);
  };

  // Date selection options (calculated once on mount)
  const selectableDates = useMemo(() => {
    const dates = [];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      let label = '';
      if (i === 0) label = 'Today';
      else if (i === 1) label = 'Tomorrow';
      else label = `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}`;
      dates.push({ date: d, label });
    }
    return dates;
  }, []);

  // Hours selection options (calculated once on mount)
  const hoursList = useMemo(() => {
    return Array.from({ length: 24 }, (_, h) => {
      const period = h >= 12 ? 'PM' : 'AM';
      const displayHour = h % 12 === 0 ? 12 : h % 12;
      return { value: h, label: `${displayHour} ${period}` };
    });
  }, []);

  // Submit scheduled watch party
  const handleScheduleParty = async () => {
    if (!selectedScheduleMovie) {
      Alert.alert('Required', 'Please select a movie or show to watch');
      return;
    }

    if (!auth.currentUser) {
      Alert.alert('Sign In Required', 'Please sign in to schedule a Watch Party.');
      return;
    }

    try {
      const baseDate = selectableDates[selectedDateIndex].date;
      const scheduledDate = new Date(
        baseDate.getFullYear(),
        baseDate.getMonth(),
        baseDate.getDate(),
        selectedHour,
        selectedMinute,
        0
      );

      // Validate that the scheduled date is in the future
      if (scheduledDate.getTime() <= Date.now()) {
        Alert.alert('Invalid Time', 'Please schedule the party for a future time.');
        return;
      }

      const mediaType = selectedScheduleMovie.media_type || (selectedScheduleMovie.title ? 'movie' : 'tv');
      const title = selectedScheduleMovie.title || selectedScheduleMovie.name || 'Untitled';

      await FriendsService.scheduleWatchParty(
        selectedProfile,
        selectedScheduleMovie.id.toString(),
        mediaType,
        title,
        scheduledDate
      );

      // Reset state
      setSelectedScheduleMovie(null);
      setScheduleSearchQuery('');
      setScheduleSearchResults([]);
      setSelectedDateIndex(0);
      setSelectedHour(20);
      setSelectedMinute(0);
      setShowScheduleModal(false);

      // Refetch parties immediately
      try {
        const scheduled = await FriendsService.getScheduledWatchParties();
        setScheduledParties(scheduled);
      } catch (_) {}

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', 'Watch Party scheduled successfully!');
    } catch (e: any) {
      console.error('[Social] scheduleWatchParty error:', e);
      const msg = e?.message || 'An unexpected error occurred';
      Alert.alert('Error', `Failed to schedule Watch Party.\n\n${msg}`);
    }
  };

  // Create new collaborative watchlist (Binge List)
  const handleCreateWatchlist = async () => {
    if (!newWatchlistName.trim()) {
      Alert.alert('Required', 'Please enter a list name');
      return;
    }

    if (!auth.currentUser) {
      Alert.alert('Sign In Required', 'Please sign in to create a Binge List.');
      return;
    }

    try {
      await FriendsService.createCollaborativeWatchlist(newWatchlistName, selectedMembers, selectedProfile);
      setNewWatchlistName('');
      setSelectedMembers([]);
      setShowCreateWatchlist(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Created!', `"${newWatchlistName.trim()}" Binge List is ready!`);
    } catch (e: any) {
      console.error('[Social] createWatchlist error:', e);
      const msg = e?.message || 'An unexpected error occurred';
      Alert.alert('Error', `Failed to create Binge List.\n\n${msg}`);
    }
  };

  // Toggle watchlist member selection
  const toggleMemberSelection = (uid: string) => {
    if (selectedMembers.includes(uid)) {
      setSelectedMembers(prev => prev.filter(id => id !== uid));
    } else {
      setSelectedMembers(prev => [...prev, uid]);
    }
  };

  // Watchlist Movie Search (debounced to avoid network thrashing)
  const searchMoviesForWatchlist = (q: string) => {
    setWatchlistSearchQuery(q);
    if (q.trim().length < 2) {
      setWatchlistSearchResults([]);
      return;
    }
    
    if (watchlistSearchTimeoutRef.current) {
      clearTimeout(watchlistSearchTimeoutRef.current);
    }
    
    watchlistSearchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await searchMulti(q);
        const moviesOnly = res.filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv');
        setWatchlistSearchResults(moviesOnly.slice(0, 5));
      } catch (_) {}
    }, 400);
  };

  // Add Movie to Watchlist
  const handleAddMovieToWatchlist = async (movie: any) => {
    if (!selectedWatchlist) return;
    try {
      const moviePayload = {
        id: movie.id.toString(),
        title: movie.title || movie.name,
        poster_path: getImageUrl(movie.poster_path) || '',
        type: (movie.media_type || (movie.title ? 'movie' : 'tv')) as 'movie' | 'tv'
      };
      await FriendsService.addMovieToWatchlist(selectedWatchlist.id, moviePayload, selectedProfile);
      // Refresh current list snap
      const updatedWatchlists = await new Promise<CollaborativeWatchlist[]>((resolve) => {
        const unsub = FriendsService.subscribeToCollaborativeWatchlists((data) => {
          unsub();
          resolve(data);
        });
      });
      const updated = updatedWatchlists.find(l => l.id === selectedWatchlist.id);
      if (updated) setSelectedWatchlist(updated);
      setWatchlistSearchQuery('');
      setWatchlistSearchResults([]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Error', 'Could not add title');
    }
  };

  // Vote on movie
  const handleVote = async (movieId: string, voteType: 'up' | 'down') => {
    if (!selectedWatchlist) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const currentUid = selectedProfile?.id || 'guest';
      const movie = selectedWatchlist.movies[movieId];
      const currentVote = movie?.votes?.[currentUid];
      
      const newVote = currentVote === voteType ? null : voteType;
      await FriendsService.voteOnMovie(selectedWatchlist.id, movieId, newVote);
      
      // Update local state copy to avoid list reset flash
      const updatedWatchlists = await new Promise<CollaborativeWatchlist[]>((resolve) => {
        const unsub = FriendsService.subscribeToCollaborativeWatchlists((data) => {
          unsub();
          resolve(data);
        });
      });
      const updated = updatedWatchlists.find(l => l.id === selectedWatchlist.id);
      if (updated) setSelectedWatchlist(updated);
    } catch (_) {}
  };

  // Render Inbox/Shared card
  const renderInboxCard = ({ item }: { item: SharedMovie }) => {
    return (
      <Pressable
        style={styles.inboxCardPremium}
        onPress={() => router.push({ pathname: '/movie/[id]', params: { id: item.tmdbId, type: item.type } })}
      >
        <ExpoImage source={{ uri: item.posterPath }} style={styles.inboxPoster} />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.95)']}
          locations={[0, 0.45, 1]}
          style={styles.inboxGrad}
        />
        <View style={styles.cardEdgeHighlight} pointerEvents="none" />
        <View style={styles.inboxDetails}>
          <View style={styles.senderContainerPremium}>
            <ExpoImage source={AVATAR_MAP[item.senderAvatar] || AVATAR_MAP.avatar1} style={styles.senderAvatarMini} />
            <Text numberOfLines={1} style={styles.senderName}>{item.senderName}</Text>
          </View>
          <Text numberOfLines={1} style={styles.inboxTitle}>{item.title}</Text>
        </View>
      </Pressable>
    );
  };

  // Render Watch Party Card
  const renderWatchPartyCard = ({ item }: { item: WatchParty }) => {
    return (
      <View style={styles.partyCardPremiumContainer}>
        <LiquidGlassPill borderRadius={18} style={styles.partyCardPremium}>
          <LinearGradient
            colors={['rgba(229, 9, 20, 0.12)', 'transparent']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.partyCardHeader}>
            <View style={styles.partyHost}>
              <ExpoImage source={AVATAR_MAP[item.hostAvatar] || AVATAR_MAP.avatar1} style={styles.partyHostAvatar} />
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.partyHostName} numberOfLines={1}>{item.hostName}</Text>
                <Text style={styles.partyStatusTextPremium}>🟢 Live Party</Text>
              </View>
            </View>
            <Pressable style={styles.joinBtnLivePremium} onPress={() => handleJoinParty(item)}>
              <LinearGradient
                colors={['#E50914', '#F43F5E']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.joinBtnLiveGradient}
              >
                <Ionicons name="play" size={14} color="white" />
                <Text style={styles.joinBtnText}>Join</Text>
              </LinearGradient>
            </Pressable>
          </View>

          <View style={{ flexGrow: 1, justifyContent: 'center', marginVertical: 4 }}>
            <Text style={styles.partyMovieTitlePremium} numberOfLines={2}>{item.title}</Text>
            {item.seasonNum && (
              <Text style={styles.partyEpisodeText}>Season {item.seasonNum} Episode {item.episodeNum}</Text>
            )}
          </View>
        </LiquidGlassPill>
      </View>
    );
  };

  // Animated style values
  const headerBlurStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 80], [0, 1], 'clamp');
    return { opacity };
  });

  const auraOpacityStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 300], [0.68, 0], 'clamp');
    return { opacity };
  });

  const heroParallaxStyle = useAnimatedStyle(() => {
    const translateY = interpolate(scrollY.value, [0, 400], [0, -60], 'clamp');
    const opacity = interpolate(scrollY.value, [0, 350], [1, 0.35], 'clamp');
    return { transform: [{ translateY }], opacity };
  });

  const animatedAmbientBackground = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      scrollY.value,
      [0, 240, 480],
      [featuredThemeColors[0], 'rgba(0,0,0,0.97)', COLORS.background]
    );
    return { backgroundColor };
  });

  return (
    <Animated.View style={[styles.container, animatedAmbientBackground]}>
      {/* Immersive ambient blurred aura bleed behind scrolling feed */}
      {featuredBackdrop && (
        <Animated.View style={[StyleSheet.absoluteFill, auraOpacityStyle, { zIndex: -1 }]}>
          <ExpoImage
            source={{ uri: featuredBackdrop }}
            style={[StyleSheet.absoluteFill, { width: undefined, height: height * 0.95 }]}
            contentFit="cover"
            blurRadius={65}
          />
          <LinearGradient
            colors={['rgba(10,10,10,0.06)', 'rgba(10,10,10,0.65)', 'rgba(10,10,10,0.96)', COLORS.background]}
            locations={[0, 0.45, 0.75, 1.0]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}

      {/* Absolute Cinematic Transparent Blurred Header */}
      <View style={[styles.absoluteHeaderContainer, { paddingTop: insets.top }]}>
        <LinearGradient
          colors={['rgba(0,0,0,0.72)', 'rgba(0,0,0,0.22)', 'transparent']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Real-time blurring backdrop appearing on scroll */}
        <Animated.View style={[StyleSheet.absoluteFill, headerBlurStyle]}>
          <BlurView intensity={75} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' }} />
        </Animated.View>

        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>Social Hub</Text>
              <Text style={styles.headerSubtitle}>Connect and watch with friends</Text>
            </View>
            <View style={styles.headerRight}>
              {/* Messages button */}
              <Pressable
                style={styles.headerIconBtn}
                onPress={() => router.push('/messaging')}
              >
                <Ionicons name="chatbubbles-outline" size={20} color="white" />
              </Pressable>

              {/* Notification badge */}
              <Pressable
                style={styles.headerIconBtn}
                onPress={() => {
                  if (inbox.length > 0) {
                    Alert.alert('Recommendations', `You have ${inbox.length} recommendations from friends! Scroll down to 'Recommended for You' to watch.`);
                  } else {
                    Alert.alert('No Recommendations', 'Your friends have not shared any recommendations yet.');
                  }
                }}
              >
                <Ionicons name="notifications-outline" size={20} color="white" />
                {inbox.length > 0 && (
                  <View style={styles.badgeContainer}>
                    <Text style={styles.badgeText}>{inbox.length}</Text>
                  </View>
                )}
              </Pressable>

              {/* Profile icon */}
              <View style={styles.profileContainer}>
                <ExpoImage
                  source={AVATAR_MAP[selectedProfile?.avatarId] || AVATAR_MAP.avatar1}
                  style={styles.profileAvatar}
                />
                <Text style={styles.profileName} numberOfLines={1}>
                  {selectedProfile?.name || 'Guest'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Main scrolling feed */}
      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Cinematic Parallax Social Hero Card */}
        <Animated.View style={heroParallaxStyle}>
          <SocialHeroCard
            featured={featuredItem}
            backdropUrl={featuredBackdrop}
            width={width}
            onJoin={handleJoinScheduledParty}
            onOpenWatchlist={(list) => setSelectedWatchlist(list)}
            onShareCode={() => Alert.alert('Share Friend Code', 'Your friend code is: NET-4829')}
          />
        </Animated.View>

        {/* Content Wrapper */}
        <View style={styles.sectionsWrapper}>
          {/* Friends presence row */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionTitleRow}>
              <LinearGradient
                colors={['#E50914', '#EC4899']}
                style={styles.sectionAccentBar}
              />
              <Text style={styles.sectionTitle}>Friends</Text>
            </View>
            {friends.length > 0 ? (
              <FlatList
                data={friends}
                renderItem={({ item }) => (
                  <FriendPresenceBubble
                    item={item}
                    onPress={() => handleFriendPress(item)}
                    onWatchPress={() => {
                      if (item.watchingTmdbId) {
                        router.push({
                          pathname: '/movie/[id]',
                          params: { id: item.watchingTmdbId, type: 'movie' }
                        });
                      }
                    }}
                  />
                )}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.uid}
                contentContainerStyle={styles.friendsList}
              />
            ) : (
              <Animated.View entering={FadeInDown.duration(500).delay(100)}>
                <View style={styles.emptyStateCard}>
                  <LinearGradient
                    colors={['rgba(229, 9, 20, 0.15)', 'rgba(139, 92, 246, 0.08)', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <LinearGradient
                    colors={['#E50914', '#8B5CF6']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.emptyStateIconGradient}
                  >
                    <Ionicons name="people-outline" size={28} color="white" />
                  </LinearGradient>
                  <Text style={styles.emptyStateTitle}>No friends yet</Text>
                  <Text style={styles.emptyStateSub}>Share your friend code to connect and watch together!</Text>
                  <Pressable onPress={() => Alert.alert('Share Code', 'Your friend code is: NET-4829')}>
                    <LinearGradient
                      colors={['#E50914', '#EC4899']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.emptyStateBtnGradient}
                    >
                      <Text style={styles.emptyStateBtnText}>Share Code</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              </Animated.View>
            )}
          </View>

          {/* Live Friend Buzz & Reaction Feed Row */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionTitleRow}>
              <LinearGradient
                colors={['#FBBF24', '#F59E0B']}
                style={styles.sectionAccentBar}
              />
              <Text style={styles.sectionTitle}>Live Friend Buzz</Text>
            </View>
            <FlatList
              data={friendBuzzList}
              renderItem={({ item }) => {
                const accentColor = item.action === 'reacted' ? '#FBBF24' : (item.action === 'reviewed' ? '#10B981' : '#3B82F6');
                return (
                  <Pressable
                    style={styles.buzzCardPremiumContainer}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push({
                        pathname: '/movie/[id]',
                        params: { id: item.tmdbId, type: item.mediaType }
                      });
                    }}
                  >
                    <LiquidGlassPill borderRadius={16} style={styles.buzzCardPremium}>
                      <LinearGradient
                        colors={['rgba(255, 255, 255, 0.05)', 'transparent']}
                        style={StyleSheet.absoluteFill}
                      />
                      {/* Colored accent strip on left edge */}
                      <View style={[styles.buzzAccentStrip, { backgroundColor: accentColor }]} />
                      <View style={styles.buzzHeader}>
                        <ExpoImage
                          source={AVATAR_MAP[item.avatarId] || AVATAR_MAP.avatar1}
                          style={styles.buzzAvatar}
                        />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.buzzName} numberOfLines={1}>{item.friendName}</Text>
                          <Text style={styles.buzzAction} numberOfLines={1}>
                            {item.action === 'reacted' ? `Reacted ${item.emoji}` : (item.action === 'reviewed' ? `Reviewed ⭐ ${item.rating}` : `Shared ${item.emoji}`)}
                          </Text>
                        </View>
                        <Text style={styles.buzzEmoji}>{item.emoji}</Text>
                        <Text style={styles.buzzTime}>{item.time}</Text>
                      </View>
                      
                      <View style={styles.buzzCommentQuote}>
                        <View style={[styles.buzzQuoteBorder, { backgroundColor: accentColor }]} />
                        <Text style={styles.buzzComment} numberOfLines={2}>
                          "{item.comment}"
                        </Text>
                      </View>
                      
                      <View style={styles.buzzMovieFooter}>
                        <Ionicons name="film-outline" size={12} color="#A3A3A3" />
                        <Text style={styles.buzzMovieTitle} numberOfLines={1}>
                          {item.movieTitle}
                        </Text>
                      </View>
                    </LiquidGlassPill>
                  </Pressable>
                );
              }}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.friendsList}
            />
          </View>

          {/* Scheduled watch parties */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleRow}>
                <LinearGradient
                  colors={['#8B5CF6', '#EC4899']}
                  style={styles.sectionAccentBar}
                />
                <Text style={styles.sectionTitle}>Scheduled Watch Parties</Text>
              </View>
              <Pressable style={styles.createWatchlistBtn} onPress={() => setShowScheduleModal(true)}>
                <Ionicons name="calendar-outline" size={16} color="white" />
                <Text style={styles.createWatchlistText}>Schedule</Text>
              </Pressable>
            </View>
            {scheduledParties.length > 0 ? (
              <FlatList
                data={scheduledParties}
                renderItem={({ item }) => (
                  <ScheduledPartyCard
                    item={item}
                    currentUid={auth.currentUser?.uid || 'guest'}
                    onJoin={handleJoinScheduledParty}
                  />
                )}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.horizontalList}
              />
            ) : (
              <View style={styles.emptyScheduledContainer}>
                <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
                <Ionicons name="calendar-outline" size={28} color="#6B7280" style={{ marginBottom: 4 }} />
                <Text style={styles.emptyScheduledText}>No upcoming watch parties</Text>
                <Pressable style={styles.scheduleNowBtn} onPress={() => setShowScheduleModal(true)}>
                  <Text style={styles.scheduleNowBtnText}>Schedule Now</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Live Watch Parties */}
          {parties.length > 0 && (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionTitleRow}>
                <LinearGradient
                  colors={['#E50914', '#F43F5E']}
                  style={styles.sectionAccentBar}
                />
                <Text style={styles.sectionTitle}>Active Watch Parties</Text>
              </View>
              <FlatList
                data={parties}
                renderItem={renderWatchPartyCard}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.horizontalList}
              />
            </View>
          )}

          {/* Recommended for You Shared Inbox */}
          {inbox.length > 0 && (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionTitleRow}>
                <LinearGradient
                  colors={['#EC4899', '#F43F5E']}
                  style={styles.sectionAccentBar}
                />
                <Text style={styles.sectionTitle}>Recommended for You</Text>
              </View>
              <FlatList
                data={inbox}
                renderItem={renderInboxCard}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.horizontalList}
              />
            </View>
          )}

          {/* Binge Lists */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleRow}>
                <LinearGradient
                  colors={['#3B82F6', '#10B981']}
                  style={styles.sectionAccentBar}
                />
                <Text style={styles.sectionTitle}>Binge Lists</Text>
              </View>
              <Pressable style={styles.createWatchlistBtn} onPress={() => setShowCreateWatchlist(true)}>
                <Ionicons name="add" size={16} color="white" />
                <Text style={styles.createWatchlistText}>New List</Text>
              </Pressable>
            </View>

            {watchlists.length > 0 ? (
              watchlists.map((list) => (
                <BingeListRow
                  key={list.id}
                  list={list}
                  onPress={() => setSelectedWatchlist(list)}
                />
              ))
            ) : (
              <Animated.View entering={FadeInDown.duration(500).delay(200)}>
                <Pressable style={styles.emptyStateCard} onPress={() => setShowCreateWatchlist(true)}>
                  <LinearGradient
                    colors={['rgba(59, 130, 246, 0.12)', 'rgba(16, 185, 129, 0.06)', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <LinearGradient
                    colors={['#3B82F6', '#10B981']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.emptyStateIconGradient}
                  >
                    <Ionicons name="film-outline" size={28} color="white" />
                  </LinearGradient>
                  <Text style={styles.emptyStateTitle}>Create your first Binge List</Text>
                  <Text style={styles.emptyStateSub}>Add movies with friends and vote on what to watch next</Text>
                </Pressable>
              </Animated.View>
            )}
          </View>
        </View>
      </Animated.ScrollView>

      <Modal
        visible={selectedFriend !== null && tasteMatch !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSelectedFriend(null);
          setTasteMatch(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => Keyboard.dismiss()}>
            <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
          </Pressable>
          {selectedFriend && tasteMatch && (
            <Animated.View entering={FadeInDown.duration(400)} style={styles.tasteCardContainerPremium}>
              <View style={styles.tasteCardHeader}>
                <Text style={styles.tasteTitle}>Taste Match Matrix</Text>
                <Pressable
                  style={styles.closeBtn}
                  onPress={() => {
                    setSelectedFriend(null);
                    setTasteMatch(null);
                  }}
                >
                  <Ionicons name="close" size={24} color="white" />
                </Pressable>
              </View>

              {/* Compatibility circular indicator */}
              <View style={styles.matchCircleContainer}>
                <LinearGradient
                  colors={['#E50914', '#EC4899', '#3B82F6']}
                  style={styles.matchCircleGradient}
                >
                  <View style={styles.matchCircleInner}>
                    <Text style={styles.matchPercentText}>{tasteMatch.score}%</Text>
                    <Text style={styles.matchMatchLabel}>Compatibility</Text>
                  </View>
                </LinearGradient>
              </View>

              <Text style={styles.tasteDescription}>
                You and {selectedFriend.name.split(' ')[0]} share a love for{' '}
                {tasteMatch.matchingGenres.join(' & ')}!
              </Text>

              {/* Presence Status Banner */}
              <View style={styles.sheetPresenceBanner}>
                <Ionicons
                  name={selectedFriend.status === 'watching' ? 'play-circle' : 'ellipse'}
                  size={12}
                  color={selectedFriend.status === 'watching' ? '#10B981' : (selectedFriend.status === 'online' ? '#FBBF24' : '#9CA3AF')}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.sheetPresenceText}>
                  {selectedFriend.status === 'watching'
                    ? `Watching: ${selectedFriend.watchingTitle || 'Streaming live...'}`
                    : (selectedFriend.status === 'online' ? 'Online Now' : 'Offline')}
                </Text>
              </View>

              {/* Interactive Friend Action Bar */}
              <View style={styles.friendActionsRowSheet}>
                <Pressable
                  style={styles.sheetActionBtn}
                  onPress={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (selectedFriend) {
                      const friend = selectedFriend;
                      setSelectedFriend(null);
                      setTasteMatch(null);
                      const resolvedChatId = await MessagingService.getOrCreateChatRoom(friend, selectedProfile);
                      router.push({
                        pathname: '/messaging/chat/[id]',
                        params: { id: resolvedChatId, name: friend.name, friendId: friend.uid }
                      });
                    }
                  }}
                >
                  <LinearGradient
                    colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']}
                    style={styles.sheetActionGradient}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color="white" />
                    <Text style={styles.sheetActionText}>Direct Chat</Text>
                  </LinearGradient>
                </Pressable>

                <Pressable
                  style={styles.sheetActionBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowQuickRecommendRow(prev => !prev);
                  }}
                >
                  <LinearGradient
                    colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']}
                    style={[styles.sheetActionGradient, showQuickRecommendRow && styles.sheetActionGradientActive]}
                  >
                    <Ionicons name="share-social-outline" size={18} color={showQuickRecommendRow ? '#EC4899' : 'white'} />
                    <Text style={[styles.sheetActionText, showQuickRecommendRow && { color: '#EC4899' }]}>Recommend</Text>
                  </LinearGradient>
                </Pressable>

                <Pressable
                  style={styles.sheetActionBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedMembers([selectedFriend.uid]);
                    setSelectedFriend(null);
                    setTasteMatch(null);
                    setShowCreateWatchlist(true);
                  }}
                >
                  <LinearGradient
                    colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']}
                    style={styles.sheetActionGradient}
                  >
                    <Ionicons name="film-outline" size={18} color="white" />
                    <Text style={styles.sheetActionText}>Binge Invite</Text>
                  </LinearGradient>
                </Pressable>
              </View>

              {/* Expandable Recommend Panel */}
              {showQuickRecommendRow && (
                <Animated.View entering={FadeInDown.duration(300)} style={styles.quickRecPanel}>
                  <Text style={styles.quickRecTitle}>Instantly Suggest to {selectedFriend.name.split(' ')[0]}:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRecScroll}>
                    {[
                      {
                        id: '119051',
                        title: 'Wednesday',
                        poster_path: 'https://image.tmdb.org/t/p/w500/zq25078V765XJ7fC7465U1rQn7D.jpg',
                        type: 'tv' as const
                      },
                      {
                        id: '66732',
                        title: 'Stranger Things',
                        poster_path: 'https://image.tmdb.org/t/p/w500/49WJfeN0mHMqj9rj675XqT6Th7t.jpg',
                        type: 'tv' as const
                      },
                      {
                        id: '93405',
                        title: 'Squid Game',
                        poster_path: 'https://image.tmdb.org/t/p/w500/dNu7wM59FhWwV47XoA9sXqT44m.jpg',
                        type: 'tv' as const
                      },
                      {
                        id: '76600',
                        title: 'Avatar 2',
                        poster_path: 'https://image.tmdb.org/t/p/w500/t6HI23jC36UIehjHkqdlfun4Z12.jpg',
                        type: 'movie' as const
                      }
                    ].map((item, idx) => (
                      <Pressable
                        key={idx}
                        style={styles.quickRecItemCard}
                        onPress={() => handleRecommendMovie(item)}
                      >
                        <ExpoImage source={{ uri: item.poster_path }} style={styles.quickRecPosterImage} />
                        <Text style={styles.quickRecItemTitle} numberOfLines={1}>{item.title}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </Animated.View>
              )}

              {/* Shared Watchlist match popup scanning result */}
              {sharedWatchlistMatch && (
                <View style={styles.sharedMatchCard}>
                  <LinearGradient
                    colors={['rgba(59, 130, 246, 0.15)', 'transparent']}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  <LinearGradient
                    colors={['#3B82F6', '#10B981']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.sharedMatchBadge}
                  >
                    <Text style={styles.sharedMatchBadgeText}>⭐ PERFECT WATCHLIST MATCH</Text>
                  </LinearGradient>
                  <Text style={styles.sharedMatchTitle}>{sharedWatchlistMatch.title}</Text>
                  <Text style={styles.sharedMatchSub}>
                    Both you and {selectedFriend.name.split(' ')[0]} want to watch this! Start a watch party to stream together now.
                  </Text>
                  <Pressable
                    style={styles.sharedMatchActionBtn}
                    onPress={() => {
                      setSelectedFriend(null);
                      setTasteMatch(null);
                      router.push({
                        pathname: '/movie/[id]',
                        params: {
                          id: sharedWatchlistMatch.tmdbId,
                          type: sharedWatchlistMatch.mediaType,
                          autoPlay: 'true'
                        }
                      });
                    }}
                  >
                    <LinearGradient
                      colors={['#3B82F6', '#10B981']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.sharedMatchActionBtnGradient}
                    >
                      <Ionicons name="play-circle" size={16} color="white" />
                      <Text style={styles.sharedMatchActionBtnText}>Start Watch Party</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              )}

              {/* Genre Affinity Match Sliders */}
              <View style={styles.genreGrid}>
                <Text style={styles.genreMatrixLabel}>Genre Match Matrix</Text>
                {genreAffinities.map((genre) => (
                  <View key={genre.name} style={{ marginBottom: 12 }}>
                    <View style={styles.genreHeaderRow}>
                      <Text style={styles.genreLabelText}>{genre.name}</Text>
                      <Text style={styles.genreDiffText}>
                        {Math.abs(genre.user - genre.friend) <= 15 ? '🔥 Strong Match' : '👍 Soft Match'}
                      </Text>
                    </View>
                    <View style={styles.genreSlidersContainer}>
                      <Text style={styles.genreSliderLabel}>You</Text>
                      <View style={styles.genreSliderTrack}>
                        <LinearGradient
                          colors={genre.colors}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={[styles.genreSliderFill, { width: `${genre.user}%` }]}
                        />
                      </View>
                      <Text style={styles.genreSliderPercent}>{genre.user}%</Text>
                    </View>
                    <View style={styles.genreSlidersContainer}>
                      <Text style={styles.genreSliderLabel}>{selectedFriend.name.split(' ')[0]}</Text>
                      <View style={styles.genreSliderTrack}>
                        <LinearGradient
                          colors={genre.colors}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={[styles.genreSliderFill, { width: `${genre.friend}%` }]}
                        />
                      </View>
                      <Text style={styles.genreSliderPercent}>{genre.friend}%</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Taste recommendations */}
              {tasteMatch.recommendedTitles.length > 0 && (
                <View style={[styles.matchRecommendations, { marginTop: 24 }]}>
                  <Text style={styles.recsTitle}>We Recommend watching:</Text>
                  {tasteMatch.recommendedTitles.map((title) => (
                    <Pressable
                      key={title.id}
                      style={styles.recMovieRow}
                      onPress={() => {
                        setSelectedFriend(null);
                        setTasteMatch(null);
                        router.push({
                          pathname: '/movie/[id]',
                          params: { id: title.id, type: title.media_type }
                        });
                      }}
                    >
                      <ExpoImage
                        source={{ uri: getImageUrl(title.poster_path) }}
                        style={styles.recPoster}
                      />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.recTitleText}>{title.title || title.name}</Text>
                        <Text style={styles.recOverviewText} numberOfLines={2}>
                          {title.overview}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="white" />
                    </Pressable>
                  ))}
                </View>
              )}
            </Animated.View>
          )}
        </View>
      </Modal>

      {/* MODAL 2: Create Watchlist */}
      <Modal
        visible={showCreateWatchlist}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateWatchlist(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => Keyboard.dismiss()}>
            <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
          </Pressable>
          <View style={styles.createWatchlistContainer}>
            <View style={styles.tasteCardHeader}>
              <Text style={styles.tasteTitle}>Create Binge List</Text>
              <Pressable style={styles.closeBtn} onPress={() => setShowCreateWatchlist(false)}>
                <Ionicons name="close" size={24} color="white" />
              </Pressable>
            </View>

            <TextInput
              placeholder="List Name (e.g. Scary Movie Night)"
              placeholderTextColor="#A3A3A3"
              style={styles.watchlistInput}
              value={newWatchlistName}
              onChangeText={setNewWatchlistName}
            />

            <Text style={styles.selectFriendsLabel}>Add Friends to List:</Text>
            <ScrollView style={styles.friendsSelectScroll}>
              {friends.map((friend) => {
                const isSelected = selectedMembers.includes(friend.uid);
                return (
                  <Pressable
                    key={friend.uid}
                    style={styles.friendSelectRow}
                    onPress={() => toggleMemberSelection(friend.uid)}
                  >
                    <ExpoImage source={AVATAR_MAP[friend.avatarId] || AVATAR_MAP.avatar1} style={styles.friendSelectAvatar} />
                    <Text style={styles.friendSelectName}>{friend.name}</Text>
                    <Ionicons
                      name={isSelected ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={isSelected ? COLORS.primary : 'white'}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable style={styles.submitBtn} onPress={handleCreateWatchlist}>
              <Text style={styles.submitBtnText}>Create List</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* MODAL 3: Watchlist Details & Voting */}
      <Modal
        visible={selectedWatchlist !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedWatchlist(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => Keyboard.dismiss()}>
            <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
          </Pressable>
          {selectedWatchlist && (
            <View style={styles.watchlistDetailContainer}>
              <View style={styles.tasteCardHeader}>
                <View>
                  <Text style={styles.tasteTitle}>{selectedWatchlist.name}</Text>
                  <Text style={styles.watchlistRowCreator}>
                    Shared Binge List • {Object.keys(selectedWatchlist.movies || {}).length} titles
                  </Text>
                </View>
                <Pressable style={styles.closeBtn} onPress={() => setSelectedWatchlist(null)}>
                  <Ionicons name="close" size={24} color="white" />
                </Pressable>
              </View>

              {/* Add Movie search bar */}
              <View style={styles.searchSection}>
                <View style={styles.searchBarContainer}>
                  <Ionicons name="search" size={16} color="#A3A3A3" />
                  <TextInput
                    placeholder="Search movie to add..."
                    placeholderTextColor="#A3A3A3"
                    value={watchlistSearchQuery}
                    onChangeText={searchMoviesForWatchlist}
                    style={styles.searchInput}
                  />
                </View>

                {watchlistSearchResults.length > 0 && (
                  <View style={styles.searchResultsDropdown}>
                    {watchlistSearchResults.map((result) => (
                      <Pressable
                        key={result.id}
                        style={styles.searchResultRow}
                        onPress={() => handleAddMovieToWatchlist(result)}
                      >
                        <ExpoImage
                          source={{ uri: getImageUrl(result.poster_path) }}
                          style={styles.searchResultPoster}
                        />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.searchResultTitle} numberOfLines={1}>
                            {result.title || result.name}
                          </Text>
                        </View>
                        <Ionicons name="add" size={20} color="white" />
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              {/* Watchlist items */}
              {/* Binge Decider Button */}
              {Object.keys(selectedWatchlist.movies || {}).length >= 2 && (
                <Pressable
                  style={styles.decideForUsBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setShowWheelOverlay(true);
                  }}
                >
                  <LinearGradient
                    colors={['#8B5CF6', '#EC4899']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.decideForUsBtnGradient}
                  >
                    <Ionicons name="color-wand-outline" size={18} color="white" />
                    <Text style={styles.decideForUsBtnText}>Decide For Us (Spin Wheel)</Text>
                  </LinearGradient>
                </Pressable>
              )}

              {/* Watchlist items */}
              <ScrollView style={styles.watchlistScroll}>
                {(() => {
                  const sortedMovies = Object.values(selectedWatchlist.movies || {}).sort((a, b) => b.voteCount - a.voteCount);
                  const totalVotes = sortedMovies.reduce((sum, m) => sum + Math.max(0, m.voteCount), 0);
                  const maxVotes = sortedMovies.length > 0 ? Math.max(0, sortedMovies[0].voteCount) : 0;
                  
                  return sortedMovies.map((movie) => {
                    const currentUid = selectedProfile?.id || 'guest';
                    const currentVote = movie.votes?.[currentUid];
                    const isTopVoted = movie.voteCount > 0 && movie.voteCount === maxVotes;
                    const votePercentage = totalVotes > 0 ? Math.round((Math.max(0, movie.voteCount) / totalVotes) * 100) : 0;

                    return (
                      <View
                        key={movie.tmdbId}
                        style={[
                          styles.watchlistMovieItem,
                          isTopVoted && styles.watchlistMovieItemLeader
                        ]}
                      >
                        <Pressable
                          style={styles.watchlistMovieInfo}
                          onPress={() => {
                            setSelectedWatchlist(null);
                            router.push({
                              pathname: '/movie/[id]',
                              params: { id: movie.tmdbId, type: movie.type }
                            });
                          }}
                        >
                          <ExpoImage source={{ uri: movie.posterPath }} style={styles.watchlistPoster} />
                          <View style={styles.watchlistMovieText}>
                            <Text style={styles.watchlistMovieTitle} numberOfLines={1}>
                              {movie.title}
                            </Text>
                            <Text style={styles.watchlistMovieAddedBy}>
                              Added by {movie.addedByName}
                            </Text>
                            
                            {/* Battle Arena Progress Bar */}
                            <View style={styles.battleArenaProgressContainer}>
                              <View style={styles.battleArenaProgressTrack}>
                                <LinearGradient
                                  colors={isTopVoted ? ['#FBBF24', '#F59E0B'] : ['#3B82F6', '#EC4899']}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 1, y: 0 }}
                                  style={[styles.battleArenaProgressFill, { width: `${Math.max(8, votePercentage)}%` }]}
                                />
                              </View>
                              <Text style={styles.battleArenaPercentageText}>
                                {votePercentage}% {isTopVoted ? '🔥' : ''}
                              </Text>
                            </View>
                          </View>
                        </Pressable>

                        {/* Voting Area */}
                        <View style={styles.votingContainer}>
                          <Pressable
                            style={[
                              styles.voteBtn,
                              currentVote === 'up' && styles.voteBtnUp
                            ]}
                            onPress={() => handleVote(movie.tmdbId, 'up')}
                          >
                            <Ionicons
                              name="thumbs-up"
                              size={16}
                              color={currentVote === 'up' ? 'white' : '#A3A3A3'}
                            />
                          </Pressable>
                          <Text style={styles.voteCountText}>{movie.voteCount}</Text>
                          <Pressable
                            style={[
                              styles.voteBtn,
                              currentVote === 'down' && styles.voteBtnDown
                            ]}
                            onPress={() => handleVote(movie.tmdbId, 'down')}
                          >
                            <Ionicons
                              name="thumbs-down"
                              size={16}
                              color={currentVote === 'down' ? 'white' : '#A3A3A3'}
                            />
                          </Pressable>
                        </View>
                      </View>
                    );
                  });
                })()}
              </ScrollView>

              {/* Decider Wheel Overlay */}
              {showWheelOverlay && (
                <Animated.View
                  entering={FadeIn}
                  exiting={FadeOut}
                  style={styles.wheelOverlayContainer}
                >
                  <BlurView intensity={95} tint="dark" style={StyleSheet.absoluteFill} />
                  
                  <View style={styles.wheelHeader}>
                    <Text style={styles.wheelHeaderTitle}>Tonight's Decider</Text>
                    <Text style={styles.wheelHeaderSub}>Let fate pick from your Binge List!</Text>
                  </View>

                  <View style={styles.wheelWrapperOuter}>
                    <View style={styles.wheelPointerContainer}>
                      <Ionicons name="caret-down" size={32} color="#EC4899" />
                    </View>

                    <Animated.View style={[styles.wheelCircle, wheelAnimatedStyle]}>
                      {Object.values(selectedWatchlist.movies || {}).map((movie, idx, arr) => {
                        const N = arr.length;
                        const angleStep = 360 / N;
                        const angle = idx * angleStep;

                        return (
                          <View
                            key={movie.tmdbId}
                            style={[
                              styles.wheelSegment,
                              {
                                transform: [
                                  { rotate: `${angle}deg` },
                                  { translateY: -85 }
                                ]
                              }
                            ]}
                          >
                            <ExpoImage
                              source={{ uri: movie.posterPath }}
                              style={styles.wheelSegmentPoster}
                            />
                            <Text numberOfLines={1} style={styles.wheelSegmentText}>
                              {movie.title}
                            </Text>
                          </View>
                        );
                      })}
                    </Animated.View>

                    <View style={styles.wheelCenterPeg}>
                      <LinearGradient
                        colors={['#EC4899', '#8B5CF6']}
                        style={styles.wheelCenterPegGradient}
                      >
                        <Ionicons name="flash" size={14} color="white" />
                      </LinearGradient>
                    </View>
                  </View>

                  <View style={styles.wheelActionsContainer}>
                    <Pressable
                      style={[styles.spinBtn, spinning && styles.spinBtnDisabled]}
                      onPress={handleSpinWheel}
                      disabled={spinning}
                    >
                      <LinearGradient
                        colors={['#8B5CF6', '#EC4899']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.spinBtnGradient}
                      >
                        <Text style={styles.spinBtnText}>
                          {spinning ? 'SPINNING...' : 'SPIN THE WHEEL'}
                        </Text>
                      </LinearGradient>
                    </Pressable>

                    <Pressable
                      style={styles.cancelWheelBtn}
                      onPress={() => {
                        if (!spinning) setShowWheelOverlay(false);
                      }}
                    >
                      <Text style={styles.cancelWheelBtnText}>Cancel</Text>
                    </Pressable>
                  </View>
                </Animated.View>
              )}

              {/* Winning Victory Celebration Overlay */}
              {showWinningOverlay && winningMovie && (
                <Animated.View
                  entering={FadeInDown}
                  style={styles.victoryOverlayContainer}
                >
                  <BlurView intensity={98} tint="dark" style={StyleSheet.absoluteFill} />
                  
                  <View style={styles.victoryCard}>
                    <Text style={styles.victorySub}>🎉 Tonight's Selection 🎉</Text>
                    <Text style={styles.victoryTitle}>{winningMovie.title}</Text>
                    
                    <View style={styles.victoryPosterContainer}>
                      <ExpoImage
                        source={{ uri: winningMovie.posterPath }}
                        style={styles.victoryPoster}
                      />
                      <LinearGradient
                        colors={['transparent', 'rgba(0,0,0,0.8)']}
                        style={StyleSheet.absoluteFill}
                      />
                    </View>

                    <Text style={styles.victoryDesc}>
                      The wheel has spoken! Grab your popcorn and enjoy the show.
                    </Text>

                    <Pressable
                      style={styles.victoryActionBtn}
                      onPress={() => {
                        setShowWinningOverlay(false);
                        setShowWheelOverlay(false);
                        setSelectedWatchlist(null);
                        router.push({
                          pathname: '/movie/[id]',
                          params: { id: winningMovie.tmdbId, type: winningMovie.type, autoPlay: 'true' }
                        });
                      }}
                    >
                      <LinearGradient
                        colors={['#E50914', '#F43F5E']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.victoryActionGradient}
                      >
                        <Ionicons name="play" size={16} color="white" />
                        <Text style={styles.victoryActionText}>Start Watch Party</Text>
                      </LinearGradient>
                    </Pressable>

                    <Pressable
                      style={styles.victoryCloseBtn}
                      onPress={() => {
                        setShowWinningOverlay(false);
                        wheelRotation.value = 0;
                      }}
                    >
                      <Text style={styles.victoryCloseText}>Spin Again</Text>
                    </Pressable>
                  </View>
                </Animated.View>
              )}
            </View>
          )}
        </View>
      </Modal>

      {/* MODAL 4: Schedule Watch Party */}
      <Modal
        visible={showScheduleModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowScheduleModal(false);
          setSelectedScheduleMovie(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => Keyboard.dismiss()}>
            <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
          </Pressable>
          <View style={styles.createWatchlistContainer}>
            <View style={styles.tasteCardHeader}>
              <Text style={styles.tasteTitle}>Schedule Watch Party</Text>
              <Pressable style={styles.closeBtn} onPress={() => {
                setShowScheduleModal(false);
                setSelectedScheduleMovie(null);
              }}>
                <Ionicons name="close" size={24} color="white" />
              </Pressable>
            </View>

            {/* Movie/Show Selection */}
            {!selectedScheduleMovie ? (
              <View style={styles.searchSection}>
                <View style={styles.searchBarContainer}>
                  <Ionicons name="search" size={16} color="#A3A3A3" />
                  <TextInput
                    placeholder="Search movie or show..."
                    placeholderTextColor="#A3A3A3"
                    value={scheduleSearchQuery}
                    onChangeText={searchMoviesForSchedule}
                    style={styles.searchInput}
                  />
                </View>

                {scheduleSearchResults.length > 0 && (
                  <View style={styles.searchResultsDropdown}>
                    {scheduleSearchResults.map((result) => (
                      <Pressable
                        key={result.id}
                        style={styles.searchResultRow}
                        onPress={() => handleSelectScheduleMovie(result)}
                      >
                        <ExpoImage
                          source={{ uri: getImageUrl(result.poster_path) }}
                          style={styles.searchResultPoster}
                        />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.searchResultTitle} numberOfLines={1}>
                            {result.title || result.name}
                          </Text>
                          <Text style={styles.searchResultType}>
                            {result.media_type === 'tv' ? 'TV Show' : 'Movie'}
                          </Text>
                        </View>
                        <Ionicons name="add" size={20} color="white" />
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.selectedMovieCard}>
                <ExpoImage source={{ uri: getImageUrl(selectedScheduleMovie.poster_path) }} style={styles.selectedMoviePoster} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.selectedMovieTitle} numberOfLines={1}>
                    {selectedScheduleMovie.title || selectedScheduleMovie.name}
                  </Text>
                  <Text style={styles.selectedMovieType}>
                    {selectedScheduleMovie.media_type === 'tv' ? 'TV Show' : 'Movie'}
                  </Text>
                </View>
                <Pressable onPress={() => setSelectedScheduleMovie(null)} style={styles.removeMovieBtn}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </Pressable>
              </View>
            )}

            {/* Date Selection */}
            <Text style={styles.selectFriendsLabel}>Select Date:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateSelectorScroll} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
              {selectableDates.map((item, idx) => {
                const isSelected = selectedDateIndex === idx;
                return (
                  <Pressable
                    key={idx}
                    style={[styles.dateSelectorBubble, isSelected && styles.dateSelectorBubbleActive]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedDateIndex(idx);
                    }}
                  >
                    <Text style={[styles.dateSelectorText, isSelected && styles.dateSelectorTextActive]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={styles.selectFriendsLabel}>Select Hour:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeSelectorScroll} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
              {hoursList.map((item) => {
                const isSelected = selectedHour === item.value;
                return (
                  <Pressable
                    key={item.value}
                    style={[styles.timeSelectorBubble, isSelected && styles.timeSelectorBubbleActive]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedHour(item.value);
                    }}
                  >
                    <Text style={[styles.timeSelectorText, isSelected && styles.timeSelectorTextActive]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Minute Selection */}
            <Text style={styles.selectFriendsLabel}>Select Minutes:</Text>
            <View style={styles.minutesContainer}>
              {[0, 15, 30, 45].map((mins) => {
                const isSelected = selectedMinute === mins;
                return (
                  <Pressable
                    key={mins}
                    style={[styles.minuteSegment, isSelected && styles.minuteSegmentActive]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedMinute(mins);
                    }}
                  >
                    <Text style={[styles.minuteSegmentText, isSelected && styles.minuteSegmentTextActive]}>
                      :{mins === 0 ? '00' : mins}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Submit Button */}
            <Pressable
              style={[styles.submitBtn, !selectedScheduleMovie && styles.submitBtnDisabled]}
              onPress={handleScheduleParty}
              disabled={!selectedScheduleMovie}
            >
              <Text style={styles.submitBtnText}>Confirm & Schedule</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollContent: {
    paddingBottom: 130,
    paddingTop: 0, // bleed to the very top under transparent header
  },
  sectionsWrapper: {
    paddingHorizontal: SPACING.md,
    marginTop: 16,
  },
  absoluteHeaderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: SPACING.md,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flex: 1,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  badgeContainer: {
    position: 'absolute',
    top: -1,
    right: -1,
    backgroundColor: '#E50914',
    borderRadius: 9,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#000',
  },
  badgeText: {
    color: 'white',
    fontSize: 9,
    fontWeight: 'bold',
  },
  profileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  profileName: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 70,
  },
  emptyStateCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    shadowColor: '#E50914',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  emptyStateIconGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyStateTitle: {
    color: 'white',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  emptyStateSub: {
    color: '#A3A3A3',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 18,
    maxWidth: 260,
    lineHeight: 18,
  },
  emptyStateBtnGradient: {
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 22,
  },
  emptyStateBtnText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    color: '#A3A3A3',
    fontSize: 12,
    marginTop: 1,
  },
  sectionContainer: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: SPACING.md,
    letterSpacing: -0.2,
    textShadowColor: 'rgba(229, 9, 20, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionAccentBar: {
    width: 3,
    height: 20,
    borderRadius: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(229, 9, 20, 0.08)',
    paddingBottom: 8,
  },
  friendsList: {
    paddingLeft: 4,
  },
  friendBubbleContainer: {
    alignItems: 'center',
    marginRight: 14,
    width: 80,
  },
  avatarGlowContainer: {
    position: 'relative',
    width: 70,
    height: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarGradientRing: {
    width: 70,
    height: 70,
    borderRadius: 35,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarGradientRingInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarShadowGlow: {
    width: 50,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginTop: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 2,
  },
  friendAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
  },
  statusIndicatorWrapper: {
    position: 'absolute',
    bottom: 1,
    right: 3,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusPulseRing: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  statusIndicator: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  friendNameText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 5,
    textAlign: 'center',
  },
  watchingText: {
    color: '#34D399',
    fontSize: 9,
    marginTop: 2,
    fontWeight: '600',
    textAlign: 'center',
  },
  horizontalList: {
    paddingLeft: 4,
  },
  inboxCardPremium: {
    width: 125,
    height: 185,
    borderRadius: 14,
    overflow: 'hidden',
    marginRight: 14,
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  inboxPoster: {
    ...StyleSheet.absoluteFillObject,
  },
  inboxGrad: {
    ...StyleSheet.absoluteFillObject,
  },
  cardEdgeHighlight: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
  },
  inboxDetails: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
  },
  senderContainerPremium: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 4,
  },
  senderAvatarMini: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  senderName: {
    color: '#D4D4D4',
    fontSize: 10,
    fontWeight: '700',
    flex: 1,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  inboxTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: -0.2,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  partyCardPremiumContainer: {
    width: 260,
    marginRight: 16,
  },
  partyCardPremium: {
    padding: 16,
    minHeight: 155,
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.15)',
  },
  partyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  partyHost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  partyHostAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  partyHostName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  partyStatusTextPremium: {
    color: '#EF4444',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  joinBtnLivePremium: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  joinBtnLiveGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 4,
  },
  joinBtnText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  partyMovieTitlePremium: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.2,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  partyEpisodeText: {
    color: '#A3A3A3',
    fontSize: 12,
    marginTop: 2,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-light' }),
  },
  createWatchlistBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 4,
  },
  createWatchlistText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  watchlistRowPremium: {
    paddingVertical: 20,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  watchlistRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  watchlistRowTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  watchlistRowCreator: {
    color: '#A3A3A3',
    fontSize: 11,
    marginTop: 3,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-light' }),
  },
  memberCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  memberCountText: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '600',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  bingeListRightSection: {
    alignItems: 'flex-end',
    gap: 8,
  },
  stackedPostersContainer: {
    position: 'relative',
    width: 70,
    height: 44,
  },
  stackedPoster: {
    position: 'absolute',
    width: 30,
    height: 44,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  bingeListBadgeChevronRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  watchlistMetaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 4,
  },
  watchlistMetaBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '800',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.md,
  },
  tasteCardContainer: {
    width: '90%',
    backgroundColor: 'rgba(26, 26, 26, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  tasteCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  tasteTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '900',
  },
  closeBtn: {
    padding: 4,
  },
  matchCircleContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    overflow: 'hidden',
    padding: 4,
    marginVertical: 10,
  },
  matchCircleGradient: {
    flex: 1,
    borderRadius: 66,
    padding: 6,
  },
  matchCircleInner: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  matchPercentText: {
    color: 'white',
    fontSize: 32,
    fontWeight: '900',
  },
  matchMatchLabel: {
    color: '#A3A3A3',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  tasteDescription: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginVertical: 14,
  },
  matchRecommendations: {
    width: '100%',
    marginTop: 10,
  },
  recsTitle: {
    color: '#A3A3A3',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
  },
  recMovieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 8,
    marginBottom: 8,
  },
  recPoster: {
    width: 44,
    height: 60,
    borderRadius: 6,
  },
  recTitleText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
  recOverviewText: {
    color: '#A3A3A3',
    fontSize: 11,
    marginTop: 2,
  },
  createWatchlistContainer: {
    width: '90%',
    backgroundColor: '#1A1A1A',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  watchlistInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    height: 48,
    color: 'white',
    paddingHorizontal: 16,
    fontSize: 14,
    marginBottom: 16,
  },
  selectFriendsLabel: {
    color: '#A3A3A3',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
  },
  friendsSelectScroll: {
    maxHeight: 180,
    marginBottom: 20,
  },
  friendSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  friendSelectAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  friendSelectName: {
    color: 'white',
    fontSize: 14,
    marginLeft: 12,
    flex: 1,
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
  },
  watchlistDetailContainer: {
    width: '92%',
    height: '80%',
    backgroundColor: '#1A1A1A',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchSection: {
    zIndex: 10,
    position: 'relative',
    marginBottom: 14,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    height: 40,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  searchInput: {
    flex: 1,
    color: 'white',
    marginLeft: 8,
    fontSize: 13,
  },
  searchResultsDropdown: {
    position: 'absolute',
    top: 45,
    left: 0,
    right: 0,
    backgroundColor: '#262626',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  searchResultPoster: {
    width: 32,
    height: 44,
    borderRadius: 4,
  },
  searchResultTitle: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  watchlistScroll: {
    flex: 1,
  },
  watchlistMovieItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.02)',
  },
  watchlistMovieInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  watchlistPoster: {
    width: 44,
    height: 60,
    borderRadius: 6,
  },
  watchlistMovieText: {
    marginLeft: 12,
    flex: 1,
  },
  watchlistMovieTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
  watchlistMovieAddedBy: {
    color: '#A3A3A3',
    fontSize: 11,
    marginTop: 2,
  },
  votingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voteBtnUp: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  voteBtnDown: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  voteCountText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '700',
    minWidth: 14,
    textAlign: 'center',
  },
  emptyScheduledContainer: {
    height: 120,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  emptyScheduledText: {
    color: '#A3A3A3',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
    marginBottom: 8,
  },
  scheduleNowBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  scheduleNowBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  selectedMovieCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 14,
    padding: 10,
    marginBottom: 16,
  },
  selectedMoviePoster: {
    width: 40,
    height: 56,
    borderRadius: 6,
  },
  selectedMovieTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
  },
  selectedMovieType: {
    color: '#8B5CF6',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  removeMovieBtn: {
    padding: 8,
  },
  searchResultType: {
    color: '#A3A3A3',
    fontSize: 11,
    marginTop: 2,
  },
  dateSelectorScroll: {
    marginBottom: 16,
  },
  dateSelectorBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  dateSelectorBubbleActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#A78BFA',
  },
  dateSelectorText: {
    color: '#A3A3A3',
    fontSize: 12,
    fontWeight: '600',
  },
  dateSelectorTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  timeSelectorScroll: {
    marginBottom: 16,
  },
  timeSelectorBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  timeSelectorBubbleActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#A78BFA',
  },
  timeSelectorText: {
    color: '#A3A3A3',
    fontSize: 12,
    fontWeight: '600',
  },
  timeSelectorTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  minutesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 24,
  },
  minuteSegment: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  minuteSegmentActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#A78BFA',
  },
  minuteSegmentText: {
    color: '#A3A3A3',
    fontSize: 13,
    fontWeight: '600',
  },
  minuteSegmentTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  // New visual overlay styles for cinematic aesthetic
  heroCardContainer: {
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
  },
  heroRefractionBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  heroContentContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.md,
    paddingBottom: 24,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  heroBadgeGradient: {
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  heroBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroBadgeClock: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  heroBadgeClockText: {
    color: '#A78BFA',
    fontSize: 10,
    fontWeight: '700',
  },
  heroTitleSection: {
    marginBottom: 12,
  },
  heroTitleText: {
    color: 'white',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  heroSubtitleText: {
    color: '#A3A3A3',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  heroMetaText: {
    color: '#A3A3A3',
    fontSize: 12,
    fontWeight: '600',
  },
  heroParticipantsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroAvatarsOverlap: {
    position: 'relative',
    height: 24,
    width: 65,
  },
  heroOverlapAvatar: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#000',
  },
  heroParticipantsCountText: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  heroActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroMainBtnContainer: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  heroMainBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  heroMainBtnText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
  },
  premiumScheduledCardContainer: {
    width: 280,
    marginRight: 16,
  },
  scheduledPartyCardPremium: {
    padding: 16,
    minHeight: 175,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.15)',
  },
  preJoinBtnPremium: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  joinBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 4,
  },
  countdownContainerPremium: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 6,
  },
  countdownDotWrapper: {
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownPulseRing: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.4)',
  },
  countdownIndicatorPremium: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  countdownTextPremium: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  preJoinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 4,
  },
  scheduledTimeText: {
    color: '#8B5CF6',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  countdownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  countdownIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8B5CF6',
  },
  countdownText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  scheduledTimeText: {
    color: '#A78BFA',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  partyCardPremiumContainer: {
    width: 260,
    marginRight: 16,
  },
  partyCardPremium: {
    padding: 16,
    height: 145,
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.15)',
  },
  partyStatusTextPremium: {
    color: '#EF4444',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  joinBtnLivePremium: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  joinBtnLiveGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 4,
  },
  watchlistRowPremium: {
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  watchlistRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  watchlistRowTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  watchlistRowCreator: {
    color: '#A3A3A3',
    fontSize: 11,
    marginTop: 3,
  },
  watchlistRowMetaPremium: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  watchlistMetaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 4,
  },
  watchlistMetaBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '800',
  },
  friendSelectAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  friendSelectName: {
    color: 'white',
    fontSize: 14,
    marginLeft: 12,
    flex: 1,
  },
  // NEW STYLES: Live Friend Buzz, Voting Battle Arena, Decide for Us Spinning Wheel & Victory celebration
  buzzCardPremiumContainer: {
    width: 240,
    marginRight: 12,
  },
  buzzCardPremium: {
    padding: 14,
    paddingLeft: 18,
    minHeight: 155,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'space-between',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  buzzAccentStrip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  buzzHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buzzAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  buzzName: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  buzzAction: {
    color: '#34D399',
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  buzzEmoji: {
    fontSize: 22,
    marginRight: 6,
  },
  buzzTime: {
    color: '#6B7280',
    fontSize: 10,
  },
  buzzCommentQuote: {
    flexDirection: 'row',
    marginTop: 6,
    gap: 8,
  },
  buzzQuoteBorder: {
    width: 2,
    borderRadius: 1,
    opacity: 0.6,
  },
  buzzComment: {
    color: '#E5E5E5',
    fontSize: 11,
    fontStyle: 'italic',
    lineHeight: 15,
    flex: 1,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-light' }),
  },
  buzzMovieFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  buzzMovieTitle: {
    color: '#A3A3A3',
    fontSize: 10,
    fontWeight: '600',
    flex: 1,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  decideForUsBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 14,
  },
  decideForUsBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  decideForUsBtnText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '800',
  },
  battleArenaProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  battleArenaProgressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  battleArenaProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  battleArenaPercentageText: {
    color: '#A3A3A3',
    fontSize: 10,
    fontWeight: '700',
    minWidth: 50,
  },
  watchlistMovieItemLeader: {
    borderColor: 'rgba(251, 191, 36, 0.4)',
    borderWidth: 1,
    backgroundColor: 'rgba(251, 191, 36, 0.04)',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  wheelOverlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    padding: 24,
  },
  wheelHeader: {
    alignItems: 'center',
    marginBottom: 30,
  },
  wheelHeaderTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  wheelHeaderSub: {
    color: '#A3A3A3',
    fontSize: 12,
    marginTop: 4,
  },
  wheelWrapperOuter: {
    position: 'relative',
    width: 250,
    height: 250,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  wheelPointerContainer: {
    position: 'absolute',
    top: -24,
    zIndex: 10,
  },
  wheelCircle: {
    width: 230,
    height: 230,
    borderRadius: 115,
    borderWidth: 6,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(20,20,20,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  wheelSegment: {
    position: 'absolute',
    width: 100,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wheelSegmentPoster: {
    width: 32,
    height: 44,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  wheelSegmentText: {
    color: 'white',
    fontSize: 8,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
    width: 70,
  },
  wheelCenterPeg: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  wheelCenterPegGradient: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wheelActionsContainer: {
    width: '100%',
    gap: 12,
  },
  spinBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  spinBtnDisabled: {
    opacity: 0.6,
  },
  spinBtnGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  spinBtnText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cancelWheelBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelWheelBtnText: {
    color: '#A3A3A3',
    fontSize: 13,
    fontWeight: '600',
  },
  victoryOverlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
    padding: 24,
  },
  victoryCard: {
    width: '100%',
    backgroundColor: 'rgba(30,30,30,0.92)',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#E50914',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 30,
  },
  victorySub: {
    color: '#FBBF24',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  victoryTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 20,
  },
  victoryPosterContainer: {
    width: 140,
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  victoryPoster: {
    width: '100%',
    height: '100%',
  },
  victoryDesc: {
    color: '#E5E5E5',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  victoryActionBtn: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  victoryActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  victoryActionText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
  },
  victoryCloseBtn: {
    paddingVertical: 8,
  },
  victoryCloseText: {
    color: '#A3A3A3',
    fontSize: 13,
    fontWeight: '600',
  },
  sheetPresenceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  sheetPresenceText: {
    color: '#E5E5E5',
    fontSize: 11,
    fontWeight: '700',
  },
  friendActionsRowSheet: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 16,
    width: '100%',
  },
  sheetActionBtn: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  sheetActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
  },
  sheetActionGradientActive: {
    borderColor: 'rgba(236, 72, 153, 0.4)',
    backgroundColor: 'rgba(236, 72, 153, 0.05)',
  },
  sheetActionText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '800',
  },
  quickRecPanel: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    width: '100%',
  },
  quickRecTitle: {
    color: '#A3A3A3',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  quickRecScroll: {
    gap: 8,
  },
  quickRecItemCard: {
    width: 75,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  quickRecPosterImage: {
    width: 65,
    height: 90,
    borderRadius: 6,
  },
  quickRecItemTitle: {
    color: 'white',
    fontSize: 8,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
    width: '100%',
  },
});
