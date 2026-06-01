import React, { useEffect, useState, useRef, useCallback, memo, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Image as RNImage, Pressable, ActivityIndicator, Alert, StatusBar, useWindowDimensions, FlatList, Modal, Platform } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons, MaterialCommunityIcons, Feather, MaterialIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useVideoPlayer, VideoView } from 'expo-video';
import { TrailerResolver } from '../../components/TrailerResolver';
import { VidLinkResolver } from '../../components/VidLinkResolver';
import { MoviesApiResolver } from '../../components/MoviesApiResolver';
import { VidLinkStream } from '../../services/vidlink';
import { MoviesApiStream } from '../../services/moviesapi';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withSequence, 
  withTiming, 
  withSequence as withSequence2, 
  Easing, 
  interpolate, 
  useAnimatedScrollHandler,
  runOnJS,
  useAnimatedRef,
  SharedTransition,
  FadeInUp,
  FadeInDown,
  withSpring,
  FadeIn,
  useAnimatedReaction,
} from 'react-native-reanimated';

const AnimatedExpoImage = Animated.createAnimatedComponent(ExpoImage);

// Custom shared transition - disabled due to version compatibility issues in Reanimated 4
// const customTransition = (SharedTransition as any).custom((values: any) => {
//   'worklet';
//   return {
//     height: withSpring(values.targetHeight, { damping: 18, stiffness: 120 }),
//     width: withSpring(values.targetWidth, { damping: 18, stiffness: 120 }),
//     originX: withSpring(values.targetOriginX, { damping: 18, stiffness: 120 }),
//     originY: withSpring(values.targetOriginY, { damping: 18, stiffness: 120 }),
//   };
// });
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { COLORS, SPACING } from '../../constants/theme';
import { fetchMovieDetails, getImageUrl, getBackdropUrl, fetchSeasonDetails } from '../../services/tmdb';
import { HorizontalCarousel } from '../../components/HorizontalCarousel';
import { ModernVideoPlayer } from '../../components/ModernVideoPlayer';
import { NetflixLoader } from '../../components/NetflixLoader';
import NetflixRatingButton from '../../components/NetflixRatingButton';
import { NetflixDownloadIcon } from '../../components/NetflixThumbs';
import { downloadVideo, loadMetadata } from '../../services/downloads';
import { useProfile, AVATAR_MAP } from '../../context/ProfileContext';
import { MyListService } from '../../services/MyListService';
import { WatchHistoryService, WatchHistoryItem } from '../../services/WatchHistoryService';
import { useNativeDetails } from '../../hooks/useNativeDetails';
import { CastCarousel } from '../../components/CastCarousel';
import { isContentLockedForFreePlan } from '../../services/AccessControl';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { FriendsActivityBottomSheet } from '../../components/FriendsActivityBottomSheet';
import { FriendsService, Friend } from '../../services/friends';
import { MessagingService } from '../../services/messaging';

// Removed static SCREEN_WIDTH/HEIGHT constants to prevent orientation-change distortion;
// using useWindowDimensions() inside MovieDetailsScreen instead.
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

const SkeletonItem = ({ style }: { style: any }) => {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 800, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.skeleton, style, animatedStyle]} />;
};

const FriendsAvatarsIcon = () => (
  <View style={{ flexDirection: 'row', alignItems: 'center', width: 42, height: 24, position: 'relative', marginBottom: 2 }}>
    <ExpoImage 
      source={{ uri: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=60&h=60&fit=crop' }} 
      style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: 'black', position: 'absolute', left: 0, zIndex: 3 }} 
    />
    <ExpoImage 
      source={{ uri: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=60&h=60&fit=crop' }} 
      style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: 'black', position: 'absolute', left: 10, zIndex: 2 }} 
    />
    <ExpoImage 
      source={{ uri: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=60&h=60&fit=crop' }} 
      style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: 'black', position: 'absolute', left: 20, zIndex: 1 }} 
    />
  </View>
);

const EpisodeRow = React.memo(({ 
  episode: ep, 
  onPress, 
  onDownloadPress, 
  progress,
  downloadStatus,
  downloadProgress
}: { 
  episode: any; 
  onPress: () => void; 
  onDownloadPress: () => void; 
  progress: number | null; 
  downloadStatus?: 'idle' | 'resolving' | 'queued' | 'downloading' | 'completed' | 'failed';
  downloadProgress?: number;
}) => {
  return (
    <Pressable style={styles.episodeItem} onPress={onPress}>
      <View style={styles.episodeMain}>
        <View style={styles.episodeThumbContainer}>
          <ExpoImage 
            source={{ uri: getImageUrl(ep.still_path) }} 
            style={styles.episodeThumb} 
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          {progress !== null && progress > 0 && (
            <View style={styles.watchProgressBarBg}>
              <View style={[styles.watchProgressBarFill, { width: `${progress * 100}%` }]} />
            </View>
          )}
        </View>
        <View style={styles.episodeInfo}>
          <Text style={styles.episodeTitle}>{ep.episode_number}. {ep.name}</Text>
          <Text style={styles.episodeRuntime}>{ep.runtime || 45}m</Text>
        </View>
        <Pressable onPress={onDownloadPress} style={styles.epDownloadContainer}>
          {downloadStatus === 'resolving' ? (
            <ActivityIndicator size="small" color="#0071eb" />
          ) : downloadStatus === 'queued' ? (
            <Ionicons name="time-outline" size={22} color="rgba(255,255,255,0.5)" />
          ) : downloadStatus === 'downloading' ? (
            <View style={styles.epDownloadProgressContainer}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.epDownloadProgressText}>{Math.round((downloadProgress || 0) * 100)}%</Text>
            </View>
          ) : downloadStatus === 'completed' ? (
            <Ionicons name="checkmark-circle" size={22} color="#46d369" />
          ) : (
            <NetflixDownloadIcon size={20} color="white" style={styles.epDownload} />
          )}
        </Pressable>
      </View>
      <Text style={styles.episodeOverview} numberOfLines={3}>{ep.overview || "No description available."}</Text>
    </Pressable>
  );
});

const SimilarMovieRow = React.memo(({ 
  item, 
  onPress 
}: { 
  item: any; 
  onPress: () => void; 
}) => {
  return (
    <Pressable style={styles.similarItem} onPress={onPress}>
      <ExpoImage 
        source={{ uri: getImageUrl(item.poster_path) }} 
        style={styles.similarPoster} 
        contentFit="cover"
      />
    </Pressable>
  );
});

function MovieDetailsSkeleton() {
  return (
    <View style={styles.container}>
      <SkeletonItem style={styles.skeletonBackdrop} />
      <View style={styles.infoContent}>
        <SkeletonItem style={styles.skeletonTitle} />
        <View style={styles.skeletonMetadataRow}>
          <SkeletonItem style={styles.skeletonMetadata} />
          <SkeletonItem style={styles.skeletonMetadata} />
          <SkeletonItem style={styles.skeletonMetadata} />
        </View>
        <SkeletonItem style={styles.skeletonButton} />
        <SkeletonItem style={styles.skeletonButton} />
        <SkeletonItem style={styles.skeletonText} />
        <SkeletonItem style={[styles.skeletonText, { width: '80%' }]} />
        <SkeletonItem style={[styles.skeletonText, { width: '60%' }]} />
      </View>
    </View>
  );
}

import { LiquidGlassCircle, LiquidGlassPill } from '../../components/LiquidGlass';

const AnimatedActionButton = ({ icon, activeIcon, text, activeText, initiallyActive = false, onPress }: any) => {
  const [isActive, setIsActive] = useState(initiallyActive);
  const scale = useSharedValue(1);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSequence(
      withSpring(0.6, { damping: 10, stiffness: 200 }),
      withSpring(1.2, { damping: 10, stiffness: 200 }),
      withSpring(1, { damping: 10, stiffness: 200 })
    );
    setIsActive(!isActive);
    if (onPress) onPress(!isActive);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  return (
    <Pressable style={styles.actionItem} onPress={handlePress}>
      <Animated.View style={animatedStyle}>
        <LiquidGlassCircle size={48}>
          {isActive && activeIcon ? activeIcon : icon}
        </LiquidGlassCircle>
      </Animated.View>
      <Text style={styles.actionText}>
        {isActive && activeText ? activeText : text}
      </Text>
    </Pressable>
  );
};

