import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions, ScrollView, Modal, Image } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons, MaterialCommunityIcons, MaterialIcons, Feather } from '@expo/vector-icons';
import Animated, { 
  useAnimatedStyle, 
  withTiming, 
  useSharedValue,
  Easing,
  runOnJS,
  FadeInDown,
  withSpring,
  SlideInRight,
  SlideOutRight,
  FadeInRight,
  FadeOutRight,
  FadeIn,
  FadeOut
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Brightness from 'expo-brightness';
import { useKeepAwake } from 'expo-keep-awake';
import { COLORS } from '../constants/theme';
import { parseVtt, Subtitle } from '../utils/vttParser';
import { getImageUrl } from '../services/tmdb';
import { NetflixLoader } from './NetflixLoader';
import { VidLinkResolver } from './VidLinkResolver';
import { VidSrcResolver } from './VidSrcResolver';
import { VidLinkStream, VidLinkSkipMarker } from '../services/vidlink';
import { VidSrcStream } from '../services/vidsrc';
import { useProfile } from '../context/ProfileContext';
import { WatchHistoryService } from '../services/WatchHistoryService';
import { RatingsService, RatingValue } from '../services/RatingsService';

// Removed static top-level Dimensions to prevent orientation distortion.
// Component now uses useWindowDimensions() hook internally.

interface ModernPlayerProps {
  videoUrl?: string; // Optional now, since we can fetch internally
  onClose: () => void;
  title: string;
  headers?: Record<string, string>;
  // Subtitles
  tracks?: any[];
  audioTracks?: { id: string; label: string; language?: string }[];
  // Episodes
  episodes?: any[];
  onEpisodeSelect?: (episodeNumber: number) => void;
  onNextEpisode?: () => void;
  // Metadata for internal fetching
  tmdbId?: string;
  contentType?: 'movie' | 'tv';
  releaseYear?: string;
  episodeNum?: number;
  seasonNum?: number;
  primaryId?: string;
  backdropUrl?: string;
}

export function ModernVideoPlayer({ 
  videoUrl, 
  onClose, 
  title, 
  headers,
  tracks = [],
  audioTracks = [],
  episodes = [],
  onEpisodeSelect,
  onNextEpisode,
  tmdbId,
  contentType,
  releaseYear,
  episodeNum,
  seasonNum,
  primaryId,
  backdropUrl
}: ModernPlayerProps) {
  const { width, height } = useWindowDimensions();
  useKeepAwake(); // Keep screen from sleeping during playback

  const [isLocked, setIsLocked] = useState(false);
  const { selectedProfile } = useProfile();
  const [internalVideoUrl, setInternalVideoUrl] = useState(videoUrl || '');
  const [internalHeaders, setInternalHeaders] = useState<Record<string, string> | undefined>(headers);
  const [internalTracks, setInternalTracks] = useState<any[]>(tracks);
  const [internalAudioTracks, setInternalAudioTracks] = useState<{ id: string; label: string; language?: string }[]>(audioTracks);
  const [selectedAudioTrackId, setSelectedAudioTrackId] = useState<string | null>(audioTracks[0]?.id || null);
  const [fetchError, setFetchError] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [showEpisodePicker, setShowEpisodePicker] = useState(false);
  const [showSubtitlePicker, setShowSubtitlePicker] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  
  // Source resolution state — VidLink primary, VidSrc fallback
  const [activeSource, setActiveSource] = useState<'vidlink' | 'vidsrc' | 'none'>('none');
  const [resolveAttempt, setResolveAttempt] = useState(0); // bump to re-trigger resolution
  
  // Premium Features State
  const [skipMarkers, setSkipMarkers] = useState<VidLinkSkipMarker[]>([]);
  const skipMarkersRef = useRef<VidLinkSkipMarker[]>([]);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const showSkipIntroRef = useRef(false);
  const [isNextEpisodeCountdown, setIsNextEpisodeCountdown] = useState(false);
  const isNextEpisodeCountdownRef = useRef(false);
  const [countdownValue, setCountdownValue] = useState(10);
  const [rating, setRating] = useState<RatingValue>('none');

  // Player State
  const [status, setStatus] = useState<'idle' | 'loading' | 'readyToPlay' | 'error'>('loading');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  // Interaction State
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const isScrubbing = useRef(false);
  const [brightnessLevel, setBrightnessLevel] = useState(0.5);
  const [volumeLevel, setVolumeLevel] = useState(1); // 1 is max

  // Subtitle State
  const parsedSubtitles = useRef<Subtitle[]>([]);
  const currentSubtitleRef = useRef('');
  const [activeSubtitle, setActiveSubtitle] = useState('');
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(-1);
  const [resizeMode, setResizeMode] = useState<'contain' | 'cover'>('contain');
  const nextEpisodeData = React.useMemo(() => {
    if (contentType === 'tv' && episodes && episodes.length > 0 && episodeNum) {
      const currentIndex = episodes.findIndex((e: any) => e.episode_number === episodeNum);
      if (currentIndex >= 0 && currentIndex < episodes.length - 1) {
        return episodes[currentIndex + 1];
      }
    }
    return null;
  }, [episodes, episodeNum, contentType]);

  const controlsOpacity = useSharedValue(1);
  const loadingOpacity = useSharedValue(1);
  const progressPercentage = useSharedValue(0);
  const progressScale = useSharedValue(1);
  const isScrubbingReact = useSharedValue(false);
  const hideTimeout = useRef<NodeJS.Timeout | null>(null);
  const currentUrlRef = useRef(videoUrl || '');

  // Initialize player with a valid source only if available
  const player = useVideoPlayer((internalVideoUrl && internalVideoUrl !== 'ERROR') ? { 
    uri: internalVideoUrl, 
    headers: internalHeaders || undefined,
    contentType: 'hls' as any,  // VidLink proxy URLs have no .m3u8 extension
  } : null, (player) => {
    player.loop = false;
    player.staysActiveInBackground = true;
    player.timeUpdateEventInterval = 0.25; // 250ms for performance
    
    // Aggressive pre-buffering — same config as TV app
    // Buffers 120s ahead instead of default 20s, reducing stalls on weak networks
    player.bufferOptions = {
      preferredForwardBufferDuration: 120,
      minBufferForPlayback: 2.5,
      prioritizeTimeOverSizeThreshold: true,
    };
    
    if (internalVideoUrl && internalVideoUrl !== 'ERROR' && internalVideoUrl !== '') {
      player.play();
    }
  });

  const videoViewRef = useRef<any>(null);

  // VidLink resolver state
  const [vidlinkEnabled, setVidlinkEnabled] = useState(false);

  // Internal Fetching Logic - now delegates to VidLinkResolver component
  useEffect(() => {
    // If we already have a URL from props, prioritize it
    if (videoUrl) {
       setInternalVideoUrl(videoUrl);
       setInternalHeaders(headers);
       setInternalTracks(tracks);
       setInternalAudioTracks(audioTracks);
       setSelectedAudioTrackId(audioTracks[0]?.id || null);
       setFetchError(false);
       setIsRateLimited(false);
       setStatus('readyToPlay');
       return;
    }

    if (!tmdbId || !title) return;

    // CRITICAL: Reset state for new episode/content to prevent stale resume/buffering
    console.log(`[Player] 🚀 Starting stream resolution for: ${title} (TMDB: ${tmdbId}, S:${seasonNum} E:${episodeNum})`);
    hasSeekedRef.current = false;       // Allow fresh resume lookup for this episode
    lastSaveTimeRef.current = 0;        // Reset save throttle
    currentUrlRef.current = '';          // Clear cached URL so replaceAsync fires
    setInternalVideoUrl('');             // Clear old stream
    setInternalHeaders(undefined);
    setInternalTracks([]);
    setInternalAudioTracks([]);
    setSelectedAudioTrackId(null);
    setCurrentTime(0);                  // Reset playback position display
    setDuration(0);
    progressPercentage.value = 0;
    isNextEpisodeCountdownRef.current = false;
    setIsNextEpisodeCountdown(false);
    showSkipIntroRef.current = false;
    setShowSkipIntro(false);
    setSkipMarkers([]);
    skipMarkersRef.current = [];
    setStatus('loading');
    setFetchError(false);
    setIsRateLimited(false);
    // Start with VidLink as primary source
    setActiveSource('vidlink');
    setVidlinkEnabled(true);
  }, [tmdbId, episodeNum, seasonNum, videoUrl, resolveAttempt, audioTracks, headers, progressPercentage, title, tracks]);

  // VidLink stream resolved callback
  const handleVidLinkResolved = useCallback((stream: VidLinkStream) => {
    console.log(`[Player] ✅ VidLink stream resolved: ${stream.url.substring(0, 80)}...`);
    setInternalVideoUrl(stream.url);
    setInternalHeaders(stream.headers);
    const vidlinkTracks = stream.captions.map(c => ({
      file: c.url,
      label: c.language,
      kind: 'captions',
    }));
    setInternalTracks(vidlinkTracks);
    setInternalAudioTracks((stream as any).audioTracks || []);
    setSelectedAudioTrackId((stream as any).audioTracks?.[0]?.id || null);
    
    if (stream.markers) {
      setSkipMarkers(stream.markers);
      skipMarkersRef.current = stream.markers;
    }
    
    setFetchError(false);
    setIsRateLimited(false);
    setStatus('readyToPlay');
    setVidlinkEnabled(false);
    setActiveSource('none');
  }, []);

  const handleVidLinkError = useCallback((error: string) => {
    console.error(`[Player] ❌ VidLink failed: ${error} — falling back to VidSrc`);
    setVidlinkEnabled(false);
    // Don't set fetchError yet — try VidSrc fallback first
    setActiveSource('vidsrc');
  }, []);

  // VidSrc fallback resolved callback
  const handleVidSrcResolved = useCallback((stream: VidSrcStream) => {
    console.log(`[Player] ✅ VidSrc fallback resolved: ${stream.url.substring(0, 80)}...`);
    setInternalVideoUrl(stream.url);
    setInternalHeaders(stream.headers);
    const vidsrcTracks = stream.captions.map(c => ({
      file: c.url,
      label: c.language,
      kind: 'captions',
    }));
    setInternalTracks(vidsrcTracks);
    setInternalAudioTracks((stream as any).audioTracks || []);
    setSelectedAudioTrackId((stream as any).audioTracks?.[0]?.id || null);
    setFetchError(false);
    setIsRateLimited(false);
    setStatus('readyToPlay');
    setActiveSource('none');
  }, []);

  const handleVidSrcError = useCallback((error: string) => {
    console.error(`[Player] ❌ VidSrc fallback also failed: ${error}`);
    setFetchError(true);
    setStatus('error');
    setActiveSource('none');
  }, []);

  // Handle Player Source Updates (when state changes)
  useEffect(() => {
    async function updatePlayer() {
      if (internalVideoUrl && internalVideoUrl !== '' && internalVideoUrl !== 'ERROR') {
         if (internalVideoUrl !== currentUrlRef.current) {
            console.log(`[Player] 🔄 Updating native player source to: ${internalVideoUrl.substring(0, 50)}...`);
            currentUrlRef.current = internalVideoUrl;
            try {
              // Ensure player is not released before calling
              if (player) {
                await (player as any).replaceAsync({
                  uri: internalVideoUrl,
                  headers: internalHeaders || undefined,
                  contentType: 'hls',  // VidLink proxy URLs need explicit HLS content type
                });
                player.play();
              }
            } catch (e) {
              console.error("[Player] ❌ replaceAsync failed:", e);
            }
         }
      }
    }
    updatePlayer();
  }, [internalVideoUrl, internalHeaders, player]);

  // Init Brightness
  useEffect(() => {
    (async () => {
      const { status } = await Brightness.requestPermissionsAsync();
      if (status === 'granted') {
        const current = await Brightness.getBrightnessAsync();
        setBrightnessLevel(current);
      }
    })();
  }, []);

  // Fetch and parse subtitles
  useEffect(() => {
    async function loadSubtitles() {
      if (selectedTrackIndex >= 0 && internalTracks[selectedTrackIndex]) {
        try {
          const track = internalTracks[selectedTrackIndex];
          const response = await fetch(track.file);
          const text = await response.text();
          parsedSubtitles.current = parseVtt(text);
          console.log(`[Subtitles] Loaded ${parsedSubtitles.current.length} lines`);
        } catch (e) {
          console.error('[Subtitles] Error fetching subtitle file', e);
        }
      } else {
        parsedSubtitles.current = [];
        setActiveSubtitle('');
      }
    }
    loadSubtitles();
  }, [selectedTrackIndex, internalTracks]);

  // Consolidated progress handler — driven by native timeUpdate events (not polling)
  // Matches TV app pattern: no setInterval, all progress/subtitle/history logic in one callback
  const lastSaveTimeRef = useRef(0);
  const hasSeekedRef = useRef(false);

  const currentPlaybackTimeRef = useRef(0);

  const handleProgressUpdate = useCallback((current: number, playerDur: number) => {
    if (playerDur > 0 && playerDur !== duration) {
      setDuration(playerDur);
    }
    
    const activeDur = playerDur > 0 ? playerDur : (duration > 0 ? duration : 1);

    if (!isScrubbing.current) {
      progressPercentage.value = (current / activeDur) * 100;
      setCurrentTime(current);
      currentPlaybackTimeRef.current = current;
    }

    // Save watch progress every 3 minutes (180s) — same as TV app
    // Previously phone saved every 10s which added unnecessary JS thread pressure
    if (Math.abs(current - lastSaveTimeRef.current) >= 180) {
      lastSaveTimeRef.current = current;
      const id = tmdbId?.toString();
      if (id && current > 5) {
        const historyItem = {
          id,
          title,
          backdrop_path: backdropUrl,
          poster_path: backdropUrl,
          tmdbId,
          type: contentType || 'movie'
        };
        WatchHistoryService.saveProgress(
          historyItem,
          contentType || 'movie',
          current,
          activeDur,
          selectedProfile?.id || '',
          seasonNum,
          episodeNum
        );
      }
    }

    // Skip Intro Logic
    const introMarker = skipMarkersRef.current.find(m => m.type === 'intro');
    // Intelligent marker check, fallback to 30-90s mock if stream has no markers
    const isIntroActive = introMarker 
      ? (current >= introMarker.start && current <= introMarker.end)
      : (current > 30 && current < 90);

    if (isIntroActive) {
      if (!showSkipIntroRef.current) {
        showSkipIntroRef.current = true;
        setShowSkipIntro(true);
      }
    } else {
      if (showSkipIntroRef.current) {
        showSkipIntroRef.current = false;
        setShowSkipIntro(false);
      }
    }

    // Auto-Play Next Episode logic
    // Require a realistic duration (>60s) so it doesn't trigger immediately on load when duration is 0
    if (contentType === 'tv' && onNextEpisode && activeDur > 60) {
      const outroMarker = skipMarkersRef.current.find(m => m.type === 'outro');
      const remaining = activeDur - current;
      
      // If we have a genuine API outro marker, trigger there. Otherwise fallback to the last 20 seconds.
      const isOutroActive = outroMarker
         ? (current >= outroMarker.start && remaining > 0)
         : (remaining <= 20 && remaining > 0);

      if (isOutroActive) {
        if (!isNextEpisodeCountdownRef.current) {
          isNextEpisodeCountdownRef.current = true;
          setIsNextEpisodeCountdown(true);
        }
        setCountdownValue(Math.ceil(remaining));
      } else if (remaining <= 0 && isNextEpisodeCountdownRef.current) {
        isNextEpisodeCountdownRef.current = false;
        setIsNextEpisodeCountdown(false);
        onNextEpisode();
      } else {
        if (isNextEpisodeCountdownRef.current) {
          isNextEpisodeCountdownRef.current = false;
          setIsNextEpisodeCountdown(false);
        }
      }
    }

    // Subtitles check
    if (parsedSubtitles.current.length > 0) {
      const sub = parsedSubtitles.current.find(s => current >= s.start && current <= s.end);
      const text = sub ? sub.text : '';
      if (text !== currentSubtitleRef.current) {
        currentSubtitleRef.current = text;
        setActiveSubtitle(text);
      }
    } else if (currentSubtitleRef.current !== '') {
       currentSubtitleRef.current = '';
       setActiveSubtitle('');
    }
  }, [duration, contentType, title, tmdbId, backdropUrl, selectedProfile?.id, seasonNum, episodeNum, onNextEpisode, progressPercentage]);

  // NOTE: Duplicate source-update effect removed — the effect at lines 185-207
  // already handles internalVideoUrl changes. Having two effects both calling
  // replaceAsync() caused double network requests on weak connections.

  // Handle Orientation
  useEffect(() => {
    async function lockOrientation() {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch {
        console.warn("Orientation lock failed");
      }
    }
    lockOrientation();
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT).catch(() => {});
    };
  }, []);
  
  // Resume Playback Progress (same pattern as TV app)
  // Now uses episode-specific lookup to avoid cross-episode position bleed
  useEffect(() => {
    async function checkHistory() {
      if (!tmdbId || hasSeekedRef.current) return;
      const id = tmdbId.toString();
      if (!id) return;
      // Pass season/episode so we get the exact episode's progress, not a different episode
      const historyItem = await WatchHistoryService.getProgress(
        selectedProfile?.id || '', 
        id, 
        seasonNum, 
        episodeNum
      );
      if (historyItem && historyItem.currentTime > 5 && player) {
        // Double-check: only resume if the history matches our current episode
        const episodeMatches = contentType !== 'tv' || 
          (historyItem.season === seasonNum && historyItem.episode === episodeNum);
        if (episodeMatches) {
          console.log(`[WatchHistory] Resuming S${seasonNum}E${episodeNum} from ${historyItem.currentTime}s`);
          try {
            player.currentTime = historyItem.currentTime;
          } catch {}
        } else {
          console.log(`[WatchHistory] Episode mismatch — starting from beginning`);
        }
      }
      hasSeekedRef.current = true;
    }
    if (status === 'readyToPlay' && !hasSeekedRef.current) {
       checkHistory();
    }
  }, [status, tmdbId, player, seasonNum, episodeNum, contentType, selectedProfile?.id]);

  // NOTE: Separate 10s save progress interval removed.
  // Watch history is now saved every 180s inside handleProgressUpdate,
  // matching the TV app pattern and reducing JS thread pressure.

  // Event Listeners — consolidated progress tracking into timeUpdate (matches TV app)
  useEffect(() => {
    if (!player) return;
    const subscriptions = [
      player.addListener('statusChange', (payload: any) => {
        if (payload.status === 'error') {
          console.error(`[Player] 💥 Error details:`, payload.error);
        }
        setStatus(payload.status);
      }),
      player.addListener('timeUpdate', (payload: any) => {
        // Drive ALL progress-dependent logic from this single native event
        // instead of the old 50ms setInterval polling loop
        const current = payload.currentTime || 0;
        const playerDur = player.duration || 0;
        handleProgressUpdate(current, playerDur);
      }),
      (player as any).addListener('durationChange', (payload: any) => {
        setDuration(payload.duration);
      }),
      player.addListener('playingChange', (payload: any) => {
        setIsPlaying(payload.isPlaying);
      })
    ];

    return () => {
      // Final Save on exit/episode switch
      // Use ref and state to avoid accessing player properties after it's released
      const current = currentPlaybackTimeRef.current || 0;
      const playerDur = duration || 0;
      if (current > 5 && playerDur > 0) {
        const id = tmdbId?.toString();
        if (id) {
          WatchHistoryService.saveProgress(
            { id, title, backdrop_path: backdropUrl, poster_path: backdropUrl, tmdbId, type: contentType || 'movie' },
            contentType || 'movie',
            current,
            playerDur,
            selectedProfile?.id || '',
            seasonNum,
            episodeNum
          );
        }
      }
      subscriptions.forEach(sub => sub.remove());
    };
  }, [player, handleProgressUpdate, duration, tmdbId, title, backdropUrl, contentType, selectedProfile?.id, seasonNum, episodeNum]);

  // Loading Screen Crossfade Animation
  useEffect(() => {
    const isLoading = status === 'loading' || status === 'idle' || !internalVideoUrl || internalVideoUrl === '';
    if (isLoading) {
      // Instantly show loading
      loadingOpacity.value = 1;
    } else if (status === 'readyToPlay' && isPlaying && !fetchError) {
      // Smooth cinematic 800ms crossfade to video
      loadingOpacity.value = withTiming(0, {
        duration: 800,
        easing: Easing.inOut(Easing.ease)
      });
    }
  }, [status, isPlaying, internalVideoUrl, fetchError, loadingOpacity]);

  const resetHideTimer = useCallback(() => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);

    setIsControlsVisible(true);
    controlsOpacity.value = withTiming(1, { duration: 200 });

    if (!isLocked) {
      hideTimeout.current = setTimeout(() => {
        controlsOpacity.value = withTiming(0, {
          duration: 500,
          easing: Easing.out(Easing.quad)
        }, (finished) => {
          if (finished) runOnJS(setIsControlsVisible)(false);
        });
      }, 5000); // Increased from 3500ms to 5000ms
    }
  }, [isLocked, controlsOpacity]);

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    };
  }, [isLocked, resetHideTimer]);

  const toggleControls = () => {
    if (controlsOpacity.value > 0) {
      controlsOpacity.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished) runOnJS(setIsControlsVisible)(false);
      });
    } else {
      resetHideTimer();
    }
  };

  const handlePlayPause = useCallback(() => {
    try {
      if (player) {
        if (isPlaying) player.pause();
        else player.play();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch {
      console.warn("[Player] handlePlayPause safe-guarded");
    }
    resetHideTimer();
  }, [player, isPlaying, resetHideTimer]);

  const handleSelectAudioTrack = useCallback((trackId: string) => {
    setSelectedAudioTrackId(trackId);
    try {
      if (player && (player as any).audioTrack !== undefined) {
        (player as any).audioTrack = trackId;
      }
    } catch {
      console.warn('[Player] Audio track switch not supported on this device/runtime');
    }
  }, [player]);

  const skip = useCallback((seconds: number) => {
    try {
      if (player) {
        player.currentTime += seconds;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {
      console.warn("[Player] skip safe-guarded");
    }
    resetHideTimer();
  }, [player, resetHideTimer]);

  // Ratings Subscription
  useEffect(() => {
    if (!selectedProfile || !tmdbId) return;
    const unsubscribe = RatingsService.subscribeToRating(selectedProfile.id, tmdbId, (fetchedRating) => {
      setRating(fetchedRating);
    });
    return () => unsubscribe();
  }, [selectedProfile, tmdbId]);

  const handleRate = useCallback((newRating: RatingValue) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRating(newRating);
    if (selectedProfile && tmdbId) {
       RatingsService.setRating(selectedProfile.id, {
         id: tmdbId,
         title: title || '',
         type: contentType || 'movie',
         poster_path: backdropUrl
       }, newRating);
    }
    resetHideTimer();
  }, [selectedProfile, tmdbId, title, contentType, backdropUrl, resetHideTimer]);

  // Gestures
  const tapGesture = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => {
      toggleControls();
    });

  const leftRippleOpacity = useSharedValue(0);
  const leftRippleScale = useSharedValue(0.5);
  const rightRippleOpacity = useSharedValue(0);
  const rightRippleScale = useSharedValue(0.5);

  const triggerLeftRipple = () => {
    leftRippleScale.value = 0.5;
    leftRippleOpacity.value = 0.8;
    leftRippleScale.value = withTiming(2, { duration: 500, easing: Easing.out(Easing.exp) });
    leftRippleOpacity.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.exp) });
  };

  const triggerRightRipple = () => {
    rightRippleScale.value = 0.5;
    rightRippleOpacity.value = 0.8;
    rightRippleScale.value = withTiming(2, { duration: 500, easing: Easing.out(Easing.exp) });
    rightRippleOpacity.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.exp) });
  };

  const doubleTapLeft = Gesture.Tap()
    .numberOfTaps(2)
    .runOnJS(true)
    .onEnd(() => {
      skip(-10);
      triggerLeftRipple();
    });

  const doubleTapRight = Gesture.Tap()
    .numberOfTaps(2)
    .runOnJS(true)
    .onEnd(() => {
      skip(10);
      triggerRightRipple();
    });

  const scrubGesture = Gesture.Pan()
    .runOnJS(true)
    .onBegin((e) => {
      isScrubbing.current = true;
      isScrubbingReact.value = true;
      progressScale.value = withSpring(1.8, { damping: 15, stiffness: 300 });
      resetHideTimer();
      if (duration > 0 && progressBarWidth > 0) {
        const percent = Math.max(0, Math.min(100, (e.x / progressBarWidth) * 100));
        progressPercentage.value = percent;
        setCurrentTime((percent / 100) * duration);
      }
    })
    .onUpdate((e) => {
      resetHideTimer();
      if (duration > 0 && progressBarWidth > 0) {
        const percent = Math.max(0, Math.min(100, (e.x / progressBarWidth) * 100));
        progressPercentage.value = percent;
        setCurrentTime((percent / 100) * duration);
      }
    })
    .onEnd(() => {
      if (duration > 0) {
        player.currentTime = (progressPercentage.value / 100) * duration;
      }
    })
    .onFinalize(() => {
      isScrubbingReact.value = false;
      progressScale.value = withSpring(1, { damping: 15, stiffness: 300 });
      setTimeout(() => {
        isScrubbing.current = false;
      }, 1500); // Increased timeout to prevent snap-back while buffering
    });

  const brightnessGesture = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => {
      if (isLocked) return;
      resetHideTimer();
      const delta = -e.translationY / 2000;
      const newBright = Math.max(0, Math.min(1, brightnessLevel + delta));
      setBrightnessLevel(newBright);
      Brightness.setBrightnessAsync(newBright);
    });

  const volumeGesture = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => {
      if (isLocked) return;
      resetHideTimer();
      const delta = -e.translationY / 2000;
      const newVol = Math.max(0, Math.min(1, volumeLevel + delta));
      // Round to 2 decimal places to prevent audio distortion from rapid micro-updates
      const roundedVol = Math.round(newVol * 100) / 100;
      setVolumeLevel(roundedVol);
      player.volume = roundedVol;
    });

  const leftGestures = Gesture.Exclusive(doubleTapLeft, tapGesture);
  const rightGestures = Gesture.Exclusive(doubleTapRight, tapGesture);

  const animatedControlsStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));

  const animatedLoadingStyle = useAnimatedStyle(() => ({
    opacity: loadingOpacity.value,
  }));

  const animatedProgressStyle = useAnimatedStyle(() => ({
    width: `${progressPercentage.value}%`,
  }));

  const animatedTrackStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: progressScale.value }],
  }));

  const animatedThumbScaleStyle = useAnimatedStyle(() => ({
    left: `${progressPercentage.value}%`,
    transform: [{ scale: progressScale.value }],
  }));

  const animatedTooltipStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isScrubbingReact.value ? 1 : 0, { duration: 150 }),
    left: `${progressPercentage.value}%`,
    transform: [{ translateX: -24 }, { translateY: -40 }],
  }));

  const leftRippleStyle = useAnimatedStyle(() => ({
    opacity: leftRippleOpacity.value,
    transform: [{ scale: leftRippleScale.value }],
  }));

  const rightRippleStyle = useAnimatedStyle(() => ({
    opacity: rightRippleOpacity.value,
    transform: [{ scale: rightRippleScale.value }],
  }));

  const animatedVideoStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: withTiming(isNextEpisodeCountdown ? 0.7 : 1, { duration: 500 }) },
        { translateX: withTiming(isNextEpisodeCountdown ? -width * 0.15 : 0, { duration: 500 }) },
        { translateY: withTiming(isNextEpisodeCountdown ? -height * 0.1 : 0, { duration: 500 }) },
      ],
    };
  });

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) secs = 0;
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.container}>
        {/* VidLink Primary Resolver WebView */}
        <VidLinkResolver
          tmdbId={tmdbId || ''}
          type={contentType || 'movie'}
          season={seasonNum}
          episode={episodeNum}
          enabled={vidlinkEnabled}
          onStreamResolved={handleVidLinkResolved}
          onError={handleVidLinkError}
        />

        {/* VidSrc Fallback Resolver WebView */}
        <VidSrcResolver
          tmdbId={tmdbId || ''}
          type={contentType || 'movie'}
          season={seasonNum}
          episode={episodeNum}
          enabled={activeSource === 'vidsrc'}
          onStreamResolved={handleVidSrcResolved}
          onError={handleVidSrcError}
        />

        <Animated.View style={[StyleSheet.absoluteFill, animatedVideoStyle]}>
          <VideoView
            ref={videoViewRef}
            style={StyleSheet.absoluteFill}
            player={player}
            nativeControls={false}
            contentFit={resizeMode}
            allowsPictureInPicture={true}
          />
        </Animated.View>

        {/* Premium Overlays */}
        {showSkipIntro && !isNextEpisodeCountdown && (
          <Animated.View entering={FadeInDown} exiting={FadeOutRight} style={styles.skipIntroContainer}>
            <Pressable style={styles.skipIntroBtn} onPress={() => {
              // Explicitly hide BEFORE skipping to prevent stale render
              showSkipIntroRef.current = false;
              setShowSkipIntro(false);
              skip(60);
            }}>
              <Text style={styles.skipIntroText}>Skip Intro</Text>
            </Pressable>
          </Animated.View>
        )}

        {isNextEpisodeCountdown && (
          <Animated.View entering={FadeInRight} exiting={FadeOutRight} style={styles.nextEpisodeOverlay}>
            <Text style={styles.nextEpisodeHeader}>Up Next</Text>
            {nextEpisodeData?.name && (
              <Text style={styles.nextEpisodeTitle}>{nextEpisodeData.name}</Text>
            )}
            <Text style={styles.nextEpisodeCountdownText}>Starting in {countdownValue} seconds</Text>
            
            <View style={styles.nextEpisodePreview}>
              {nextEpisodeData?.still_path && (
                <Image 
                  source={{ uri: getImageUrl(nextEpisodeData.still_path) }} 
                  style={[StyleSheet.absoluteFill, { borderRadius: 8 }]} 
                />
              )}
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', borderRadius: 8 }]}>
                <Ionicons name="play-circle" size={50} color="white" />
              </View>
            </View>

            <View style={styles.nextEpisodeActions}>
              <Pressable style={styles.nextEpisodeBtn} onPress={() => { setIsNextEpisodeCountdown(false); skip(20); }}>
                 <Text style={[styles.nextEpisodeBtnText, { color: 'white' }]}>Watch Credits</Text>
              </Pressable>
              <Pressable style={[styles.nextEpisodeBtn, styles.nextEpisodeBtnPrimary]} onPress={() => { setIsNextEpisodeCountdown(false); onNextEpisode?.(); }}>
                 <Ionicons name="play" size={16} color="black" />
                 <Text style={styles.nextEpisodeBtnText}>Play Now</Text>
              </Pressable>
            </View>
          </Animated.View>
        )}

        {/* Subtitle Overlay - Rendered under controls but over video */}
        {activeSubtitle ? (
          <View style={styles.subtitleContainer}>
            <Text style={styles.subtitleText}>{activeSubtitle}</Text>
          </View>
        ) : null}

        {/* Background Gesture Zones (Always active, behind controls) */}
        {!isLocked ? (
          <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', zIndex: 1 }]} pointerEvents="box-none">
            <GestureDetector gesture={Gesture.Simultaneous(brightnessGesture, leftGestures)}>
              <View style={{ flex: 1, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' }}>
                <Animated.View style={[styles.seekRipple, leftRippleStyle]}>
                  <MaterialIcons name="replay-10" size={40} color="white" />
                </Animated.View>
              </View>
            </GestureDetector>
            <GestureDetector gesture={Gesture.Simultaneous(volumeGesture, rightGestures)}>
              <View style={{ flex: 1, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' }}>
                <Animated.View style={[styles.seekRipple, rightRippleStyle]}>
                  <MaterialIcons name="forward-10" size={40} color="white" />
                </Animated.View>
              </View>
            </GestureDetector>
          </View>
        ) : (
          <GestureDetector gesture={tapGesture}>
             <View style={[StyleSheet.absoluteFill, { zIndex: 1, backgroundColor: 'transparent' }]} />
          </GestureDetector>
        )}

        {/* Buffering/Loading Overlay */}
        <Animated.View 
          style={[styles.centeredOverlay, animatedLoadingStyle]}
          pointerEvents={(status === 'loading' || status === 'idle' || !internalVideoUrl || internalVideoUrl === '') && !fetchError ? "auto" : "none"}
        >
          {backdropUrl && (
            <>
              <Image 
                source={{ uri: backdropUrl }} 
                style={[StyleSheet.absoluteFill, { opacity: 0.6 }]} 
                resizeMode="cover" 
                blurRadius={20}
              />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
            </>
          )}
          
          {(!fetchError) && (
            <>
              <NetflixLoader size={60} withPercentage={true} />
              {!internalVideoUrl ? (
                <>
                  <Text style={[styles.loadingStatusText, { marginTop: 30, fontSize: 18, fontWeight: '600', color: 'white' }]}>
                    {contentType === 'tv' && episodeNum
                      ? `Getting Episode ${episodeNum} ready...`
                      : 'Getting your movie ready...'}
                  </Text>
                  <Text style={[styles.loadingStatusText, { marginTop: 10, fontSize: 13 }]}>
                    {activeSource === 'vidlink' ? 'Trying VidLink...' 
                     : activeSource === 'vidsrc' ? 'Trying VidSrc fallback...' 
                     : 'Resolving stream...'}
                  </Text>
                </>
              ) : (
                <Text style={[styles.loadingStatusText, { marginTop: 30 }]}>Buffering...</Text>
              )}
            </>
          )}
        </Animated.View>

        {/* Error Overlay */}
        {(status === 'error' || fetchError) && (
          <View style={styles.centeredOverlay}>
            <Ionicons name={isRateLimited ? "time-outline" : "alert-circle"} size={50} color={isRateLimited ? "#FFA500" : COLORS.primary} />
            <Text style={styles.errorText}>
              {isRateLimited 
                ? "Server Temporarily Busy" 
                : (fetchError ? "Stream Not Found" : "This video is currently unavailable.")}
            </Text>
            <Text style={[styles.errorText, { fontSize: 14, fontWeight: '400', marginTop: 5, color: 'rgba(255,255,255,0.7)' }]}>
              {isRateLimited 
                ? "Too many requests detected. Please wait 2-5 minutes and try again."
                : (fetchError 
                  ? "We couldn't find a high-quality stream for this content." 
                  : "Please try again later.")}
            </Text>
            <View style={styles.errorActions}>
              <Pressable style={styles.retryBtn} onPress={() => {
                // Re-trigger resolution from scratch
                setFetchError(false);
                setIsRateLimited(false);
                setResolveAttempt(prev => prev + 1);
              }}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
              <Pressable style={[styles.retryBtn, { backgroundColor: '#333' }]} onPress={onClose}>
                <Text style={[styles.retryText, { color: 'white' }]}>Go Back</Text>
              </Pressable>
            </View>
          </View>
        )}

        {isControlsVisible && status !== 'error' && (
          <Animated.View 
            style={[styles.overlay, animatedControlsStyle]}
            pointerEvents="box-none"
          >
            {/* Top Bar */}
            <View style={styles.topBar}>
              {!isLocked ? (
                <>
                  <View style={styles.topBarLeft}>
                    <Pressable onPress={onClose} style={styles.iconBtn}>
                      <Ionicons name="chevron-back" size={28} color="white" />
                    </Pressable>
                    <Text style={styles.videoTitle} numberOfLines={1}>{title}</Text>
                  </View>
                  
                  {/* Three Thumbs (Rating) */}
                  <View style={styles.thumbsContainer}>
                    <Pressable style={styles.thumbBtn} onPress={() => handleRate('dislike')}>
                      <MaterialCommunityIcons name={rating === 'dislike' ? "thumb-down" : "thumb-down-outline"} size={26} color="white" />
                      <Text style={styles.thumbLabel}>Not for me</Text>
                    </Pressable>
                    <Pressable style={styles.thumbBtn} onPress={() => handleRate('like')}>
                      <MaterialCommunityIcons name={rating === 'like' ? "thumb-up" : "thumb-up-outline"} size={26} color="white" />
                      <Text style={styles.thumbLabel}>I like this</Text>
                    </Pressable>
                    <Pressable style={styles.thumbBtn} onPress={() => handleRate('love')}>
                      <View style={styles.doubleThumbWrapper}>
                        <MaterialCommunityIcons name={rating === 'love' ? "thumb-up" : "thumb-up-outline"} size={20} color="white" style={styles.thumbOffset} />
                        <MaterialCommunityIcons name={rating === 'love' ? "thumb-up" : "thumb-up-outline"} size={20} color="white" />
                      </View>
                      <Text style={styles.thumbLabel}>Love this!</Text>
                    </Pressable>
                  </View>

                  <View style={styles.topBarRight}>
                    <Pressable style={styles.iconBtn}>
                      <MaterialCommunityIcons name="cast" size={26} color="white" />
                    </Pressable>
                    <Pressable onPress={onClose} style={styles.iconBtn}>
                      <Ionicons name="close" size={30} color="white" />
                    </Pressable>
                  </View>
                </>
              ) : (
                <View style={{ flex: 1, alignItems: 'flex-end', paddingTop: 10, paddingRight: 20 }}>
                  <Pressable 
                    onPress={() => {
                      setIsLocked(false);
                      resetHideTimer();
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    }} 
                    style={styles.lockPill}
                  >
                    <Ionicons name="lock-closed" size={18} color="white" />
                    <Text style={styles.lockPillText}>Screen Locked</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {/* Middle Section: Brightness, Playback Controls, Volume */}
            <View style={styles.middleSection} pointerEvents="box-none">
              {/* Left: Brightness Visual */}
              {!isLocked && (
                <View style={styles.sideControl} pointerEvents="none">
                  <Ionicons name="sunny-outline" size={24} color="white" />
                  <View style={styles.verticalSlider}>
                    <View style={[styles.verticalSliderFill, { height: `${brightnessLevel * 100}%` }]} />
                  </View>
                </View>
              )}

              {/* Center Controls */}
              {!isLocked ? (
                <View style={styles.centerControls} pointerEvents="box-none">
                  <Pressable onPress={() => skip(-10)} style={styles.centerIcon}>
                    <MaterialIcons name="replay-10" size={56} color="white" />
                  </Pressable>
                  
                  <Pressable onPress={handlePlayPause} style={styles.playBtn}>
                    <Ionicons name={isPlaying ? "pause" : "play"} size={70} color="white" style={!isPlaying && { marginLeft: 6 }} />
                  </Pressable>

                  <Pressable onPress={() => skip(10)} style={styles.centerIcon}>
                    <MaterialIcons name="forward-10" size={56} color="white" />
                  </Pressable>
                </View>
              ) : (
                <View style={{ flex: 1 }} pointerEvents="none" />
              )}

              {/* Right: Volume Visual */}
              {!isLocked && (
                <View style={styles.sideControl} pointerEvents="none">
                  <Ionicons name={volumeLevel === 0 ? "volume-mute-outline" : "volume-high-outline"} size={24} color="white" />
                  <View style={styles.verticalSlider}>
                    <View style={[styles.verticalSliderFill, { height: `${volumeLevel * 100}%` }]} />
                  </View>
                </View>
              )}
            </View>

            {/* Skip Intro Button */}
            {showSkipIntro && !isLocked && (
              <Animated.View 
                entering={FadeIn.duration(400)} 
                exiting={FadeOut.duration(400)}
                style={styles.skipIntroContainer}
              >
                <Pressable 
                  style={styles.skipIntroBtn}
                  onPress={() => {
                    const introMarker = skipMarkers.find(m => m.type === 'intro');
                    if (introMarker && player) {
                      player.currentTime = introMarker.end;
                    } else {
                      skip(90 - currentTime); // Fallback to 90s mark
                    }
                    setShowSkipIntro(false);
                    showSkipIntroRef.current = false;
                    resetHideTimer();
                  }}
                >
                  <Text style={styles.skipIntroText}>Skip Intro</Text>
                </Pressable>
              </Animated.View>
            )}

            {/* Bottom Section */}
            {!isLocked && (
              <View style={styles.bottomSection}>
                <View style={styles.progressContainer}>
                  <Text style={styles.timeTextRemaining}>{formatTime((duration || 0) - currentTime)}</Text>
                  
                  <GestureDetector gesture={scrubGesture}>
                    <View 
                      style={styles.progressTrackContainer}
                      onLayout={(e) => setProgressBarWidth(e.nativeEvent.layout.width)}
                    >
                      <Animated.View style={[styles.progressTrack, animatedTrackStyle]}>
                        <Animated.View style={[styles.progressFill, animatedProgressStyle]} />
                      </Animated.View>
                      
                      <Animated.View style={[styles.scrubTooltip, animatedTooltipStyle]}>
                        <Text style={styles.scrubTooltipText}>{formatTime(currentTime)}</Text>
                      </Animated.View>

                      <Animated.View style={[styles.progressThumb, animatedThumbScaleStyle]} />
                    </View>
                  </GestureDetector>
                </View>

                <View style={styles.bottomIcons}>
                  {episodes && episodes.length > 0 && (
                    <Pressable onPress={() => setShowEpisodePicker(true)} style={styles.bottomIconBtn}>
                      <MaterialCommunityIcons name="layers-outline" size={26} color="white" />
                      <Text style={styles.bottomIconLabel}>Episodes</Text>
                    </Pressable>
                  )}

                  <Pressable onPress={() => setShowSubtitlePicker(true)} style={styles.bottomIconBtn}>
                    <Ionicons name="chatbox-outline" size={26} color={selectedTrackIndex >= 0 ? COLORS.primary : "white"} />
                    <Text style={styles.bottomIconLabel}>Audio & Subtitles</Text>
                  </Pressable>

                  {episodes && episodes.length > 0 && onNextEpisode && (
                    <Pressable 
                      onPress={() => {
                        onNextEpisode();
                        resetHideTimer();
                      }} 
                      style={styles.bottomIconBtn}
                    >
                      <Ionicons name="play-skip-forward-outline" size={26} color="white" />
                      <Text style={styles.bottomIconLabel}>Next Ep.</Text>
                    </Pressable>
                  )}

                  <Pressable onPress={() => { setShowMoreOptions(true); resetHideTimer(); }} style={styles.bottomIconBtn}>
                    <Ionicons name="ellipsis-horizontal-circle-outline" size={26} color="white" />
                    <Text style={styles.bottomIconLabel}>More</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </Animated.View>
        )}
      </View>

      {/* Episodes Picker Side Panel */}
      <Modal
        visible={showEpisodePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEpisodePicker(false)}
      >
        <Pressable style={styles.sidePanelOverlay} onPress={() => setShowEpisodePicker(false)}>
          <Pressable style={styles.sidePanelWrapper} onPress={(e) => e.stopPropagation()}>
            <Animated.View 
              entering={SlideInRight.duration(300)} 
              exiting={SlideOutRight.duration(300)} 
              style={styles.sidePanelContent}
            >
              <View style={styles.sidePanelHeader}>
                <Text style={styles.sidePanelTitle}>Episodes</Text>
                <Pressable onPress={() => setShowEpisodePicker(false)} style={{ padding: 5 }}>
                  <Ionicons name="close" size={28} color="white" />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                {episodes.map((ep) => {
                  const isActive = ep.episode_number === episodeNum;
                  return (
                    <Pressable 
                      key={ep.id} 
                      style={[styles.epOptionItem, isActive && styles.epOptionItemActive]}
                      onPress={() => {
                        if (onEpisodeSelect) onEpisodeSelect(ep.episode_number);
                        setShowEpisodePicker(false);
                        resetHideTimer();
                      }}
                    >
                      <View style={styles.epThumbWrapper}>
                        <Image source={{ uri: getImageUrl(ep.still_path) }} style={styles.epOptionThumbImage} />
                        {isActive && (
                          <View style={styles.epPlayingOverlay}>
                            <Ionicons name="play" size={24} color="white" />
                          </View>
                        )}
                      </View>
                      
                      <View style={styles.epOptionInfoText}>
                        <Text 
                          style={[styles.epOptionTitleText, isActive && { color: 'white' }]} 
                          numberOfLines={1}
                        >
                          {ep.episode_number}. {ep.name}
                        </Text>
                        <Text style={styles.epOptionRuntimeText}>{ep.runtime || 45}m</Text>
                      </View>
                      
                      <Feather name="download" size={22} color="white" style={{ opacity: 0.8 }} />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Subtitles Picker Side Panel */}
      <Modal
        visible={showSubtitlePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSubtitlePicker(false)}
      >
        <Pressable style={styles.sidePanelOverlay} onPress={() => setShowSubtitlePicker(false)}>
          <Pressable style={styles.sidePanelWrapper} onPress={(e) => e.stopPropagation()}>
            <Animated.View 
              entering={SlideInRight.duration(300)} 
              exiting={SlideOutRight.duration(300)} 
              style={styles.sidePanelContent}
            >
              <View style={styles.sidePanelHeader}>
                <Text style={styles.sidePanelTitle}>Audio & Subtitles</Text>
                <Pressable onPress={() => setShowSubtitlePicker(false)} style={{ padding: 5 }}>
                  <Ionicons name="close" size={28} color="white" />
                </Pressable>
              </View>

              <View style={styles.sidePanelColumns}>
                {/* Audio Column (Static for now as VidLink only provides subs) */}
                <View style={styles.sidePanelCol}>
                  <Text style={styles.sidePanelColTitle}>Audio</Text>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {internalAudioTracks.length > 0 ? (
                      internalAudioTracks.map((track, index) => {
                        const id = track.id || `${track.label}_${index}`;
                        const isActive = selectedAudioTrackId === id || (!selectedAudioTrackId && index === 0);
                        return (
                          <Pressable
                            key={id}
                            style={isActive ? styles.trackItemActive : styles.trackItem}
                            onPress={() => {
                              handleSelectAudioTrack(id);
                              setShowSubtitlePicker(false);
                            }}
                          >
                            <Text style={isActive ? styles.trackItemTextActive : styles.trackItemText}>
                              {track.label || track.language || `Audio ${index + 1}`}
                            </Text>
                            {isActive && <Ionicons name="checkmark" size={24} color="#E50914" />}
                          </Pressable>
                        );
                      })
                    ) : (
                      <Pressable style={styles.trackItemActive}>
                        <Text style={styles.trackItemTextActive}>Default Audio</Text>
                        <Ionicons name="checkmark" size={24} color="#E50914" />
                      </Pressable>
                    )}
                  </ScrollView>
                </View>

                {/* Subtitles Column */}
                <View style={styles.sidePanelCol}>
                  <Text style={styles.sidePanelColTitle}>Subtitles</Text>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    <Pressable 
                      style={selectedTrackIndex === -1 ? styles.trackItemActive : styles.trackItem}
                      onPress={() => {
                        setSelectedTrackIndex(-1);
                        setShowSubtitlePicker(false);
                        resetHideTimer();
                      }}
                    >
                      <Text style={selectedTrackIndex === -1 ? styles.trackItemTextActive : styles.trackItemText}>Off</Text>
                      {selectedTrackIndex === -1 && <Ionicons name="checkmark" size={24} color="#E50914" />}
                    </Pressable>

                    {internalTracks.map((track, index) => (
                      <Pressable 
                        key={index} 
                        style={selectedTrackIndex === index ? styles.trackItemActive : styles.trackItem}
                        onPress={() => {
                          setSelectedTrackIndex(index);
                          setShowSubtitlePicker(false);
                          resetHideTimer();
                        }}
                      >
                        <Text style={selectedTrackIndex === index ? styles.trackItemTextActive : styles.trackItemText}>
                          {track.label || `Track ${index + 1}`}
                        </Text>
                        {selectedTrackIndex === index && <Ionicons name="checkmark" size={24} color="#E50914" />}
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* More Options Bottom Sheet */}
      <Modal
        visible={showMoreOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMoreOptions(false)}
      >
        <Pressable style={styles.moreOptionsOverlay} onPress={() => setShowMoreOptions(false)}>
          <Pressable style={styles.moreOptionsSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.moreOptionsHandle} />
            <Text style={styles.moreOptionsTitle}>More Options</Text>

            <Pressable 
              style={styles.moreOptionRow} 
              onPress={() => {
                const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
                const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
                setPlaybackSpeed(next);
                player.playbackRate = next;
              }}
            >
              <Ionicons name="speedometer-outline" size={24} color="white" />
              <View style={styles.moreOptionInfo}>
                <Text style={styles.moreOptionLabel}>Playback Speed</Text>
                <Text style={styles.moreOptionValue}>{playbackSpeed}x</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.4)" />
            </Pressable>

            <Pressable 
              style={styles.moreOptionRow} 
              onPress={() => {
                setIsLocked(true);
                setShowMoreOptions(false);
              }}
            >
              <Ionicons name="lock-closed-outline" size={24} color="white" />
              <View style={styles.moreOptionInfo}>
                <Text style={styles.moreOptionLabel}>Lock Screen</Text>
                <Text style={styles.moreOptionValue}>Disables touch controls</Text>
              </View>
            </Pressable>

            <Pressable 
              style={styles.moreOptionRow} 
              onPress={() => {
                videoViewRef.current?.startPictureInPicture?.();
                setShowMoreOptions(false);
              }}
            >
              <MaterialIcons name="picture-in-picture-alt" size={24} color="white" />
              <View style={styles.moreOptionInfo}>
                <Text style={styles.moreOptionLabel}>Picture in Picture</Text>
                <Text style={styles.moreOptionValue}>Continue watching in a mini player</Text>
              </View>
            </Pressable>

            <Pressable 
              style={styles.moreOptionRow} 
              onPress={() => {
                setResizeMode(prev => prev === 'contain' ? 'cover' : 'contain');
              }}
            >
              <Ionicons name={resizeMode === 'contain' ? "expand-outline" : "contract-outline"} size={24} color="white" />
              <View style={styles.moreOptionInfo}>
                <Text style={styles.moreOptionLabel}>Screen Fit</Text>
                <Text style={styles.moreOptionValue}>{resizeMode === 'contain' ? 'Fit to Screen' : 'Fill Screen'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.4)" />
            </Pressable>

          </Pressable>
        </Pressable>
      </Modal>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'space-between',
    paddingVertical: 20,
    zIndex: 10,
  },
  centeredOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    zIndex: 5,
  },
  subtitleContainer: {
    position: 'absolute',
    bottom: 90,
    left: 40,
    right: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    pointerEvents: 'none',
  },
  subtitleText: {
    color: 'white',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    textShadowColor: 'black',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 6,
  },
  errorText: {
    color: 'white',
    marginTop: 10,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  loadingStatusText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 1,
    textAlign: 'center',
  },
  errorActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  retryBtn: {
    backgroundColor: 'white',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 4,
  },
  retryText: {
    color: 'black',
    fontWeight: 'bold',
    fontSize: 16,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    flex: 1,
    justifyContent: 'flex-end',
  },
  thumbsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 25,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  thumbBtn: {
    alignItems: 'center',
    gap: 4,
  },
  doubleThumbWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 26,
    width: 32,
    justifyContent: 'center',
  },
  thumbOffset: {
    position: 'absolute',
    left: 0,
    zIndex: -1,
    transform: [{ rotate: '-15deg' }, { scale: 0.9 }],
    opacity: 0.7,
  },
  thumbLabel: {
    color: 'white',
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  iconBtn: {
    padding: 10,
  },
  videoTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
  middleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    flex: 1,
  },
  sideControl: {
    alignItems: 'center',
    width: 40,
    paddingVertical: 20,
  },
  verticalSlider: {
    height: 100,
    width: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  verticalSliderFill: {
    width: '100%',
    backgroundColor: 'white',
    borderRadius: 2,
  },
  centerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 80,
  },
  centerIcon: {
    opacity: 0.9,
    padding: 10,
  },
  playBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  bottomSection: {
    paddingHorizontal: 50,
    paddingBottom: 10,
  },
  progressContainer: {
    marginBottom: 20,
  },
  timeTextRemaining: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'right',
    marginBottom: 8,
  },
  progressTrackContainer: {
    height: 30,
    justifyContent: 'center',
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#E50914',
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E50914',
    marginLeft: -10,
    shadowColor: '#E50914',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  scrubTooltip: {
    position: 'absolute',
    backgroundColor: 'black',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrubTooltipText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  bottomIcons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  bottomIconBtn: {
    alignItems: 'center',
    gap: 8,
    padding: 5,
  },
  bottomIconLabel: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
  lockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 30,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  lockPillText: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Audio & Subtitles Side Panel Styles
  sidePanelOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sidePanelWrapper: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '45%',
    maxWidth: 400,
  },
  sidePanelContent: {
    flex: 1,
    backgroundColor: 'rgba(28,28,28,0.95)',
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: -10, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  sidePanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  sidePanelTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  sidePanelColumns: {
    flexDirection: 'row',
    flex: 1,
    gap: 40,
  },
  sidePanelCol: {
    flex: 1,
  },
  sidePanelColTitle: {
    color: '#808080',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  trackItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  trackItemActive: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  trackItemText: {
    color: '#A0A0A0',
    fontSize: 16,
    fontWeight: '500',
  },
  trackItemTextActive: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  // Episodes Panel Specific Styles
  epOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 16,
  },
  epOptionItemActive: {
    opacity: 1,
  },
  epThumbWrapper: {
    width: 130,
    height: 74,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  epOptionThumbImage: {
    width: '100%',
    height: '100%',
  },
  epPlayingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  epOptionInfoText: {
    flex: 1,
    justifyContent: 'center',
  },
  epOptionTitleText: {
    color: '#D1D1D1',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  epOptionRuntimeText: {
    color: '#808080',
    fontSize: 13,
  },
  seekRipple: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipIntroContainer: {
    position: 'absolute',
    right: 40,
    bottom: 120,
    zIndex: 50,
  },
  skipIntroBtn: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  skipIntroText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  nextEpisodeOverlay: {
    position: 'absolute',
    right: 40,
    bottom: 40,
    width: '35%',
    maxWidth: 300,
    backgroundColor: 'rgba(20,20,20,0.95)',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
    zIndex: 40,
  },
  nextEpisodeHeader: {
    color: 'white',
    fontSize: 18,
    fontFamily: 'NetflixSans-Bold',
    marginBottom: 4,
  },
  nextEpisodeTitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontFamily: 'NetflixSans-Medium',
    marginBottom: 8,
    maxWidth: 200,
  },
  nextEpisodeCountdownText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  nextEpisodePreview: {
    height: 100,
    backgroundColor: '#333',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  nextEpisodeActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  nextEpisodeBtn: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextEpisodeBtnPrimary: {
    backgroundColor: 'white',
    flexDirection: 'row',
    gap: 4,
  },
  nextEpisodeBtnText: {
    color: 'black',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // More Options Bottom Sheet
  moreOptionsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  moreOptionsSheet: {
    backgroundColor: 'rgba(30,30,30,0.98)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  moreOptionsHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  moreOptionsTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  moreOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    gap: 16,
  },
  moreOptionInfo: {
    flex: 1,
  },
  moreOptionLabel: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  moreOptionValue: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 2,
  },
});