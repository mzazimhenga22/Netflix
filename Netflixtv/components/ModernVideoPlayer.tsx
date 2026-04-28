import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, ScrollView, Modal, Image, useTVEventHandler } from 'react-native';
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
  SlideOutRight
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Brightness from 'expo-brightness';
import { useKeepAwake } from 'expo-keep-awake';
import { COLORS } from '../constants/theme';
import { parseVtt, Subtitle } from '../utils/vttParser';
import { getImageUrl, fetchMovieImages } from '../services/tmdb';
import LoadingSpinner from './LoadingSpinner';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
// Cloud resolver — replaces broken WebView/NativeModule resolution on TV
import { resolveStreamFromCloud, invalidateCacheEntry } from '../services/cloudResolver';
import { TrailerResolver, TrailerStream } from './TrailerResolver';
import { WatchHistoryService } from '../services/WatchHistoryService';
import { VidLinkStream, VidLinkSkipMarker } from '../services/vidlink';
import { useProfile } from '../context/ProfileContext';
import { NativeModules } from 'react-native';

const { TvNativeModule } = NativeModules; // Still used for trailers
const RESOLVE_TIMEOUT_MS = 45000; // Cloud Function needs more time

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

const { width, height } = Dimensions.get('window');

interface ModernPlayerProps {
  videoUrl?: string; // Optional now, since we can fetch internally
  onClose: () => void;
  title: string;
  headers?: Record<string, string>;
  // Subtitles
  tracks?: any[];
  // Episodes
  episodes?: any[];
  itemData?: any; // The full movie/show object for history rows
  onEpisodeSelect?: (epNum: number) => void;
  onNextEpisode?: () => void;
  // Metadata for internal fetching
  tmdbId?: string;
  contentType?: 'movie' | 'tv';
  releaseYear?: string;
  episodeNum?: number;
  seasonNum?: number;
  primaryId?: string;
  backdropUrl?: string;
  initialTime?: number;
}

const NetflixNLogo = ({ width = 24, height = 44 }) => (
  <Svg viewBox="0 0 551 1000" width={width} height={height}>
    <Defs>
      <LinearGradient id="linearGradient35887">
        <Stop stopColor="#b1060f" stopOpacity="1" offset="0" />
        <Stop stopColor="#7b010c" stopOpacity="1" offset="0.625" />
        <Stop stopColor="#b1060f" stopOpacity="0" offset="1" />
      </LinearGradient>
      <LinearGradient id="linearGradient19332">
        <Stop stopColor="#b1060f" stopOpacity="1" offset="0" />
        <Stop stopColor="#7b010c" stopOpacity="1" offset="0.546" />
        <Stop stopColor="#e50914" stopOpacity="0" offset="1" />
      </LinearGradient>
      <LinearGradient
        id="linearGradient13368"
        x1="78.2"
        y1="423.8"
        x2="221.7"
        y2="365.1"
        gradientUnits="userSpaceOnUse"
      >
        <Stop stopColor="#b1060f" stopOpacity="1" offset="0" />
        <Stop stopColor="#7b010c" stopOpacity="1" offset="0.546" />
        <Stop stopColor="#e50914" stopOpacity="0" offset="1" />
      </LinearGradient>
      <LinearGradient
        id="linearGradient35889"
        x1="456.4"
        y1="521.6"
        x2="309.7"
        y2="583.5"
        gradientUnits="userSpaceOnUse"
      >
        <Stop stopColor="#b1060f" stopOpacity="1" offset="0" />
        <Stop stopColor="#7b010c" stopOpacity="1" offset="0.625" />
        <Stop stopColor="#b1060f" stopOpacity="0" offset="1" />
      </LinearGradient>
    </Defs>
    <Path
      fill="url(#linearGradient13368)"
      d="M -1.2,-1.2 2.3,1002.7 C 75.6,988.6 133.2,990.1 198.2,984.2 V 0 Z"
    />
    <Path
      fill="url(#linearGradient35889)"
      d="m 353.8,0 h 199.4 l 2.3,1000.4 -202.8,-33.4 z"
    />
    <Path
      fill="#e50914"
      d="M 1.2,0 C 5.8,11.5 346.9,981.9 346.9,981.9 c 56.1,-0.4 131.2,8.8 205.1,17.3 L 197.1,0 Z"
    />
  </Svg>
);

// Optimization: Sub-components wrapped in React.memo to prevent unnecessary re-renders
const AnimatedLoadingOverlay = React.memo(({ status, internalVideoUrl, fetchError, backdropUrl, animatedLoadingStyle, resolvingStatus, loadingPercent }: any) => {
  return (
    <Animated.View 
      style={[styles.centeredOverlay, animatedLoadingStyle]}
      pointerEvents={(status === 'loading' || status === 'idle' || !internalVideoUrl || internalVideoUrl === '') && !fetchError ? "auto" : "none"}
    >
      {backdropUrl && (
        <>
          <Image 
            source={{ uri: backdropUrl }} 
            style={[StyleSheet.absoluteFill, { opacity: 0.4 }]} 
            resizeMode="cover" 
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)' }]} />
        </>
      )}
      
      {(!fetchError) && (
        <>
          <LoadingSpinner size={76} progress={loadingPercent} tone="light" />
          {!internalVideoUrl ? (
            <Text style={[styles.loadingStatusText, { marginTop: 30 }]}>{resolvingStatus || 'Resolving Stream...'}</Text>
          ) : (
            <Text style={[styles.loadingStatusText, { marginTop: 30 }]}>Buffering...</Text>
          )}
        </>
      )}
    </Animated.View>
  );
});

const AnimatedErrorOverlay = React.memo(({ status, fetchError, isRateLimited, isRecovering, onClose }: any) => {
  if (isRecovering) return null; // Don't show error while auto-recovery is in progress
  if (status !== 'error' && !fetchError) return null;
  
  return (
    <View style={styles.centeredOverlay}>
      <Ionicons name={isRateLimited ? "time-outline" : "videocam-off-outline"} size={60} color={isRateLimited ? "#FFA500" : 'rgba(255,255,255,0.7)'} />
      <Text style={styles.errorText}>
        {isRateLimited 
          ? "Server Temporarily Busy" 
          : (fetchError ? "Not Available to Stream" : "This video is currently unavailable.")}
      </Text>
      <Text style={[styles.errorText, { fontSize: 16, fontWeight: '400', marginTop: 8, color: 'rgba(255,255,255,0.6)', maxWidth: '70%' }]}>
        {isRateLimited 
          ? "Too many requests detected. Please wait a moment and try again."
          : (fetchError 
            ? "This title may not have been released yet, or no stream source is currently available." 
            : "Please try again later.")}
      </Text>
      <View style={styles.errorActions}>
        <Pressable style={styles.retryBtn} onPress={onClose}>
          <Text style={styles.retryText}>Go Back</Text>
        </Pressable>
      </View>
    </View>
  );
});

