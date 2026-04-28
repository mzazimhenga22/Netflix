import React, { useEffect, useState, useCallback } from 'react';
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
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import ColorExtractor from '../../components/ColorExtractor';
import { COLORS } from '../../constants/theme';
import { usePageColor } from '../../context/PageColorContext';
import { downloadVideo, DownloadItem, loadMetadata } from '../../services/downloads';
import { fetchImdbTrailer, TrailerSource } from '../../services/trailers';
import { WatchHistoryService, WatchHistoryItem } from '../../services/WatchHistoryService';
import { VidLinkStream } from '../../services/vidlink';
import { resolveStreamFromCloud, invalidateCacheEntry } from '../../services/cloudResolver';
import LoadingSpinner from '../../components/LoadingSpinner';

const AnimatedImage = Animated.createAnimatedComponent(Image);

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function MovieDetailScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const { id, type: typeParam, season, episode } = useLocalSearchParams();
  // Auto-detect content type if not provided or incorrect
  const rawType = typeParam as string;
  const [contentType, setContentType] = useState<string>(rawType || 'movie');
  
  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [heroColors, setHeroColors] = useState<readonly [string, string, string]>(['#000', '#000', '#000']);
  const { setPageColor } = usePageColor();
  
  // Episode State
  const [showEpisodesView, setShowEpisodesView] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [playEpisode, setPlayEpisode] = useState<{ season: number; episode: number } | null>(null);
  const [isInMyList, setIsInMyList] = useState(false);
  const { selectedProfile } = useProfile();
  
  // Download State
  const [isResolvingForDownload, setIsResolvingForDownload] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState<'none' | 'downloading' | 'completed' | 'failed'>('none');
  const [downloadedItems, setDownloadedItems] = useState<DownloadItem[]>([]);
  
  // Watch History State
  const [watchProgress, setWatchProgress] = useState<WatchHistoryItem | null>(null);

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

  const router = useRouter();

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        
        // Use current contentType for fetching but don't re-trigger on auto-correction
        const fetchType = contentType as any;
        const [details, images] = await Promise.all([
          fetchMovieDetails(id as string, fetchType),
          fetchMovieImages(id as string, fetchType)
        ]);
        
        // Auto-detect type from TMDB response (movies have `title`, TV shows have `name`)
        // This updates state for rendering but won't re-trigger this effect (contentType removed from deps)
        let correctedType = fetchType;
        if (details.name && !details.title && contentType !== 'tv') {
          console.log(`[Details] Auto-correcting type to 'tv' for: ${details.name}`);
          correctedType = 'tv';
          setContentType('tv');
        } else if (details.title && !details.name && contentType !== 'movie') {
          console.log(`[Details] Auto-correcting type to 'movie' for: ${details.title}`);
          correctedType = 'movie';
          setContentType('movie');
        }

        // If type was corrected, re-fetch with correct type for accurate data
        if (correctedType !== fetchType) {
          const [correctedDetails, correctedImages] = await Promise.all([
            fetchMovieDetails(id as string, correctedType),
            fetchMovieImages(id as string, correctedType)
          ]);
          setMovie(correctedDetails);
          if (correctedImages?.logos?.length > 0) {
            const engLogo = correctedImages.logos.find((l: any) => l.iso_639_1 === 'en');
            const logoToUse = engLogo || correctedImages.logos[0];
            setLogoUrl(getLogoUrl(logoToUse.file_path) || null);
          }
        } else {
          setMovie(details);
          if (images?.logos?.length > 0) {
            const engLogo = images.logos.find((l: any) => l.iso_639_1 === 'en');
            const logoToUse = engLogo || images.logos[0];
            setLogoUrl(getLogoUrl(logoToUse.file_path) || null);
          }
        }

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]); // contentType removed from deps to prevent double fetch on auto-correction

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
      const hash = String(id).split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
      const isLocked = (hash % 3 === 0);
      if (isLocked) {
        Alert.alert(
          'Upgrade Required',
          'This content is locked on the Free Plan. Scan the QR code on the main screen to upgrade.',
          [{ text: 'Go Back', onPress: () => router.back() }]
        );
      }
    }
  }, [id, isFreePlan]);

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
    const unsub = WatchHistoryService.subscribeToHistory(selectedProfile.id, (items) => {
      const historyItem = items.find(hi => hi.id.toString() === id.toString());
      if (historyItem) {
        setWatchProgress(historyItem as WatchHistoryItem);
      } else {
        setWatchProgress(null);
      }
    });
    return () => unsub();
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
        episode.episode_number
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
        contentType as 'movie' | 'tv'
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

  if (isPlaying || playEpisode || playingTrailerUrl) {
    // Invalidate cache before player opens so it resolves a fresh stream
    if (!playingTrailerUrl && movie?.id) {
      invalidateCacheEntry(
        movie.id.toString(),
        contentType,
        playEpisode?.season,
        playEpisode?.episode
      );
    }
    return (
      <View style={styles.fullScreenPlayer}>
        <ModernVideoPlayer
          videoUrl={playingTrailerUrl || undefined}
          tmdbId={playingTrailerUrl ? undefined : movie.id.toString()}
          contentType={playingTrailerUrl ? undefined : contentType as any}
          title={playingTrailerUrl ? `${movie.title || movie.name} (Trailer)` : (movie.title || movie.name)}
          seasonNum={playEpisode?.season}
          episodeNum={playEpisode?.episode}
          episodes={episodes}
          itemData={movie}
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
          onClose={() => { setIsPlaying(false); setPlayEpisode(null); setPlayingTrailerUrl(null); }}
          initialTime={(() => {
            // Don't resume for trailers
            if (playingTrailerUrl) return 0;
            // No watch progress at all
            if (!watchProgress || watchProgress.id.toString() !== movie.id.toString()) return 0;
            // For TV: only resume if episode AND season match
            if (contentType === 'tv' && playEpisode) {
              const epMatch = watchProgress.episode === playEpisode.episode
                && (watchProgress.season || 1) === playEpisode.season;
              if (!epMatch) return 0;
              // If episode was >95% watched, start from beginning (finished)
              if (watchProgress.duration > 0 && (watchProgress.currentTime / watchProgress.duration) > 0.95) return 0;
            }
            // For movies: if >95% watched, start from beginning
            if (contentType === 'movie' && watchProgress.duration > 0
                && (watchProgress.currentTime / watchProgress.duration) > 0.95) return 0;
            return watchProgress.currentTime;
          })()}
        />
      </View>
    );
  }

  const backdrop = getBackdropUrl(movie.backdrop_path);
  const releaseYear = (movie.release_date || movie.first_air_date)?.split('-')[0] || '2026';
  const isTv = contentType === 'tv';
  
  // Format metadata strings
  const genres = movie.genres?.map((g: any) => g.name).slice(0, 2).join(', ') || 'Drama';
  let durationText = '';
  if (isTv) {
    const epCount = movie.number_of_episodes || (episodes.length > 0 ? episodes.length : 6);
    durationText = `${epCount} Episodes`;
  } else {
    durationText = `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m`;
  }
  
  const metadataString = `${releaseYear} · ${genres} · ${durationText}   HD`;

  // -----------------------------------------------------------------------------------
  // VIEW: EPISODES & MORE (Split Pane)
  // -----------------------------------------------------------------------------------
  if (showEpisodesView) {
    return (
      <View style={styles.episodesContainer}>
         {/* Left Pane */}
         <View style={styles.episodesLeftPane}>
            {isTv && (
              <View style={styles.nSeriesContainerSmall}>
                <Image 
                  source={require('../../assets/images/netflix-n-logo.svg')} 
                  style={styles.nLogoSmall} 
                  contentFit="contain"
                />
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
              <View style={styles.ratingBadgeSmall}>
                <Text style={styles.ratingTextSmall}>16+</Text>
              </View>
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

         {/* Right Pane */}
         <View style={styles.episodesRightPane}>
            {activeTab === 'episodes' ? (
              <>
                {/* Season Selector Tabs */}
                {movie.number_of_seasons > 1 && (
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                style={styles.seasonTabsContainer}
                contentContainerStyle={styles.seasonTabsContent}
              >
                {Array.from({ length: movie.number_of_seasons }, (_, i) => i + 1).map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setSelectedSeason(s)}
                    style={({ focused }) => [
                      styles.seasonTab,
                      selectedSeason === s && styles.seasonTabActive,
                      focused && styles.seasonTabFocused,
                    ]}
                  >
                    <Text style={[
                      styles.seasonTabText, 
                      selectedSeason === s && styles.seasonTabTextActive
                    ]}>
                      Season {s}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.episodesScrollContent}>
               {episodesLoading ? (
                 <View style={{ marginTop: 100, alignItems: 'center' }}>
                   <LoadingSpinner size={82} label="Loading episodes" />
                 </View>
               ) : (
                 episodes.map((ep: any) => (
                   <Pressable
                     key={ep.id}
                     onPress={() => setPlayEpisode({ season: selectedSeason, episode: ep.episode_number })}
                     style={({ focused }) => [
                       styles.episodeCard,
                       focused && styles.episodeCardFocused,
                     ]}
                   >
                     <View style={styles.episodeThumbContainer}>
                       <Image
                         source={{ uri: getImageUrl(ep.still_path) }}
                         style={styles.episodeThumbRight}
                         contentFit="cover"
                       />
                       {watchProgress && watchProgress.episode === ep.episode_number && watchProgress.season === selectedSeason && watchProgress.duration > 0 && (
                        <View style={styles.episodeProgressBarContainer}>
                          <View style={[styles.episodeProgressBarFill, { width: `${Math.min(100, Math.max(0, (watchProgress.currentTime / watchProgress.duration) * 100))}%` }]} />
                        </View>
                       )}
                       <Text style={styles.episodeThumbOverlayText}>Episode {ep.episode_number}</Text>
                     </View>

                     <View style={styles.episodeInfoRight}>
                       <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                         <Text style={styles.episodeTitleRight} numberOfLines={1}>
                           {ep.name}
                         </Text>
                         <Pressable 
                           onPress={() => handleEpisodeDownload(ep)}
                           style={({ focused }) => [
                             styles.episodeDownloadBtnSmall,
                             focused && { backgroundColor: 'rgba(255,255,255,0.2)' }
                           ]}
                         >
                           <Ionicons name="download-outline" size={20} color="white" />
                         </Pressable>
                       </View>
                       <Text style={styles.episodeOverviewRight} numberOfLines={3}>
                         {ep.overview}
                       </Text>
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
                 <View style={{ marginTop: 100, alignItems: 'center' }}>
                   <LoadingSpinner size={82} label="Loading trailers" />
                 </View>
               ) : trailers.length === 0 ? (
                 <Text style={{color: 'rgba(255,255,255,0.5)', fontSize: 18, marginTop: 40}}>No trailers found.</Text>
               ) : (
                 <View style={styles.trailerGrid}>
                   {trailers.map((t, i) => (
                     <Pressable
                       key={i}
                       style={({ focused }) => [styles.trailerCard, focused && styles.trailerCardFocused]}
                       onPress={() => setPlayingTrailerUrl(t.url)}
                     >
                       <Image
                         source={{ uri: getBackdropUrl(movie.backdrop_path) || getImageUrl(movie.poster_path) }}
                         style={styles.trailerThumb}
                         contentFit="cover"
                       />
                       <View style={styles.trailerPlayOverlay}>
                         <Ionicons name="play-circle-outline" size={40} color="white" />
                       </View>
                       <Text style={styles.trailerTitle}>Trailer {i + 1} ({t.quality})</Text>
                     </Pressable>
                   ))}
                 </View>
               )}
            </ScrollView>
            )}
         </View>


         {/* Global Back Button */}
         <Pressable 
           style={({ focused }) => [styles.backBtn, focused && { backgroundColor: 'rgba(255,255,255,0.2)' }]}
           onPress={() => setShowEpisodesView(false)}
         >
            <Ionicons name="arrow-back" size={32} color="white" />
         </Pressable>
      </View>
    );
  }

  // -----------------------------------------------------------------------------------
  // VIEW: MAIN DETAILS (Vertical Stack)
  // -----------------------------------------------------------------------------------
  return (
    <View style={styles.container}>
      <View style={styles.ambientBackground}>
         <LinearGradient colors={heroColors} style={StyleSheet.absoluteFill} />
      </View>

      <ColorExtractor 
        imageUrl={getBackdropUrl(movie?.backdrop_path) || ''} 
        onColorExtracted={handleColorExtracted}
      />

      <View style={styles.backdropContainer}>
        <Image 
          source={{ uri: backdrop }} 
          style={styles.backdrop} 
          contentFit="cover" 
          cachePolicy="memory-disk"
          transition={400}
          recyclingKey={`backdrop-${id}`}
          priority="high"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.1)', 'transparent', 'rgba(0,0,0,0.8)', '#000']}
          locations={[0, 0.2, 0.7, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Main Content Overlay */}
      <ScrollView
        style={[StyleSheet.absoluteFill, styles.mainContent]}
        contentContainerStyle={styles.mainContentScroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.leftColumn}>
           
           {/* Header & Logo */}
           {isTv && (
             <View style={styles.nSeriesContainer}>
                <Image 
                  source={require('../../assets/images/netflix-n-logo.svg')} 
                  style={styles.nLogo} 
                  contentFit="contain"
                />
                <Text style={styles.nSeriesText}>SERIES</Text>
             </View>
           )}
           {logoUrl ? (
             <AnimatedImage 
               entering={FadeInDown.delay(200)}
               source={{ uri: logoUrl }} 
               style={styles.mainLogoImage} 
               contentFit="contain" 
             />
           ) : (
             <Text style={styles.mainTitleFallback}>{movie.title || movie.name}</Text>
           )}

           {/* Metadata Row */}
           <View style={styles.metaRowVertical}>
              <Text style={styles.metaTextDot}>{metadataString}</Text>
              <MaterialCommunityIcons name="closed-caption-outline" size={24} color="rgba(255,255,255,0.7)" style={{ marginHorizontal: 5 }} />
           </View>
           <View style={styles.metaRowSecondary}>
              <View style={styles.ratingBadge}>
                 <Text style={styles.ratingText}>16+</Text>
              </View>
              <Text style={styles.metaTextDotSecondary}>Sex, Language</Text>
           </View>

           {/* Overview & Cast */}
           <Text style={styles.mainOverview} numberOfLines={4}>
             {movie.overview}
           </Text>
           <Text style={styles.castTextSmall} numberOfLines={1}>
             Cast: {movie.credits?.cast?.slice(0, 4).map((c: any) => c.name).join(', ')}
           </Text>

           {/* Rating Icons Row (Above standard buttons) */}
           <View style={styles.iconsRow}>
              <Pressable 
                style={({ focused }) => [styles.iconOnlyBtn, focused && styles.iconOnlyBtnFocused, userRating === 1 && styles.iconOnlyBtnActive]}
                onPress={() => handleRating(1)}
              >
                 <MaterialCommunityIcons 
                   name={userRating === 1 ? 'thumb-down' : 'thumb-down-outline'} 
                   size={28} 
                   color={userRating === 1 ? '#E50914' : 'white'} 
                 />
              </Pressable>
              <Pressable 
                style={({ focused }) => [styles.iconOnlyBtn, focused && styles.iconOnlyBtnFocused, userRating === 2 && styles.iconOnlyBtnActive]}
                onPress={() => handleRating(2)}
              >
                 <MaterialCommunityIcons 
                   name={userRating === 2 ? 'thumb-up' : 'thumb-up-outline'} 
                   size={28} 
                   color={userRating === 2 ? '#46d369' : 'white'} 
                 />
              </Pressable>
              <Pressable 
                style={({ focused }) => [styles.iconOnlyBtn, focused && styles.iconOnlyBtnFocused, userRating === 3 && styles.iconOnlyBtnActive]}
                onPress={() => handleRating(3)}
              >
                 <MaterialCommunityIcons 
                   name="thumb-up" 
                   size={28} 
                   color={userRating === 3 ? '#46d369' : 'rgba(255,255,255,0.4)'} 
                 />
              </Pressable>
           </View>

           {/* Vertical Action Stack */}
           <View style={styles.actionStack}>
              <Pressable
                style={({ focused }) => [
                  styles.actionBtnPrimary,
                  focused && styles.actionBtnPrimaryFocused
                ]}
                onPress={() => {
                  if (isTv) {
                    let epToPlay = 1;
                    let seasonToPlay = 1;
                    if (watchProgress && watchProgress.id.toString() === movie.id.toString()) {
                      const percent = watchProgress.currentTime / watchProgress.duration;
                      if (percent > 0.95 && watchProgress.episode) {
                        epToPlay = watchProgress.episode + 1;
                        seasonToPlay = watchProgress.season || 1;
                      } else {
                        epToPlay = watchProgress.episode || 1;
                        seasonToPlay = watchProgress.season || 1;
                      }
                    }
                    setSelectedSeason(seasonToPlay);
                    setPlayEpisode({ season: seasonToPlay, episode: epToPlay });
                  } else {
                    setIsPlaying(true);
                  }
                }}
                hasTVPreferredFocus={true}
              >
                 <Ionicons name="play" size={28} color="black" />
                 <Text style={styles.actionBtnTextPrimary}>
                   {watchProgress && watchProgress.currentTime > 5 
                     ? (isTv && watchProgress.episode ? `Resume S${watchProgress.season} E${watchProgress.episode}` : 'Resume') 
                     : `Play${isTv ? ' Episode 1' : ''}`}
                 </Text>
              </Pressable>

              {watchProgress && watchProgress.currentTime > 5 && watchProgress.duration > 0 && (
                <View style={styles.mainProgressBarContainer}>
                  <View style={[styles.mainProgressBarFill, { width: `${Math.min(100, Math.max(0, (watchProgress.currentTime / watchProgress.duration) * 100))}%` }]} />
                </View>
              )}

              {isTv && (
                <Pressable
                  style={({ focused }) => [
                    styles.actionBtnSecondary,
                    focused && styles.actionBtnSecondaryFocused
                  ]}
                  onPress={() => setShowEpisodesView(true)}
                >
                   <MaterialCommunityIcons name="layers-outline" size={30} color="white" />
                   <Text style={styles.actionBtnTextSecondary}>Episodes & More</Text>
                </Pressable>
              )}

              <Pressable
                style={({ focused }) => [
                  styles.actionBtnSecondary,
                  focused && styles.actionBtnSecondaryFocused
                ]}
                onPress={handleMoreLikeThis}
              >
                 <MaterialCommunityIcons name="grid" size={30} color="white" />
                 <Text style={styles.actionBtnTextSecondary}>More Like This</Text>
              </Pressable>

              <Pressable 
                style={({ focused }) => [
                  styles.actionBtnSecondary,
                  focused && styles.actionBtnSecondaryFocused
                ]}
                onPress={handleToggleMyList}
              >
                <Ionicons name={isInMyList ? "checkmark" : "add"} size={30} color="white" />
                <Text style={styles.actionBtnTextSecondary}>{isInMyList ? 'In My List' : 'Add to My List'}</Text>
              </Pressable>

               <Pressable
                style={({ focused }) => [
                  styles.actionBtnSecondary,
                  focused && styles.actionBtnSecondaryFocused
                ]}
                onPress={() => handleDownload()}
                disabled={downloadStatus === 'downloading' || isResolvingForDownload}
              >
                {downloadStatus === 'downloading' || isResolvingForDownload ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Ionicons 
                    name={downloadStatus === 'completed' ? "checkmark-done" : "download-outline"} 
                    size={30} 
                    color={downloadStatus === 'completed' ? COLORS.primary : "white"} 
                  />
                )}
                <Text style={styles.actionBtnTextSecondary}>
                  {downloadStatus === 'downloading' ? `Downloading ${Math.floor(downloadProgress * 100)}%` : 
                   downloadStatus === 'completed' ? 'Downloaded' : 
                   isResolvingForDownload ? 'Resolving...' : 'Download'}
                </Text>
              </Pressable>

           </View>

        </View>
      </ScrollView>

      {/* Back Button for TV */}
      <Pressable 
        style={({ focused }) => [styles.backBtn, focused && { backgroundColor: 'rgba(255,255,255,0.2)' }]}
        onPress={() => router.back()}
      >
         <Ionicons name="arrow-back" size={32} color="white" />
      </Pressable>



      {/* More Like This — Bottom Sheet */}
      <Modal
        visible={showMoreLikeThis}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMoreLikeThis(false)}
      >
        <Pressable 
          style={styles.moreLikeThisOverlay}
          onPress={() => setShowMoreLikeThis(false)}
        >
          {/* Prevent taps inside sheet from closing */}
          <Pressable style={styles.moreLikeThisSheet} onPress={() => {}}>
            {/* Handle bar */}
            <View style={styles.sheetHandle}>
              <View style={styles.sheetHandleBar} />
            </View>

            <View style={styles.moreLikeThisHeader}>
              <Text style={styles.moreLikeThisTitle}>More Like This</Text>
              <Pressable
                style={({ focused }) => [styles.closePanelBtn, focused && { backgroundColor: 'rgba(255,255,255,0.2)' }]}
                onPress={() => setShowMoreLikeThis(false)}
              >
                <Ionicons name="close" size={32} color="white" />
              </Pressable>
            </View>

            {similarLoading ? (
              <View style={styles.moreLikeThisCenter}>
                <LoadingSpinner size={82} label="Finding similar titles" />
                <Text style={styles.moreLikeThisLoadingText}>Finding similar titles...</Text>
              </View>
            ) : similarTitles.length === 0 ? (
              <View style={styles.moreLikeThisCenter}>
                <Text style={styles.moreLikeThisEmptyText}>No similar titles found.</Text>
              </View>
            ) : (
              <FlatList
                data={similarTitles}
                key={`more-like-this-${Math.max(3, Math.floor((windowWidth - 80) / 160))}`}
                keyExtractor={(item) => item.id.toString()}
                numColumns={Math.max(3, Math.floor((windowWidth - 80) / 160))}
                contentContainerStyle={styles.moreLikeThisGrid}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <Pressable
                    style={({ focused }) => [styles.moreLikeThisCard, focused && styles.moreLikeThisCardFocused]}
                    onPress={() => {
                      setShowMoreLikeThis(false);
                      router.push({
                        pathname: `/movie/${item.id}`,
                        params: { type: item.media_type || contentType }
                      });
                    }}
                  >
                    <Image
                      source={{ uri: getImageUrl(item.poster_path) }}
                      style={styles.moreLikeThisCardImage}
                      contentFit="cover"
                      placeholder={{ uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==' }}
                      placeholderContentFit="cover"
                      transition={300}
                      recyclingKey={`similar-${item.id}`}
                      cachePolicy="memory-disk"
                    />
                    <Text style={styles.moreLikeThisCardTitle} numberOfLines={2}>
                      {item.title || item.name}
                    </Text>
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
  backBtn: {
    position: 'absolute',
    top: 50,
    left: 60,
    padding: 12,
    borderRadius: 40,
    zIndex: 100,
  },
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
  
  // MAIN DETAILS UI
  mainContent: {
    zIndex: 1,
  },
  mainContentScroll: {
    paddingTop: SCREEN_HEIGHT * 0.15,
    paddingHorizontal: 80,
    paddingBottom: 140,
    minHeight: SCREEN_HEIGHT,
  },
  leftColumn: {
    width: '45%',
    minWidth: 420,
    maxWidth: 720,
  },
  nSeriesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
    gap: 8,
  },
  nLogo: {
    width: 25,
    height: 40,
  },
  nSeriesText: {
    color: '#E50914',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 4,
  },
  mainLogoImage: {
    width: 380,
    height: 120,
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  mainTitleFallback: {
    color: 'white',
    fontSize: 60,
    fontWeight: '900',
    marginBottom: 20,
  },
  metaRowVertical: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  metaTextDot: {
    color: 'white',
    fontSize: 18,
    fontWeight: '500',
  },
  metaRowSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 25,
    gap: 10,
  },
  ratingBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ratingText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  metaTextDotSecondary: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  mainOverview: {
    color: 'white',
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '400',
    marginBottom: 10,
  },
  castTextSmall: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 16,
    marginBottom: 25,
  },
  iconsRow: {
    flexDirection: 'row',
    gap: 25,
    marginBottom: 25,
  },
  iconOnlyBtn: {
    padding: 8,
    borderRadius: 20,
  },
  iconOnlyBtnFocused: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    transform: [{ scale: 1.1 }],
  },
  iconOnlyBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  actionStack: {
    gap: 15,
  },
  actionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 25,
    paddingVertical: 15,
    borderRadius: 6,
    gap: 15,
    width: '100%',
  },
  actionBtnPrimaryFocused: {
    transform: [{ scale: 1.05 }],
  },
  actionBtnTextPrimary: {
    color: 'black',
    fontSize: 22,
    fontWeight: 'bold',
  },
  actionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 6,
    gap: 15,
    width: '100%',
  },
  actionBtnSecondaryFocused: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    transform: [{ scale: 1.02 }],
  },
  actionBtnTextSecondary: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 20,
    fontWeight: '600',
  },
  mainProgressBarContainer: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    marginTop: -10, // Pull it closer to the play button
    marginBottom: 5,
    overflow: 'hidden',
  },
  mainProgressBarFill: {
    height: '100%',
    backgroundColor: '#E50914',
  },
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

  // EPISODES & MORE UI (Split Pane)
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
    backgroundColor: '#333', // Dark gray pill
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
    marginBottom: 20,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  episodeCardFocused: {
    borderColor: 'white',
    backgroundColor: 'rgba(255,255,255,0.05)',
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

  // Season Tabs
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

  // Trailer Tab Styles
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
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: '#111',
  },
  trailerCardFocused: {
    borderColor: 'white',
    transform: [{ scale: 1.02 }],
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

  // Episodes List Item Active Fix
  episodesMenuItemActiveCard: {
    backgroundColor: '#E50914',
    borderLeftWidth: 0,
  },

  // More Like This Bottom Sheet
  moreLikeThisOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  moreLikeThisSheet: {
    width: '100%',
    maxHeight: '75%',
    backgroundColor: '#181818',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 40,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
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
    padding: 12,
    borderRadius: 40,
  },
  moreLikeThisCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 20,
  },
  moreLikeThisLoadingText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
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
