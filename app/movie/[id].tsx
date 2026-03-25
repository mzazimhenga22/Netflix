import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Pressable, ActivityIndicator, Alert, StatusBar, Dimensions, Animated as RNAnimated, FlatList, Modal } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons, MaterialCommunityIcons, Feather, MaterialIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  withSequence, 
  Easing, 
  interpolate, 
  useAnimatedScrollHandler,
  runOnJS,
  useAnimatedRef
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { COLORS, SPACING } from '../../constants/theme';
import { fetchMovieDetails, getImageUrl, getBackdropUrl, fetchSeasonDetails } from '../../services/tmdb';
import { HorizontalCarousel } from '../../components/HorizontalCarousel';
import { fetchStreamingLinks } from '../../services/streaming';
import { fetchNetMirrorStream, NetMirrorTrack } from '../../services/netmirror';
import { ModernVideoPlayer } from '../../components/ModernVideoPlayer';
import { NetflixLoader } from '../../components/NetflixLoader';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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

export default function MovieDetailsScreen() {
  const { id, type } = useLocalSearchParams();
  const router = useRouter();
  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadingStream, setLoadingStream] = useState(false);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [showSeasonModal, setShowSeasonModal] = useState(false);
  const [isTV, setIsTV] = useState(type === 'tv');
  
  const scrollY = useSharedValue(0);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  
  const [streamConfig, setStreamConfig] = useState<{ 
    url: string; 
    headers?: Record<string, string> | null;
    tracks?: NetMirrorTrack[];
    currentTitle?: string;
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
    setSelectedSeason(seasonNum);
    setShowSeasonModal(false);
    try {
      const seasonData = await fetchSeasonDetails(id as string, seasonNum);
      setEpisodes(seasonData.episodes || []);
    } catch (e) {
      console.error("Failed to load season:", e);
    }
  };

  const handleWatchNow = async (episodeNum?: number) => {
    const url = isTV 
      ? `https://vidsrc.to/embed/tv/${id}/${selectedSeason}/${episodeNum || 1}`
      : `https://vidsrc.to/embed/movie/${id}`;
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      Alert.alert("Error", "Could not open the player.");
    }
  };

  const handlePlay = async (episodeNum?: number) => {
    const movieTitle = movie.title || movie.name;
    
    // Calculate absolute episode number for TV shows
    let targetEpisode = episodeNum;
    if (isTV && episodeNum && movie.seasons) {
      targetEpisode = 0;
      for (const s of movie.seasons) {
        if (s.season_number === 0) continue; 
        if (s.season_number < selectedSeason) {
          targetEpisode += s.episode_count;
        } else if (s.season_number === selectedSeason) {
          targetEpisode += episodeNum;
          break;
        }
      }
    }

    const playTitle = isTV && episodeNum ? `${movieTitle} - S${selectedSeason} E${episodeNum}` : movieTitle;
    
    console.log(`[Stream V2] 🎬 Play: "${movieTitle}" (isTV: ${isTV}, Ep: ${targetEpisode || 'N/A'})`);
    setLoadingStream(true);
    
    try {
      // Pass the Netflix ID if available from TMDb external_ids to prioritize the correct version
      const primaryId = movie.external_ids?.netflix_id;
      const releaseYear = (movie.release_date || movie.first_air_date || '').split('-')[0];
      const netMirrorResponse = await fetchNetMirrorStream(movieTitle, isTV ? targetEpisode : undefined, primaryId, releaseYear);
      
      if (netMirrorResponse && netMirrorResponse.sources.length > 0) {
        // IMPORTANT: Unified headers for bypass
        setStreamConfig({
          url: netMirrorResponse.sources[0].url,
          headers: {
            'Referer': 'https://net52.cc/',
            'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer',
            'Cookie': netMirrorResponse.cookies
          },
          tracks: netMirrorResponse.tracks,
          currentTitle: playTitle
        });
        setIsPlaying(true);
        setLoadingStream(false);
        return;
      }

      const data = await fetchStreamingLinks(id as string, isTV ? 'tv' : 'movie', selectedSeason, episodeNum);
      if (data && data.sources.length > 0) {
        setStreamConfig({ 
          url: data.sources[0].url, 
          headers: null, 
          tracks: [],
          currentTitle: playTitle
        });
        setIsPlaying(true);
        setLoadingStream(false);
      } else {
        setLoadingStream(false);
        handleWatchNow(episodeNum);
      }
    } catch (error: any) {
      console.error(`[Stream] 💥 Critical Error:`, error.message);
      setLoadingStream(false);
      handleWatchNow(episodeNum);
    }
  };

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const headerAnimatedStyle = useAnimatedStyle(() => {
    const headerOpacity = interpolate(scrollY.value, [0, 200], [0, 1]);
    return {
      opacity: headerOpacity,
      backgroundColor: `rgba(0,0,0,${headerOpacity})`,
    };
  });

  const backdropAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(scrollY.value, [-100, 0], [1.2, 1], 'clamp');
    const bgTranslateY = interpolate(scrollY.value, [0, 300], [0, 100]);
    return {
      transform: [{ scale }, { translateY: bgTranslateY }],
    };
  });

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
      if (scrollY.value <= 0 && event.translationY > 0) {
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

  if (loading) return <MovieDetailsSkeleton />;
  if (!movie) return null;

  const year = (movie.release_date || movie.first_air_date || '').split('-')[0];
  const runtime = movie.runtime 
    ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` 
    : (movie.number_of_seasons ? `${movie.number_of_seasons} Seasons` : '');
  const matchScore = Math.floor(85 + Math.random() * 14);

  if (isPlaying && streamConfig.url) {
    return (
      <View style={styles.fullScreenPlayer}>
        <StatusBar hidden />
        <ModernVideoPlayer 
          videoUrl={streamConfig.url}
          headers={streamConfig.headers || undefined}
          title={streamConfig.currentTitle || movie.title || movie.name}
          onClose={() => setIsPlaying(false)}
          tracks={streamConfig.tracks}
          episodes={isTV ? episodes : undefined}
          onEpisodeSelect={(epNum) => handlePlay(epNum)}
        />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Animated.View style={[styles.container, containerAnimatedStyle, { flex: 1 }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar barStyle="light-content" />

        {/* Dynamic Header */}
        <Animated.View style={[styles.header, headerAnimatedStyle]}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
          <View style={styles.headerContent}>
            <Pressable style={styles.headerCircleBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={24} color="white" />
            </Pressable>
            <Text style={styles.headerTitle} numberOfLines={1}>{movie.title || movie.name}</Text>
            <View style={styles.headerRight}>
              <Pressable style={styles.headerCircleBtn}>
                <MaterialCommunityIcons name="cast" size={22} color="white" />
              </Pressable>
              <Pressable style={styles.headerCircleBtn} onPress={() => router.back()}>
                <Ionicons name="close" size={24} color="white" />
              </Pressable>
            </View>
          </View>
        </Animated.View>
        
        <View style={{ flex: 1 }}>
          <GestureDetector gesture={panGesture}>
            <Animated.ScrollView 
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
              onScroll={scrollHandler}
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingBottom: 100 }}
            >
              {/* Hero Backdrop */}
              <Animated.View style={[styles.posterContainer, backdropAnimatedStyle]}>
                <Animated.Image 
                  source={{ uri: getBackdropUrl(movie.backdrop_path) }} 
                  style={styles.backdrop} 
                  resizeMode="cover"
                  sharedTransitionTag={`movie-image-${id}`}
                />
                <View style={styles.bottomFadeOverlay} />
                
                <Pressable style={styles.heroPlayOverlay} onPress={() => isTV ? handlePlay(1) : handlePlay()}>
                  <View style={styles.heroPlayCircle}>
                    {loadingStream ? (
                      <NetflixLoader size={36} color="white" />
                    ) : (
                      <Ionicons name="play" size={32} color="white" style={{ marginLeft: 4 }} />
                    )}
                  </View>
                </Pressable>
              </Animated.View>

              {/* Content Info */}
              <View style={styles.infoContent}>
                <View style={styles.matchBadgeRow}>
                  <Text style={styles.matchScore}>{matchScore}% Match</Text>
                  <Text style={styles.metadataText}>{year}</Text>
                  <View style={styles.ratingBadge}>
                    <Text style={styles.ratingText}>M/A 16+</Text>
                  </View>
                  <Text style={styles.metadataText}>{runtime}</Text>
                  <View style={styles.hdBadge}>
                    <Text style={styles.hdText}>4K Ultra HD</Text>
                  </View>
                </View>

                <Text style={styles.title}>{movie.title || movie.name}</Text>
                
                <View style={styles.top10Row}>
                  <View style={styles.top10Badge}>
                    <Text style={styles.top10Text}>TOP</Text>
                    <Text style={styles.top10Number}>10</Text>
                  </View>
                  <Text style={styles.top10Label}>#1 in {isTV ? 'TV Shows' : 'Movies'} Today</Text>
                </View>

                <Pressable 
                  style={({ pressed }) => [
                    styles.playLargeButton,
                    pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }
                  ]} 
                  onPress={() => isTV ? handlePlay(1) : handlePlay()}
                >
                  {loadingStream ? (
                    <NetflixLoader size={24} color="black" />
                  ) : (
                    <>
                      <Ionicons name="play" size={24} color="black" />
                      <Text style={styles.playLargeText}>Play</Text>
                    </>
                  )}
                </Pressable>
                
                <Pressable style={styles.downloadLargeButton}>
                  <Feather name="download" size={22} color="white" />
                  <Text style={styles.downloadLargeText}>Download</Text>
                </Pressable>

                <Text style={styles.synopsis}>
                  {movie.overview}
                </Text>

                <View style={styles.bentoCard}>
                  <Text style={styles.bentoLabel}>Cast & Crew</Text>
                  <Text style={styles.credits} numberOfLines={2}>
                    {movie.credits?.cast?.slice(0, 5).map((c: any) => c.name).join(', ')}... more
                  </Text>
                </View>

                <View style={styles.secondaryActions}>
                  <Pressable style={styles.actionItem}>
                    <Ionicons name="add" size={28} color="white" />
                    <Text style={styles.actionText}>My List</Text>
                  </Pressable>
                  <Pressable style={styles.actionItem}>
                    <MaterialIcons name="thumb-up-off-alt" size={24} color="white" />
                    <Text style={styles.actionText}>Rate</Text>
                  </Pressable>
                  <Pressable style={styles.actionItem}>
                    <Feather name="send" size={24} color="white" />
                    <Text style={styles.actionText}>Share</Text>
                  </Pressable>
                </View>
              </View>

              {/* TV Show Episodes Section */}
              {isTV && (
                <View style={styles.episodesSection}>
                  <View style={styles.tabsContainer}>
                    <View style={styles.tabItemActive}>
                      <Text style={styles.tabTextActive}>Episodes</Text>
                      <View style={styles.tabIndicator} />
                    </View>
                    <View style={styles.tabItem}>
                      <Text style={styles.tabText}>More Like This</Text>
                    </View>
                  </View>

                  <View style={styles.seasonPicker}>
                    <Pressable style={styles.seasonBtn} onPress={() => setShowSeasonModal(true)}>
                      <Text style={styles.seasonBtnText}>Season {selectedSeason}</Text>
                      <Ionicons name="chevron-down" size={16} color="white" />
                    </Pressable>
                  </View>

                  {episodes.map((ep) => (
                    <Pressable key={ep.id} style={styles.episodeItem} onPress={() => handlePlay(ep.episode_number)}>
                      <View style={styles.episodeMain}>
                        <Image 
                          source={{ uri: getImageUrl(ep.still_path) }} 
                          style={styles.episodeThumb} 
                        />
                        <View style={styles.episodeInfo}>
                          <Text style={styles.episodeTitle}>{ep.episode_number}. {ep.name}</Text>
                          <Text style={styles.episodeRuntime}>{ep.runtime || 45}m</Text>
                        </View>
                        <Feather name="download" size={20} color="white" style={styles.epDownload} />
                      </View>
                      <Text style={styles.episodeOverview} numberOfLines={3}>{ep.overview}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {!isTV && (
                <View style={styles.episodesSection}>
                  <View style={styles.tabsContainer}>
                    <View style={styles.tabItemActive}>
                      <Text style={styles.tabTextActive}>More Like This</Text>
                      <View style={styles.tabIndicator} />
                    </View>
                  </View>
                  <View style={styles.similarGrid}>
                    <HorizontalCarousel title="" data={movie.similar?.results?.map((item: any) => ({
                      id: item.id.toString(),
                      title: item.title || item.name,
                      imageUrl: getImageUrl(item.poster_path),
                    })) || []} />
                  </View>
                </View>
              )}
            </Animated.ScrollView>
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
  },
  backdrop: {
    width: '100%',
    height: '100%',
  },
  bottomFadeOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
    backgroundColor: 'rgba(0,0,0,0.8)',
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
    borderTopWidth: 1,
    borderTopColor: '#262626',
    paddingHorizontal: SPACING.md,
    marginTop: 10,
    gap: 30,
  },
  tabItemActive: {
    paddingTop: 15,
  },
  tabItem: {
    paddingTop: 15,
  },
  tabTextActive: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  tabText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  tabIndicator: {
    height: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    width: '100%',
  },
  similarGrid: {
    paddingVertical: SPACING.md,
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
  episodeThumb: {
    width: 130,
    height: 75,
    borderRadius: 4,
    backgroundColor: '#1a1a1a',
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