export function ModernVideoPlayer({ 
  videoUrl, 
  onClose, 
  title, 
  headers,
  tracks = [],
  episodes = [],
  itemData,
  onEpisodeSelect,
  onNextEpisode,
  tmdbId,
  contentType,
  releaseYear,
  episodeNum,
  seasonNum,
  primaryId,
  backdropUrl,
  initialTime
}: ModernPlayerProps) {
  useKeepAwake(); // Keep screen from sleeping during playback

  const [isLocked, setIsLocked] = useState(false);
  const [resolvingStatus, setResolvingStatus] = useState('Finding best stream...');
  const [internalVideoUrl, setInternalVideoUrl] = useState(videoUrl || '');
  const [internalHeaders, setInternalHeaders] = useState<Record<string, string> | undefined>(headers);
  const [internalTracks, setInternalTracks] = useState<any[]>(tracks);
  const [fetchError, setFetchError] = useState(false);
  const fetchIdRef = useRef(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [isFullControlsVisible, setIsFullControlsVisible] = useState(false);
  const fullControlsOpacity = useSharedValue(0);
  const [skipMarkers, setSkipMarkers] = useState<VidLinkSkipMarker[]>([]);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const showSkipIntroRef = useRef(false);
  const [showEpisodePicker, setShowEpisodePicker] = useState(false);
  const [showSubtitlePicker, setShowSubtitlePicker] = useState(false);
  const [showUpNext, setShowUpNext] = useState(false);
  const showUpNextRef = useRef(false);
  const autoNextFiredRef = useRef(false);
  const hasSeekedRef = useRef(false);
  const pendingResumeTimeRef = useRef<number | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loadingPercent, setLoadingPercent] = useState(7);
  const [isBuffering, setIsBuffering] = useState(false);
  const stallTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastProgressTimeRef = useRef(0);
  // jsVidLinkEnabled and isTryingVidSrc removed — cloud resolver handles all fallback logic

  // Auto-recovery: when HLS proxy tokens expire mid-playback, re-resolve and resume
  const autoRetryCountRef = useRef(0);
  const isAutoRecoveringRef = useRef(false);
  const [isAutoRecovering, setIsAutoRecovering] = useState(false);
  const recoveryPositionRef = useRef(0);
  const MAX_AUTO_RETRIES = 5; // More retries for low-network resilience

  const { selectedProfile } = useProfile();
  
  // Player State
  const [status, setStatus] = useState<'idle' | 'loading' | 'readyToPlay' | 'error'>('loading');
  const [currentTime, setCurrentTime] = useState(0);
  const currentPlaybackTimeRef = useRef(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlaybackStarted, setHasPlaybackStarted] = useState(false);

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
  const [preferredTrackLabel, setPreferredTrackLabel] = useState<string | null>(null);
  const [resizeMode, setResizeMode] = useState<'contain' | 'cover'>('contain');

  const controlsOpacity = useSharedValue(1);
  const loadingOpacity = useSharedValue(1);
  const progressPercentage = useSharedValue(0);
  const progressScale = useSharedValue(1);
  const isScrubbingReact = useSharedValue(false);
  const hideTimeout = useRef<NodeJS.Timeout | null>(null);
  const fullControlsTimeout = useRef<NodeJS.Timeout | null>(null);
  const currentUrlRef = useRef(videoUrl || '');

  // Auto-detect stream type — don't force HLS on MP4 streams
  const detectContentType = useCallback((url: string): string | undefined => {
    if (!url) return undefined;
    const lower = url.toLowerCase();
    if (lower.includes('.m3u8') || lower.includes('/hls/') || lower.includes('m3u8')) return 'hls';
    if (lower.includes('.mpd')) return 'dash';
    // For proxy URLs with no extension, default to HLS (most common for streaming providers)
    if (!lower.match(/\.(mp4|mkv|avi|webm|mov)/)) return 'hls';
    return undefined; // Let the player auto-detect
  }, []);

  // Initialize player ONCE with null source — source is set exclusively via
  // replace() in the source-update effect. This prevents the double-load race
  // condition where useVideoPlayer recreates the player (destroying event
  // listeners) AND the effect calls replace() simultaneously, which consumes
  // one-time-use HLS proxy tokens twice and causes ExoPlayer to error.
  const player = useVideoPlayer(null, (player) => {
    player.loop = false;
    player.staysActiveInBackground = true;
    player.timeUpdateEventInterval = 0.25; // 250ms for performance

    // Low-network resilience: configure larger buffers so ExoPlayer doesn't
    // error out on brief connectivity drops.
    try {
      player.bufferOptions = {
        preferredForwardBufferDuration: 60,  // Buffer 60s ahead
        minBufferForPlayback: 3,             // Need 3s buffered to start/resume
        prioritizeTimeOverSizeThreshold: true,
      };
    } catch (e) {
      // bufferOptions may not be supported on all platforms
    }
  });

  const videoViewRef = useRef<any>(null);

  const handleStreamResult = useCallback((result: any) => {
    setInternalVideoUrl(result.url);
    setInternalHeaders(result.headers || {});
    setSkipMarkers(result.markers || []);
    
    const mappedTracks = (result.captions || []).map((c: any) => ({
      file: c.url,
      label: c.language,
      kind: 'captions',
    }));
    setInternalTracks(mappedTracks);

    if (preferredTrackLabel) {
      const idx = mappedTracks.findIndex((t: any) => t.label === preferredTrackLabel);
      if (idx >= 0) setSelectedTrackIndex(idx);
    } else {
      const engIdx = mappedTracks.findIndex((t: any) => t.label.toLowerCase().includes('english'));
      if (engIdx >= 0) {
        setSelectedTrackIndex(engIdx);
        setPreferredTrackLabel(mappedTracks[engIdx].label);
      }
    }

    setFetchError(false);
    // Don't set status='readyToPlay' here — let the native player report it
    // via statusChange once it has actually loaded the stream. Premature status
    // caused the loading overlay to fade before playback started.
  }, [preferredTrackLabel]);

  // Internal Fetching Logic — uses Cloud Function instead of WebView/NativeModule
  useEffect(() => {
    // If we already have a URL from props, prioritize it
    if (videoUrl) {
       setInternalVideoUrl(videoUrl);
       setInternalHeaders(headers);
       setInternalTracks(tracks || []);
       
       if (preferredTrackLabel) {
         const idx = (tracks || []).findIndex(t => t.label === preferredTrackLabel);
         if (idx >= 0) setSelectedTrackIndex(idx);
       } else if (tracks && tracks.length > 0) {
         const engIdx = tracks.findIndex(t => t.label.toLowerCase().includes('english'));
         if (engIdx >= 0) {
           setSelectedTrackIndex(engIdx);
           setPreferredTrackLabel(tracks[engIdx].label);
         }
       }

       setFetchError(false);
       // Status will be set by the native player's statusChange event
       // once it actually loads the source via replace().
       return;
    }

    if (!tmdbId || !title) return;

    // ====================================================================
    // STREAM RESOLUTION STRATEGY — Cloud Function (Puppeteer)
    // Single HTTP POST to GCF. The function tries VidLink first, then
    // VidSrc as fallback, all server-side with a full Chrome browser.
    // No WebViews needed on the TV device.
    // ====================================================================
    let cancelled = false;
    const fetchId = ++fetchIdRef.current;

    async function resolveStream() {
      console.log(`[Player] 🚀 Resolving stream via Cloud Function for: ${title} (TMDB: ${tmdbId})`);
      // Reset playback state for new episode/content
      hasSeekedRef.current = false;
      pendingResumeTimeRef.current = null;
      currentPlaybackTimeRef.current = 0;
      lastSaveTimeRef.current = 0;
      setCurrentTime(0);
      setDuration(0);
      setHasPlaybackStarted(false);
      progressPercentage.value = 0;
      setIsBuffering(false);
      autoRetryCountRef.current = 0;
      autoNextFiredRef.current = false;
      showUpNextRef.current = false;
      showSkipIntroRef.current = false;
      setShowUpNext(false);
      setShowSkipIntro(false);

      setStatus('loading');
      setFetchError(false);
      setResolvingStatus('Resolving stream...');

      try {
        // Invalidate any cached URL first — preview ExoPlayer may have consumed it
        invalidateCacheEntry(tmdbId!, contentType || 'movie', seasonNum, episodeNum);

        const result = await resolveStreamFromCloud(
          tmdbId!,
          contentType || 'movie',
          seasonNum,
          episodeNum
        );
        
        if (cancelled || fetchId !== fetchIdRef.current) return;
        
        if (result?.url) {
          console.log(`[Player] ✅ Cloud resolved via ${result.sourceId}: ${result.url.substring(0, 80)}...`);
          handleStreamResult(result);
          return;
        }

        // Cloud function returned no stream
        console.error(`[Player] ❌ Cloud resolver returned no stream for: ${title}`);
        setFetchError(true);
        setStatus('error');
      } catch (e: any) {
        if (cancelled || fetchId !== fetchIdRef.current) return;
        console.error(`[Player] ❌ Cloud resolver error: ${e.message}`);
        setFetchError(true);
        setStatus('error');
      }
    }

    resolveStream();

    return () => { cancelled = true; };
  }, [tmdbId, episodeNum, seasonNum, videoUrl, title, contentType, handleStreamResult]);

  // Fetch Logo
  useEffect(() => {
    async function getLogo() {
      if (tmdbId) {
        const images = await fetchMovieImages(tmdbId, contentType || 'movie');
        if (images.logos && images.logos.length > 0) {
          // Find English logo or first one
          const logo = images.logos.find((l: any) => l.iso_639_1 === 'en') || images.logos[0];
           setLogoUrl(`https://image.tmdb.org/t/p/w500${logo.file_path}`);
        }
      }
    }
    getLogo();
  }, [tmdbId, contentType]);


  // Handle Player Source Updates — this is the ONLY place that sets the
  // native player source. useVideoPlayer is created with null to avoid the
  // double-load race condition.
  useEffect(() => {
    if (internalVideoUrl && internalVideoUrl !== '' && internalVideoUrl !== 'ERROR') {
      if (internalVideoUrl !== currentUrlRef.current) {
        console.log(`[Player] 🔄 Updating native player source to: ${internalVideoUrl.substring(0, 80)}...`);
        currentUrlRef.current = internalVideoUrl;
        setHasPlaybackStarted(false);
        try {
          if (player) {
            const resolvedHeaders = (internalHeaders && Object.keys(internalHeaders).length > 0) 
              ? internalHeaders 
              : undefined;

            const detectedType = detectContentType(internalVideoUrl);
            const source = {
              uri: internalVideoUrl,
              headers: resolvedHeaders,
              ...(detectedType ? { contentType: detectedType as any } : {}),
            };

            // Use replace with disableWarning=true to suppress iOS deprecation
            // warning. On Android this is identical to replaceAsync.
            player.replace(source, true);

            // Small delay to let the decoder/TV stabilize before triggering play
            setTimeout(() => {
              try { player.play(); } catch (e) {}
            }, 250);
          }
        } catch (e) {
          console.error("[Player] ❌ replace failed:", e);
        }
      }
    }
  }, [internalVideoUrl, internalHeaders, player, detectContentType]);

  useEffect(() => {
    if (status !== 'loading' && status !== 'idle') {
      setLoadingPercent(100);
      return;
    }

    setLoadingPercent(7);
    const interval = setInterval(() => {
      setLoadingPercent((current) => {
        const cap = internalVideoUrl ? 96 : 88;
        if (current >= cap) return current;
        const step = current < 30 ? 7 : current < 60 ? 5 : current < 80 ? 3 : 2;
        return Math.min(cap, current + step);
      });
    }, 450);

    return () => clearInterval(interval);
  }, [internalVideoUrl, status]);

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

  // Safe Player methods
  const handlePlayPause = useCallback(() => {
    try {
      if (player) {
         if (isPlaying) player.pause();
         else player.play();
         Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch (e) {
      console.warn("[Player] ⚠️ handlePlayPause safe-guarded:", e);
    }
    resetHideTimer();
  }, [player, isPlaying]);

  const skip = useCallback((seconds: number) => {
    try {
      if (player) {
        player.currentTime += seconds;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (e) {
      console.warn("[Player] ⚠️ skip safe-guarded:", e);
    }
    resetHideTimer();
  }, [player]);

  const safePlay = () => {
    try { if (player) player.play(); } catch (e) {}
  };

  const safePause = () => {
    try { if (player) player.pause(); } catch (e) {}
  };

  useEffect(() => {
    async function checkHistory() {
      if (!tmdbId || hasSeekedRef.current) return;
      
      // Fast path: use initialTime passed from Details screen
      // (Details screen already validates episode match + >95% completion)
      if (initialTime && initialTime > 5 && player) {
        console.log(`[WatchHistory] Queueing resume from prop initialTime: ${initialTime}s`);
        pendingResumeTimeRef.current = initialTime;
        hasSeekedRef.current = true;
        return;
      }

      // Slow path: fetch from AsyncStorage
      const historyItem = await WatchHistoryService.getProgress(selectedProfile?.id || '', tmdbId.toString());
      if (historyItem && historyItem.currentTime > 5 && player) {
        // For TV: only resume if the saved episode matches what we're playing
        if (contentType === 'tv' && episodeNum !== undefined) {
          const epMatch = historyItem.episode === episodeNum
            && (historyItem.season || 1) === (seasonNum || 1);
          if (!epMatch) {
            console.log(`[WatchHistory] Skipping resume — saved S${historyItem.season}E${historyItem.episode}, playing S${seasonNum}E${episodeNum}`);
            hasSeekedRef.current = true;
            return;
          }
        }
        // Skip resume if content was >95% watched (it's finished)
        if (historyItem.duration > 0 && (historyItem.currentTime / historyItem.duration) > 0.95) {
          console.log(`[WatchHistory] Skipping resume — content was ${Math.round((historyItem.currentTime / historyItem.duration) * 100)}% watched (finished)`);
          hasSeekedRef.current = true;
          return;
        }
        console.log(`[WatchHistory] Queueing resume from AsyncStorage: ${historyItem.currentTime}s`);
        pendingResumeTimeRef.current = historyItem.currentTime;
      }
      hasSeekedRef.current = true;
    }
    if (status === 'readyToPlay' && !hasSeekedRef.current) {
       checkHistory();
    }
  }, [status, tmdbId, player, initialTime, contentType, episodeNum, seasonNum]);

  // Progress tracking, UI updates, and Watch History saving
  // Uses a ref for lastSaveTime to persist across re-renders without causing them
  const lastSaveTimeRef = useRef(0);

  // Consolidated progress handler — called from timeUpdate listener
  const handleProgressUpdate = useCallback((current: number, playerDur: number) => {
    if (playerDur > 0 && playerDur !== duration) {
      setDuration(playerDur);
    }
    
    const activeDur = playerDur > 0 ? playerDur : (duration > 0 ? duration : 1);

    if (!isScrubbing.current) {
      const progress = Math.min(100, Math.max(0, (current / activeDur) * 100));
      progressPercentage.value = progress;
      setCurrentTime(current);
      currentPlaybackTimeRef.current = current;
    }

    // Save progress every 3 minutes (180 seconds)
    if (Math.abs(current - lastSaveTimeRef.current) >= 180) {
      lastSaveTimeRef.current = current;
      if (itemData || title) {
        WatchHistoryService.saveProgress(
          itemData || { id: tmdbId, title, backdrop_path: backdropUrl, media_type: contentType }, 
          contentType || 'movie', 
          current, 
          activeDur,
          selectedProfile?.id,
          seasonNum,
          episodeNum
        );
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

    // Up Next Check & Skip Intro Check using Markers
    if (activeDur > 0 && current > 0 && !isScrubbing.current) {
      const introMarker = skipMarkers.find(m => m.type === 'intro');
      const outroMarker = skipMarkers.find(m => m.type === 'outro');

      // Skip Intro logic
      if (introMarker && current >= introMarker.start && current <= introMarker.end) {
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

        // Up Next logic
        if (contentType === 'tv') {
          let shouldShowUpNext = false;
          if (outroMarker && current >= outroMarker.start) {
            shouldShowUpNext = true;
          } else if (!outroMarker) {
            // Fallback to time-based if no API marker
            const timeLeft = activeDur - current;
            if (timeLeft <= 15 && timeLeft > 0) {
              shouldShowUpNext = true;
            }
          }

          if (shouldShowUpNext) {
            if (!showUpNextRef.current) {
              showUpNextRef.current = true;
              setShowUpNext(true);
            }
          } else {
            if (showUpNextRef.current) {
              showUpNextRef.current = false;
              setShowUpNext(false);
            }
          }

          // Auto-play trigger: when video actually reaches the end (within 1s)
          // Guard with ref to prevent firing repeatedly every 250ms
          const timeLeft = activeDur - current;
          if (timeLeft <= 1 && timeLeft >= 0 && onNextEpisode && !isScrubbing.current && !autoNextFiredRef.current) {
             autoNextFiredRef.current = true;
             console.log('[Player] Video finished, auto-playing next episode...');
             onNextEpisode();
          }
        }
      }
  }, [duration, contentType, itemData, title, tmdbId, backdropUrl, selectedProfile?.id, seasonNum, episodeNum, skipMarkers]);

  // NOTE: Duplicate source-update effect removed — the effect at lines 294-316
  // already handles internalVideoUrl changes, and line 206's effect syncs
  // videoUrl prop → internalVideoUrl. This prevents double replaceAsync() calls.

  // Handle Orientation
  useEffect(() => {
    async function lockOrientation() {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch (e) {
        console.warn("Orientation lock failed:", e);
      }
    }
    lockOrientation();
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    };
  }, []);

  // Auto-recovery: re-resolve stream when HLS token expires mid-playback
  const attemptAutoRecovery = useCallback(async () => {
    if (isAutoRecoveringRef.current) return;
    if (autoRetryCountRef.current >= MAX_AUTO_RETRIES) {
      console.log(`[Player] ❌ Max auto-retries (${MAX_AUTO_RETRIES}) reached, giving up`);
      setFetchError(true);
      return;
    }
    if (!tmdbId || !title) return;

    isAutoRecoveringRef.current = true;
    setIsAutoRecovering(true);
    autoRetryCountRef.current += 1;
    recoveryPositionRef.current = currentPlaybackTimeRef.current;

    console.log(`[Player] 🔄 Auto-recovery attempt ${autoRetryCountRef.current}/${MAX_AUTO_RETRIES} — resuming from ${Math.floor(recoveryPositionRef.current)}s`);
    setResolvingStatus(`Reconnecting... (attempt ${autoRetryCountRef.current})`);
    setStatus('loading');
    setFetchError(false);

    try {
      // Force fresh resolution — the old URL's token likely expired
      invalidateCacheEntry(tmdbId, contentType || 'movie', seasonNum, episodeNum);

      const result = await resolveStreamFromCloud(
        tmdbId,
        contentType || 'movie',
        seasonNum,
        episodeNum
      );

      if (result?.url) {
        console.log(`[Player] ✅ Recovery resolved via ${result.sourceId}: ${result.url.substring(0, 80)}...`);
        // Update URL which triggers the player source-update effect
        currentUrlRef.current = ''; // Force re-replace
        handleStreamResult(result);

        // Seek back to where the user was — delay must be longer than the
        // source-update effect's 250ms play() to avoid a race condition
        setTimeout(() => {
          try {
            if (player && recoveryPositionRef.current > 5) {
              player.currentTime = recoveryPositionRef.current;
              console.log(`[Player] ⏩ Seeked to ${Math.floor(recoveryPositionRef.current)}s after recovery`);
            }
            player?.play();
          } catch (e) {
            console.warn('[Player] Recovery seek failed:', e);
          }
          isAutoRecoveringRef.current = false;
          setIsAutoRecovering(false);
        }, 2500);
      } else {
        console.error('[Player] ❌ Recovery resolver returned no stream');
        setFetchError(true);
        setStatus('error');
        isAutoRecoveringRef.current = false;
        setIsAutoRecovering(false);
      }
    } catch (e: any) {
      console.error(`[Player] ❌ Recovery error: ${e.message}`);
      setFetchError(true);
      setStatus('error');
      isAutoRecoveringRef.current = false;
      setIsAutoRecovering(false);
    }
  }, [tmdbId, contentType, seasonNum, episodeNum, title, player, handleStreamResult]);

  // Event Listeners — consolidated progress tracking into timeUpdate
  useEffect(() => {
    if (!player) return;

    // Stall detection: if timeUpdate stops firing while playing, we're buffering
    const startStallDetection = () => {
      if (stallTimerRef.current) clearInterval(stallTimerRef.current);
      stallTimerRef.current = setInterval(() => {
        const now = Date.now();
        const elapsed = now - lastProgressTimeRef.current;
        // If we haven't received a timeUpdate in 3s while supposedly playing → buffering
        if (elapsed > 3000 && player.playing && currentPlaybackTimeRef.current > 0) {
          setIsBuffering(true);
        }
      }, 2000);
    };
    startStallDetection();

    const subscriptions = [
      player.addListener('statusChange', (payload: any) => {
        const newStatus = payload.status;
        setStatus(newStatus);

        if (newStatus === 'readyToPlay') {
          setIsBuffering(false);
        }

        // Auto-recovery: re-resolve on ANY playback error.
        // If 0s played → stream URL may be stale/incompatible, try fresh resolve.
        // If >0s played → HLS token likely expired mid-playback.
        if (newStatus === 'error' && !isAutoRecoveringRef.current) {
          const playedSec = Math.floor(currentPlaybackTimeRef.current);
          console.log(`[Player] ⚠️ Stream error at ${playedSec}s — attempting auto-recovery (attempt ${autoRetryCountRef.current + 1}/${MAX_AUTO_RETRIES})`);
          // Longer delay on low-network errors to allow connectivity to recover
          const retryDelay = playedSec < 5 ? 3000 : 2000;
          setTimeout(() => attemptAutoRecovery(), retryDelay);
        }
      }),
      player.addListener('timeUpdate', (payload: any) => {
        // Consolidated: drive all progress-dependent logic from this single event
        const current = payload.currentTime || 0;
        const playerDur = player.duration || 0;
        lastProgressTimeRef.current = Date.now();

        // Resume only after the player has actually started and duration is known.
        // Seeking too early on weak networks can stall HLS startup and trip playback errors.
        const pendingResumeTime = pendingResumeTimeRef.current;
        if (
          pendingResumeTime !== null &&
          playerDur > 0 &&
          current <= 2
        ) {
          const safeResumeTime = Math.max(0, Math.min(pendingResumeTime, Math.max(0, playerDur - 5)));
          pendingResumeTimeRef.current = null;
          setTimeout(() => {
            try {
              player.currentTime = safeResumeTime;
              console.log(`[WatchHistory] Applied deferred resume at ${Math.floor(safeResumeTime)}s`);
            } catch (e) {
              console.warn('[WatchHistory] Deferred resume seek failed:', e);
            }
          }, 300);
        }

        // Clear buffering state when progress resumes
        if (current > 0) {
          if (!hasPlaybackStarted) {
            setHasPlaybackStarted(true);
          }
          setIsBuffering(false);
        }

        handleProgressUpdate(current, playerDur);

        // Reset retry counter on successful playback progress (stream is healthy)
        if (current > 0 && autoRetryCountRef.current > 0) {
          autoRetryCountRef.current = 0;
        }
      }),
      (player as any).addListener('durationChange', (payload: any) => {
        setDuration(payload.duration);
      }),
      player.addListener('playingChange', (payload: any) => {
        setIsPlaying(payload.isPlaying);
        // If player stops playing unexpectedly (not user-initiated), might be buffering
        if (!payload.isPlaying && player.status === 'readyToPlay' && currentPlaybackTimeRef.current > 0) {
          // Give it a moment — could just be a brief stall
          setTimeout(() => {
            if (!player.playing && player.status === 'readyToPlay') {
              setIsBuffering(true);
            }
          }, 1500);
        } else if (payload.isPlaying) {
          setIsBuffering(false);
        }
      })
    ];

    return () => {
      // Clean up stall detection
      if (stallTimerRef.current) {
        clearInterval(stallTimerRef.current);
        stallTimerRef.current = null;
      }
      // Final Save on exit/episode switch
      const current = currentPlaybackTimeRef.current || 0;
      const playerDur = duration || 0;
      if (current > 5 && playerDur > 0) {
        if (tmdbId) {
          WatchHistoryService.saveProgress(
            itemData || { id: tmdbId, title, backdrop_path: backdropUrl, media_type: contentType }, 
            contentType || 'movie', 
            current, 
            playerDur,
            selectedProfile?.id,
            seasonNum,
            episodeNum
          );
        }
      }
      subscriptions.forEach(sub => sub.remove());
    };
  }, [player, handleProgressUpdate, attemptAutoRecovery]);

  // Loading Screen Crossfade Animation
  useEffect(() => {
    const isLoading = status === 'loading' || status === 'idle' || !internalVideoUrl || internalVideoUrl === '';
    if (isLoading) {
      loadingOpacity.value = 1;
    } else if (status === 'readyToPlay' && hasPlaybackStarted && !fetchError) {
      // Keep the loading overlay until playback has actually started advancing.
      // On slow networks/TV decoders, readyToPlay can arrive before the first frame.
      loadingOpacity.value = withTiming(0, { duration: 800 });
    }
  }, [status, internalVideoUrl, hasPlaybackStarted, fetchError]);

  // Show/hide controls like a modern Netflix player:
  // - During playback: show progress bar + bottom row on interaction, auto-hide after 5s
  // - On pause: show everything (progress bar + full details) and keep visible
  // - Full details (top metadata, center logo/ratings) ONLY show when paused
  const resetHideTimer = useCallback((forceFullControls = false) => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    if (fullControlsTimeout.current) clearTimeout(fullControlsTimeout.current);
    
    // Always show the bottom bar (progress + controls)
    setIsControlsVisible(true);
    controlsOpacity.value = withTiming(1, { duration: 200 });

    if (forceFullControls) {
      // Pause state: show full details immediately, stay visible
      setIsFullControlsVisible(true);
      fullControlsOpacity.value = withTiming(1, { duration: 300 });
      // No auto-hide when paused — controls stay until user resumes
    } else {
      // Playing state: hide full details, only show progress bar
      fullControlsOpacity.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished) runOnJS(setIsFullControlsVisible)(false);
      });

      // Auto-hide progress bar after 5s during playback
      if (!isLocked) {
        hideTimeout.current = setTimeout(() => {
          controlsOpacity.value = withTiming(0, { duration: 500 }, (finished) => {
            if (finished) runOnJS(setIsControlsVisible)(false);
          });
        }, 5000);
      }
    }
  }, [isLocked]);

  // When paused, show full controls. When playing, start auto-hide timer.
  useEffect(() => {
    if (isPlaying) {
      // Resumed playback — start auto-hide timer (progress bar only)
      resetHideTimer(false);
    } else {
      // Paused — show everything and keep visible
      resetHideTimer(true);
    }
    return () => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      if (fullControlsTimeout.current) clearTimeout(fullControlsTimeout.current);
    };
  }, [isPlaying, isLocked, resetHideTimer]);

  const toggleControls = useCallback(() => {
    if (controlsOpacity.value > 0) {
      // Hide all controls immediately
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      if (fullControlsTimeout.current) clearTimeout(fullControlsTimeout.current);
      
      controlsOpacity.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished) runOnJS(setIsControlsVisible)(false);
      });
      fullControlsOpacity.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished) runOnJS(setIsFullControlsVisible)(false);
      });
    } else {
      // Show controls — full details only if paused
      resetHideTimer(!isPlaying);
    }
  }, [resetHideTimer, isPlaying]);

  // TV Remote Event Handler for direct D-Pad interactions when controls are hidden
  // TV Remote D-Pad handler — modern player behavior
  useTVEventHandler((evt) => {
    if (!evt) return;
    
    // If a modal is open, don't hijack the D-Pad
    if (showSubtitlePicker || showEpisodePicker || status === 'error' || fetchError) {
      return;
    }

    if (evt.eventType === 'select' || evt.eventType === 'playPause') {
      if (!isControlsVisible) {
        // First press: show controls (full details only if paused)
        resetHideTimer(!isPlaying);
      } else {
        // Controls visible: toggle play/pause
        handlePlayPause();
        // playingChange listener will handle showing/hiding via useEffect
      }
    } else if (evt.eventType === 'left') {
      skip(-10);
      resetHideTimer(!isPlaying);
    } else if (evt.eventType === 'right') {
      skip(10);
      resetHideTimer(!isPlaying);
    } else if (evt.eventType === 'up') {
      // Show or refresh controls
      resetHideTimer(!isPlaying);
    } else if (evt.eventType === 'down') {
      if (isControlsVisible && isPlaying) {
        // Dismiss controls immediately during playback
        toggleControls();
      } else {
        resetHideTimer(!isPlaying);
      }
    }
  });

  const animatedControlsStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));

  const animatedFullControlsStyle = useAnimatedStyle(() => ({
    opacity: fullControlsOpacity.value,
  }));

  const animatedLoadingStyle = useAnimatedStyle(() => ({
    opacity: loadingOpacity.value,
  }));

  const animatedProgressStyle = useAnimatedStyle(() => ({
    width: withTiming(`${progressPercentage.value}%`, { duration: 1100, easing: Easing.linear }),
  }));

  const formatTime = useCallback((secs: number) => {
    if (isNaN(secs) || secs < 0) secs = 0;
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${mins}:${s.toString().padStart(2, '0')}`;
  }, []);

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.container}>
        {/* Stream resolution is handled by Cloud Function — no WebViews needed */}

        <VideoView
          ref={videoViewRef}
          style={StyleSheet.absoluteFill}
          player={player}
          nativeControls={false}
          contentFit={resizeMode}
          allowsPictureInPicture={true}
        />

        {/* Subtitle Overlay - Rendered under controls but over video */}
        {activeSubtitle ? (
          <View style={styles.subtitleContainer}>
            <Text style={styles.subtitleText}>{activeSubtitle}</Text>
          </View>
        ) : null}

        {/* TV Native Controls Wrapper (Always focused/Pressable) */}
        <Pressable 
          style={StyleSheet.absoluteFill} 
          onPress={toggleControls}
        >
           {/* Controls only appear from remote button presses (useTVEventHandler) */}
        </Pressable>

        {/* Buffering/Loading Overlay */}
        <AnimatedLoadingOverlay 
          status={status} 
          internalVideoUrl={internalVideoUrl} 
          fetchError={fetchError} 
          backdropUrl={backdropUrl} 
          animatedLoadingStyle={animatedLoadingStyle} 
          resolvingStatus={resolvingStatus}
          loadingPercent={loadingPercent}
        />

        {/* Mid-playback buffering spinner (network stall) */}
        {isBuffering && status === 'readyToPlay' && !fetchError && (
          <View style={styles.bufferingOverlay} pointerEvents="none">
            <LoadingSpinner size={52} tone="light" />
            <Text style={styles.bufferingText}>Buffering...</Text>
          </View>
        )}

        {/* Error Overlay */}
        <AnimatedErrorOverlay 
          status={status} 
          fetchError={fetchError} 
          isRateLimited={false}
          isRecovering={isAutoRecovering}
          onClose={onClose} 
        />

        {isControlsVisible && status !== 'error' && (
          <Animated.View 
            style={[styles.overlay, animatedControlsStyle]}
            pointerEvents="box-none"
          >
            {/* Top Row and Center grouped natively for proper fading */}
            <Animated.View style={[StyleSheet.absoluteFill, animatedFullControlsStyle]} pointerEvents={isFullControlsVisible ? "box-none" : "none"}>
              {/* Top Row: Navigation and Metadata */}
              <View style={styles.topRowTv}>
                 <View style={styles.topControlsTv}>
                    <View style={styles.topNavIconsTv}>
                      <Pressable 
                        onPress={onClose} 
                        style={({ focused }) => [styles.iconBtnTv, focused && styles.focusedBtnTv]}
                      >
                        <Ionicons name="arrow-back" size={32} color="white" />
                      </Pressable>
                      <Pressable 
                        onPress={() => skip(-10)} 
                        style={({ focused }) => [styles.iconBtnTv, focused && styles.focusedBtnTv]}
                      >
                        <Ionicons name="refresh" size={32} color="white" />
                      </Pressable>
                      <Pressable 
                        onPress={() => onNextEpisode?.()} 
                        style={({ focused }) => [styles.iconBtnTv, focused && styles.focusedBtnTv]}
                      >
                        <Ionicons name="play-skip-forward" size={32} color="white" />
                      </Pressable>
                    </View>
                    <Text style={styles.optionsLabelTv}>OPTIONS</Text>
                 </View>

                 <View style={styles.metadataTv}>
                    <Text style={styles.metadataTitleTv}>{title}</Text>
                    {contentType === 'tv' && (
                       <Text style={styles.metadataDetailsTv}>{`S${seasonNum || 1}: E${episodeNum}${itemData?.name ? ` "${itemData.name}"` : ''}`}</Text>
                    )}
                 </View>
              </View>

              {/* Center Left: Logo and Ratings */}
              <View style={styles.centerLeftOverlay}>
                 <View style={styles.nSeriesRow}>
                    <NetflixNLogo />
                    <Text style={styles.seriesText}>SERIES</Text>
                 </View>
                 
                 {logoUrl ? (
                   <Image source={{ uri: logoUrl }} style={styles.tvLogo} resizeMode="contain" />
                 ) : (
                   <Text style={styles.logoTextTv}>{title}</Text>
                 )}

                 <View style={styles.ratingRowTv}>
                    <Pressable style={({ focused }) => [styles.ratingBtnTv, focused && styles.focusedRatingBtnTv]}>
                      <MaterialCommunityIcons name="thumb-down-outline" size={26} color="white" />
                      <Text style={styles.ratingBtnTextTv}>Not for me</Text>
                    </Pressable>
                    <Pressable style={({ focused }) => [styles.ratingBtnTv, focused && styles.focusedRatingBtnTv]}>
                      <MaterialCommunityIcons name="thumb-up-outline" size={26} color="white" />
                      <Text style={styles.ratingBtnTextTv}>I like this</Text>
                    </Pressable>
                    <Pressable 
                      style={({ focused }) => [
                        styles.ratingBtnTv, 
                        focused && styles.focusedRatingBtnTv,
                        { backgroundColor: focused ? 'white' : 'rgba(255,255,255,0.2)' }
                      ]}
                      hasTVPreferredFocus={true} 
                    >
                      {({ focused }) => (
                        <>
                          <MaterialCommunityIcons name="thumb-up" size={26} color={focused ? "black" : "white"} />
                          <Text style={[styles.ratingBtnTextTv, { color: focused ? 'black' : 'white' }]}>Love this!</Text>
                        </>
                      )}
                    </Pressable>
                 </View>

                 <Text style={styles.helperTextTv}>
                   Enjoying this? Rating helps us know if we should recommend more like this.
                 </Text>
               </View>
             </Animated.View>

            {/* Bottom Bar: Progress and Seek */}
            <View style={styles.bottomBarTv}>
               <View style={styles.playbackRowTv}>
                  <Pressable 
                    onPress={handlePlayPause}
                    style={({ focused }) => [styles.largePlayBtnTv, focused && styles.focusedBtnTv]}
                  >
                    <Ionicons name={isPlaying ? "pause" : "play"} size={32} color="white" />
                  </Pressable>

                  <Text style={styles.timeTextTv}>{formatTime(currentTime)}</Text>

                  <View style={styles.progressBarContainerTv}>
                    <View style={styles.progressTrackTv}>
                       <Animated.View style={[styles.progressFillTv, animatedProgressStyle]} />
                    </View>
                  </View>

                  <Text style={styles.timeTextTv}>{formatTime(duration)}</Text>
               </View>

               <View style={styles.bottomControlsRowTv}>
                  <Pressable 
                    onPress={() => setShowSubtitlePicker(true)}
                    style={({ focused }) => [styles.bottomControlBtnTv, focused && styles.focusedControlBtnTv]}
                  >
                    {({ focused }) => (
                      <>
                        <Ionicons name="checkmark" size={18} color={focused ? "black" : "white"} style={{ marginRight: 6 }} />
                        <Text style={[styles.bottomControlTextTv, focused && { color: 'black' }]}>English [Original]</Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable 
                    onPress={() => setShowSubtitlePicker(true)}
                    style={({ focused }) => [styles.bottomControlBtnTv, focused && styles.focusedControlBtnTv]}
                  >
                    {({ focused }) => (
                      <Text style={[styles.bottomControlTextTv, focused && { color: 'black' }]}>English [Original] with Subtitles</Text>
                    )}
                  </Pressable>
                  <Pressable 
                    onPress={() => setShowSubtitlePicker(true)}
                    style={({ focused }) => [styles.bottomControlBtnTv, focused && styles.focusedControlBtnTv]}
                  >
                    {({ focused }) => (
                      <Text style={[styles.bottomControlTextTv, focused && { color: 'black' }]}>Other...</Text>
                    )}
                  </Pressable>
                  <Pressable 
                    onPress={() => setShowSubtitlePicker(true)}
                    style={({ focused }) => [styles.bottomControlBtnTv, focused && styles.focusedControlBtnTv]}
                  >
                    {({ focused }) => (
                      <Ionicons name="settings-outline" size={24} color={focused ? "black" : "white"} />
                    )}
                  </Pressable>
                  <Pressable 
                    onPress={() => {
                      const newSpeed = playbackSpeed === 1 ? 1.25 : playbackSpeed === 1.25 ? 1.5 : playbackSpeed === 1.5 ? 2 : 1;
                      setPlaybackSpeed(newSpeed);
                      if (player) {
                        try { player.playbackRate = newSpeed; } catch (e) {}
                      }
                    }}
                    style={({ focused }) => [styles.bottomControlBtnTv, focused && styles.focusedControlBtnTv]}
                  >
                    {({ focused }) => (
                      <>
                        <Feather name="fast-forward" size={18} color={focused ? "black" : "white"} style={{ marginRight: 6 }} />
                        <Text style={[styles.bottomControlTextTv, focused && { color: 'black' }]}>{playbackSpeed}x</Text>
                      </>
                    )}
                  </Pressable>
               </View>
            </View>
          </Animated.View>
        )}

        {showSkipIntro && !showUpNext && (
          <Animated.View entering={FadeInDown} exiting={SlideOutRight} style={styles.skipIntroContainerTv}>
            <Pressable style={({ focused }) => [styles.skipIntroBtnTv, focused && styles.skipIntroBtnTvFocused]} onPress={() => {
              const introMarker = skipMarkers.find(m => m.type === 'intro');
              if (introMarker && player) {
                try { player.currentTime = introMarker.end; } catch (e) {}
              }
              showSkipIntroRef.current = false;
              setShowSkipIntro(false);
            }}>
              <Text style={styles.skipIntroTextTv}>Skip Intro</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Up Next Countdown Overlay */}
        {showUpNext && contentType === 'tv' && onNextEpisode && (
          <Animated.View entering={SlideInRight.duration(500)} exiting={SlideOutRight.duration(500)} style={styles.upNextContainer}>
            <View style={styles.upNextHeader}>
               <Text style={styles.upNextTitle}>Up Next in</Text>
               <Text style={styles.upNextCountdown}>{Math.max(0, Math.ceil(duration - currentTime))}s</Text>
            </View>
            <View style={styles.upNextEpisodeInfo}>
               <Text style={styles.upNextSeriesTitle}>{title}</Text>
               <Text style={styles.upNextSeasonText}>Next Episode</Text>
            </View>
            <Pressable 
              onPress={() => {
                 setShowUpNext(false);
                 showUpNextRef.current = false;
                 onNextEpisode();
              }}
              style={({ focused }) => [styles.upNextBtn, focused && styles.upNextBtnFocused]}
            >
              <Ionicons name="play" size={24} color="black" />
              <Text style={styles.upNextBtnText}>Play Now</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* TV Modals */}
        <Modal
          visible={showSubtitlePicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSubtitlePicker(false)}
        >
          <View style={styles.modalOverlayTv}>
             <View style={styles.modalContentTv}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
                  <Text style={styles.modalTitleTv}>Audio & Subtitles</Text>
                  <Pressable 
                    onPress={() => setShowSubtitlePicker(false)}
                    style={({ focused }) => [
                      { padding: 10, borderRadius: 20 },
                      focused && { backgroundColor: 'rgba(255,255,255,0.2)' }
                    ]}
                  >
                    <Ionicons name="close" size={28} color="white" />
                  </Pressable>
                </View>
                <View style={styles.modalColumnsTv}>
                   <View style={styles.modalColTv}>
                      <Text style={styles.modalColHeaderTv}>Subtitles</Text>
                      <ScrollView>
                        {/* Off option */}
                        <Pressable 
                          onPress={() => { 
                            setSelectedTrackIndex(-1); 
                            setPreferredTrackLabel(null);
                            setShowSubtitlePicker(false); 
                          }}
                          style={({ focused }) => [styles.modalItemTv, focused && styles.modalItemFocusedTv]}
                        >
                          <Text style={[styles.modalItemTextTv, selectedTrackIndex === -1 && { color: '#E50914', fontWeight: 'bold' }]}>Off</Text>
                          {selectedTrackIndex === -1 && <Ionicons name="checkmark" size={20} color="#E50914" />}
                        </Pressable>

                        {internalTracks.length > 0 ? (
                          internalTracks.map((track, i) => (
                            <Pressable 
                              key={i} 
                              onPress={() => { 
                                setSelectedTrackIndex(i); 
                                setPreferredTrackLabel(track.label);
                                setShowSubtitlePicker(false); 
                              }}
                              style={({ focused }) => [styles.modalItemTv, focused && styles.modalItemFocusedTv]}
                            >
                              <Text style={[styles.modalItemTextTv, selectedTrackIndex === i && { color: '#E50914', fontWeight: 'bold' }]}>{track.label}</Text>
                              {selectedTrackIndex === i && <Ionicons name="checkmark" size={20} color="#E50914" />}
                            </Pressable>
                          ))
                        ) : (
                          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, marginTop: 10 }}>No subtitles available for this content.</Text>
                        )}
                      </ScrollView>
                   </View>
                </View>
             </View>
          </View>
        </Modal>

        <Modal
          visible={showEpisodePicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowEpisodePicker(false)}
        >
          <View style={styles.modalOverlayTv}>
             <View style={styles.modalContentTv}>
                <Text style={styles.modalTitleTv}>Episodes</Text>
                <ScrollView>
                   {episodes.map((ep) => (
                     <Pressable 
                       key={ep.id} 
                       onPress={() => { onEpisodeSelect?.(ep.episode_number); setShowEpisodePicker(false); }}
                       style={({ focused }) => [styles.modalItemTv, focused && styles.modalItemFocusedTv]}
                     >
                       <Text style={styles.modalItemTextTv}>{ep.episode_number}. {ep.name}</Text>
                     </Pressable>
                   ))}
                </ScrollView>
             </View>
          </View>
        </Modal>
      </View>
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
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  centeredOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 100,
  },
  subtitleContainer: {
    position: 'absolute',
    bottom: 80,
    left: 100,
    right: 100,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    pointerEvents: 'none',
  },
  subtitleText: {
    color: 'white',
    fontSize: 42,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 44,
    textShadowColor: 'black',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    overflow: 'hidden',
  },
  
  // TV Player Styles
  topRowTv: {
    position: 'absolute',
    top: 50,
    left: 80,
    right: 80,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  topControlsTv: {
    alignItems: 'center',
    gap: 15,
  },
  topNavIconsTv: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 30,
  },
  iconBtnTv: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  focusedBtnTv: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    transform: [{ scale: 1.1 }],
  },
  optionsLabelTv: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  metadataTv: {
    alignItems: 'flex-end',
  },
  metadataTitleTv: {
    color: 'white',
    fontSize: 24,
    fontWeight: '700',
    opacity: 0.9,
  },
  metadataDetailsTv: {
    color: 'white',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 4,
  },
  
  centerLeftOverlay: {
    position: 'absolute',
    top: '35%',
    left: 80,
    maxWidth: '60%',
    gap: 15,
  },
  nSeriesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: -10,
  },
  nText: {
    color: '#E50914',
    fontSize: 28,
    fontWeight: '900',
  },
  seriesText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 4,
  },
  tvLogo: {
    width: 400,
    height: 140,
  },
  logoTextTv: {
    color: 'white',
    fontSize: 64,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  ratingRowTv: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 10,
  },
  ratingBtnTv: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 25,
    paddingVertical: 14,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.15)',
    gap: 12,
  },
  focusedRatingBtnTv: {
    backgroundColor: 'white',
    transform: [{ scale: 1.05 }],
  },
  ratingBtnTextTv: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  helperTextTv: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 18,
    lineHeight: 28,
    marginTop: 10,
    fontWeight: '500',
  },
  
  bottomBarTv: {
    position: 'absolute',
    bottom: 40,
    left: 80,
    right: 80,
    gap: 20,
  },
  playbackRowTv: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    width: '100%',
  },
  largePlayBtnTv: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBarContainerTv: {
    flex: 1,
    height: 40,
    justifyContent: 'center',
  },
  timeTextTv: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
    minWidth: 60,
    textAlign: 'center',
  },
  progressTrackTv: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressFillTv: {
    height: '100%',
    backgroundColor: '#E50914',
  },
  
  bottomControlsRowTv: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    justifyContent: 'center',
  },
  bottomControlBtnTv: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  focusedControlBtnTv: {
    backgroundColor: 'white',
  },
  bottomControlTextTv: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  
  // Modal TV
  modalOverlayTv: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContentTv: {
    width: '60%',
    backgroundColor: '#181818',
    borderRadius: 12,
    padding: 40,
  },
  modalTitleTv: {
    color: 'white',
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 40,
  },
  modalColumnsTv: {
    flexDirection: 'row',
    gap: 60,
  },
  modalColTv: {
    flex: 1,
  },
  modalColHeaderTv: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  modalItemTv: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  modalItemFocusedTv: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  modalItemTextTv: {
    color: 'white',
    fontSize: 18,
    fontWeight: '500',
  },
  
  loadingStatusText: {
    color: 'white',
    marginTop: 20,
    fontSize: 18,
  },
  errorText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  errorActions: {
    marginTop: 40,
  },
  retryBtn: {
    backgroundColor: 'white',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 10,
  },
  retryText: {
    color: 'black',
    fontSize: 18,
    fontWeight: 'bold',
  },
  upNextContainer: {
    position: 'absolute',
    bottom: 120,
    right: 60,
    backgroundColor: 'rgba(20,20,20,0.95)',
    padding: 30,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    zIndex: 200,
    width: 380,
    shadowColor: 'black',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
  },
  upNextHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  upNextTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 18,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  upNextCountdown: {
    color: '#E50914',
    fontSize: 22,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  upNextEpisodeInfo: {
    marginBottom: 25,
  },
  upNextSeriesTitle: {
    color: 'white',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 5,
  },
  upNextSeasonText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 18,
  },
  upNextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    paddingVertical: 15,
    borderRadius: 8,
    gap: 12,
  },
  upNextBtnFocused: {
    transform: [{ scale: 1.05 }],
  },
  upNextBtnText: {
    color: 'black',
    fontSize: 22,
    fontWeight: 'bold',
  },
  skipIntroContainerTv: {
    position: 'absolute',
    bottom: 120,
    right: 40,
    zIndex: 90,
  },
  skipIntroBtnTv: {
    backgroundColor: 'rgba(20,20,20,0.8)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  skipIntroBtnTvFocused: {
    backgroundColor: 'white',
    transform: [{ scale: 1.05 }],
  },
  skipIntroTextTv: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  bufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 50,
  },
  bufferingText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 14,
    letterSpacing: 0.5,
  },
});
