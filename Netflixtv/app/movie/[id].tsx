import React, { useEffect, useMemo, useState, useCallback, memo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Pressable, 
  ScrollView, 
  FlatList,
  ActivityIndicator,
  Dimensions,
  Alert,
  Modal,
  useWindowDimensions
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fetchMovieDetails, getBackdropUrl, fetchMovieImages, getLogoUrl, fetchSeasonDetails, getImageUrl, fetchSimilar } from '../../services/tmdb';
import { useProfile } from '../../context/ProfileContext';
import { MyListService } from '../../services/MyListService';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ModernVideoPlayer } from '../../components/ModernVideoPlayer';
import Animated, { FadeIn, FadeInDown, FadeOut, SlideInRight, SlideOutRight, useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import ColorExtractor from '../../components/ColorExtractor';
import { COLORS } from '../../constants/theme';
import { usePageColor } from '../../context/PageColorContext';
import { downloadVideo, DownloadItem, loadMetadata } from '../../services/downloads';
import { fetchImdbTrailer, TrailerSource } from '../../services/trailers';
import { WatchHistoryService, WatchHistoryItem } from '../../services/WatchHistoryService';
import { VidLinkStream } from '../../services/vidlink';
import { resolveStreamFromCloud, invalidateCacheEntry } from '../../services/cloudResolver';
import LoadingSpinner from '../../components/LoadingSpinner';
import { isTitleLockedForSubscription } from '../../services/contentAccess';


const AnimatedImage = Animated.createAnimatedComponent(Image);

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function MovieDetailScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const params = useLocalSearchParams();
  const { id, type: typeParam, season, episode } = params;
  const getParamString = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  
  // Auto-detect content type if not provided or incorrect
  const rawType = typeParam as string;
  const [contentType, setContentType] = useState<string>(rawType || 'movie');
  
  // Initial state from params for instant UI
  const [movie, setMovie] = useState<any>(() => {
    if (params.title) {
      return {
        id: id,
        title: params.title,
        name: params.title,
        poster_path: params.poster,
        backdrop_path: params.backdrop,
        overview: params.overview,
        release_date: params.year ? `${params.year}-01-01` : undefined,
        first_air_date: params.year ? `${params.year}-01-01` : undefined,
        vote_average: params.rating ? parseFloat(params.rating as string) : 0,
        genres: [], // Will be filled by full fetch
      };
    }
    return null;
  });

  const [loading, setLoading] = useState(!params.title);
  const [isPlaying, setIsPlaying] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [heroColors, setHeroColors] = useState<readonly [string, string, string]>(['#000', '#000', '#000']);
  const { setPageColor } = usePageColor();
  
  // Entrance Animation
  const entranceScale = useSharedValue(1.1);
  const entranceOpacity = useSharedValue(0);

  useEffect(() => {
    entranceScale.value = withTiming(1, { duration: 800 });
    entranceOpacity.value = withTiming(1, { duration: 600 });
  }, []);

  const animatedEntranceStyle = useAnimatedStyle(() => ({
    transform: [{ scale: entranceScale.value }],
    opacity: entranceOpacity.value,
  }));

  // Episode State
  const [showEpisodesView, setShowEpisodesView] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [playEpisode, setPlayEpisode] = useState<{ season: number; episode: number } | null>(null);
  const [isInMyList, setIsInMyList] = useState(false);
  const { selectedProfile, subscriptionStatus } = useProfile();
  
  // Download State
  const [isResolvingForDownload, setIsResolvingForDownload] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState<'none' | 'downloading' | 'completed' | 'failed'>('none');
  const [downloadedItems, setDownloadedItems] = useState<DownloadItem[]>([]);
  
  // Watch History State
  const [watchProgress, setWatchProgress] = useState<WatchHistoryItem | null>(() => {
    const routeResumeTime = Number(getParamString(params.resumeTime as any) || 0);
    const routeResumeDuration = Number(getParamString(params.resumeDuration as any) || 0);
    if (!id || !Number.isFinite(routeResumeTime) || routeResumeTime <= 5) return null;

    const routeSeason = Number(getParamString(season as any) || 1);
    const routeEpisode = Number(getParamString(episode as any) || 1);
    const routeTitle = getParamString(params.title as any);

    return {
      id: id.toString(),
      type: (rawType === 'tv' ? 'tv' : 'movie'),
      currentTime: routeResumeTime,
      duration: Number.isFinite(routeResumeDuration) && routeResumeDuration > 0 ? routeResumeDuration : 0,
      lastUpdated: Date.now(),
      season: rawType === 'tv' ? (Number.isFinite(routeSeason) ? routeSeason : 1) : undefined,
      episode: rawType === 'tv' ? (Number.isFinite(routeEpisode) ? routeEpisode : 1) : undefined,
      item: {
        id,
        title: routeTitle,
        name: routeTitle,
        poster_path: getParamString(params.poster as any),
        backdrop_path: getParamString(params.backdrop as any),
        overview: getParamString(params.overview as any),
        media_type: rawType,
      },
    };
  });

  // Rating State (0 = unrated, 1 = thumbs down, 2 = thumbs up, 3 = love it)
  const [userRating, setUserRating] = useState<0 | 1 | 2 | 3>(0);

  // More Like This state
  const [showMoreLikeThis, setShowMoreLikeThis] = useState(false);
  const [similarTitles, setSimilarTitles] = useState<any[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);

  // Episode download resolver
  const [episodeToDownload, setEpisodeToDownload] = useState<any | null>(null);
  const [isResolvingEpDownload, setIsResolvingEpDownload] = useState(false);

  // Trailers & More state (in Episodes View)
  const [activeTab, setActiveTab] = useState<'episodes' | 'trailers'>('episodes');
  const [trailers, setTrailers] = useState<TrailerSource[]>([]);
  const [trailersLoading, setTrailersLoading] = useState(false);
  const [playingTrailerUrl, setPlayingTrailerUrl] = useState<string | null>(null);
  const [isContentLocked, setIsContentLocked] = useState(false);

  const router = useRouter();

  // Unified Always-On Player State
  const isVideoActive = isPlaying || playEpisode !== null || playingTrailerUrl !== null;

  const detailsOpacity = useSharedValue(1);
  const detailsScale = useSharedValue(1);
  useEffect(() => {
    detailsOpacity.value = withTiming(isVideoActive ? 0 : 1, { duration: 700, easing: Easing.out(Easing.cubic) });
    detailsScale.value = withTiming(isVideoActive ? 0.95 : 1, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [isVideoActive, detailsOpacity, detailsScale]);

  const animatedDetailsStyle = useAnimatedStyle(() => ({
    opacity: detailsOpacity.value,
    transform: [{ scale: detailsScale.value }],
  }));

  useEffect(() => {
    async function loadData() {
      try {
        if (!params.title) setLoading(true);
        
        const fetchType = contentType as any;
        const [details, images] = await Promise.all([
          fetchMovieDetails(id as string, fetchType),
          fetchMovieImages(id as string, fetchType)
        ]);
        
        let correctedType = fetchType;
        if (details.name && !details.title && contentType !== 'tv') {
          correctedType = 'tv';
          setContentType('tv');
        } else if (details.title && !details.name && contentType !== 'movie') {
          correctedType = 'movie';
          setContentType('movie');
        }

        if (correctedType !== fetchType) {
          const [correctedDetails, correctedImages] = await Promise.all([
            fetchMovieDetails(id as string, correctedType),
            fetchMovieImages(id as string, correctedType)
          ]);
          setMovie((prev: any) => ({ ...prev, ...correctedDetails }));
          if (correctedImages?.logos?.length > 0) {
            const engLogo = correctedImages.logos.find((l: any) => l.iso_639_1 === 'en');
            setLogoUrl(getLogoUrl(engLogo?.file_path || correctedImages.logos[0].file_path) || null);
          }
        } else {
          setMovie((prev: any) => ({ ...prev, ...details }));
          if (images?.logos?.length > 0) {
            const engLogo = images.logos.find((l: any) => l.iso_639_1 === 'en');
            setLogoUrl(getLogoUrl(engLogo?.file_path || images.logos[0].file_path) || null);
          }
        }

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]); 
// contentType removed from deps to prevent double fetch on auto-correction

  // Hard guard: compute lock status and block rendering entirely
  useEffect(() => {
    setIsContentLocked(isTitleLockedForSubscription(id as string, subscriptionStatus));
  }, [id, subscriptionStatus]);

  // Invalidate cached stream for this title on mount so the player
  // gets a fresh URL instead of reusing one the preview ExoPlayer consumed
  useEffect(() => {
    if (id) {
      invalidateCacheEntry(id as string, contentType, undefined, undefined);
      // Also invalidate TV S1E1 which is the default preview episode
      if (contentType === 'tv') {
        invalidateCacheEntry(id as string, 'tv', 1, 1);
      }
    }
  }, [id, contentType]);

  // Fetch episodes when season changes (TV shows only)
  useEffect(() => {
    if (contentType !== 'tv' || !movie) return;
    async function loadEpisodes() {
      setEpisodesLoading(true);
      try {
        const seasonData = await fetchSeasonDetails(id as string, selectedSeason);
        setEpisodes(seasonData.episodes || []);
      } catch (e) {
        console.error('[Details] Failed to load episodes:', e);
        setEpisodes([]);
      } finally {
        setEpisodesLoading(false);
      }
    }
    loadEpisodes();
  }, [id, selectedSeason, contentType, movie?.id]);

  useEffect(() => {
    setEpisodes([]);
    const s = season ? parseInt(season as string, 10) : 1;
    setSelectedSeason(isNaN(s) ? 1 : s);
    setPlayEpisode(null);
  }, [id, season]);

  // Subscribe to Watch History for this title
  useEffect(() => {
    if (!selectedProfile?.id || !id) return;
    let active = true;

    WatchHistoryService.getProgress(selectedProfile.id, id as string).then((historyItem) => {
      if (!active) return;
      setWatchProgress(historyItem);
    });

    const unsub = WatchHistoryService.subscribeToHistory(selectedProfile.id, async (items) => {
      if (!active) return;
      const historyItem = items.find(hi => hi.id.toString() === id.toString());
      if (historyItem) {
        setWatchProgress(historyItem as WatchHistoryItem);
      } else {
        const localHistoryItem = await WatchHistoryService.getProgress(selectedProfile.id, id as string);
        if (active) setWatchProgress(localHistoryItem);
      }
    });
    return () => {
      active = false;
      unsub();
    };
  }, [id, selectedProfile?.id]);

  // Check if in My List
  useEffect(() => {
    async function checkMyList() {
      if (selectedProfile?.id && movie?.id) {
        const inList = await MyListService.isInList(selectedProfile.id, movie.id);
        setIsInMyList(inList);
      }
    }
    checkMyList();
  }, [movie?.id, selectedProfile?.id]);
  // Load downloads to check status
  useEffect(() => {
    async function checkDownloads() {
      const items = await loadMetadata();
      setDownloadedItems(items);
      
      if (movie?.id) {
        const item = items.find(i => i.tmdbId === movie.id.toString() && i.type === contentType);
        if (item) setDownloadStatus(item.status as any);
      }
    }
    checkDownloads();
  }, [movie?.id, contentType]);

  const handleEpisodeDownload = async (episode: any) => {
    if (!movie) return;

    const epId = `${movie.id}_tv_s${selectedSeason}_e${episode.episode_number}`;
    const existing = downloadedItems.find(i => i.id === epId);
    if (existing?.status === 'completed') {
      Alert.alert('Already Downloaded', `Episode ${episode.episode_number} is already available offline.`);
      return;
    }

    // Resolve stream via Cloud Function (same as player)
    setEpisodeToDownload(episode);
    setIsResolvingEpDownload(true);
    try {
      const result = await resolveStreamFromCloud(
        movie.id.toString(),
        'tv',
        selectedSeason,
        episode.episode_number,
        { title: movie.name || movie.title }
      );
      if (!result?.url) {
        Alert.alert('Error', 'Could not resolve a download link for this episode.');
        return;
      }

      const resolvedStream: VidLinkStream = {
        url: result.url,
        headers: result.headers,
        captions: result.captions || [],
        markers: result.markers || [],
        sourceId: result.sourceId,
      };

      await downloadVideo(
        movie.id.toString(),
        movie.name || movie.title,
        'tv',
        getImageUrl(movie.poster_path),
        selectedSeason,
        episode.episode_number,
        undefined,
        movie.first_air_date?.split('-')[0],
        undefined,
        resolvedStream
      );
      Alert.alert('Download Started', `S${selectedSeason}E${episode.episode_number} is downloading.`);
    } catch (error) {
      console.error('[Download] Episode failed:', error);
      Alert.alert('Error', 'Download failed for this episode.');
    } finally {
      setEpisodeToDownload(null);
      setIsResolvingEpDownload(false);
    }
  };

  const handleDownload = async () => {
    if (!movie) return;
    
    if (contentType === 'tv') {
      Alert.alert('Download TV Show', 'Please select an individual episode to download from the Episodes & More section.');
      return;
    }

    if (downloadStatus === 'completed') {
      Alert.alert('Already Downloaded', 'This movie is already available offline.');
      return;
    }

    // Resolve stream via Cloud Function (same as player)
    setIsResolvingForDownload(true);
    setDownloadStatus('downloading');
    try {
      const result = await resolveStreamFromCloud(
        movie.id.toString(),
        contentType as 'movie' | 'tv',
        undefined,
        undefined,
        { title: movie.title || movie.name }
      );
      if (!result?.url) {
        setDownloadStatus('failed');
        Alert.alert('Error', 'Could not resolve a download link for this title.');
        return;
      }

      const resolvedStream: VidLinkStream = {
        url: result.url,
        headers: result.headers,
        captions: result.captions || [],
        markers: result.markers || [],
        sourceId: result.sourceId,
      };

      await downloadVideo(
        movie.id.toString(),
        movie.title || movie.name,
        'movie',
        getImageUrl(movie.poster_path),
        undefined,
        undefined,
        undefined,
        movie.release_date?.split('-')[0],
        (p) => setDownloadProgress(p),
        resolvedStream
      );
      setDownloadStatus('completed');
    } catch (error) {
      console.error('[Download] Failed:', error);
      setDownloadStatus('failed');
    } finally {
      setIsResolvingForDownload(false);
    }
  };

  const handleToggleMyList = useCallback(async () => {
    if (selectedProfile?.id && movie) {
      const added = await MyListService.toggleItem(selectedProfile.id, movie);
      setIsInMyList(added);
    }
  }, [selectedProfile?.id, movie]);

  const handleColorExtracted = useCallback((color: string) => {
     setHeroColors([`${color}B3`, `${color}66`, '#000000']);
     setPageColor(color);
  }, [setPageColor]);

  const handleRating = useCallback(async (rating: 0 | 1 | 2 | 3) => {
    setUserRating(prev => prev === rating ? 0 : rating);
    // TODO: persist to Firestore if you add a RatingsService
  }, []);

  const handleMoreLikeThis = useCallback(async () => {
    setShowMoreLikeThis(true);
    if (similarTitles.length > 0) return;
    setSimilarLoading(true);
    try {
      const data = await fetchSimilar(movie?.id?.toString(), contentType as any);
      setSimilarTitles(data || []);
    } catch (e) {
      console.error('[MoreLikeThis]', e);
    } finally {
      setSimilarLoading(false);
    }
  }, [movie?.id, contentType, similarTitles.length]);

  const handleOpenTrailersTab = useCallback(async () => {
    setActiveTab('trailers');
    if (trailers.length > 0) return;
    setTrailersLoading(true);
    try {
      const results = await fetchImdbTrailer(id as string, contentType as any);
      if (results) setTrailers(results);
    } catch (e) {
      console.error('[Trailers] Error:', e);
    } finally {
      setTrailersLoading(false);
    }
  }, [id, contentType, trailers.length]);

  // -----------------------------------------------------------------------------------
  // PRE-RENDER LOGIC & METADATA
  // -----------------------------------------------------------------------------------
  const backdrop = getBackdropUrl(movie?.backdrop_path);
  const releaseYear = (movie?.release_date || movie?.first_air_date)?.split('-')[0] || '2026';
  const isTv = contentType === 'tv';
  
  const genres = movie?.genres?.map((g: any) => g.name).slice(0, 2).join(', ') || 'Drama';
  let durationText = '';
  if (isTv) {
    const epCount = movie?.number_of_episodes || (episodes.length > 0 ? episodes.length : 6);
    durationText = `${epCount} Episodes`;
  } else {
    durationText = `${Math.floor((movie?.runtime || 0) / 60)}h ${(movie?.runtime || 0) % 60}m`;
  }
  
  const metadataString = `${releaseYear} · ${genres} · ${durationText}   HD`;
  const watchedRatio = watchProgress?.duration ? watchProgress.currentTime / watchProgress.duration : 0;
  const hasResumableProgress = !!watchProgress
    && !!movie?.id
    && watchProgress.id.toString() === movie.id.toString()
    && watchProgress.currentTime > 5
    && watchedRatio > 0
    && watchedRatio <= 0.95;

  const playTarget = useMemo(() => {
    if (!isTv) {
      return {
        season: undefined as number | undefined,
        episode: undefined as number | undefined,
        initialTime: hasResumableProgress ? watchProgress?.currentTime || 0 : 0,
        label: hasResumableProgress ? 'Resume' : 'Play',
        progressPercent: hasResumableProgress ? Math.min(100, Math.max(0, watchedRatio * 100)) : 0,
      };
    }

    let seasonToPlay = 1;
    let episodeToPlay = 1;
    let initialTime = 0;

    if (movie?.id && watchProgress && watchProgress.id.toString() === movie.id.toString()) {
      seasonToPlay = watchProgress.season || 1;
      episodeToPlay = watchProgress.episode || 1;

      if (hasResumableProgress) {
        initialTime = watchProgress.currentTime;
      } else if (watchedRatio > 0.95 && watchProgress.episode) {
        episodeToPlay = watchProgress.episode + 1;
      }
    }

    return {
      season: seasonToPlay,
      episode: episodeToPlay,
      initialTime,
      label: initialTime > 5 ? `Resume S${seasonToPlay}E${episodeToPlay}` : `Play S${seasonToPlay}E${episodeToPlay}`,
      progressPercent: initialTime > 5 ? Math.min(100, Math.max(0, watchedRatio * 100)) : 0,
    };
  }, [hasResumableProgress, isTv, movie?.id, watchProgress, watchedRatio]);

  const getInitialTimeForPlayer = useCallback(() => {
    if (playingTrailerUrl) return 0;
    if (!movie?.id || !watchProgress || watchProgress.id.toString() !== movie.id.toString()) return 0;
    if (contentType === 'tv' && playEpisode) {
      const epMatch = watchProgress.episode === playEpisode.episode
        && (watchProgress.season || 1) === playEpisode.season;
      if (!epMatch) return 0;
    }
    if (watchProgress.duration > 0 && (watchProgress.currentTime / watchProgress.duration) > 0.95) return 0;
    return watchProgress.currentTime;
  }, [contentType, movie?.id, playEpisode, playingTrailerUrl, watchProgress]);

  // Invalidate cache before player opens so it resolves a fresh stream
  useEffect(() => {
    if (isVideoActive && !playingTrailerUrl && movie?.id) {
      invalidateCacheEntry(
        movie.id.toString(),
        contentType,
        playEpisode?.season,
        playEpisode?.episode
      );
    }
  }, [isVideoActive, playingTrailerUrl, movie?.id, contentType, playEpisode]);

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingSpinner size={92} label="Loading title" />
      </View>
    );
  }

  if (!movie) {
    return (
      <View style={styles.center}>
        <Text style={{color: 'white', fontSize: 24, fontWeight: 'bold', marginBottom: 20}}>Title not found.</Text>
        <Text style={{color: 'gray', fontSize: 16, marginBottom: 40}}>This title may have been removed or is temporarily unavailable.</Text>
        <Pressable 
          onPress={() => router.back()} 
          style={({ focused }) => [
            { paddingHorizontal: 30, paddingVertical: 15, backgroundColor: 'white', borderRadius: 8 },
            focused && { transform: [{ scale: 1.05 }] }
          ]}
        >
           <Text style={{color: 'black', fontSize: 20, fontWeight: 'bold'}}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // -----------------------------------------------------------------------------------
  // MAIN RENDER
  // -----------------------------------------------------------------------------------
  return (
    <View style={styles.container}>
      {/* 0. Unified Always-On Video Player Layer */}
      {!isContentLocked && (
        <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 0 }]}>
          <ModernVideoPlayer
            videoUrl={playingTrailerUrl || undefined}
            tmdbId={playingTrailerUrl ? undefined : movie.id.toString()}
            contentType={playingTrailerUrl ? undefined : contentType as any}
            title={playingTrailerUrl ? `${movie.title || movie.name} (Trailer)` : (movie.title || movie.name)}
            seasonNum={playEpisode?.season}
            episodeNum={playEpisode?.episode}
            episodes={episodes}
            itemData={movie}
            isBackgroundMode={!isVideoActive}
            onEpisodeSelect={(epNum) => setPlayEpisode({ season: selectedSeason, episode: epNum })}
            onNextEpisode={() => {
              if (contentType === 'tv' && playEpisode) {
                const nextEpNum = playEpisode.episode + 1;
                const hasNext = episodes.some(e => e.episode_number === nextEpNum);
                if (hasNext) {
                  setPlayEpisode({ season: selectedSeason, episode: nextEpNum });
                } else {
                  setIsPlaying(false);
                  setPlayEpisode(null);
                }
              }
            }}
            onClose={() => { 
              setIsPlaying(false); 
              setPlayEpisode(null); 
              setPlayingTrailerUrl(null); 
            }}
            initialTime={getInitialTimeForPlayer()}
          />
        </Animated.View>
      )}

      {/* 1. Locked Screen Layer */}
      {isContentLocked && (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={[StyleSheet.absoluteFill, styles.center, { zIndex: 1000 }]}>
          <View style={{ alignItems: 'center', paddingHorizontal: 60 }}>
            <Text style={{ fontSize: 64, marginBottom: 20 }}>🔒</Text>
            <Text style={{ color: '#E50914', fontSize: 32, fontWeight: '900', marginBottom: 12, textAlign: 'center' }}>
              Premium Content
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 20, textAlign: 'center', lineHeight: 30, marginBottom: 40, maxWidth: 600 }}>
              This title is only available on a paid plan. Upgrade your subscription to unlock all movies and shows.
            </Text>
            <View style={{ flexDirection: 'row', gap: 20 }}>
              <Pressable
                onPress={() => router.push('/upgrade' as any)}
                style={({ focused }) => [
                  { paddingHorizontal: 36, paddingVertical: 16, backgroundColor: '#E50914', borderRadius: 8 },
                  focused && { transform: [{ scale: 1.08 }], backgroundColor: '#ff1a25' },
                ]}
                hasTVPreferredFocus={true}
              >
                <Text style={{ color: 'white', fontSize: 22, fontWeight: 'bold' }}>⬆ Upgrade Now</Text>
              </Pressable>
              <Pressable
                onPress={() => router.back()}
                style={({ focused }) => [
                  { paddingHorizontal: 36, paddingVertical: 16, backgroundColor: 'rgba(100,100,100,0.6)', borderRadius: 8 },
                  focused && { transform: [{ scale: 1.08 }], backgroundColor: 'rgba(150,150,150,0.7)' },
                ]}
              >
                <Text style={{ color: 'white', fontSize: 22, fontWeight: 'bold' }}>Go Back</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      )}

      {/* 3. Episodes & More Overlay Layer */}
      {!isContentLocked && showEpisodesView && (
        <Animated.View 
          entering={SlideInRight.duration(400).easing(Easing.out(Easing.cubic))} 
          exiting={SlideOutRight.duration(350).easing(Easing.in(Easing.cubic))}
          style={[StyleSheet.absoluteFill, { zIndex: isVideoActive ? 0 : 20 }]}
        >
          <View style={styles.episodesContainer}>
             <View style={styles.episodesLeftPane}>
                {isTv && (
                  <View style={styles.nSeriesContainerSmall}>
                    <Image source={require('../../assets/images/netflix-n-logo.svg')} style={styles.nLogoSmall} contentFit="contain" />
                    <Text style={styles.nSeriesTextSmall}>SERIES</Text>
                  </View>
                )}
                {logoUrl ? (
                  <Image source={{ uri: logoUrl }} style={styles.episodesLogoText} contentFit="contain" />
                ) : (
                  <Text style={styles.episodesLogoTextFallback}>{movie.title || movie.name}</Text>
                )}
                <View style={styles.episodesMetaRow}>
                  <Text style={styles.episodesMetaText}>{releaseYear} · {durationText}</Text>
                  <View style={styles.ratingBadgeSmall}><Text style={styles.ratingTextSmall}>16+</Text></View>
                </View>
                <View style={styles.episodesMenu}>
                   <Pressable 
                     style={({ focused }) => [styles.episodesMenuItem, (activeTab === 'episodes' || focused) && styles.episodesMenuItemFocused, activeTab === 'episodes' && styles.episodesMenuItemActiveCard]}
                     onPress={() => setActiveTab('episodes')}
                     hasTVPreferredFocus={activeTab === 'episodes'}
                   >
                      <Text style={[styles.episodesMenuItemText, activeTab === 'episodes' && styles.episodesMenuItemTextActive]} numberOfLines={1}>{movie.name || movie.title}</Text>
                      <Text style={[styles.episodesMenuItemText, activeTab === 'episodes' && styles.episodesMenuItemTextActive]}>{movie.number_of_episodes || episodes.length || 6} episodes</Text>
                   </Pressable>
                   <Pressable 
                     style={({ focused }) => [styles.episodesMenuItem, (activeTab === 'trailers' || focused) && styles.episodesMenuItemFocused, activeTab === 'trailers' && styles.episodesMenuItemActiveCard]}
                     onPress={handleOpenTrailersTab}
                   >
                      <Text style={[styles.episodesMenuItemText, activeTab === 'trailers' && styles.episodesMenuItemTextActive]}>Trailers & More</Text>
                      <Text style={[styles.episodesMenuItemText, activeTab === 'trailers' && styles.episodesMenuItemTextActive]}>{trailers.length > 0 ? trailers.length : 1} video</Text>
                   </Pressable>
                </View>
             </View>
             <View style={styles.episodesRightPane}>
                {activeTab === 'episodes' ? (
                  <>
                    {movie.number_of_seasons > 1 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.seasonTabsContainer} contentContainerStyle={styles.seasonTabsContent}>
                        {Array.from({ length: movie.number_of_seasons }, (_, i) => i + 1).map((s) => (
                          <Pressable key={s} onPress={() => setSelectedSeason(s)} style={({ focused }) => [styles.seasonTab, selectedSeason === s && styles.seasonTabActive, focused && styles.seasonTabFocused]}>
                            <Text style={[styles.seasonTabText, selectedSeason === s && styles.seasonTabTextActive]}>Season {s}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    )}
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.episodesScrollContent}>
                       {episodesLoading ? (
                         <View style={{ marginTop: 100, alignItems: 'center' }}><LoadingSpinner size={82} label="Loading episodes" /></View>
                       ) : (
                         episodes.map((ep: any) => (
                           <Pressable key={ep.id} onPress={() => setPlayEpisode({ season: selectedSeason, episode: ep.episode_number })} style={({ focused }) => [styles.episodeCard, focused && styles.episodeCardFocused]}>
                             <View style={styles.episodeThumbContainer}>
                               <Image source={{ uri: getImageUrl(ep.still_path) }} style={styles.episodeThumbRight} contentFit="cover" />
                               {watchProgress && watchProgress.episode === ep.episode_number && watchProgress.season === selectedSeason && watchProgress.duration > 0 && (
                                <View style={styles.episodeProgressBarContainer}><View style={[styles.episodeProgressBarFill, { width: `${Math.min(100, Math.max(0, (watchProgress.currentTime / watchProgress.duration) * 100))}%` }]} /></View>
                               )}
                               <Text style={styles.episodeThumbOverlayText}>Episode {ep.episode_number}</Text>
                             </View>
                             <View style={styles.episodeInfoRight}>
                               <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                 <Text style={styles.episodeTitleRight} numberOfLines={1}>{ep.name}</Text>
                                 <Pressable onPress={() => handleEpisodeDownload(ep)} style={({ focused }) => [styles.episodeDownloadBtnSmall, focused && { backgroundColor: 'rgba(255,255,255,0.2)' }]}><Ionicons name="download-outline" size={20} color="white" /></Pressable>
                               </View>
                               <Text style={styles.episodeOverviewRight} numberOfLines={3}>{ep.overview}</Text>
                               <Text style={styles.episodeRuntimeRight}>({ep.runtime || 40}m)</Text>
                             </View>
                           </Pressable>
                         ))
                       )}
                    </ScrollView>
                  </>
                ) : (
                  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.episodesScrollContent}>
                     <Text style={styles.trailerTabHeader}>Trailers & Featurettes</Text>
                     {trailersLoading ? (
                       <View style={{ marginTop: 100, alignItems: 'center' }}><LoadingSpinner size={82} label="Loading trailers" /></View>
                     ) : trailers.length === 0 ? (
                       <Text style={{color: 'rgba(255,255,255,0.5)', fontSize: 18, marginTop: 40}}>No trailers found.</Text>
                     ) : (
                       <View style={styles.trailerGrid}>
                         {trailers.map((t, i) => (
                           <Pressable key={i} style={({ focused }) => [styles.trailerCard, focused && styles.trailerCardFocused]} onPress={() => setPlayingTrailerUrl(t.url)}>
                             <Image source={{ uri: getBackdropUrl(movie.backdrop_path) || getImageUrl(movie.poster_path) }} style={styles.trailerThumb} contentFit="cover" />
                             <View style={styles.trailerPlayOverlay}><Ionicons name="play-circle-outline" size={40} color="white" /></View>
                             <Text style={styles.trailerTitle}>Trailer {i + 1} ({t.quality})</Text>
                           </Pressable>
                         ))}
                       </View>
                     )}
                  </ScrollView>
                )}
             </View>
             <Pressable style={({ focused }) => [styles.backBtn, focused && styles.backBtnFocused]} onPress={() => setShowEpisodesView(false)}>
                <Ionicons name="arrow-back" size={28} color="white" />
             </Pressable>
          </View>
        </Animated.View>
      )}

      {/* 4. Details UI Layer */}
      {!isContentLocked && !showEpisodesView && (
        <Animated.View 
          style={[StyleSheet.absoluteFill, { zIndex: 10 }, animatedDetailsStyle]}
          pointerEvents={isVideoActive ? 'none' : 'auto'}
          entering={FadeIn.duration(400)}
          exiting={FadeOut.duration(400)}
          key="details-layer"
        >
          <View style={styles.ambientBackground}>
             <LinearGradient colors={heroColors} style={StyleSheet.absoluteFill} />
          </View>
          <ColorExtractor imageUrl={backdrop || ''} onColorExtracted={handleColorExtracted} />
          <View style={styles.backdropContainer}>
            <Image source={{ uri: backdrop }} style={styles.backdrop} contentFit="cover" cachePolicy="memory-disk" transition={400} priority="high" />

            <LinearGradient colors={['rgba(0,0,0,0.95)', 'rgba(0,0,0,0.7)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.65, y: 0 }} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)', '#000']} locations={[0.3, 0.75, 1]} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={['rgba(0,0,0,0.4)', 'transparent']} locations={[0, 0.3]} style={[StyleSheet.absoluteFill, { height: '30%' }]} />
          </View>

          <ScrollView style={[StyleSheet.absoluteFill, styles.mainContent]} contentContainerStyle={styles.mainContentScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.leftColumn}>
               <Animated.View entering={FadeIn.delay(100)} style={styles.nSeriesContainer}>
                  <Image source={require('../../assets/images/netflix-n-logo.svg')} style={styles.nLogo} contentFit="contain" />
                  <Text style={styles.nSeriesText}>{isTv ? 'S E R I E S' : 'F I L M'}</Text>
               </Animated.View>

               {logoUrl ? (
                 <AnimatedImage entering={FadeInDown.delay(200).springify()} source={{ uri: logoUrl }} style={styles.mainLogoImage} contentFit="contain" />
               ) : (
                 <Animated.Text entering={FadeInDown.delay(200)} style={styles.mainTitleFallback}>{movie.title || movie.name}</Animated.Text>
               )}

               <Animated.View entering={FadeInDown.delay(300)} style={styles.metaRowVertical}>
                  <Text style={styles.metaYear}>{releaseYear}</Text>
                  <View style={styles.metaPill}><Text style={styles.metaPillText}>16+</Text></View>
                  <Text style={styles.metaDuration}>{durationText}</Text>
                  <View style={styles.metaPillHD}><Text style={styles.metaPillHDText}>HD</Text></View>
                  <MaterialCommunityIcons name="closed-caption-outline" size={20} color="rgba(255,255,255,0.6)" />
               </Animated.View>

               <Text style={styles.genresText}>{genres}</Text>
               <Text style={styles.mainOverview} numberOfLines={4}>{movie.overview}</Text>

               <View style={styles.creditsSection}>
                 <Text style={styles.creditLabel}>Cast: <Text style={styles.creditValue}>{movie.credits?.cast?.slice(0, 4).map((c: any) => c.name).join(', ')}</Text></Text>
                 {movie.created_by?.length > 0 && (
                   <Text style={styles.creditLabel}>Creator: <Text style={styles.creditValue}>{movie.created_by.map((c: any) => c.name).join(', ')}</Text></Text>
                 )}
               </View>

               <View style={styles.actionRow}>
                  <Pressable style={({ focused }) => [styles.playBtn, focused && styles.playBtnFocused]} onPress={() => {
                    if (isTv) {
                      const seasonToPlay = playTarget.season || 1;
                      const episodeToPlay = playTarget.episode || 1;
                      setSelectedSeason(seasonToPlay);
                      setPlayEpisode({ season: seasonToPlay, episode: episodeToPlay });
                    } else { setIsPlaying(true); }
                  }} hasTVPreferredFocus={true}>
                    <Ionicons name="play" size={26} color="black" />
                    <Text style={styles.playBtnText}>{playTarget.label}</Text>
                  </Pressable>

                  {isTv && (
                    <Pressable style={({ focused }) => [styles.actionCircle, focused && styles.actionCircleFocused]} onPress={() => setShowEpisodesView(true)}>
                       <MaterialCommunityIcons name="layers-outline" size={26} color="white" />
                       <Text style={styles.actionCircleLabel}>Episodes</Text>
                    </Pressable>
                  )}

                  <Pressable style={({ focused, pressed }) => [styles.actionCircle, focused && styles.actionCircleFocused, pressed && styles.actionCirclePressed, isInMyList && styles.actionCircleActive]} onPress={handleToggleMyList}>
                    <Ionicons name={isInMyList ? "checkmark" : "add"} size={26} color="white" />
                    <Text style={styles.actionCircleLabel}>My List</Text>
                  </Pressable>

                  <Pressable style={({ focused, pressed }) => [styles.actionCircle, focused && styles.actionCircleFocused, pressed && styles.actionCirclePressed, userRating > 0 && styles.actionCircleActive]} onPress={() => handleRating(userRating === 2 ? 0 : 2)}>
                    <MaterialCommunityIcons name={userRating === 1 ? 'thumb-down' : userRating >= 2 ? 'thumb-up' : 'thumb-up-outline'} size={26} color={userRating === 1 ? '#E50914' : userRating >= 2 ? '#46d369' : 'white'} />
                    <Text style={styles.actionCircleLabel}>{userRating === 1 ? 'Not for me' : userRating >= 2 ? 'Rated' : 'Rate'}</Text>
                  </Pressable>

                  <Pressable style={({ focused, pressed }) => [styles.actionCircle, focused && styles.actionCircleFocused, pressed && styles.actionCirclePressed, downloadStatus === 'completed' && styles.actionCircleActive]} onPress={() => handleDownload()} disabled={downloadStatus === 'downloading' || isResolvingForDownload}>
                    {downloadStatus === 'downloading' || isResolvingForDownload ? <ActivityIndicator size="small" color="white" /> : <Ionicons name={downloadStatus === 'completed' ? "checkmark-done" : "download-outline"} size={26} color={downloadStatus === 'completed' ? '#46d369' : "white"} />}
                    <Text style={styles.actionCircleLabel}>{downloadStatus === 'completed' ? 'Downloaded' : downloadStatus === 'downloading' ? `${Math.floor(downloadProgress * 100)}%` : 'Download'}</Text>
                  </Pressable>

                  <Pressable style={({ focused, pressed }) => [styles.actionCircle, focused && styles.actionCircleFocused, pressed && styles.actionCirclePressed]} onPress={handleMoreLikeThis}>
                     <MaterialCommunityIcons name="view-grid-outline" size={26} color="white" />
                     <Text style={styles.actionCircleLabel}>Similar</Text>
                  </Pressable>
               </View>

               {playTarget.progressPercent > 0 && (
                 <View style={styles.mainProgressBarContainer}><View style={[styles.mainProgressBarFill, { width: `${playTarget.progressPercent}%` }]} /></View>
               )}
            </View>
          </ScrollView>

          {/* Global Back Button (Inside main details view) */}
          <Pressable style={({ focused }) => [styles.backBtn, focused && styles.backBtnFocused]} onPress={() => router.back()}>
             <Ionicons name="arrow-back" size={28} color="white" />
          </Pressable>
        </Animated.View>
      )}

      {/* 5. More Like This Bottom Sheet */}
      <Modal visible={showMoreLikeThis} transparent animationType="slide" onRequestClose={() => setShowMoreLikeThis(false)}>
        <Pressable style={styles.moreLikeThisOverlay} onPress={() => setShowMoreLikeThis(false)}>
          <Pressable style={styles.moreLikeThisSheet} onPress={() => {}}>
            <View style={styles.sheetHandle}><View style={styles.sheetHandleBar} /></View>
            <View style={styles.moreLikeThisHeader}>
              <Text style={styles.moreLikeThisTitle}>More Like This</Text>
              <Pressable style={({ focused }) => [styles.closePanelBtn, focused && { backgroundColor: 'rgba(255,255,255,0.25)' }]} onPress={() => setShowMoreLikeThis(false)}><Ionicons name="close" size={28} color="white" /></Pressable>
            </View>
            {similarLoading ? (
              <View style={styles.moreLikeThisCenter}><LoadingSpinner size={82} label="Finding similar titles" /></View>
            ) : similarTitles.length === 0 ? (
              <View style={styles.moreLikeThisCenter}><Text style={styles.moreLikeThisEmptyText}>No similar titles found.</Text></View>
            ) : (
              <FlatList
                data={similarTitles}
                key={`mlt-${Math.max(3, Math.floor((windowWidth - 80) / 160))}`}
                keyExtractor={(item) => item.id.toString()}
                numColumns={Math.max(3, Math.floor((windowWidth - 80) / 160))}
                contentContainerStyle={styles.moreLikeThisGrid}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <Pressable style={({ focused }) => [styles.moreLikeThisCard, focused && styles.moreLikeThisCardFocused]} onPress={() => { setShowMoreLikeThis(false); router.push({ pathname: `/movie/${item.id}`, params: { type: item.media_type || contentType } }); }}>
                    <Image source={{ uri: getImageUrl(item.poster_path) }} style={styles.moreLikeThisCardImage} contentFit="cover" transition={300} recyclingKey={`similar-${item.id}`} cachePolicy="memory-disk" />
                    <Text style={styles.moreLikeThisCardTitle} numberOfLines={2}>{item.title || item.name}</Text>
                  </Pressable>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullScreenPlayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },

  // ─── Back Button ───
  backBtn: {
    position: 'absolute',
    top: 44,
    left: 50,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  backBtnFocused: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderColor: 'rgba(255,255,255,0.4)',
    transform: [{ scale: 1.1 }],
  },

  // ─── Ambient / Backdrop ───
  ambientBackground: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  backdropContainer: {
    ...StyleSheet.absoluteFillObject,
    height: '100%',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    width: SCREEN_WIDTH,
    height: '100%',
  },
  
  // ─── Main Details Layout ───
  mainContent: {
  },
  mainContentScroll: {
    paddingTop: SCREEN_HEIGHT * 0.12,
    paddingHorizontal: 80,
    paddingBottom: 120,
    minHeight: SCREEN_HEIGHT,
  },
  leftColumn: {
    width: '50%',
    minWidth: 460,
    maxWidth: 760,
  },

  // ─── N SERIES / N FILM Badge ───
  nSeriesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 10,
  },
  nLogo: {
    width: 22,
    height: 36,
  },
  nSeriesText: {
    color: '#E50914',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 5,
  },

  // ─── Title Logo ───
  mainLogoImage: {
    width: 400,
    height: 130,
    marginBottom: 24,
    alignSelf: 'flex-start',
  },
  mainTitleFallback: {
    color: 'white',
    fontSize: 56,
    fontWeight: '900',
    marginBottom: 24,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 20,
  },

  // ─── Metadata Pills ───
  metaRowVertical: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 12,
  },
  metaYear: {
    color: '#46d369',
    fontSize: 17,
    fontWeight: '700',
  },
  metaPill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  metaPillText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: 'bold',
  },
  metaDuration: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    fontWeight: '500',
  },
  metaPillHD: {
    backgroundColor: 'transparent',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  metaPillHDText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // ─── Genres ───
  genresText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 18,
    letterSpacing: 0.5,
  },

  // ─── Overview ───
  mainOverview: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 17,
    lineHeight: 26,
    fontWeight: '400',
    marginBottom: 14,
  },

  // ─── Credits ───
  creditsSection: {
    marginBottom: 28,
    gap: 4,
  },
  creditLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    fontWeight: '500',
  },
  creditValue: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '400',
  },

  // ─── Horizontal Action Row ───
  actionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 20,
    marginBottom: 20,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 6,
    gap: 10,
    minWidth: 140,
    justifyContent: 'center',
  },
  playBtnFocused: {
    transform: [{ scale: 1.08 }],
    elevation: 16,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
  },
  playBtnText: {
    color: '#000',
    fontSize: 20,
    fontWeight: '800',
  },

  // ─── Circle Action Buttons ───
  actionCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: 72,
  },
  actionCircleFocused: {
    transform: [{ scale: 1.15 }],
  },
  actionCirclePressed: {
    transform: [{ scale: 0.92 }],
    opacity: 0.7,
  },
  actionCircleActive: {
    opacity: 1,
  },
  actionCircleLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },

  // ─── Progress Bar ───
  mainProgressBarContainer: {
    width: 160,
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: -8,
  },
  mainProgressBarFill: {
    height: '100%',
    backgroundColor: '#E50914',
    borderRadius: 2,
  },

  // ─── Episode Progress ───
  episodeProgressBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  episodeProgressBarFill: {
    height: '100%',
    backgroundColor: '#E50914',
  },

  // ═══════════════════════════════════════════════
  // EPISODES & MORE UI (Split Pane)
  // ═══════════════════════════════════════════════
  episodesContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#080808',
  },
  episodesLeftPane: {
    width: '35%',
    paddingTop: SCREEN_HEIGHT * 0.15,
    paddingLeft: 80,
    paddingRight: 20,
  },
  nSeriesContainerSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
    gap: 6,
  },
  nLogoSmall: {
    width: 15,
    height: 25,
  },
  nSeriesTextSmall: {
    color: '#E50914',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 3,
  },
  episodesLogoText: {
    width: 250,
    height: 80,
    marginBottom: 15,
    alignSelf: 'flex-start',
  },
  episodesLogoTextFallback: {
    color: 'white',
    fontSize: 40,
    fontWeight: '900',
    marginBottom: 15,
  },
  episodesMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40,
    gap: 10,
  },
  episodesMetaText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
  },
  ratingBadgeSmall: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ratingTextSmall: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  episodesMenu: {
    gap: 10,
  },
  episodesMenuItemActive: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#333',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 8,
  },
  episodesMenuItemTextActive: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  episodesMenuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 8,
  },
  episodesMenuItemFocused: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  episodesMenuItemText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 18,
    fontWeight: '600',
  },
  episodesRightPane: {
    flex: 1,
    width: '65%',
    paddingTop: SCREEN_HEIGHT * 0.15,
  },
  episodesScrollContent: {
    paddingRight: 80,
    paddingLeft: 20,
    paddingBottom: 80,
  },
  episodeCard: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  episodeCardFocused: {
    borderColor: 'rgba(255,255,255,0.8)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    elevation: 8,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  episodeThumbContainer: {
    width: 250,
    height: 140,
    backgroundColor: '#1a1a1a',
    position: 'relative',
  },
  episodeThumbRight: {
    width: '100%',
    height: '100%',
  },
  episodeThumbOverlayText: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textShadowColor: 'black',
    textShadowRadius: 4,
  },
  episodeInfoRight: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  episodeTitleRight: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  episodeOverviewRight: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  episodeRuntimeRight: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
  },

  // ─── Season Tabs ───
  seasonTabsContainer: {
    maxHeight: 60,
    marginBottom: 15,
  },
  seasonTabsContent: {
    gap: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
  },
  seasonTab: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  seasonTabActive: {
    backgroundColor: '#E50914',
  },
  seasonTabFocused: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    transform: [{ scale: 1.05 }],
  },
  seasonTabText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: '600',
  },
  seasonTabTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  episodeDownloadBtnSmall: {
    padding: 8,
    borderRadius: 20,
    marginLeft: 10,
  },

  // ─── Trailer Tab ───
  trailerTabHeader: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  trailerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
  },
  trailerCard: {
    width: 300,
    marginBottom: 20,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: '#111',
  },
  trailerCardFocused: {
    borderColor: 'white',
    transform: [{ scale: 1.03 }],
    elevation: 8,
  },
  trailerThumb: {
    width: '100%',
    height: 160,
  },
  trailerPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    height: 160,
  },
  trailerTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    padding: 12,
  },
  episodesMenuItemActiveCard: {
    backgroundColor: '#E50914',
    borderLeftWidth: 0,
  },

  // ═══════════════════════════════════════════════
  // More Like This Bottom Sheet
  // ═══════════════════════════════════════════════
  moreLikeThisOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  moreLikeThisSheet: {
    width: '100%',
    maxHeight: '75%',
    backgroundColor: '#141414',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 40,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    elevation: 24,
  },
  sheetHandle: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  sheetHandleBar: {
    width: 50,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  moreLikeThisHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  moreLikeThisTitle: {
    color: 'white',
    fontSize: 28,
    fontWeight: 'bold',
  },
  closePanelBtn: {
    padding: 10,
    borderRadius: 24,
  },
  moreLikeThisCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 20,
  },
  moreLikeThisEmptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 20,
  },
  moreLikeThisGrid: {
    paddingBottom: 20,
    gap: 14,
  },
  moreLikeThisCard: {
    width: 140,
    marginRight: 14,
    marginBottom: 16,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#222',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  moreLikeThisCardFocused: {
    borderColor: 'white',
    transform: [{ scale: 1.08 }],
    elevation: 10,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  moreLikeThisCardImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#333',
  },
  moreLikeThisCardTitle: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    padding: 8,
  },
});