export default function MovieDetailsScreen() {
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const { id, type, autoPlay, startTime, season, episode, resumeTime, resumeDuration, watchPartyId, isHost } = useLocalSearchParams();
  const router = useRouter();
  const normalizedRouteType = type === 'tv' || type === 'movie' ? type : null;
  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [isTV, setIsTV] = useState(normalizedRouteType === 'tv');
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [activeTab, setActiveTab] = useState<'episodes' | 'more'>(isTV ? 'episodes' : 'more');
  const [showSeasonModal, setShowSeasonModal] = useState(false);
  const friendsSheetRef = useRef<BottomSheetModal>(null);
  const { selectedProfile } = useProfile();
  const [isInMyList, setIsInMyList] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPartyShareModal, setShowPartyShareModal] = useState(false);
  const [friendsList, setFriendsList] = useState<Friend[]>([]);
  
  // Waiting Room state
  const [showWaitingRoom, setShowWaitingRoom] = useState(false);
  const [watchPartyIdState, setWatchPartyIdState] = useState<string | null>(null);
  const [isWatchPartyHostState, setIsWatchPartyHostState] = useState(false);
  const [waitingRoomParticipants, setWaitingRoomParticipants] = useState<any[]>([]);
  const [waitingRoomEmojis, setWaitingRoomEmojis] = useState<{ id: string; emoji: string; xOffset: number }[]>([]);
  
  // Watch History State
  const [watchProgress, setWatchProgress] = useState<WatchHistoryItem | null>(() => {
    const routeResumeTime = Number(resumeTime || startTime || 0);
    const routeResumeDuration = Number(resumeDuration || 0);
    if (!id || !Number.isFinite(routeResumeTime) || routeResumeTime <= 5) return null;

    const routeSeason = Number(season || 1);
    const routeEpisode = Number(episode || 1);

    return {
      id: id.toString(),
      type: (type === 'tv' ? 'tv' : 'movie'),
      currentTime: routeResumeTime,
      duration: routeResumeDuration,
      lastUpdated: Date.now(),
      season: type === 'tv' ? routeSeason : undefined,
      episode: type === 'tv' ? routeEpisode : undefined,
      item: {
        id,
        media_type: type,
      },
    };
  });
  const hasAutoplayedRef = useRef(false);

  // Native Optimization Hook (Data mapping & Palette extraction)
  const { details, palette } = useNativeDetails(movie);

  const [isFreePlan, setIsFreePlan] = useState(false);

  useEffect(() => {
    const { SubscriptionService } = require('../../services/SubscriptionService');
    const unsub = SubscriptionService.listenToSubscription((sub: any) => {
      setIsFreePlan(sub.status !== 'active');
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (id && isFreePlan) {
      const isLocked = isContentLockedForFreePlan(String(id), true);
      if (isLocked) {
        Alert.alert(
          'Upgrade Required',
          'This content is locked on the Free Plan. Upgrade your subscription to watch.',
          [
            { text: 'Go Back', style: 'cancel', onPress: () => router.back() },
            { text: 'Upgrade', onPress: () => { router.back(); router.push('/subscription'); } }
          ]
        );
      }
    }
  }, [id, isFreePlan, router]);

  // Subscribe to Watch History for this specific item
  useEffect(() => {
    if (!selectedProfile || !id) return;
    const unsubscribe = WatchHistoryService.subscribeToHistory(selectedProfile.id, (items) => {
      const showItems = items.filter(item => item && item.id && item.id.toString() === id.toString());
      if (showItems.length > 0) {
        // Sort by lastUpdated descending (newest first) to get the most recent episode/movie progress
        showItems.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
        setWatchProgress(showItems[0] as WatchHistoryItem);
      } else {
        setWatchProgress(null);
      }
    });
    return () => unsubscribe();
  }, [selectedProfile, id]);
  
  // Trailer States
  const [resolvedTrailerUrl, setResolvedTrailerUrl] = useState<string | null>(null);
  const [isTrailerMuted, setIsTrailerMuted] = useState(true);
  const [isTrailerResolving, setIsTrailerResolving] = useState(true);
  const [trailerHasEnded, setTrailerHasEnded] = useState(false);
  const [isTrailerPlaying, setIsTrailerPlaying] = useState(false);
  const [trailerStatus, setTrailerStatus] = useState<'idle' | 'loading' | 'readyToPlay' | 'error'>('idle');

  // Download Resolution State
  const [downloadVidlinkEnabled, setDownloadVidlinkEnabled] = useState(false);
  const [downloadMoviesapiEnabled, setDownloadMoviesapiEnabled] = useState(false);
  const [downloadTarget, setDownloadTarget] = useState<{
    episodeNum?: number;
    title: string;
    image: string;
  } | null>(null);
  
  // Real-time download progress tracking
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'resolving' | 'downloading' | 'completed'>('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadQueue, setDownloadQueue] = useState<number[]>([]);
  const [localDownloads, setLocalDownloads] = useState<any[]>([]);
  const downloadHasResolvedRef = useRef(false);
  const downloadFailedCountRef = useRef(0);
  const downloadTargetRef = useRef<{ episodeNum?: number; title: string; image: string } | null>(null);

  // Poll download state for the current item and update localDownloads
  useEffect(() => {
    let active = true;
    const checkState = async () => {
      try {
        const list = await loadMetadata();
        if (!active) return;
        setLocalDownloads(list);
      } catch (_) {}
    };

    checkState();
    const interval = setInterval(checkState, 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Process the download queue
  useEffect(() => {
    if (downloadQueue.length > 0 && !downloadTarget) {
      const nextEp = downloadQueue[0];
      setDownloadQueue(prev => prev.slice(1));
      handleDownload(nextEp);
    }
  }, [downloadQueue, downloadTarget]);

  const trailerPlayer = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.muted = isTrailerMuted;
    p.staysActiveInBackground = false;
  });

  // Listen for trailer player status changes
  useEffect(() => {
    if (!trailerPlayer) return;
    
    setTrailerStatus(trailerPlayer.status);

    const subscription = trailerPlayer.addListener('statusChange', (payload: any) => {
      console.log(`[MovieDetails] 🎥 Trailer Player status changed to: ${payload.status}`);
      setTrailerStatus(payload.status);
    });

    return () => {
      subscription.remove();
    };
  }, [trailerPlayer]);

  // Keep trailer player muted state in sync
  useEffect(() => {
    if (trailerPlayer) {
      trailerPlayer.muted = isTrailerMuted;
    }
  }, [trailerPlayer, isTrailerMuted]);

  // Update trailer player source when resolved trailer URL changes
  useEffect(() => {
    async function updateTrailer() {
      if (!trailerPlayer) return;
      if (resolvedTrailerUrl) {
        console.log(`[MovieDetails] 🔄 Loading resolved trailer: ${resolvedTrailerUrl}`);
        try {
          await (trailerPlayer as any).replaceAsync({
            uri: resolvedTrailerUrl,
          });
          if (!isPlaying && scrollY.value < 100) {
            trailerPlayer.play();
            setIsTrailerPlaying(true);
          }
        } catch (e) {
          console.error("[MovieDetails] ❌ Failed to load trailer in player:", e);
        }
      } else {
        try {
          trailerPlayer.pause();
          setIsTrailerPlaying(false);
        } catch (_) {}
      }
    }
    updateTrailer();
  }, [resolvedTrailerUrl, trailerPlayer, isPlaying]);

  // Listen for trailer end to show replay button
  useEffect(() => {
    if (!trailerPlayer || !resolvedTrailerUrl) return;
    
    const interval = setInterval(() => {
      try {
        if (trailerPlayer.duration > 0 && trailerPlayer.currentTime >= trailerPlayer.duration - 0.5) {
          setTrailerHasEnded(true);
          setIsTrailerPlaying(false);
          clearInterval(interval);
        }
      } catch (_) {
        // Player may not be ready yet
      }
    }, 500);
    
    return () => clearInterval(interval);
  }, [trailerPlayer, resolvedTrailerUrl]);

  const toggleTrailerPlayPause = () => {
    if (!trailerPlayer || !resolvedTrailerUrl || trailerHasEnded) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isTrailerPlaying) {
      try {
        trailerPlayer.pause();
        setIsTrailerPlaying(false);
      } catch (_) {}
    } else {
      try {
        trailerPlayer.play();
        setIsTrailerPlaying(true);
      } catch (_) {}
    }
  };

  // Handle My List Subscription
  useEffect(() => {
    if (!selectedProfile || !id) return;
    
    // Initial check
    MyListService.isInList(selectedProfile.id, id as string).then(setIsInMyList);

    // Subscribe for real-time updates
    const unsubscribe = MyListService.subscribeToList(selectedProfile.id, (items) => {
      const exists = items.some(item => item.id.toString() === id.toString());
      setIsInMyList(exists);
    });

    return () => unsubscribe();
  }, [selectedProfile, id]);

  const handleToggleMyList = async () => {
    if (!selectedProfile || !movie) return;
    
    // Optimistic UI update
    const newStatus = !isInMyList;
    setIsInMyList(newStatus);
    
    const wasAdded = await MyListService.toggleItem(selectedProfile.id, {
      id: movie.id,
      title: movie.title || movie.name,
      poster_path: movie.poster_path,
      backdrop_path: movie.backdrop_path,
      type: isTV ? 'tv' : 'movie'
    });
    
    // Ensure state matches result
    if (typeof wasAdded === 'boolean') {
      setIsInMyList(wasAdded);
    }
  };

  // Pause trailer when full-scale player starts
  useEffect(() => {
    if (isPlaying && trailerPlayer && resolvedTrailerUrl) {
      try { trailerPlayer.pause(); } catch (_) {}
    }
  }, [isPlaying]);

  // Fetch friends list for sharing
  useEffect(() => {
    FriendsService.getFriends().then(setFriendsList);
  }, []);

  // Auto-start player if navigated from Continue Watching or Watch Party link
  useEffect(() => {
    if (movie && !hasAutoplayedRef.current) {
      if (autoPlay === 'true') {
        hasAutoplayedRef.current = true;
        const timer = setTimeout(() => {
          handleHeroPlay();
        }, 600);
        return () => clearTimeout(timer);
      } else if (watchPartyId) {
        hasAutoplayedRef.current = true;
        const timer = setTimeout(() => {
          FriendsService.joinWatchParty(watchPartyId as string, selectedProfile).then(() => {
            setWatchPartyIdState(watchPartyId as string);
            setIsWatchPartyHostState(isHost === 'true');
            setShowWaitingRoom(true);
          }).catch(() => {
            Alert.alert("Party Error", "Could not join Watch Party");
          });
        }, 600);
        return () => clearTimeout(timer);
      }
    }
  }, [autoPlay, watchPartyId, movie, selectedProfile]);

  // Listen to Watch Party status changes (Waiting Room transitions)
  useEffect(() => {
    if (!watchPartyIdState) return;

    const unsubParticipants = FriendsService.subscribeToWatchPartyParticipants(watchPartyIdState, (list) => {
      setWaitingRoomParticipants(list);
    });

    const unsubParty = FriendsService.subscribeToWatchParty(watchPartyIdState, (party) => {
      if (!party) return;
      if (party.status === 'playing' && !isWatchPartyHostState && !isPlaying) {
        setShowWaitingRoom(false);
        handlePlay(undefined, undefined, watchPartyIdState, false);
      }
    });

    const unsubEvents = FriendsService.subscribeToWatchPartyEvents(watchPartyIdState, (event) => {
      if (!event) return;
      if (event.type === 'reaction') {
        const currentUid = selectedProfile?.id || 'guest';
        if (event.senderId !== currentUid) {
          const xOffset = -60 + Math.random() * 120;
          setWaitingRoomEmojis((prev) => [...prev, { id: Math.random().toString(), emoji: event.content, xOffset }]);
        }
      }
    });

    return () => {
      unsubParticipants();
      unsubParty();
      unsubEvents();
    };
  }, [watchPartyIdState, isWatchPartyHostState, isPlaying, selectedProfile]);



  const toggleTrailerMute = () => {
    setIsTrailerMuted(!isTrailerMuted);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  
  const scrollY = useSharedValue(0);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scrollRef = useAnimatedRef<FlatList>();
  
  const [streamConfig, setStreamConfig] = useState<{ 
    url: string; 
    headers?: Record<string, string> | null;
    tracks?: any[];
    currentTitle?: string;
    tmdbId?: string;
    contentType?: string;
    releaseYear?: string;
    episodeNum?: number;
    seasonNum?: number;
    primaryId?: string;
    backdropUrl?: string;
    watchPartyId?: string;
    isHost?: boolean;
  }>({
    url: '',
    headers: null,
    tracks: [],
    currentTitle: ''
  });

  useEffect(() => {
    const loadContent = async () => {
      if (!id) return;

      try {
        setLoading(true);

        if (normalizedRouteType) {
          const data = await fetchMovieDetails(id as string, normalizedRouteType);
          setMovie(data);
          setIsTV(normalizedRouteType === 'tv');

          if (normalizedRouteType === 'tv') {
            const firstSeason = data.seasons?.find((s: any) => s.season_number > 0)?.season_number || 1;
            setSelectedSeason(firstSeason);
            const seasonData = await fetchSeasonDetails(id as string, firstSeason);
            setEpisodes(seasonData.episodes || []);
          } else {
            setEpisodes([]);
          }

          return;
        }

        // Only probe both endpoints when the route did not provide a valid content type.
        let contentType = 'movie' as string;
        const data = await fetchMovieDetails(id as string, contentType as 'movie' | 'tv');
        setMovie(data);
        setIsTV(contentType === 'tv');

        if (contentType === 'tv') {
          // Default to Season 1 or the first available season
          const firstSeason = data.seasons?.find((s: any) => s.season_number > 0)?.season_number || 1;
          setSelectedSeason(firstSeason);
          const seasonData = await fetchSeasonDetails(id as string, firstSeason);
          setEpisodes(seasonData.episodes || []);
        }
      } catch (error) {
        console.error("Error fetching details:", error);
        try {
          const fallbackType: 'movie' | 'tv' = 'tv';
          const data = await fetchMovieDetails(id as string, fallbackType);
          setMovie(data);
          setIsTV(fallbackType === 'tv');
          if (fallbackType === 'tv') {
            const firstSeason = data.seasons?.find((s: any) => s.season_number > 0)?.season_number || 1;
            setSelectedSeason(firstSeason);
            const seasonData = await fetchSeasonDetails(id as string, firstSeason);
            setEpisodes(seasonData.episodes || []);
          }
        } catch (e) {
          console.error("Double fallback failed:", e);
        }
      } finally {
        setLoading(false);
      }
    };
    loadContent();
  }, [id, normalizedRouteType]);

  // Reset all states and scroll to top when movie ID changes
  useEffect(() => {
    if (!id) return;
    
    // Clear movie data to trigger skeleton loader
    setMovie(null);
    setEpisodes([]);
    setResolvedTrailerUrl(null);
    setIsTrailerResolving(true);
    setTrailerHasEnded(false);
    setIsPlaying(false);
    hasAutoplayedRef.current = false;
    
    // Reset layout animation shared values
    translateY.value = 0;
    opacity.value = 1;
    scrollY.value = 0;
    
    // Scroll flatlist back to top
    try {
      scrollRef.current?.scrollToOffset({ offset: 0, animated: false });
    } catch (_) {}
  }, [id]);

  const handleSeasonChange = async (seasonNum: number) => {
    Haptics.selectionAsync();
    setSelectedSeason(seasonNum);
    setShowSeasonModal(false);
    try {
      const seasonData = await fetchSeasonDetails(id as string, seasonNum);
      setEpisodes(seasonData.episodes || []);
    } catch (e) {
      console.error("Failed to load season:", e);
    }
  };


  const handleHostWatchParty = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const partyId = await FriendsService.createWatchParty(
        selectedProfile,
        id as string,
        isTV ? 'tv' : 'movie',
        movie.title || movie.name,
        isTV ? selectedSeason : undefined,
        isTV ? 1 : undefined
      );
      setWatchPartyIdState(partyId);
      setIsWatchPartyHostState(true);
      setShowWaitingRoom(true);
    } catch (e) {
      Alert.alert("Error", "Could not start watch party");
    }
  };

  const handleShareMovie = async (friendUid: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const posterUrl = getImageUrl(movie.poster_path) || '';
      const movieTitle = movie.title || movie.name;
      const mediaType = isTV ? 'tv' : 'movie';

      await FriendsService.shareMovieWithFriend(friendUid, {
        id: id as string,
        title: movieTitle,
        poster_path: posterUrl,
        type: mediaType
      }, selectedProfile);

      // Write direct message sharing details
      if (selectedProfile?.id) {
        const chatId = MessagingService.getChatId(selectedProfile.id, friendUid);
        const sharePayload = `[MOVIE_SHARE]:${id}:${movieTitle}:${posterUrl}:${mediaType}`;
        await MessagingService.sendMessage(chatId, sharePayload, selectedProfile);
      }

      Alert.alert("Success", "Movie recommendation shared with friend!");
      setShowShareModal(false);
    } catch (_) {
      Alert.alert("Error", "Could not share movie");
    }
  };

  const handleShareParty = async (friendUid: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (selectedProfile?.id && watchPartyIdState) {
        const movieTitle = movie.title || movie.name;
        const mediaType = isTV ? 'tv' : 'movie';
        const chatId = MessagingService.getChatId(selectedProfile.id, friendUid);
        const invitePayload = `[PARTY_SHARE]:${watchPartyIdState}:${movieTitle}:${mediaType}:${id}`;
        await MessagingService.sendMessage(chatId, invitePayload, selectedProfile);
        Alert.alert("Success", "Watch Party invite sent to friend!");
        setShowPartyShareModal(false);
      }
    } catch (_) {
      Alert.alert("Error", "Could not send Watch Party invitation");
    }
  };

  const handlePlay = async (episodeNum?: number, overrideSeason?: number, watchPartyId?: string, isHost?: boolean) => {
    const movieTitle = movie.title || movie.name;
    const seasonToPlay = overrideSeason || selectedSeason;
    const playTitle = isTV && episodeNum ? `${movieTitle} - S${seasonToPlay} E${episodeNum}` : movieTitle;
    
    console.log(`[Stream V2] 🎬 Play: "${movieTitle}" (isTV: ${isTV}, Season: ${seasonToPlay}, Ep: ${episodeNum || 'N/A'})`);
    
    // Show player IMMEDIATELY to handle loading there
    setIsPlaying(true);

    if (isTV) {
      if (seasonToPlay !== selectedSeason || episodes.length === 0) {
        setSelectedSeason(seasonToPlay);
        try {
          const seasonData = await fetchSeasonDetails(id as string, seasonToPlay);
          setEpisodes(seasonData.episodes || []);
        } catch (e) {
          console.error("Failed to load season on play:", e);
        }
      }
    }

    try {
      const primaryId = movie.external_ids?.netflix_id;
      const releaseYear = (movie.release_date || movie.first_air_date || '').split('-')[0];
      
      setStreamConfig({
        url: '', 
        headers: null,
        tracks: [],
        currentTitle: playTitle,
        tmdbId: id as string,
        contentType: isTV ? 'tv' : 'movie',
        releaseYear: releaseYear,
        episodeNum: episodeNum,
        seasonNum: seasonToPlay,
        primaryId: primaryId,
        backdropUrl: getImageUrl(movie.backdrop_path || movie.poster_path),
        watchPartyId,
        isHost
      });
    } catch (error: any) {
      console.error(`[Stream] 💥 Setup Error:`, error.message);
    }
  };

  const overallDownload = useMemo(() => {
    if (!isTV) {
      const movieDownloadId = `${id}_movie`;
      const dl = localDownloads.find(d => d.id === movieDownloadId);
      if (dl) {
        if (dl.status === 'downloading') return { status: 'downloading', text: `Downloading ${Math.round(dl.progress * 100)}%`, progress: dl.progress };
        if (dl.status === 'completed') return { status: 'completed', text: 'Downloaded' };
      }
      if (downloadTarget && !downloadTarget.episodeNum) {
        return { status: 'resolving', text: 'Resolving link...' };
      }
      return { status: 'idle', text: 'Download' };
    }

    // For TV shows
    if (episodes.length === 0) {
      return { status: 'idle', text: `Download S${selectedSeason}` };
    }

    const seasonEps = episodes.map(e => e.episode_number);
    const seasonEpsIds = seasonEps.map(num => `${id}_tv_s${selectedSeason}_e${num}`);
    const matches = localDownloads.filter(d => seasonEpsIds.includes(d.id));

    const completed = matches.filter(d => d.status === 'completed');
    const downloading = matches.filter(d => d.status === 'downloading');

    if (completed.length === episodes.length && episodes.length > 0) {
      return { status: 'completed', text: 'Season Downloaded' };
    }

    if (downloading.length > 0 || downloadQueue.length > 0) {
      const avgProgress = downloading.length > 0 ? (downloading.reduce((a, b) => a + b.progress, 0) / downloading.length) : 0;
      return { 
        status: 'downloading', 
        text: `Downloading (${completed.length}/${episodes.length})`, 
        progress: avgProgress 
      };
    }

    if (completed.length > 0) {
      return { status: 'partial', text: `Download Remaining (${episodes.length - completed.length})` };
    }

    return { status: 'idle', text: `Download S${selectedSeason}` };
  }, [isTV, id, selectedSeason, episodes, localDownloads, downloadQueue, downloadTarget]);

  const handleDownloadSeason = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!episodes || episodes.length === 0) {
      Alert.alert("No Episodes", "No episodes found for this season.");
      return;
    }

    const currentDownloads = await loadMetadata();
    const toQueue: number[] = [];
    
    for (const ep of episodes) {
      const downloadId = `${id}_tv_s${selectedSeason}_e${ep.episode_number}`;
      const existing = currentDownloads.find(d => d.id === downloadId);
      if (!existing || (existing.status !== 'completed' && existing.status !== 'downloading')) {
        toQueue.push(ep.episode_number);
      }
    }

    if (toQueue.length === 0) {
      Alert.alert("Season Downloaded", "All episodes in this season are already downloaded or downloading.");
      return;
    }

    setDownloadQueue(prev => [...prev, ...toQueue]);
    Alert.alert("Downloading Season", `Queued ${toQueue.length} episodes for download.`);
  };

  const handleDownload = async (episodeNum?: number) => {
    const movieTitle = movie.title || movie.name;
    const targetEpisode = episodes.find(e => e.episode_number === episodeNum) || episodes[0];
    const image = getImageUrl(isTV ? targetEpisode?.still_path : movie.poster_path);
    
    try {
      // Check if already downloaded/downloading
      const currentDownloads = await loadMetadata();
      const downloadId = `${id}_${isTV ? 'tv' : 'movie'}${isTV ? `_s${selectedSeason}` : ''}${episodeNum ? `_e${episodeNum}` : ''}`;
      
      const existing = currentDownloads.find(d => d.id === downloadId);
      if (existing?.status === 'completed') {
        Alert.alert("Already Downloaded", "This content is already available in your downloads.");
        return;
      }
      if (existing?.status === 'downloading') {
        Alert.alert("Downloading", "This content is already being downloaded.");
        return;
      }

      // Concurrently launch all 4 download resolvers!
      console.log(`[Download] 🚀 Initiating CONCURRENT stream resolution for download...`);
      setDownloadStatus('resolving');

      const target = {
        episodeNum,
        title: movieTitle,
        image: image || ''
      };
      setDownloadTarget(target);
      downloadTargetRef.current = target;

      downloadHasResolvedRef.current = false;
      downloadFailedCountRef.current = 0;

      // Trigger WebView resolvers
      setDownloadVidlinkEnabled(true);
      setDownloadMoviesapiEnabled(true);

      // Launch Net22 scraper in parallel for downloads
      (async () => {
        try {
          console.log(`[Download] 🚀 Resolving Net22 in parallel...`);
          const { resolveNet22 } = require('../../services/netmirrorResolver');
          const resolvePromise = resolveNet22(id as string, isTV ? 'tv' : 'movie', selectedSeason, episodeNum || 0);
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Net22 download timeout (30s)')), 30000)
          );
          const stream = await Promise.race([resolvePromise, timeoutPromise]);
          handleDownloadSourceResolved('Net22', stream);
        } catch (err: any) {
          handleDownloadSourceFailed('Net22', err.message || 'Unknown error');
        }
      })();

      // Launch Net52 scraper in parallel for downloads
      (async () => {
        try {
          console.log(`[Download] 🚀 Resolving Net52 in parallel...`);
          const { resolveNet52 } = require('../../services/netmirrorResolver');
          const resolvePromise = resolveNet52(id as string, isTV ? 'tv' : 'movie', selectedSeason, episodeNum || 0);
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Net52 download timeout (30s)')), 30000)
          );
          const stream = await Promise.race([resolvePromise, timeoutPromise]);
          handleDownloadSourceResolved('Net52', stream);
        } catch (err: any) {
          handleDownloadSourceFailed('Net52', err.message || 'Unknown error');
        }
      })();

    } catch (error: any) {
      Alert.alert("Download Error", "Failed to start download. Please try again.");
      console.error("[Download] 💥 Error:", error);
    }
  };

  // Unified download success handler
  const handleDownloadSourceResolved = useCallback(async (source: string, stream: any) => {
    if (downloadHasResolvedRef.current) {
      console.log(`[Download] ⏭ ${source} finished but another source already won the download race.`);
      return;
    }
    downloadHasResolvedRef.current = true;
    console.log(`[Download] 🏁 ${source} won the download race!`);

    // Reset resolvers immediately
    setDownloadVidlinkEnabled(false);
    setDownloadMoviesapiEnabled(false);

    const currentTarget = downloadTargetRef.current;
    if (!currentTarget) return;
    const { episodeNum, title, image } = currentTarget;
    
    // Decodes base64 data: URIs to temp files for downloads too!
    let playableUrl = stream.url;
    if (playableUrl.startsWith('data:')) {
      try {
        const base64Match = playableUrl.match(/^data:[^;]+;base64,(.+)$/);
        if (base64Match) {
          const decoded = global.atob(base64Match[1]);
          const tempFile = `${FileSystem.cacheDirectory}dl_stream_${Date.now()}.m3u8`;
          await FileSystem.writeAsStringAsync(tempFile, decoded);
          console.log(`[Download] 📁 Pre-decoded data URI for download → ${tempFile}`);
          playableUrl = tempFile;
        }
      } catch (decodeErr: any) {
        console.error(`[Download] ❌ Data URI decode failed: ${decodeErr.message}`);
      }
    }

    const normalizedStream: VidLinkStream = {
      url: playableUrl,
      headers: stream.headers || {},
      captions: (stream.captions || []).map((c: any) => ({
        id: c.id || c.url,
        url: c.url,
        language: c.language || 'Unknown',
        type: c.type || 'vtt',
      })),
    };

    const primaryId = movie.external_ids?.netflix_id;
    const releaseYear = (movie.release_date || movie.first_air_date || '').split('-')[0];

    console.log(`[Download] 🚀 Starting background download with resolved ${source} stream...`);
    
    downloadVideo(
      id as string,
      title,
      isTV ? 'tv' : 'movie',
      image,
      isTV ? selectedSeason : undefined,
      episodeNum,
      primaryId,
      releaseYear,
      undefined, // onProgress
      normalizedStream
    ).catch(err => {
      console.error("[Download] ❌ Background download failed:", err);
    });

    setDownloadTarget(null);
    downloadTargetRef.current = null;
  }, [id, isTV, selectedSeason, movie]);

  // Unified download failure handler
  const handleDownloadSourceFailed = useCallback((source: string, error: string) => {
    console.warn(`[Download] ⚠️ ${source} resolution failed: ${error}`);
    if (downloadHasResolvedRef.current) return;

    downloadFailedCountRef.current += 1;
    console.log(`[Download] 📊 Failed download sources: ${downloadFailedCountRef.current}/4`);
    
    if (downloadFailedCountRef.current >= 4) {
      console.error('[Download] ❌ All 4 download resolution sources failed!');
      Alert.alert("Download Failed", "Could not resolve a valid download link. Please try again.");
      setDownloadVidlinkEnabled(false);
      setDownloadMoviesapiEnabled(false);
      setDownloadTarget(null);
      downloadTargetRef.current = null;
    }
  }, []);

  const handleDownloadVidLinkResolved = useCallback((stream: VidLinkStream) => {
    handleDownloadSourceResolved('VidLink', stream);
  }, [handleDownloadSourceResolved]);

  const handleDownloadVidLinkError = useCallback((error: string) => {
    handleDownloadSourceFailed('VidLink', error);
  }, [handleDownloadSourceFailed]);

  const handleDownloadMoviesApiResolved = useCallback((stream: MoviesApiStream) => {
    handleDownloadSourceResolved('MoviesAPI', stream);
  }, [handleDownloadSourceResolved]);

  const handleDownloadMoviesApiError = useCallback((error: string) => {
    handleDownloadSourceFailed('MoviesAPI', error);
  }, [handleDownloadSourceFailed]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const headerAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 200], [0, 1]);
    return {
      backgroundColor: `rgba(0,0,0,${opacity})`,
    };
  });

  const backdropAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(scrollY.value, [-100, 0], [1.2, 1], 'clamp');
    const bgTranslateY = interpolate(scrollY.value, [0, 300], [0, 100]);

    return {
      transform: [{ scale }, { translateY: bgTranslateY }],
    };
  });

  // Auto-pause/resume trailer based on scroll position (JS thread safe)
  const pauseTrailer = useCallback(() => {
    if (!resolvedTrailerUrl) return;
    try { 
      trailerPlayer.pause(); 
      setIsTrailerPlaying(false);
    } catch (_) {}
  }, [trailerPlayer, resolvedTrailerUrl]);

  const resumeTrailer = useCallback(() => {
    if (!resolvedTrailerUrl || trailerHasEnded || isPlaying) return;
    try { 
      trailerPlayer.play(); 
      setIsTrailerPlaying(true);
    } catch (_) {}
  }, [trailerPlayer, resolvedTrailerUrl, trailerHasEnded, isPlaying]);

  useAnimatedReaction(
    () => scrollY.value,
    (currentScrollY, previousScrollY) => {
      if (currentScrollY > 350 && (previousScrollY ?? 0) <= 350) {
        runOnJS(pauseTrailer)();
      } else if (currentScrollY < 100 && (previousScrollY ?? 350) >= 100) {
        runOnJS(resumeTrailer)();
      }
    },
    [pauseTrailer, resumeTrailer]
  );

  const containerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
      opacity: opacity.value,
    };
  });

  const panGesture = Gesture.Pan()
    .activeOffsetY(5)
    .failOffsetY(-5)
    .onUpdate((event) => {
      // ONLY allow close-to-dismiss if we are at the very top of the list.
      // This prevents the gesture from fighting with normal upward scrolling.
      if (scrollY.value <= 1 && event.translationY > 0) {
        translateY.value = event.translationY;
        opacity.value = interpolate(event.translationY, [0, 300], [1, 0.5]);
      }
    })
    .onEnd((event) => {
      if (translateY.value > 150) {
        runOnJS(router.back)();
      } else {
        translateY.value = withTiming(0);
        opacity.value = withTiming(1);
      }
    });

  const matchScore = React.useMemo(() => details?.matchScore || Math.floor(85 + Math.random() * 14), [details, id]);



  const year = details?.formattedYear || (movie?.release_date || movie?.first_air_date || '').split('-')[0];
  const runtime = details?.formattedRuntime || (movie?.runtime 
    ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` 
    : (movie?.number_of_seasons ? `${movie.number_of_seasons} Seasons` : ''));



  function handleHeroPlay() {
    if (isTV) {
      let defaultEpisode = 1;
      let defaultSeason = selectedSeason;
      if (watchProgress && watchProgress.episode && watchProgress.season) {
         const progressPercent = watchProgress.currentTime / watchProgress.duration;
         if (progressPercent > 0.95) {
            defaultEpisode = watchProgress.episode + 1;
            defaultSeason = watchProgress.season;
         } else {
            defaultEpisode = watchProgress.episode;
            defaultSeason = watchProgress.season;
         }
      }
      handlePlay(defaultEpisode, defaultSeason);
    } else {
      handlePlay();
    }
  }

  const renderHeader = () => (
    <View>
      {/* Hero Backdrop & Trailer */}
      <Animated.View style={[styles.posterContainer, backdropAnimatedStyle]}>
        {/* Hidden Resolver */}
        {isTrailerResolving && (
            <TrailerResolver 
               tmdbId={id as string} 
               mediaType={isTV ? 'tv' : 'movie'} 
               enabled={!isPlaying && isTrailerResolving && !trailerHasEnded}
              onResolved={(stream) => {
                setResolvedTrailerUrl(stream.url);
                setIsTrailerResolving(false);
              }}
              onError={() => setIsTrailerResolving(false)}
            />
        )}

        {/* Headless VidLink Resolver for Downloads */}
        <VidLinkResolver
          tmdbId={id as string}
          type={isTV ? 'tv' : 'movie'}
          season={isTV ? selectedSeason : undefined}
          episode={isTV ? downloadTarget?.episodeNum : undefined}
          enabled={downloadVidlinkEnabled}
          onStreamResolved={handleDownloadVidLinkResolved}
          onError={handleDownloadVidLinkError}
        />
        {/* Headless MoviesAPI Resolver for Downloads */}
        <MoviesApiResolver
          tmdbId={id as string}
          type={isTV ? 'tv' : 'movie'}
          season={isTV ? selectedSeason : undefined}
          episode={isTV ? downloadTarget?.episodeNum : undefined}
          enabled={downloadMoviesapiEnabled}
          onStreamResolved={handleDownloadMoviesApiResolved}
          onError={handleDownloadMoviesApiError}
        />

        <AnimatedExpoImage 
          source={{ uri: getBackdropUrl(movie.backdrop_path) }} 
          style={styles.backdrop} 
          contentFit="cover"
          priority="high"
          sharedTransitionTag={`movie-image-${id}`}
        />

        {/* Spinner loader with percentage before trailer loads */}
        {!isPlaying && !trailerHasEnded && (isTrailerResolving || (resolvedTrailerUrl && trailerStatus !== 'readyToPlay' && trailerStatus !== 'error')) && (
          <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', zIndex: 12, backgroundColor: 'rgba(0,0,0,0.35)' }]}>
            <NetflixLoader size={50} withPercentage={true} />
          </View>
        )}

        {resolvedTrailerUrl && !trailerHasEnded && (
          <Animated.View entering={FadeIn.duration(1000)} style={[StyleSheet.absoluteFill, { zIndex: 10 }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={toggleTrailerPlayPause}>
              <VideoView
                player={trailerPlayer}
                style={styles.backdrop}
                contentFit="cover"
                nativeControls={false}
              />
            </Pressable>
            <Pressable 
              onPress={toggleTrailerMute}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              style={styles.muteButton}
            >
              <LiquidGlassCircle size={36}>
                <Ionicons 
                  name={isTrailerMuted ? "volume-mute" : "volume-high"} 
                  size={18} 
                  color="white" 
                />
              </LiquidGlassCircle>
            </Pressable>
          </Animated.View>
        )}

        {trailerHasEnded && (
            <Pressable 
              style={styles.replayOverlay} 
              onPress={() => {
                setTrailerHasEnded(false);
                setIsTrailerPlaying(true);
                trailerPlayer.currentTime = 0;
                trailerPlayer.play();
              }}
            >
              <Ionicons name="refresh" size={24} color="white" />
              <Text style={styles.replayText}>Replay</Text>
            </Pressable>
        )}
        <LinearGradient
          colors={[
            'transparent', 
            'rgba(0,0,0,0.4)', 
            'rgba(0,0,0,0.85)', 
            '#000000'
          ]}
          style={[styles.bottomFadeOverlay, { zIndex: 15 }]}
          pointerEvents="none"
        />
        {!isTrailerPlaying && (
          <Animated.View 
              entering={FadeInDown.duration(400)} 
              style={styles.heroPlayOverlay}
              pointerEvents="box-none"
            >
            <Pressable onPress={resolvedTrailerUrl ? toggleTrailerPlayPause : () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              handleHeroPlay();
            }}>
              <LiquidGlassCircle size={72}>
                <Ionicons name="play" size={30} color="white" style={{ marginLeft: 3 }} />
              </LiquidGlassCircle>
            </Pressable>
          </Animated.View>
        )}
      </Animated.View>

      {/* Content Info */}
      <View style={styles.infoContent}>
        <Animated.View entering={FadeInUp.delay(500).duration(800)} style={styles.matchBadgeRow}>
          <Text style={styles.matchScore}>{matchScore}% Match</Text>
          <Text style={styles.metadataText}>{year}</Text>
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingText}>M/A 16+</Text>
          </View>
          <Text style={styles.metadataText}>{runtime}</Text>
          <View style={styles.hdBadge}>
            <Text style={styles.hdText}>4K Ultra HD</Text>
          </View>
        </Animated.View>

        <Animated.Text entering={FadeInUp.delay(600).duration(800)} style={styles.title}>{movie.title || movie.name}</Animated.Text>
        
        <Animated.View entering={FadeInUp.delay(700).duration(800)} style={styles.top10Row}>
          <View style={styles.top10Badge}>
            <Text style={styles.top10Text}>TOP</Text>
            <Text style={styles.top10Number}>10</Text>
          </View>
          <Text style={styles.top10Label}>#{(Math.abs(parseInt(id as string || '0')) % 10) + 1} in {isTV ? 'TV Shows' : 'Movies'} Today</Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(800).duration(800)}>
          <Pressable 
            style={({ pressed }) => [
              styles.playLargeButton,
              pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }
            ]} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              handleHeroPlay();
            }}
          >
            <Ionicons name="play" size={24} color="black" />
            <Text style={styles.playLargeText}>
              {watchProgress && watchProgress.currentTime > 0 
                ? (isTV && watchProgress.episode ? `Resume S${watchProgress.season} E${watchProgress.episode}` : 'Resume') 
                : 'Play'}
            </Text>
          </Pressable>
          {/* Main sequence progress bar */}
          {watchProgress && watchProgress.currentTime > 0 && watchProgress.duration > 0 && (
            <View style={{ width: '100%', height: 4, backgroundColor: 'rgba(255,255,255,0.2)', marginTop: 8, borderRadius: 2, overflow: 'hidden' }}>
              <View style={{ height: '100%', backgroundColor: COLORS.primary, borderRadius: 2, width: `${Math.min(100, Math.max(0, (watchProgress.currentTime / watchProgress.duration) * 100))}%` }} />
            </View>
          )}
        </Animated.View>
        
        <Animated.View entering={FadeInUp.delay(900).duration(800)}>
          <LiquidGlassPill style={{ height: 48, marginBottom: 20, justifyContent: 'center' }}>
            {overallDownload.status === 'downloading' && (
              <View style={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                width: `${Math.round((overallDownload.progress || 0) * 100)}%`,
                backgroundColor: 'rgba(229, 9, 20, 0.45)', // Premium Red liquid progress color
              }} />
            )}
            <Pressable 
              style={styles.downloadLargeButton}
              onPress={() => {
                if (overallDownload.status === 'downloading' || overallDownload.status === 'resolving') return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                isTV ? handleDownloadSeason() : handleDownload();
              }}
            >
              {overallDownload.status === 'resolving' ? (
                <>
                  <ActivityIndicator size="small" color="#0071eb" style={{ marginRight: 8 }} />
                  <Text style={styles.downloadLargeText}>{overallDownload.text}</Text>
                </>
              ) : overallDownload.status === 'downloading' ? (
                <>
                  <ActivityIndicator size="small" color="#e50914" style={{ marginRight: 8 }} />
                  <Text style={styles.downloadLargeText}>{overallDownload.text}</Text>
                </>
              ) : overallDownload.status === 'completed' ? (
                <>
                  <Ionicons name="checkmark-circle" size={22} color="#46d369" style={{ marginRight: 8 }} />
                  <Text style={styles.downloadLargeText}>{overallDownload.text}</Text>
                </>
              ) : (
                <>
                  <NetflixDownloadIcon size={22} color="white" />
                  <Text style={styles.downloadLargeText}>{overallDownload.text}</Text>
                </>
              )}
            </Pressable>
          </LiquidGlassPill>
        </Animated.View>


        <Animated.Text entering={FadeInUp.delay(1000).duration(800)} style={styles.synopsis}>
          {movie.overview}
        </Animated.Text>

        <Animated.View entering={FadeInUp.delay(1100).duration(800)}>
          {movie.credits?.cast ? (
            <CastCarousel cast={movie.credits.cast} />
          ) : (
            <View style={styles.bentoCard}>
              <Text style={styles.bentoLabel}>Cast & Crew</Text>
              <Text style={styles.credits} numberOfLines={2}>
                {details?.castList || 'Cast information unavailable'}
              </Text>
            </View>
          )}
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(1200).duration(800)} style={styles.secondaryActions}>
          <AnimatedActionButton 
            icon={<Ionicons name="add" size={28} color="white" />}
            activeIcon={<Ionicons name="checkmark" size={28} color="white" />}
            text="My List"
            activeText="My List"
            initiallyActive={isInMyList}
            onPress={handleToggleMyList}
          />
          <NetflixRatingButton item={movie} />
          <AnimatedActionButton 
            icon={<FriendsAvatarsIcon />}
            text="Friends (3)"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              friendsSheetRef.current?.present();
            }}
          />
          <AnimatedActionButton 
            icon={<Feather name="send" size={24} color="white" />}
            text="Share"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowShareModal(true);
            }}
          />
          <AnimatedActionButton 
            icon={<MaterialCommunityIcons name="account-group" size={24} color="white" />}
            text="Watch Party"
            onPress={handleHostWatchParty}
          />
          <AnimatedActionButton 
            icon={
              overallDownload.status === 'completed' ? (
                <Ionicons name="checkmark-circle" size={22} color="#46d369" />
              ) : (
                <NetflixDownloadIcon size={22} color="white" />
              )
            }
            text={overallDownload.text}
            onPress={() => {
              if (overallDownload.status === 'downloading' || overallDownload.status === 'resolving') return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              isTV ? handleDownloadSeason() : handleDownload();
            }}
          />
        </Animated.View>
      </View>

      <View style={styles.tabsContainer}>
        {isTV && (
          <Pressable 
            style={[styles.tabItem, activeTab === 'episodes' && styles.tabItemActive]} 
            onPress={() => {
              Haptics.selectionAsync();
              setActiveTab('episodes');
            }}
          >
            <Text style={[styles.tabText, activeTab === 'episodes' && styles.tabTextActive]}>Episodes</Text>
            {activeTab === 'episodes' && <View style={styles.tabIndicator} />}
          </Pressable>
        )}
        <Pressable 
          style={[styles.tabItem, activeTab === 'more' && styles.tabItemActive]} 
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab('more');
          }}
        >
          <Text style={[styles.tabText, activeTab === 'more' && styles.tabTextActive]}>More Like This</Text>
          {activeTab === 'more' && <View style={styles.tabIndicator} />}
        </Pressable>
      </View>

      {isTV && activeTab === 'episodes' && (
        <View style={styles.seasonPicker}>
          <Pressable onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowSeasonModal(true);
          }}>
            <LiquidGlassPill style={{ height: 38, justifyContent: 'center', alignSelf: 'flex-start' }}>
              <View style={styles.seasonBtn}>
                <Text style={styles.seasonBtnText}>Season {selectedSeason}</Text>
                <Ionicons name="chevron-down" size={16} color="white" />
              </View>
            </LiquidGlassPill>
          </Pressable>
        </View>
      )}
    </View>
  );

  const renderFooter = () => (
    <View style={{ paddingBottom: 100 }}>
      {/* Universal Footer Info */}
      <View style={{ padding: 20, alignItems: 'center' }}>
        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Version 1.0.0 (2026.03.24)</Text>
        <Text style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, marginTop: 4 }}>made by mzazimhenga ❤️</Text>
      </View>
    </View>
  );

  const renderSimilarItem = useCallback(({ item }: { item: any }) => (
    <SimilarMovieRow 
      item={item} 
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push({
          pathname: "/movie/[id]",
          params: { id: item.id.toString(), type: item.media_type || (isTV ? 'tv' : 'movie') }
        });
      }}
    />
  ), [isTV, router]);

  const renderItem = useCallback(({ item }: { item: any }) => {
    if (activeTab === 'episodes') {
      const hasProgress = watchProgress && 
                          watchProgress.episode === item.episode_number && 
                          watchProgress.season === selectedSeason && 
                          watchProgress.duration > 0;
      const progressVal = hasProgress ? (watchProgress.currentTime / watchProgress.duration) : null;

      const epDownloadId = `${id}_tv_s${selectedSeason}_e${item.episode_number}`;
      const epDownload = localDownloads.find(d => d.id === epDownloadId);
      
      let epDownloadStatus: 'idle' | 'resolving' | 'queued' | 'downloading' | 'completed' | 'failed' = 'idle';
      let epDownloadProgress = 0;
      
      if (epDownload) {
        epDownloadStatus = epDownload.status;
        epDownloadProgress = epDownload.progress;
      } else if (downloadTarget && downloadTarget.episodeNum === item.episode_number) {
        epDownloadStatus = 'resolving';
      } else if (downloadQueue.includes(item.episode_number)) {
        epDownloadStatus = 'queued';
      }

      return (
        <EpisodeRow 
          episode={item} 
          progress={progressVal}
          downloadStatus={epDownloadStatus}
          downloadProgress={epDownloadProgress}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            handlePlay(item.episode_number);
          }}
          onDownloadPress={() => handleDownload(item.episode_number)}
        />
      );
    }
    return renderSimilarItem({ item });
  }, [activeTab, watchProgress, selectedSeason, renderSimilarItem, handlePlay, handleDownload, localDownloads, downloadTarget, downloadQueue, id]);


  if (loading) return <MovieDetailsSkeleton />;
  if (!movie) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'black' }}>
      <Animated.View style={[styles.container, containerAnimatedStyle, { flex: 1 }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar barStyle="light-content" />

        {/* Ambient Backdrop Glow */}
        {movie.backdrop_path && (
          <View style={{ ...StyleSheet.absoluteFillObject, zIndex: -1 }} pointerEvents="none">
            <ExpoImage 
              source={{ uri: getBackdropUrl(movie.backdrop_path) }}
              style={StyleSheet.absoluteFillObject}
              blurRadius={60}
              contentFit="cover"
              cachePolicy="memory-disk"
              opacity={0.15}
            />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.6)', '#000000']}
              style={StyleSheet.absoluteFillObject}
            />
          </View>
        )}

        <Animated.View style={[styles.header, headerAnimatedStyle]}>
          <View style={styles.headerContent}>
            <Pressable onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}>
              <LiquidGlassCircle size={38}>
                <Ionicons name="chevron-back" size={22} color="white" />
              </LiquidGlassCircle>
            </Pressable>
            <Text style={styles.headerTitle} numberOfLines={1}>{movie.title || movie.name}</Text>
            <View style={styles.headerRight}>
              <Pressable>
                <LiquidGlassCircle size={38}>
                  <MaterialCommunityIcons name="cast" size={20} color="white" />
                </LiquidGlassCircle>
              </Pressable>
              <Pressable onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}>
                <LiquidGlassCircle size={38}>
                  <Ionicons name="close" size={22} color="white" />
                </LiquidGlassCircle>
              </Pressable>
            </View>
          </View>
        </Animated.View>
        
        <View style={{ flex: 1 }}>
          <GestureDetector gesture={panGesture}>
            <AnimatedFlatList 
              key={activeTab === 'more' ? 'grid-3' : 'list-1'}
              ref={scrollRef as any}
              data={activeTab === 'episodes' ? episodes : (movie.similar?.results || [])}
              renderItem={renderItem}
              keyExtractor={(item: any) => item.id.toString()}
              ListHeaderComponent={renderHeader()}
              ListFooterComponent={renderFooter()}
              numColumns={activeTab === 'more' ? 3 : 1}
              columnWrapperStyle={activeTab === 'more' ? { paddingHorizontal: 4 } : null}
              showsVerticalScrollIndicator={false}
              onScroll={scrollHandler}
              scrollEventThrottle={16}
              removeClippedSubviews={Platform.OS === 'android'}
              initialNumToRender={6}
              maxToRenderPerBatch={8}
              windowSize={5}
            />
          </GestureDetector>
        </View>

        <Modal
          visible={showSeasonModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSeasonModal(false)}
        >
          <View style={styles.modalContainer}>
            <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowSeasonModal(false)} />
            </BlurView>
            <View style={styles.seasonModalCard}>
              <Text style={styles.modalTitle}>Select Season</Text>
              <ScrollView 
                style={styles.seasonScroll}
                contentContainerStyle={styles.seasonList}
                showsVerticalScrollIndicator={false}
              >
                {movie.seasons?.map((season: any) => (
                  <Pressable 
                    key={season.id} 
                    style={[
                      styles.seasonItem,
                      selectedSeason === season.season_number && styles.seasonItemActive
                    ]}
                    onPress={() => handleSeasonChange(season.season_number)}
                  >
                    <Text style={[
                      styles.seasonText,
                      selectedSeason === season.season_number && styles.seasonTextActive
                    ]}>
                      Season {season.season_number}
                    </Text>
                    {selectedSeason === season.season_number && (
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable style={styles.modalCloseBtnGlass} onPress={() => setShowSeasonModal(false)}>
                <Ionicons name="close" size={20} color="white" />
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showShareModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowShareModal(false)}
        >
          <View style={styles.modalOverlay}>
            <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.shareModalContainer}>
              <View style={styles.shareModalHeader}>
                <Text style={styles.shareModalTitle}>Share with Friends</Text>
                <Pressable style={styles.closeBtn} onPress={() => setShowShareModal(false)}>
                  <Ionicons name="close" size={24} color="white" />
                </Pressable>
              </View>
              <ScrollView style={styles.shareFriendsList}>
                {friendsList.map((friend) => (
                  <Pressable
                    key={friend.uid}
                    style={styles.shareFriendRow}
                    onPress={() => handleShareMovie(friend.uid)}
                  >
                    <ExpoImage
                      source={AVATAR_MAP[friend.avatarId] || AVATAR_MAP.avatar1}
                      style={styles.shareFriendAvatar}
                    />
                    <Text style={styles.shareFriendName}>{friend.name}</Text>
                    <Feather name="send" size={18} color="white" />
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showPartyShareModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowPartyShareModal(false)}
        >
          <View style={styles.modalOverlay}>
            <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.shareModalContainer}>
              <View style={styles.shareModalHeader}>
                <Text style={styles.shareModalTitle}>Invite to Watch Party</Text>
                <Pressable style={styles.closeBtn} onPress={() => setShowPartyShareModal(false)}>
                  <Ionicons name="close" size={24} color="white" />
                </Pressable>
              </View>
              <ScrollView style={styles.shareFriendsList}>
                {friendsList.map((friend) => (
                  <Pressable
                    key={friend.uid}
                    style={styles.shareFriendRow}
                    onPress={() => handleShareParty(friend.uid)}
                  >
                    <ExpoImage
                      source={AVATAR_MAP[friend.avatarId] || AVATAR_MAP.avatar1}
                      style={styles.shareFriendAvatar}
                    />
                    <Text style={styles.shareFriendName}>{friend.name}</Text>
                    <Feather name="send" size={18} color="white" />
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </Animated.View>

      <FriendsActivityBottomSheet
        sheetRef={friendsSheetRef}
        tmdbId={id as string}
        movieTitle={movie?.title || movie?.name || 'Group Watch'}
      />

      {/* Render the full screen player as an overlay to prevent details screen unmounting/collapsing */}
      {isPlaying && (
        <View style={styles.fullScreenPlayer}>
          <StatusBar hidden />
          <ModernVideoPlayer 
            videoUrl={streamConfig.url || undefined}
            headers={streamConfig.headers || undefined}
            title={streamConfig.currentTitle || movie.title || movie.name}
            onClose={() => setIsPlaying(false)}
            tracks={streamConfig.tracks}
            episodes={isTV ? episodes : undefined}
            onEpisodeSelect={(epNum) => handlePlay(epNum, selectedSeason)}
            tmdbId={streamConfig.tmdbId}
            contentType={streamConfig.contentType as any}
            releaseYear={streamConfig.releaseYear}
            backdropUrl={streamConfig.backdropUrl}
            episodeNum={streamConfig.episodeNum}
            seasonNum={streamConfig.seasonNum}
            primaryId={streamConfig.primaryId}
            watchPartyId={streamConfig.watchPartyId}
            isHost={streamConfig.isHost}
            onNextEpisode={
              isTV && streamConfig.episodeNum && episodes?.some(e => e.episode_number === (streamConfig.episodeNum || 0) + 1)
                ? () => handlePlay((streamConfig.episodeNum || 0) + 1, streamConfig.seasonNum)
                : undefined
            }
          />
        </View>
      )}

      {/* Watch Party Waiting Room Modal */}
      <Modal
        visible={showWaitingRoom}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowWaitingRoom(false);
          setWatchPartyIdState(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={95} tint="dark" style={StyleSheet.absoluteFill} />
          {movie && (
            <View style={styles.waitingRoomContainer}>
              <View style={styles.shareModalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shareModalTitle}>Waiting Room</Text>
                  <Text style={styles.waitingRoomSub}>{movie.title || movie.name}</Text>
                </View>
                <Pressable style={styles.closeBtn} onPress={() => {
                  setShowWaitingRoom(false);
                  setWatchPartyIdState(null);
                }}>
                  <Ionicons name="close" size={24} color="white" />
                </Pressable>
              </View>

              <View style={styles.waitingCodeBox}>
                <Text style={styles.waitingCodeLabel}>Share Join Code</Text>
                <View style={styles.waitingCodeRow}>
                  <Text style={styles.waitingCodeText}>{watchPartyIdState}</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Pressable onPress={() => {
                      const { Clipboard } = require('react-native');
                      Clipboard.setString(watchPartyIdState || '');
                      Alert.alert("Copied", "Party code copied to clipboard!");
                    }} style={styles.copyBtn}>
                      <Feather name="copy" size={16} color="white" />
                    </Pressable>
                    <Pressable onPress={() => {
                      setShowPartyShareModal(true);
                    }} style={styles.copyBtn}>
                      <Ionicons name="chatbubble-ellipses-outline" size={16} color="white" />
                    </Pressable>
                  </View>
                </View>
              </View>

              <Text style={styles.waitingRoomSectionTitle}>Participants Joined ({waitingRoomParticipants.length})</Text>
              <ScrollView style={styles.waitingParticipantsScroll}>
                {waitingRoomParticipants.map((member) => (
                  <View key={member.uid} style={styles.waitingParticipantRow}>
                    <ExpoImage source={AVATAR_MAP[member.avatarId] || AVATAR_MAP.avatar1} style={styles.waitingParticipantAvatar} />
                    <Text style={styles.waitingParticipantName} numberOfLines={1}>{member.name}</Text>
                    <View style={styles.onlineStatusDot} />
                  </View>
                ))}
              </ScrollView>

              <Text style={styles.reactionsTitle}>Send Emoji</Text>
              <View style={styles.reactionsContainer}>
                {['🔥', '😂', '😱', '❤️', '😢'].map((emoji) => (
                  <Pressable key={emoji} style={styles.reactionBubble} onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    const xOffset = -60 + Math.random() * 120;
                    setWaitingRoomEmojis((prev) => [...prev, { id: Math.random().toString(), emoji, xOffset }]);
                    if (watchPartyIdState) {
                      FriendsService.sendWatchPartyEvent(watchPartyIdState, selectedProfile?.name || 'Friend', 'reaction', 0, { content: emoji });
                    }
                  }}>
                    <Text style={{ fontSize: 24 }}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>

              {isWatchPartyHostState ? (
                <Pressable
                  style={styles.startShowBtn}
                  onPress={async () => {
                    if (watchPartyIdState) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                      await FriendsService.startWatchPartyFromWaitingRoom(watchPartyIdState);
                      setShowWaitingRoom(false);
                      handlePlay(isTV ? 1 : undefined, isTV ? selectedSeason : undefined, watchPartyIdState, true);
                    }
                  }}
                >
                  <Text style={styles.startShowBtnText}>Start Movie</Text>
                </Pressable>
              ) : (
                <View style={styles.waitingForHostBox}>
                  <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: 10 }} />
                  <Text style={styles.waitingForHostText}>Waiting for Host to start...</Text>
                </View>
              )}
            </View>
          )}

          {/* Floating Emojis Overlay */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {waitingRoomEmojis.map((item) => (
              <FloatingEmoji
                key={item.id}
                emoji={item.emoji}
                xOffset={item.xOffset}
                onComplete={() => {
                  setWaitingRoomEmojis((prev) => prev.filter((e) => e.id !== item.id));
                }}
              />
            ))}
          </View>
        </View>
      </Modal>

    </GestureHandlerRootView>
  );
}

const FloatingEmoji = ({ emoji, xOffset, onComplete }: { emoji: string; xOffset: number; onComplete: () => void }) => {
  const yAnim = useSharedValue(0);
  const opacityAnim = useSharedValue(1);

  useEffect(() => {
    yAnim.value = withTiming(-280, { duration: 2500, easing: Easing.out(Easing.quad) });
    opacityAnim.value = withTiming(0, { duration: 2500, easing: Easing.out(Easing.quad) }, (finished) => {
      if (finished) {
        runOnJS(onComplete)();
      }
    });
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: yAnim.value },
        { translateX: xOffset },
        { scale: interpolate(yAnim.value, [0, -250], [1, 1.4]) }
      ],
      opacity: opacityAnim.value,
      position: 'absolute',
      bottom: 120, // Start just above the controls
      alignSelf: 'center',
    };
  });

  return (
    <Animated.View style={animatedStyle}>
      <Text style={{ fontSize: 36 }}>{emoji}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  skeleton: {
    backgroundColor: '#262626',
    borderRadius: 4,
  },
  skeletonBackdrop: {
    width: '100%',
    height: 400,
  },
  skeletonTitle: {
    width: '70%',
    height: 30,
    marginBottom: 15,
  },
  skeletonMetadataRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 25,
  },
  skeletonMetadata: {
    width: 60,
    height: 15,
  },
  skeletonButton: {
    width: '100%',
    height: 45,
    marginBottom: 10,
  },
  skeletonText: {
    width: '100%',
    height: 12,
    marginBottom: 8,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    zIndex: 100,
    justifyContent: 'flex-end',
    paddingBottom: 10,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: 'white',
    fontSize: 17,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 10,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 15,
  },
  headerCircleBtn: {
    // Styling now handled by LiquidGlassCircle wrapper
  },
  fullScreenPlayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'black',
    zIndex: 999,
  },
  posterContainer: {
    width: '100%',
    height: 400,
    backgroundColor: COLORS.background,
  },
  backdrop: {
    width: '100%',
    height: '100%',
  },
  bottomFadeOverlay: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 151,
  },
  heroPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroPlayCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  muteButton: {
    position: 'absolute',
    right: 16,
    bottom: 40,
    zIndex: 20,
  },
  replayOverlay: {
    position: 'absolute',
    right: 16,
    bottom: 40,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    zIndex: 20,
  },
  replayText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  infoContent: {
    padding: SPACING.md,
    marginTop: 0,
    paddingTop: 16,
  },
  matchBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  matchScore: {
    color: '#46d369',
    fontWeight: '800',
    fontSize: 14,
  },
  title: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  top10Row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  top10Badge: {
    backgroundColor: '#E50914',
    padding: 2,
    borderRadius: 2,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  top10Text: {
    color: 'white',
    fontSize: 6,
    fontWeight: '900',
  },
  top10Number: {
    color: 'white',
    fontSize: 10,
    fontWeight: '900',
    marginTop: -2,
  },
  top10Label: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
  },
  metadataText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  ratingBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  ratingText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  hdBadge: {
    borderColor: 'rgba(255,255,255,0.35)',
    borderWidth: 0.8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  hdText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: 'bold',
  },
  playLargeButton: {
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  playLargeText: {
    color: 'black',
    fontSize: 16,
    fontWeight: 'bold',
  },
  downloadLargeButton: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    paddingVertical: 12,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 0,
  },
  downloadLargeText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  synopsis: {
    color: 'white',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
    fontWeight: '400',
  },
  bentoCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  bentoLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 1,
  },
  credits: {
    color: '#e5e5e5',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  secondaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    marginBottom: 20,
  },
  actionItem: {
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    marginTop: 20,
  },
  tabItem: {
    paddingVertical: 12,
    marginRight: 32,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemActive: {
    // Active specific styles if any
  },
  tabText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tabTextActive: {
    color: 'white',
  },
  tabIndicator: {
    position: 'absolute',
    top: -1, 
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: COLORS.primary,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  similarGrid: {
    paddingVertical: SPACING.md,
  },
  similarItem: {
    flex: 1/3,
    aspectRatio: 2/3,
    padding: 4,
  },
  similarPoster: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  episodesSection: {
    marginTop: 10,
  },
  seasonPicker: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 15,
  },
  seasonBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'transparent',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    height: 38,
  },
  seasonBtnText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  episodeItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 14,
    marginBottom: 16,
    marginHorizontal: SPACING.md,
  },
  episodeMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  episodeThumbContainer: {
    width: 130,
    height: 75,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
  },
  episodeThumb: {
    width: '100%',
    height: '100%',
  },
  watchProgressBarBg: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  watchProgressBarFill: {
    height: '100%',
    backgroundColor: '#E50914',
  },
  episodeInfo: {
    flex: 1,
  },
  episodeTitle: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  episodeRuntime: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
  epDownload: {
    padding: 10,
  },
  episodeOverview: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 18,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  seasonModalCard: {
    width: '80%',
    maxHeight: '60%',
    backgroundColor: 'rgba(20, 20, 20, 0.75)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
    overflow: 'hidden',
  },
  modalTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  seasonScroll: {
    width: '100%',
    marginBottom: 10,
  },
  seasonList: {
    paddingVertical: 8,
    gap: 10,
  },
  seasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  seasonItemActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.1)',
    borderColor: 'rgba(229, 9, 20, 0.25)',
  },
  seasonText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    fontWeight: '500',
  },
  seasonTextActive: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  modalCloseBtnGlass: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  shareModalContainer: {
    width: '90%',
    backgroundColor: '#1A1A1A',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  shareModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  shareModalTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '900',
  },
  closeBtn: {
    padding: 4,
  },
  shareFriendsList: {
    maxHeight: 250,
  },
  shareFriendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  shareFriendAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  shareFriendName: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 12,
    flex: 1,
  },
  waitingRoomContainer: {
    width: '90%',
    backgroundColor: '#1A1A1A',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  waitingRoomSub: {
    color: '#A3A3A3',
    fontSize: 13,
    marginTop: 4,
  },
  waitingCodeBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 16,
  },
  waitingCodeLabel: {
    color: '#A3A3A3',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  waitingCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  waitingCodeText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '800',
  },
  copyBtn: {
    padding: 4,
  },
  waitingRoomSectionTitle: {
    color: '#A3A3A3',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
  },
  waitingParticipantsScroll: {
    maxHeight: 150,
    marginBottom: 16,
  },
  waitingParticipantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  waitingParticipantAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  waitingParticipantName: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 12,
    flex: 1,
  },
  onlineStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  reactionsTitle: {
    color: '#A3A3A3',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  reactionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  reactionBubble: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  startShowBtn: {
    backgroundColor: COLORS.primary,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  startShowBtnText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
  },
  waitingForHostBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  waitingForHostText: {
    color: '#A3A3A3',
    fontSize: 13,
    fontWeight: '600',
  },
  epDownloadContainer: {
    minWidth: 40,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  epDownloadProgressContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  epDownloadProgressText: {
    color: '#e50914',
    fontSize: 9,
    fontWeight: 'bold',
    marginTop: 2,
  },
});
