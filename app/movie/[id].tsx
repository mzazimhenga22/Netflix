import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Image as RNImage, Pressable, ActivityIndicator, Alert, StatusBar, useWindowDimensions, FlatList, Modal } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons, MaterialCommunityIcons, Feather, MaterialIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { TrailerResolver } from '../../components/TrailerResolver';
import { VidLinkResolver } from '../../components/VidLinkResolver';
import { VidLinkStream } from '../../services/vidlink';
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
import { downloadVideo, loadMetadata } from '../../services/downloads';
import { useProfile } from '../../context/ProfileContext';
import { MyListService } from '../../services/MyListService';
import { WatchHistoryService, WatchHistoryItem } from '../../services/WatchHistoryService';
import { useNativeDetails } from '../../hooks/useNativeDetails';

// Removed static SCREEN_WIDTH/HEIGHT constants to prevent orientation-change distortion;
// using useWindowDimensions() inside MovieDetailsScreen instead.

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
        {isActive && activeIcon ? activeIcon : icon}
      </Animated.View>
      <Text style={styles.actionText}>
        {isActive && activeText ? activeText : text}
      </Text>
    </Pressable>
  );
};

export default function MovieDetailsScreen() {
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const { id, type } = useLocalSearchParams();
  const router = useRouter();
  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [isTV, setIsTV] = useState(type === 'tv');
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [activeTab, setActiveTab] = useState<'episodes' | 'more'>(isTV ? 'episodes' : 'more');
  const [showSeasonModal, setShowSeasonModal] = useState(false);
  const { selectedProfile } = useProfile();
  const [isInMyList, setIsInMyList] = useState(false);
  
  // Watch History State
  const [watchProgress, setWatchProgress] = useState<WatchHistoryItem | null>(null);

  // Native Optimization Hook (Data mapping & Palette extraction)
  const { details, palette } = useNativeDetails(movie);

  // Subscribe to Watch History for this specific item
  useEffect(() => {
    if (!selectedProfile || !id) return;
    const unsubscribe = WatchHistoryService.subscribeToHistory(selectedProfile.id, (items) => {
      const historyItem = items.find(item => item.id.toString() === id.toString());
      if (historyItem) {
        setWatchProgress(historyItem as WatchHistoryItem);
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

  // Download Resolution State
  const [downloadVidlinkEnabled, setDownloadVidlinkEnabled] = useState(false);
  const [downloadTarget, setDownloadTarget] = useState<{
    episodeNum?: number;
    title: string;
    image: string;
  } | null>(null);

  const trailerPlayer = useVideoPlayer(resolvedTrailerUrl ?? '', (p) => {
    p.loop = false;
    p.muted = isTrailerMuted;
  });

  // Listen for trailer end to show replay button
  useEffect(() => {
    if (!trailerPlayer || !resolvedTrailerUrl) return;
    
    const interval = setInterval(() => {
      try {
        if (trailerPlayer.duration > 0 && trailerPlayer.currentTime >= trailerPlayer.duration - 0.5) {
          setTrailerHasEnded(true);
          clearInterval(interval);
        }
      } catch (_) {
        // Player may not be ready yet
      }
    }, 500);
    
    return () => clearInterval(interval);
  }, [trailerPlayer, resolvedTrailerUrl]);

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

  const renderSimilarItem = ({ item }: { item: any }) => (
    <Pressable 
      style={styles.similarItem}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push({ pathname: "/movie/[id]", params: { id: item.id.toString(), type: item.media_type || 'movie' } });
      }}
    >
      <ExpoImage 
        source={{ uri: getImageUrl(item.poster_path) }} 
        style={styles.similarPoster} 
        contentFit="cover"
      />
    </Pressable>
  );

  const renderItem = ({ item, index }: any) => {
    if (activeTab === 'episodes') {
      return renderEpisodeItem({ item });
    }
    return renderSimilarItem({ item });
  };

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
  }>({
    url: '',
    headers: null,
    tracks: [],
    currentTitle: ''
  });

  useEffect(() => {
    const loadContent = async () => {
      try {
        setLoading(true);
        const contentType = (type as 'movie' | 'tv') || 'movie';
        const data = await fetchMovieDetails(id as string, contentType);
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
          const fallbackType = type === 'tv' ? 'movie' : 'tv';
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
  }, [id, type]);

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


  const handlePlay = async (episodeNum?: number, overrideSeason?: number) => {
    const movieTitle = movie.title || movie.name;
    const seasonToPlay = overrideSeason || selectedSeason;
    const playTitle = isTV && episodeNum ? `${movieTitle} - S${seasonToPlay} E${episodeNum}` : movieTitle;
    
    console.log(`[Stream V2] 🎬 Play: "${movieTitle}" (isTV: ${isTV}, Season: ${seasonToPlay}, Ep: ${episodeNum || 'N/A'})`);
    
    // Show player IMMEDIATELY to handle loading there
    setIsPlaying(true);

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
        backdropUrl: getImageUrl(movie.backdrop_path || movie.poster_path)
      });
    } catch (error: any) {
      console.error(`[Stream] 💥 Setup Error:`, error.message);
    }
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

      // Instead of starting download immediately, we need to RESOLVE VidLink first
      console.log(`[Download] 🔍 Initiating VidLink resolution for download...`);
      Alert.alert(
        "Preparing Download", 
        "Resolving high-quality download link...",
        [{ text: "OK" }]
      );

      setDownloadTarget({
        episodeNum,
        title: movieTitle,
        image: image || ''
      });
      setDownloadVidlinkEnabled(true);

    } catch (error: any) {
      Alert.alert("Download Error", "Failed to start download. Please try again.");
      console.error("[Download] 💥 Error:", error);
    }
  };

  const handleDownloadStreamResolved = (stream: VidLinkStream) => {
    if (!downloadTarget) return;

    const { episodeNum, title, image } = downloadTarget;
    const primaryId = movie.external_ids?.netflix_id;
    const releaseYear = (movie.release_date || movie.first_air_date || '').split('-')[0];

    console.log(`[Download] ✅ VidLink resolved, starting background download...`);
    
    // Start download in background using the resolved stream
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
      stream     // Pass the pre-resolved VidLink stream!
    ).catch(err => {
      console.error("[Download] ❌ Background download failed:", err);
    });

    // Cleanup
    setDownloadVidlinkEnabled(false);
    setDownloadTarget(null);
  };

  const handleDownloadError = (error: string) => {
    console.error(`[Download] ❌ VidLink Error: ${error}`);
    Alert.alert("Download Failed", "Could not resolve a valid download link. Please try again.");
    setDownloadVidlinkEnabled(false);
    setDownloadTarget(null);
  };

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
    try { trailerPlayer.pause(); } catch (_) {}
  }, [trailerPlayer, resolvedTrailerUrl]);

  const resumeTrailer = useCallback(() => {
    if (!resolvedTrailerUrl || trailerHasEnded || isPlaying) return;
    try { trailerPlayer.play(); } catch (_) {}
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
  const AnimatedFlatList = React.useMemo(() => Animated.createAnimatedComponent(FlatList), []);

  const renderEpisodeItem = useCallback(({ item: ep }: { item: any }) => (
    <Pressable key={ep.id} style={styles.episodeItem} onPress={() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      handlePlay(ep.episode_number);
    }}>
      <View style={styles.episodeMain}>
        <View style={styles.episodeThumbContainer}>
          <ExpoImage 
            source={{ uri: getImageUrl(ep.still_path) }} 
            style={styles.episodeThumb} 
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          {watchProgress && watchProgress.episode === ep.episode_number && watchProgress.season === selectedSeason && watchProgress.duration > 0 && (
            <View style={styles.watchProgressBarBg}>
              <View style={[styles.watchProgressBarFill, { width: `${Math.min(100, Math.max(0, (watchProgress.currentTime / watchProgress.duration) * 100))}%` }]} />
            </View>
          )}
        </View>
        <View style={styles.episodeInfo}>
          <Text style={styles.episodeTitle}>{ep.episode_number}. {ep.name}</Text>
          <Text style={styles.episodeRuntime}>{ep.runtime || 45}m</Text>
        </View>
        <Pressable onPress={() => handleDownload(ep.episode_number)}>
          <Feather name="download" size={20} color="white" style={styles.epDownload} />
        </Pressable>
      </View>
      <Text style={styles.episodeOverview} numberOfLines={3}>{ep.overview || "No description available."}</Text>
    </Pressable>
  ), [selectedSeason, id, movie]);

  if (loading) return <MovieDetailsSkeleton />;
  if (!movie) return null;

  const year = details?.formattedYear || (movie.release_date || movie.first_air_date || '').split('-')[0];
  const runtime = details?.formattedRuntime || (movie.runtime 
    ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` 
    : (movie.number_of_seasons ? `${movie.number_of_seasons} Seasons` : ''));

  if (isPlaying) {
    return (
      <View style={styles.fullScreenPlayer}>
        <StatusBar hidden />
        <ModernVideoPlayer 
          videoUrl={streamConfig.url || undefined}
          headers={streamConfig.headers || undefined}
          title={streamConfig.currentTitle || movie.title || movie.name}
          onClose={() => setIsPlaying(false)}
          tracks={streamConfig.tracks}
          episodes={isTV ? episodes : undefined}
          onEpisodeSelect={(epNum) => handlePlay(epNum)}
          tmdbId={streamConfig.tmdbId}
          contentType={streamConfig.contentType as any}
          releaseYear={streamConfig.releaseYear}
          backdropUrl={streamConfig.backdropUrl}
          episodeNum={streamConfig.episodeNum}
          seasonNum={streamConfig.seasonNum}
          primaryId={streamConfig.primaryId}
          onNextEpisode={
            isTV && streamConfig.episodeNum && episodes?.some(e => e.episode_number === (streamConfig.episodeNum || 0) + 1)
              ? () => handlePlay((streamConfig.episodeNum || 0) + 1)
              : undefined
          }
        />
      </View>
    );
  }

  const handleHeroPlay = () => {
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
  };

  const renderHeader = () => (
    <View>
      {/* Hero Backdrop & Trailer */}
      <Animated.View style={[styles.posterContainer, backdropAnimatedStyle]}>
        {/* Hidden Resolver */}
        {isTrailerResolving && (
            <TrailerResolver 
               tmdbId={id as string} 
               mediaType={isTV ? 'tv' : 'movie'} 
               enabled={!isPlaying && !isTrailerResolving && !trailerHasEnded}
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
          onStreamResolved={handleDownloadStreamResolved}
          onError={handleDownloadError}
        />

        {resolvedTrailerUrl && !trailerHasEnded ? (
          <Animated.View entering={FadeIn.duration(1000)} style={StyleSheet.absoluteFill}>
              <VideoView
                player={trailerPlayer}
                style={styles.backdrop}
                contentFit="cover"
                nativeControls={false}
              />
              <Pressable 
                style={styles.muteButton} 
                onPress={toggleTrailerMute}
                hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              >
                <Ionicons 
                  name={isTrailerMuted ? "volume-mute" : "volume-high"} 
                  size={20} 
                  color="white" 
                />
              </Pressable>
          </Animated.View>
        ) : (
          <AnimatedExpoImage 
            source={{ uri: getBackdropUrl(movie.backdrop_path) }} 
            style={styles.backdrop} 
            contentFit="cover"
            priority="high"
            sharedTransitionTag={`movie-image-${id}`}
          />
        )}

        {trailerHasEnded && (
            <Pressable 
              style={styles.replayOverlay} 
              onPress={() => {
                setTrailerHasEnded(false);
                trailerPlayer.currentTime = 0;
                trailerPlayer.play();
              }}
            >
              <Ionicons name="refresh" size={24} color="white" />
              <Text style={styles.replayText}>Replay</Text>
            </Pressable>
        )}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.7)', palette?.darkVibrant || palette?.dominant || COLORS.background]}
          style={styles.bottomFadeOverlay}
          pointerEvents="none"
        />
        <Animated.View 
            entering={FadeInDown.delay(400).duration(800)} 
            style={styles.heroPlayOverlay}
            pointerEvents="box-none"
          >
          <Pressable style={styles.heroPlayCircle} onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            handleHeroPlay();
          }}>
            <Ionicons name="play" size={32} color="white" style={{ marginLeft: 4 }} />
          </Pressable>
        </Animated.View>
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
          <Text style={styles.top10Label}>#1 in {isTV ? 'TV Shows' : 'Movies'} Today</Text>
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
          <Pressable 
            style={styles.downloadLargeButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              isTV ? handleDownload(1) : handleDownload();
            }}
          >
            <Feather name="download" size={22} color="white" />
            <Text style={styles.downloadLargeText}>Download</Text>
          </Pressable>
        </Animated.View>

        <Animated.Text entering={FadeInUp.delay(1000).duration(800)} style={styles.synopsis}>
          {movie.overview}
        </Animated.Text>

        <Animated.View entering={FadeInUp.delay(1100).duration(800)} style={styles.bentoCard}>
          <Text style={styles.bentoLabel}>Cast & Crew</Text>
          <Text style={styles.credits} numberOfLines={2}>
            {details?.castList || movie.credits?.cast?.slice(0, 5).map((c: any) => c.name).join(', ')}... more
          </Text>
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
            icon={<Feather name="send" size={24} color="white" />}
            text="Share"
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
          <Pressable style={styles.seasonBtn} onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowSeasonModal(true);
          }}>
            <Text style={styles.seasonBtnText}>Season {selectedSeason}</Text>
            <Ionicons name="chevron-down" size={16} color="white" />
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


  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Animated.View style={[styles.container, containerAnimatedStyle, { flex: 1 }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar barStyle="light-content" />

        {/* Dynamic Header */}
        <Animated.View style={[styles.header, headerAnimatedStyle]}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
          <View style={styles.headerContent}>
            <Pressable style={styles.headerCircleBtn} onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}>
              <Ionicons name="chevron-back" size={24} color="white" />
            </Pressable>
            <Text style={styles.headerTitle} numberOfLines={1}>{movie.title || movie.name}</Text>
            <View style={styles.headerRight}>
              <Pressable style={styles.headerCircleBtn}>
                <MaterialCommunityIcons name="cast" size={22} color="white" />
              </Pressable>
              <Pressable style={styles.headerCircleBtn} onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}>
                <Ionicons name="close" size={24} color="white" />
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
              ListHeaderComponent={renderHeader}
              ListFooterComponent={renderFooter}
              numColumns={activeTab === 'more' ? 3 : 1}
              columnWrapperStyle={activeTab === 'more' ? { paddingHorizontal: 4 } : null}
              showsVerticalScrollIndicator={false}
              onScroll={scrollHandler}
              scrollEventThrottle={16}
              removeClippedSubviews={false}
              initialNumToRender={12}
              maxToRenderPerBatch={12}
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
          <Pressable style={styles.modalOverlay} onPress={() => setShowSeasonModal(false)}>
            <View style={styles.seasonModalContent}>
              <Text style={styles.modalTitle}>Select Season</Text>
              <ScrollView contentContainerStyle={styles.seasonList}>
                {movie.seasons?.map((season: any) => (
                  <Pressable 
                    key={season.id} 
                    style={styles.seasonItem}
                    onPress={() => handleSeasonChange(season.season_number)}
                  >
                    <Text style={[
                      styles.seasonText,
                      selectedSeason === season.season_number && styles.seasonTextActive
                    ]}>
                      Season {season.season_number}
                    </Text>
                    {selectedSeason === season.season_number && (
                      <Ionicons name="checkmark" size={24} color={COLORS.primary} />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable style={styles.modalCloseBtn} onPress={() => setShowSeasonModal(false)}>
                <Ionicons name="close" size={32} color="white" />
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      </Animated.View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
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
    marginTop: -20,
  },
  matchBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  matchScore: {
    color: '#46d369',
    fontWeight: 'bold',
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
    fontWeight: '500',
  },
  ratingBadge: {
    backgroundColor: '#333',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  ratingText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: 'bold',
  },
  hdBadge: {
    borderColor: 'rgba(255,255,255,0.4)',
    borderWidth: 1,
    paddingHorizontal: 4,
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
    backgroundColor: '#262626',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
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
    borderRadius: 4,
    backgroundColor: '#1a1a1a',
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
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  seasonBtnText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  episodeItem: {
    paddingHorizontal: SPACING.md,
    marginBottom: 25,
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
    borderRadius: 4,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  seasonModalContent: {
    width: '100%',
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  modalTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  seasonList: {
    alignItems: 'center',
    gap: 20,
  },
  seasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    paddingVertical: 10,
  },
  seasonText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 20,
    fontWeight: '500',
  },
  seasonTextActive: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  modalCloseBtn: {
    marginTop: 50,
    backgroundColor: 'white',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
