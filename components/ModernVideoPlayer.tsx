import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions, ScrollView, Modal, Image, NativeModules, Alert, requireNativeComponent, Platform, TextInput } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { BlurView } from 'expo-blur';
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
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Brightness from 'expo-brightness';
import { useKeepAwake } from 'expo-keep-awake';
import { COLORS } from '../constants/theme';
import { parseVtt, Subtitle } from '../utils/vttParser';
import { getImageUrl } from '../services/tmdb';
import { NetflixLoader } from './NetflixLoader';
import { VidLinkResolver } from './VidLinkResolver';
import { MoviesApiResolver } from './MoviesApiResolver';
import { VidLinkStream, VidLinkSkipMarker } from '../services/vidlink';
import { MoviesApiStream } from '../services/moviesapi';
import { useProfile } from '../context/ProfileContext';
import { WatchHistoryService } from '../services/WatchHistoryService';
import { RatingsService, RatingValue } from '../services/RatingsService';
import { ViewProps } from 'react-native';
import { FriendsService, FRIEND_AVATARS } from '../services/friends';

interface HologramNativeViewProps extends ViewProps {
  videoUrl?: string;
  title?: string;
  drmLicenseUrl?: string;
  videoFormat?: string;
  hologramType?: string;
  onPlaybackStatusUpdate?: (event: any) => void;
}

// Safe lazy-load: requireNativeComponent crashes the entire bundle if the
// native ViewManager hasn't been registered (e.g. in Expo Go, or if the
// native build is stale). We catch that and fall back to null.
let HologramNativeView: React.ComponentType<HologramNativeViewProps> | null = null;
try {
  HologramNativeView = (global as any).HologramNativeView ||
    ((global as any).HologramNativeView = requireNativeComponent<HologramNativeViewProps>('HologramModule'));
} catch (e) {
  console.warn('[Hologram] Native HologramModule not available — hologram mode disabled:', (e as any)?.message);
}

// Stable empty array references to prevent useEffect infinite loops.
// Default param `= []` creates a new ref every render; if that ref is in
// a useEffect dep array the effect fires on every render, resetting the
// stream resolution and keeping the player stuck on "Resolving...".
const EMPTY_TRACKS: any[] = [];
const EMPTY_AUDIO_TRACKS: { id: string; label: string; language?: string }[] = [];

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
  watchPartyId?: string;
  isHost?: boolean;
}

export function ModernVideoPlayer({ 
  videoUrl, 
  onClose, 
  title, 
  headers,
  tracks = EMPTY_TRACKS,
  audioTracks = EMPTY_AUDIO_TRACKS,
  episodes = [],
  onEpisodeSelect,
  onNextEpisode,
  tmdbId,
  contentType,
  releaseYear,
  episodeNum,
  seasonNum,
  primaryId,
  backdropUrl,
  watchPartyId,
  isHost
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
  const [isBuffering, setIsBuffering] = useState(false);
  const [showRemainingTime, setShowRemainingTime] = useState(true);
  const wasPlayingBeforeBuffer = useRef(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [showEpisodePicker, setShowEpisodePicker] = useState(false);
  const [showSubtitlePicker, setShowSubtitlePicker] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  
  // Source resolution state — VidLink primary, MoviesAPI fallback (which is slower)
  const [activeSource, setActiveSource] = useState<'vidlink' | 'moviesapi' | 'net22' | 'net52' | 'none'>('none');
  const [resolveAttempt, setResolveAttempt] = useState(0); // bump to re-trigger resolution
  
  // Premium Features State
  const [skipMarkers, setSkipMarkers] = useState<VidLinkSkipMarker[]>([]);
  const skipMarkersRef = useRef<VidLinkSkipMarker[]>([]);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [activeSkipType, setActiveSkipType] = useState<'intro' | 'recap' | 'outro'>('intro');
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
  const initialBrightnessRef = useRef(0.5);
  const initialVolumeRef = useRef(1);

  // Subtitle State
  const parsedSubtitles = useRef<Subtitle[]>([]);
  const currentSubtitleRef = useRef('');
  const [activeSubtitle, setActiveSubtitle] = useState('');
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(-1);
  const [resizeMode, setResizeMode] = useState<'contain' | 'cover'>('contain');
  const [isHologramMode, setIsHologramMode] = useState(false);
  const [showHologramSetup, setShowHologramSetup] = useState(false);
  const [selectedHologramType, setSelectedHologramType] = useState<'air' | 'pyramid'>('air');
  const nextEpisodeData = React.useMemo(() => {
    if (contentType === 'tv' && episodes && episodes.length > 0 && episodeNum) {
      const currentIndex = episodes.findIndex((e: any) => e.episode_number === episodeNum);
      if (currentIndex >= 0 && currentIndex < episodes.length - 1) {
        return episodes[currentIndex + 1];
      }
    }
    return null;
  }, [episodes, episodeNum, contentType]);

  // Watch Party Refined Sync State & Effects
  const lastWriteTimeRef = useRef(0);
  const lastCheckedTimeRef = useRef(0);
  const lastProcessedEventIdRef = useRef<string | null>(null);
  const [partyMessage, setPartyMessage] = useState<string | null>(null);
  const [partyParticipantsCount, setPartyParticipantsCount] = useState(1);
  const [showPartyDrawer, setShowPartyDrawer] = useState(false);
  const [participants, setParticipants] = useState<any[]>([]);
  const [floatingEmojis, setFloatingEmojis] = useState<{ id: string; emoji: string; xOffset: number }[]>([]);
  const [partyFeed, setPartyFeed] = useState<any[]>([]);
  const [drawerInput, setDrawerInput] = useState('');
  const drawerChatScrollRef = useRef<ScrollView>(null);

  const triggerFloatingEmoji = useCallback((emoji: string) => {
    const xOffset = -50 + Math.random() * 100;
    setFloatingEmojis((prev) => [...prev, { id: Math.random().toString(), emoji, xOffset }]);
  }, []);

  // Presence and Participant Heartbeat
  useEffect(() => {
    if (!watchPartyId) return;
    
    const unsub = FriendsService.subscribeToWatchPartyParticipants(watchPartyId, (list) => {
      setParticipants(list);
      setPartyParticipantsCount(list.length);
      if (list.length > 1) {
        setPartyMessage(`Watch Party: ${list.length} members`);
      }
    });

    const updatePresence = () => {
      FriendsService.updateWatchPartyPresence(watchPartyId, selectedProfile, 'online').catch(() => {});
    };
    updatePresence();
    const heartbeatInterval = setInterval(updatePresence, 8000);

    return () => {
      unsub();
      clearInterval(heartbeatInterval);
      FriendsService.updateWatchPartyPresence(watchPartyId, selectedProfile, 'offline').catch(() => {});
    };
  }, [watchPartyId, selectedProfile]);

  // Subscribe to live chat and reaction events in the watch party
  useEffect(() => {
    if (!watchPartyId) return;
    const unsubFeed = FriendsService.subscribeToWatchPartyChat(watchPartyId, (list) => {
      setPartyFeed(list);
    });
    return () => unsubFeed();
  }, [watchPartyId]);

  // Auto-scroll watch party chat drawer to end on updates
  useEffect(() => {
    if (showPartyDrawer) {
      const timer = setTimeout(() => {
        drawerChatScrollRef.current?.scrollToEnd({ animated: true });
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [partyFeed, showPartyDrawer]);

  const handleSendDrawerMessage = async () => {
    if (!drawerInput.trim() || !watchPartyId) return;
    const msg = drawerInput.trim();
    setDrawerInput('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await FriendsService.sendWatchPartyEvent(
      watchPartyId,
      selectedProfile?.name || 'Friend',
      'chat',
      currentTime,
      { content: msg }
    );
  };

  // Action-Driven Event Sync
  useEffect(() => {
    if (!watchPartyId || !player) return;

    if (isHost) {
      setPartyMessage("Hosting Watch Party");
      return;
    }

    setPartyMessage("Joining Watch Party...");
    const unsubEvents = FriendsService.subscribeToWatchPartyEvents(watchPartyId, (event) => {
      if (!event) return;
      if (event.id === lastProcessedEventIdRef.current) return;
      
      const currentUid = selectedProfile?.id || 'guest';
      if (event.senderId === currentUid) return;

      lastProcessedEventIdRef.current = event.id;
      console.log(`[WatchParty] Guest processing event: ${event.type} at ${event.currentTime}s`);

      if (event.type === 'play') {
        if (!player.playing) {
          player.play();
        }
      } else if (event.type === 'pause') {
        if (player.playing) {
          player.pause();
        }
      } else if (event.type === 'seek') {
        player.currentTime = event.currentTime;
      } else if (event.type === 'reaction') {
        triggerFloatingEmoji(event.content);
      }

      // Safeguard sync drift
      const drift = Math.abs(event.currentTime - player.currentTime);
      if (drift > 2.5) {
        player.currentTime = event.currentTime;
      }
      
      setPartyMessage(`Synced with Host (${event.senderName})`);
    });

    return () => unsubEvents();
  }, [watchPartyId, isHost, player, selectedProfile]);

  const controlsOpacity = useSharedValue(1);
  const loadingOpacity = useSharedValue(1);
  const progressPercentage = useSharedValue(0);
  const bufferedPercentage = useSharedValue(0);
  const progressScale = useSharedValue(1);
  const isScrubbingReact = useSharedValue(false);
  const hideTimeout = useRef<NodeJS.Timeout | null>(null);
  const currentUrlRef = useRef(videoUrl || '');

  // Initialize player with a valid source only if available
  const player = useVideoPlayer((internalVideoUrl && internalVideoUrl !== 'ERROR' && internalVideoUrl !== '') ? { 
    uri: internalVideoUrl, 
    headers: internalHeaders || undefined,
    contentType: 'hls' as any,  // VidLink proxy URLs have no .m3u8 extension
  } : null, (player) => {
    player.loop = false;
    player.staysActiveInBackground = true;
    player.timeUpdateEventInterval = 0.25; // 250ms for performance
    
    // Aggressive buffer options to minimize stalling on slower Wifi connections
    player.bufferOptions = {
      preferredForwardBufferDuration: 180, // Buffer 3 minutes ahead
      maxBufferBytes: Platform.OS === 'android' ? 150 * 1024 * 1024 : undefined, // 150MB maximum cache size on Android
    };
    
    if (internalVideoUrl && internalVideoUrl !== 'ERROR' && internalVideoUrl !== '') {
      player.play();
    }
  });

  const videoViewRef = useRef<any>(null);

  // Resolution states
  const [vidlinkEnabled, setVidlinkEnabled] = useState(false);
  const [moviesapiEnabled, setMoviesapiEnabled] = useState(false);
  const hasResolvedRef = useRef(false);
  const failedCountRef = useRef(0);
  // Backup streams from resolvers that lost the race — used for auto-fallback
  // when the winning stream fails at the player level (e.g. 403)
  const backupStreamsRef = useRef<{ source: string; stream: any }[]>([]);

  // Resolution cleanup helper
  const cleanupResolvers = useCallback(() => {
    setVidlinkEnabled(false);
    setMoviesapiEnabled(false);
    setActiveSource('none');
  }, []);

  // Unified stream error handler (defined before handleSourceResolved to avoid circular deps)
  const handleSourceError = useCallback((source: string, error: string) => {
    console.warn(`[Player] ⚠️ ${source} resolution failed: ${error}`);
    if (hasResolvedRef.current) {
      console.log(`[Player] ⏭ ${source} error ignored — another source already resolved.`);
      return;
    }
    
    failedCountRef.current += 1;
    console.log(`[Player] 📊 Failed sources: ${failedCountRef.current}/4`);
    if (failedCountRef.current >= 4) {
      console.error('[Player] ❌ All 4 resolution sources failed!');
      setFetchError(true);
      setStatus('error');
      cleanupResolvers();
    }
  }, [cleanupResolvers]);

  // Unified stream success handler
  // IMPORTANT: Pre-decodes data: URIs to temp files BEFORE setting state,
  // because useVideoPlayer is reactive and would feed raw data: URIs to ExoPlayer
  // (which can't play them), causing "Input does not start with #EXTM3U" errors.
  // Also pre-validates the stream URL with a HEAD request to catch unreachable
  // proxy domains (DNS failures, dead CDNs) before committing to the native player.
  const handleSourceResolved = useCallback(async (source: string, stream: any) => {
    if (hasResolvedRef.current) {
      // Don't discard — save as backup for auto-fallback if the winner fails
      if (stream?.url && stream.url !== '') {
        console.log(`[Player] 💾 ${source} resolved but another source won — saving as backup`);
        backupStreamsRef.current.push({ source, stream });
      } else {
        console.log(`[Player] ⏭ ${source} resolved empty — discarding`);
      }
      return;
    }
    
    // Guard: NetMirror may return an object with empty url when rate-limited
    if (!stream?.url || stream.url === '') {
      console.warn(`[Player] ⚠️ ${source} returned empty/null URL${stream?.isRateLimited ? ' (RATE LIMITED)' : ''} — treating as error`);
      handleSourceError(source, stream?.isRateLimited ? 'Rate limited by CDN' : 'Empty stream URL');
      return;
    }
    
    // Pre-validate: Quick HEAD request to verify the domain is reachable.
    // Catches unreachable proxy domains (e.g. DNS failures like toodfk.vfodvidl.site)
    // before committing to the native player where error recovery is much slower.
    // Skip validation for local file:// and data: URIs.
    const urlToCheck = stream.url;
    if (urlToCheck.startsWith('http')) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); // 5s max
        const checkResp = await fetch(urlToCheck, {
          method: 'HEAD',
          signal: controller.signal,
          headers: stream.headers || {},
        });
        clearTimeout(timeout);
        // Accept any response (even 403) — it means the domain resolved.
        // Only reject if the fetch itself threw (DNS failure, connection refused).
        console.log(`[Player] 🏥 ${source} URL health-check: HTTP ${checkResp.status}`);
      } catch (healthErr: any) {
        console.warn(`[Player] 🚫 ${source} URL health-check FAILED: ${healthErr.message} — domain unreachable, skipping`);
        // Another source may have won during our await — check before treating as error
        if (hasResolvedRef.current) {
          console.log(`[Player] ⏭ ${source} health-check failed but another source already won`);
          return;
        }
        handleSourceError(source, `URL unreachable: ${healthErr.message}`);
        return;
      }
      // Re-check winner after async validation — another source may have claimed during await
      if (hasResolvedRef.current) {
        console.log(`[Player] 💾 ${source} passed health-check but another source won during validation — saving as backup`);
        backupStreamsRef.current.push({ source, stream });
        return;
      }
    }
    
    hasResolvedRef.current = true;
    
    console.log(`[Player] ✅ ${source} stream resolved first: ${stream.url.substring(0, 80)}...`);
    console.log(`[Player] 📊 ${source} details: captions=${(stream.captions || []).length}, markers=${(stream.markers || []).length}, rateLimited=${stream.isRateLimited || false}, headers=${JSON.stringify(stream.headers || {}).substring(0, 100)}`);
    
    // Pre-decode data: URIs to temp .m3u8 files before setting state
    let playableUrl = stream.url;
    if (playableUrl.startsWith('data:')) {
      try {
        const base64Match = playableUrl.match(/^data:[^;]+;base64,(.+)$/);
        if (base64Match) {
          const decoded = global.atob(base64Match[1]);
          const tempFile = `${FileSystem.cacheDirectory}stream_${Date.now()}.m3u8`;
          await FileSystem.writeAsStringAsync(tempFile, decoded);
          console.log(`[Player] 📁 Pre-decoded data URI → ${tempFile} (${decoded.length} bytes, starts: "${decoded.substring(0, 30)}...")`);
          playableUrl = tempFile;
        } else {
          console.error(`[Player] ❌ Data URI format not recognized`);
        }
      } catch (decodeErr: any) {
        console.error(`[Player] ❌ Data URI pre-decode failed: ${decodeErr.message}`);
      }
    }
    
    // Check we're still the winner after async decode (another source might have won during await)
    if (!hasResolvedRef.current) {
      // This shouldn't happen since we set it above, but guard anyway
      return;
    }
    
    setInternalVideoUrl(playableUrl);
    setInternalHeaders(stream.headers);
    
    const mappedTracks = (stream.captions || []).map((c: any) => ({
      file: c.url || c.file,
      label: c.language || c.label,
      kind: 'captions',
    }));
    setInternalTracks(mappedTracks);
    setInternalAudioTracks(stream.audioTracks || []);
    setSelectedAudioTrackId(stream.audioTracks?.[0]?.id || null);
    
    if (stream.markers) {
      setSkipMarkers(stream.markers);
      skipMarkersRef.current = stream.markers;
    }
    
    setFetchError(false);
    setIsRateLimited(false);
    setStatus('readyToPlay');
    cleanupResolvers();
  }, [cleanupResolvers, handleSourceError]);

  // VidLink callbacks
  const handleVidLinkResolved = useCallback((stream: VidLinkStream) => {
    handleSourceResolved('VidLink', stream);
  }, [handleSourceResolved]);

  const handleVidLinkError = useCallback((error: string) => {
    handleSourceError('VidLink', error);
  }, [handleSourceError]);

  // MoviesAPI callbacks
  const handleMoviesApiResolved = useCallback((stream: MoviesApiStream) => {
    handleSourceResolved('MoviesAPI', stream);
  }, [handleSourceResolved]);

  const handleMoviesApiError = useCallback((error: string) => {
    handleSourceError('MoviesAPI', error);
  }, [handleSourceError]);

  // Internal Fetching Logic - delegates concurrently to all resolvers
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
    console.log(`[Player] 🚀 Starting CONCURRENT stream resolution for: ${title} (TMDB: ${tmdbId}, S:${seasonNum} E:${episodeNum})`);
    hasSeekedRef.current = false;
    lastSaveTimeRef.current = 0;
    currentUrlRef.current = '';
    setInternalVideoUrl('');
    setInternalHeaders(undefined);
    setInternalTracks(EMPTY_TRACKS);
    setInternalAudioTracks(EMPTY_AUDIO_TRACKS);
    setSelectedAudioTrackId(null);
    setCurrentTime(0);
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

    // Setup concurrency coordinators
    hasResolvedRef.current = false;
    failedCountRef.current = 0;
    backupStreamsRef.current = [];

    // Trigger WebView resolvers
    setVidlinkEnabled(true);
    setMoviesapiEnabled(true);
    setActiveSource('all');

    // Launch Net22 scraper in parallel (with 30s safety timeout)
    const net22StartMs = Date.now();
    (async () => {
      try {
        console.log(`[Player] 🚀 Resolving Net22 in parallel...`);
        const { resolveNet22 } = require('../services/netmirrorResolver');
        const resolvePromise = resolveNet22(tmdbId, contentType || 'movie', seasonNum || 0, episodeNum || 0);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Net22 overall timeout (30s)')), 30000)
        );
        const stream = await Promise.race([resolvePromise, timeoutPromise]);
        const elapsed = Date.now() - net22StartMs;
        console.log(`[Player] 🏁 Net22 finished in ${elapsed}ms`);
        handleSourceResolved('Net22', stream);
      } catch (error: any) {
        const elapsed = Date.now() - net22StartMs;
        console.error(`[Player] 💥 Net22 crashed after ${elapsed}ms: ${error.message}`);
        if (error.stack) console.error(`[Player] Net22 stack: ${error.stack.split('\n').slice(0, 3).join(' | ')}`);
        handleSourceError('Net22', error.message || 'Unknown error');
      }
    })();

    // Launch Net52 scraper in parallel (with 30s safety timeout)
    const net52StartMs = Date.now();
    (async () => {
      try {
        console.log(`[Player] 🚀 Resolving Net52 in parallel...`);
        const { resolveNet52 } = require('../services/netmirrorResolver');
        const resolvePromise = resolveNet52(tmdbId, contentType || 'movie', seasonNum || 0, episodeNum || 0);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Net52 overall timeout (30s)')), 30000)
        );
        const stream = await Promise.race([resolvePromise, timeoutPromise]);
        const elapsed = Date.now() - net52StartMs;
        console.log(`[Player] 🏁 Net52 finished in ${elapsed}ms`);
        handleSourceResolved('Net52', stream);
      } catch (error: any) {
        const elapsed = Date.now() - net52StartMs;
        console.error(`[Player] 💥 Net52 crashed after ${elapsed}ms: ${error.message}`);
        if (error.stack) console.error(`[Player] Net52 stack: ${error.stack.split('\n').slice(0, 3).join(' | ')}`);
        handleSourceError('Net52', error.message || 'Unknown error');
      }
    })();

    return () => {
      hasResolvedRef.current = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbId, episodeNum, seasonNum, videoUrl, resolveAttempt, title, contentType]);

  // Handle Player Source Updates (when state changes)
  // Data URIs are already pre-decoded in handleSourceResolved, so internalVideoUrl
  // is always a playable URL (https:// or file://) — never a raw data: URI.
  useEffect(() => {
    async function updatePlayer() {
      if (internalVideoUrl && internalVideoUrl !== '' && internalVideoUrl !== 'ERROR') {
         if (internalVideoUrl !== currentUrlRef.current) {
            const finalUrl = internalVideoUrl;
            const urlScheme = finalUrl.substring(0, Math.min(finalUrl.indexOf(':') + 1, 30));
            console.log(`[Player] 🔄 Updating native player source | scheme: ${urlScheme} | length: ${finalUrl.length} | preview: ${finalUrl.substring(0, 80)}...`);

            currentUrlRef.current = internalVideoUrl; // Track for dedup
            try {
              if (player) {
                // Auto-detect content type instead of always forcing HLS
                const lowerUrl = finalUrl.toLowerCase();
                let detectedContentType: string | undefined = 'hls'; // Default for streaming
                if (lowerUrl.endsWith('.mp4') || lowerUrl.includes('.mp4?') || lowerUrl.includes('.mp4%') || lowerUrl.includes('/mp/')) {
                  detectedContentType = undefined; // Let ExoPlayer auto-detect MP4
                } else if (lowerUrl.endsWith('.mpd')) {
                  detectedContentType = 'dash';
                }
                console.log(`[Player] ▶️ replaceAsync(uri=${finalUrl.substring(0, 60)}..., contentType=${detectedContentType || 'auto'})`);

                await (player as any).replaceAsync({
                  uri: finalUrl,
                  headers: internalHeaders || undefined,
                  ...(detectedContentType ? { contentType: detectedContentType } : {}),
                });
                player.play();
              }
            } catch (e: any) {
              console.error(`[Player] ❌ replaceAsync failed: ${e.message}`);
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

    // Skip Intro/Recap Logic
    const activeMarker = skipMarkersRef.current.find(m => current >= m.start && current <= m.end);
    
    if (activeMarker && (activeMarker.type === 'intro' || (activeMarker as any).type === 'recap')) {
      if (!showSkipIntroRef.current) {
        showSkipIntroRef.current = true;
        setActiveSkipType((activeMarker.type as any) || 'intro');
        setShowSkipIntro(true);
      }
    } else {
      if (showSkipIntroRef.current) {
        showSkipIntroRef.current = false;
        setShowSkipIntro(false);
      }
    }

    // Auto-Play Next Episode — only when stream metadata provides real outro markers
    if (contentType === 'tv' && onNextEpisode && activeDur > 60) {
      const outroMarker = skipMarkersRef.current.find(m => m.type === 'outro');
      const remaining = activeDur - current;

      // Only trigger from genuine API outro markers, no hardcoded time fallback
      const isOutroActive = outroMarker
         ? (current >= outroMarker.start && remaining > 0)
         : false;

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
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
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
          
          // Auto-fallback: if the winning stream failed at the player level
          // (e.g. DNS failure, 403, malformed), try the next backup stream.
          // If no backups are available yet (slower resolvers still running),
          // wait up to 8s for them to arrive before giving up.
          const tryFallback = () => {
            if (backupStreamsRef.current.length > 0) {
              const backup = backupStreamsRef.current.shift()!;
              console.log(`[Player] 🔄 Winner failed — falling back to ${backup.source} backup stream`);
              hasResolvedRef.current = false;
              currentUrlRef.current = '';
              setStatus('loading');
              handleSourceResolved(backup.source, backup.stream);
              return true;
            }
            return false;
          };
          
          if (currentUrlRef.current) {
            if (!tryFallback()) {
              // No backups yet — poll briefly for late-arriving streams
              console.log(`[Player] ⏳ No backup streams yet — waiting up to 8s for other resolvers...`);
              setStatus('loading'); // Show loading instead of error while waiting
              let waited = 0;
              const pollInterval = setInterval(() => {
                waited += 500;
                if (tryFallback()) {
                  clearInterval(pollInterval);
                } else if (waited >= 8000) {
                  clearInterval(pollInterval);
                  console.error(`[Player] ❌ No backup streams arrived after 8s — all sources exhausted`);
                  setStatus('error');
                  setFetchError(true);
                }
              }, 500);
            }
            return; // Don't set error status — we're retrying or waiting
          }
        }
        setStatus(payload.status);
        // Mid-stream buffering detection: if status goes back to 'loading'
        // while we already had a URL, show a lightweight buffering indicator
        if (payload.status === 'loading' && currentUrlRef.current) {
          setIsBuffering(true);
        } else if (payload.status === 'readyToPlay') {
          setIsBuffering(false);
          resetHideTimer();
        }
      }),
      player.addListener('timeUpdate', (payload: any) => {
        // Drive ALL progress-dependent logic from this single native event
        // instead of the old 50ms setInterval polling loop
        const current = payload.currentTime || 0;
        const playerDur = player.duration || 0;
        handleProgressUpdate(current, playerDur);
        
        // Update buffered percentage
        if (playerDur > 0 && player.bufferedPosition !== undefined) {
          bufferedPercentage.value = (player.bufferedPosition / playerDur) * 100;
        }

        // If time is advancing, we are not buffering
        if (current > 0) setIsBuffering(false);

        // Watch Party Host Update
        if (watchPartyId && isHost) {
          // Detect manual seeks
          const timeDelta = Math.abs(current - lastCheckedTimeRef.current);
          if (timeDelta > 2.0 && lastCheckedTimeRef.current > 0) {
            console.log(`[WatchParty] Host seek detected: ${lastCheckedTimeRef.current}s -> ${current}s. Broadcasting seek event.`);
            FriendsService.sendWatchPartyEvent(watchPartyId, selectedProfile?.name || 'Host', 'seek', current).catch(() => {});
          }

          // Heartbeat state update (every 10 seconds to keep party document alive)
          const now = Date.now();
          if (now - lastWriteTimeRef.current > 10000) {
            lastWriteTimeRef.current = now;
            FriendsService.updateWatchPartyState(watchPartyId, player.playing, current).catch(() => {});
          }
        }
        lastCheckedTimeRef.current = current;
      }),
      (player as any).addListener('durationChange', (payload: any) => {
        setDuration(payload.duration);
      }),
      player.addListener('playingChange', (payload: any) => {
        setIsPlaying(payload.isPlaying);
        
        // Watch Party Host Update
        if (watchPartyId && isHost) {
          const type = payload.isPlaying ? 'play' : 'pause';
          console.log(`[WatchParty] Host state changed: ${type}. Broadcasting event.`);
          FriendsService.sendWatchPartyEvent(watchPartyId, selectedProfile?.name || 'Host', type, player.currentTime).catch(() => {});
        }
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
  }, [player, handleProgressUpdate, handleSourceResolved, duration, tmdbId, title, backdropUrl, contentType, selectedProfile?.id, seasonNum, episodeNum, resetHideTimer]);

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

    if (status === 'loading' || status === 'idle' || !internalVideoUrl || internalVideoUrl === '') {
      setIsControlsVisible(false);
      controlsOpacity.value = 0;
      return;
    }

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
  }, [isLocked, controlsOpacity, status, internalVideoUrl]);

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    };
  }, [isLocked, resetHideTimer]);

  const toggleControls = () => {
    if (status === 'loading' || status === 'idle' || !internalVideoUrl || internalVideoUrl === '') return;
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
      if (duration > 0 && player) {
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
    .onBegin(() => {
      initialBrightnessRef.current = brightnessLevel;
    })
    .onUpdate((e) => {
      if (isLocked) return;
      resetHideTimer();
      const newBright = Math.max(0, Math.min(1, initialBrightnessRef.current + (-e.translationY / 400)));
      setBrightnessLevel(newBright);
      Brightness.setBrightnessAsync(newBright);
    });

  const volumeGesture = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => {
      initialVolumeRef.current = volumeLevel;
    })
    .onUpdate((e) => {
      if (isLocked) return;
      resetHideTimer();
      const newVol = Math.max(0, Math.min(1, initialVolumeRef.current + (-e.translationY / 400)));
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

  const animatedBufferedStyle = useAnimatedStyle(() => ({
    width: `${bufferedPercentage.value}%`,
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

        {/* MoviesAPI Fallback Resolver WebView (slower than VidLink) */}
        <MoviesApiResolver
          tmdbId={tmdbId || ''}
          type={contentType || 'movie'}
          season={seasonNum}
          episode={episodeNum}
          enabled={moviesapiEnabled}
          onStreamResolved={handleMoviesApiResolved}
          onError={handleMoviesApiError}
        />

        <Animated.View style={[StyleSheet.absoluteFill, animatedVideoStyle]}>
          {isHologramMode && internalVideoUrl && HologramNativeView ? (
            <HologramNativeView 
              videoUrl={internalVideoUrl}
              title={title || ''}
              videoFormat="standard"
              hologramType={selectedHologramType}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <VideoView
              ref={videoViewRef}
              style={StyleSheet.absoluteFill}
              player={player}
              nativeControls={false}
              contentFit={resizeMode}
              allowsPictureInPicture={true}
            />
          )}
        </Animated.View>

        {isHologramMode && (
          <Pressable 
            style={styles.exitHologramBtn}
            onPress={() => {
              setIsHologramMode(false);
              try { player.play(); } catch(_) {}
            }}
          >
            <Ionicons name="close-circle-outline" size={24} color="white" />
            <Text style={{color: 'white', marginLeft: 8, fontWeight: 'bold'}}>Exit Hologram</Text>
          </Pressable>
        )}

        {/* Premium Overlays — Skip Intro is rendered inside controls below */}

        {isNextEpisodeCountdown && (
          <Animated.View entering={FadeInRight.duration(600).springify()} exiting={FadeOutRight} style={styles.nextEpisodeOverlay}>
            <View style={styles.nextEpisodeHeaderRow}>
              <Text style={styles.nextEpisodeHeader}>Up Next</Text>
              <View style={styles.nextEpisodeTimerCircle}>
                <Text style={styles.nextEpisodeTimerText}>{countdownValue}</Text>
              </View>
            </View>
            
            {nextEpisodeData?.name && (
              <Text style={styles.nextEpisodeTitle} numberOfLines={2}>{nextEpisodeData.name}</Text>
            )}
            
            <View style={styles.nextEpisodePreview}>
              {nextEpisodeData?.still_path && (
                <Image 
                  source={{ uri: getImageUrl(nextEpisodeData.still_path) }} 
                  style={StyleSheet.absoluteFill} 
                  resizeMode="cover"
                />
              )}
              <LinearGradient 
                colors={['transparent', 'rgba(0,0,0,0.8)']}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.nextEpisodePlayIcon}>
                <Ionicons name="play" size={32} color="white" />
              </View>
            </View>

            <View style={styles.nextEpisodeActions}>
              <Pressable 
                style={[styles.nextEpisodeBtn, styles.nextEpisodeBtnPrimary]} 
                onPress={() => { isNextEpisodeCountdownRef.current = false; setIsNextEpisodeCountdown(false); onNextEpisode?.(); }}
              >
                 <Ionicons name="play" size={20} color="black" />
                 <Text style={styles.nextEpisodeBtnText}>Play Now</Text>
              </Pressable>
              <Pressable 
                style={styles.nextEpisodeBtn} 
                onPress={() => { 
                  isNextEpisodeCountdownRef.current = false;
                  setIsNextEpisodeCountdown(false); 
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                 <Text style={[styles.nextEpisodeBtnText, { color: 'white' }]}>Cancel</Text>
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
                  <Text style={styles.seekRippleText}>-10</Text>
                </Animated.View>
              </View>
            </GestureDetector>
            <GestureDetector gesture={Gesture.Simultaneous(volumeGesture, rightGestures)}>
              <View style={{ flex: 1, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' }}>
                <Animated.View style={[styles.seekRipple, rightRippleStyle]}>
                  <MaterialIcons name="forward-10" size={40} color="white" />
                  <Text style={styles.seekRippleText}>+10</Text>
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
            <NetflixLoader size={60} withPercentage={true} />
          )}
        </Animated.View>

        {/* Mid-Stream Buffering Indicator — lightweight spinner over the video */}
        {isBuffering && status !== 'loading' && internalVideoUrl && (
          <View style={styles.midStreamBuffering} pointerEvents="none">
            <NetflixLoader size={36} />
          </View>
        )}

        {/* Error Overlay — only show when resolvers exhausted OR player errored on a real URL */}
        {(fetchError || (status === 'error' && currentUrlRef.current !== '')) && (
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

        {isControlsVisible && status !== 'error' && status !== 'loading' && status !== 'idle' && internalVideoUrl !== '' && (
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
                    <View style={{ marginLeft: 4 }}>
                      <Text style={styles.videoTitle} numberOfLines={1}>{title}</Text>
                      {partyMessage && (
                        <Text style={{ color: '#34D399', fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                          🔴 {partyMessage}
                        </Text>
                      )}
                    </View>
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
                    {watchPartyId && (
                      <Pressable style={[styles.iconBtn, showPartyDrawer && styles.activeIconBtn]} onPress={() => setShowPartyDrawer(!showPartyDrawer)}>
                        <MaterialCommunityIcons name="account-multiple" size={26} color={showPartyDrawer ? COLORS.primary : "white"} />
                      </Pressable>
                    )}
                    <Pressable style={styles.iconBtn}>
                      <MaterialCommunityIcons name="cast" size={26} color="white" />
                    </Pressable>
                    <Pressable onPress={() => {
                      // Save progress before closing
                      const curr = currentPlaybackTimeRef.current || 0;
                      const dur = duration || 0;
                      if (curr > 5 && dur > 0 && tmdbId) {
                        WatchHistoryService.saveProgress(
                          { id: tmdbId.toString(), title, backdrop_path: backdropUrl, poster_path: backdropUrl, tmdbId, type: contentType || 'movie' },
                          contentType || 'movie', curr, dur,
                          selectedProfile?.id || '', seasonNum, episodeNum
                        );
                      }
                      onClose();
                    }} style={styles.iconBtn}>
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
                    const activeMarker = skipMarkers.find(m => currentTime >= m.start && currentTime <= m.end);
                    if (activeMarker && player) {
                      player.currentTime = activeMarker.end;
                    } else {
                      skip(90 - currentTime); // Fallback
                    }
                    setShowSkipIntro(false);
                    showSkipIntroRef.current = false;
                    resetHideTimer();
                  }}
                >
                  <Text style={styles.skipIntroText}>
                    {activeSkipType === 'recap' ? 'Skip Recap' : 'Skip Intro'}
                  </Text>
                </Pressable>
              </Animated.View>
            )}

            {/* Bottom Section */}
            {!isLocked && (
              <View style={styles.bottomSection}>
                <View style={styles.progressContainer}>
                  <Pressable onPress={() => setShowRemainingTime(prev => !prev)}>
                    <Text style={styles.timeTextRemaining}>
                      {showRemainingTime 
                        ? `-${formatTime((duration || 0) - currentTime)}`
                        : formatTime(currentTime)
                      }
                    </Text>
                  </Pressable>
                  
                  <GestureDetector gesture={scrubGesture}>
                    <View 
                      style={styles.progressTrackContainer}
                      onLayout={(e) => setProgressBarWidth(e.nativeEvent.layout.width)}
                    >
                      <Animated.View style={[styles.progressTrack, animatedTrackStyle]}>
                        <Animated.View style={[styles.bufferedFill, animatedBufferedStyle]} />
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

            <Pressable 
              style={[styles.moreOptionRow, { borderTopWidth: 1, borderTopColor: 'rgba(0,229,255,0.15)', marginTop: 8, paddingTop: 16 }]} 
              onPress={() => {
                setShowMoreOptions(false);
                if (!HologramNativeView) {
                  Alert.alert('Hologram', 'Hologram mode requires a native build. Please rebuild the app with EAS.');
                  return;
                }
                if (internalVideoUrl) {
                  try { player.pause(); } catch(_) {}
                  setShowHologramSetup(true);
                } else {
                  Alert.alert('Hologram', 'No active video stream to project. Please wait for the video to load first.');
                }
              }}
            >
              <Ionicons name="cube-outline" size={24} color="#00E5FF" />
              <View style={styles.moreOptionInfo}>
                <Text style={[styles.moreOptionLabel, { color: '#00E5FF' }]}>Hologram Mode</Text>
                <Text style={styles.moreOptionValue}>Project video through a pyramid</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#00E5FF" />
            </Pressable>

          </Pressable>
        </Pressable>
      </Modal>

      {/* ═══ HOLOGRAM SETUP DASHBOARD ═══ */}
      <Modal visible={showHologramSetup} animationType="fade" transparent statusBarTranslucent>
        <View style={holoStyles.dashboardBg}>
          <ScrollView contentContainerStyle={holoStyles.dashboardScroll} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={holoStyles.headerSection}>
              <Text style={holoStyles.headerTitle}>HOLOGRAPHIC MOVIE MODE</Text>
              <Text style={holoStyles.headerSubtitle}>Watch movies like never before</Text>
              <Text style={holoStyles.headerDesc}>
                Turn your phone into a holographic projector and enjoy a floating 3D cinema experience.{'\n'}Best experienced in a dark environment.
              </Text>
            </View>

            {/* Mode Selector */}
            <View style={holoStyles.sectionRow}>
              <View style={holoStyles.sectionFlex}>
                <Text style={holoStyles.sectionTitle}>PROJECTION MODE</Text>
                <Pressable
                  style={[holoStyles.modeCard, selectedHologramType === 'air' && holoStyles.modeCardActive]}
                  onPress={() => setSelectedHologramType('air')}
                >
                  <Ionicons name="sparkles-outline" size={22} color={selectedHologramType === 'air' ? '#00E5FF' : '#5a7a99'} />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={[holoStyles.modeLabel, selectedHologramType === 'air' && holoStyles.modeLabelActive]}>Ambient Cinema</Text>
                    <Text style={holoStyles.modeDesc}>3D volumetric display with ambilight glow, spatial audio &amp; kinetic haptics</Text>
                  </View>
                  {selectedHologramType === 'air' && <Ionicons name="checkmark-circle" size={20} color="#00E5FF" />}
                </Pressable>
                <Pressable
                  style={[holoStyles.modeCard, selectedHologramType === 'pyramid' && holoStyles.modeCardActive]}
                  onPress={() => setSelectedHologramType('pyramid')}
                >
                  <Ionicons name="prism-outline" size={22} color={selectedHologramType === 'pyramid' ? '#00E5FF' : '#5a7a99'} />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={[holoStyles.modeLabel, selectedHologramType === 'pyramid' && holoStyles.modeLabelActive]}>Prism Hologram</Text>
                    <Text style={holoStyles.modeDesc}>4-way Pepper's Ghost projection — requires a clear pyramid prism</Text>
                  </View>
                  {selectedHologramType === 'pyramid' && <Ionicons name="checkmark-circle" size={20} color="#00E5FF" />}
                </Pressable>
              </View>

              {/* Right panel */}
              <View style={holoStyles.sectionFlex}>
                {/* Best Results */}
                <Text style={holoStyles.sectionTitle}>BEST RESULTS</Text>
                <View style={holoStyles.tipCard}>
                  <View style={holoStyles.tipRow}>
                    <Ionicons name="moon-outline" size={18} color="#00E5FF" />
                    <Text style={holoStyles.tipText}>Use in a dark room</Text>
                  </View>
                  <View style={holoStyles.tipRow}>
                    <Ionicons name="sunny-outline" size={18} color="#00E5FF" />
                    <Text style={holoStyles.tipText}>Increase screen brightness to maximum</Text>
                  </View>
                  <View style={holoStyles.tipRow}>
                    <Ionicons name="phone-landscape-outline" size={18} color="#00E5FF" />
                    <Text style={holoStyles.tipText}>Place phone flat on a table</Text>
                  </View>
                  {selectedHologramType === 'pyramid' && (
                    <View style={holoStyles.tipRow}>
                      <Ionicons name="triangle-outline" size={18} color="#00E5FF" />
                      <Text style={holoStyles.tipText}>Use a clear acrylic/plastic pyramid</Text>
                    </View>
                  )}
                </View>

                {/* Works On */}
                <Text style={[holoStyles.sectionTitle, { marginTop: 16 }]}>WORKS ON</Text>
                <View style={holoStyles.displayRow}>
                  <View style={holoStyles.displayChip}>
                    <View style={[holoStyles.displayDot, { backgroundColor: '#FF4444' }]} />
                    <Text style={holoStyles.displayLabel}>AMOLED / OLED</Text>
                    <Text style={holoStyles.displayQuality}>Best quality</Text>
                  </View>
                  <View style={holoStyles.displayChip}>
                    <View style={[holoStyles.displayDot, { backgroundColor: '#44AAFF' }]} />
                    <Text style={holoStyles.displayLabel}>QLED</Text>
                    <Text style={holoStyles.displayQuality}>Good</Text>
                  </View>
                  <View style={holoStyles.displayChip}>
                    <View style={[holoStyles.displayDot, { backgroundColor: '#88AAcc' }]} />
                    <Text style={holoStyles.displayLabel}>LCD / IPS</Text>
                    <Text style={holoStyles.displayQuality}>Basic</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* How It Works */}
            <Text style={[holoStyles.sectionTitle, { marginTop: 24 }]}>HOW IT WORKS</Text>
            <View style={holoStyles.flowRow}>
              <View style={holoStyles.flowStep}>
                <View style={holoStyles.flowIconWrap}>
                  <Ionicons name="play-circle-outline" size={28} color="#00E5FF" />
                </View>
                <Text style={holoStyles.flowStepNum}>1. STREAM</Text>
                <Text style={holoStyles.flowStepDesc}>The M3U8 video is streamed from the cloud and decoded.</Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color="#334466" style={{ marginTop: 18 }} />
              <View style={holoStyles.flowStep}>
                <View style={holoStyles.flowIconWrap}>
                  <Ionicons name="grid-outline" size={28} color="#00E5FF" />
                </View>
                <Text style={holoStyles.flowStepNum}>{selectedHologramType === 'pyramid' ? '2. SPLIT & RENDER' : '2. PROCESS'}</Text>
                <Text style={holoStyles.flowStepDesc}>
                  {selectedHologramType === 'pyramid' 
                    ? 'The app renders the video into 4 different angles.'
                    : 'Volumetric slices, ambilight colors, and audio spectrum are extracted.'}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color="#334466" style={{ marginTop: 18 }} />
              <View style={holoStyles.flowStep}>
                <View style={holoStyles.flowIconWrap}>
                  <Ionicons name="layers-outline" size={28} color="#00E5FF" />
                </View>
                <Text style={holoStyles.flowStepNum}>{selectedHologramType === 'pyramid' ? '3. REFLECT' : '3. PROJECT'}</Text>
                <Text style={holoStyles.flowStepDesc}>
                  {selectedHologramType === 'pyramid'
                    ? 'The pyramid reflects the 4 views into the center.'
                    : 'Ambilight glow, beam, and particles are projected around the video.'}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color="#334466" style={{ marginTop: 18 }} />
              <View style={holoStyles.flowStep}>
                <View style={holoStyles.flowIconWrap}>
                  <Ionicons name="eye-outline" size={28} color="#00E5FF" />
                </View>
                <Text style={holoStyles.flowStepNum}>4. IMMERSIVE VIEW</Text>
                <Text style={holoStyles.flowStepDesc}>
                  {selectedHologramType === 'pyramid'
                    ? 'Your brain perceives it as a floating 3D movie.'
                    : 'Spatial audio follows your head. Bass drives haptic feedback.'}
                </Text>
              </View>
            </View>

            {/* Performance */}
            <View style={holoStyles.perfRow}>
              <View style={holoStyles.perfChip}>
                <Ionicons name="speedometer-outline" size={16} color="#00E5FF" />
                <Text style={holoStyles.perfText}>Smooth 60fps</Text>
                <Text style={holoStyles.perfSub}>On High-End Devices</Text>
              </View>
              <View style={holoStyles.perfChip}>
                <Ionicons name="hardware-chip-outline" size={16} color="#00E5FF" />
                <Text style={holoStyles.perfText}>Optimized Rendering</Text>
                <Text style={holoStyles.perfSub}>Single render pass</Text>
              </View>
              <View style={holoStyles.perfChip}>
                <Ionicons name="battery-half-outline" size={16} color="#FFB300" />
                <Text style={holoStyles.perfText}>Battery Usage</Text>
                <Text style={holoStyles.perfSub}>Higher than normal</Text>
              </View>
              <View style={holoStyles.perfChip}>
                <Ionicons name="diamond-outline" size={16} color="#00E5FF" />
                <Text style={holoStyles.perfText}>Best Quality</Text>
                <Text style={holoStyles.perfSub}>AMOLED / OLED</Text>
              </View>
            </View>

            {/* Start Projection Button */}
            <Pressable
              style={holoStyles.startBtn}
              onPress={() => {
                setShowHologramSetup(false);
                setIsHologramMode(true);
              }}
            >
              <Ionicons name="flash-outline" size={22} color="#000" />
              <Text style={holoStyles.startBtnText}>START PROJECTION</Text>
            </Pressable>

            {/* Close */}
            <Pressable
              style={holoStyles.closeDashBtn}
              onPress={() => {
                setShowHologramSetup(false);
                try { player.play(); } catch(_) {}
              }}
            >
              <Text style={holoStyles.closeDashText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* Watch Party Side Drawer */}
      {showPartyDrawer && watchPartyId && (
        <Animated.View entering={SlideInRight} exiting={SlideOutRight} style={styles.partyDrawer}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          
          <View style={styles.partyDrawerHeader}>
            <View>
              <Text style={styles.partyDrawerTitle}>Watch Party</Text>
              <Pressable onPress={() => {
                const { Clipboard } = require('react-native');
                Clipboard.setString(watchPartyId);
                Alert.alert("Copied", "Party code copied to clipboard!");
              }} style={styles.partyCodeHeaderRow}>
                <Text style={styles.partyCodeHeaderText}>Code: {watchPartyId}</Text>
                <Feather name="copy" size={10} color="#A3A3A3" style={{ marginLeft: 4 }} />
              </Pressable>
            </View>
            <Pressable onPress={() => setShowPartyDrawer(false)} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="white" />
            </Pressable>
          </View>
          
          {/* Compact Horizontal Participants list */}
          <View style={styles.participantsHorizontalContainer}>
            {participants.map((member) => (
              <View key={member.uid} style={styles.participantAvatarWrapper}>
                <Image source={{ uri: FRIEND_AVATARS[member.avatarId] || FRIEND_AVATARS.avatar1 }} style={styles.participantAvatarCompact} />
                <View style={[styles.presenceDotOverlay, { backgroundColor: member.status === 'online' ? '#10B981' : '#6B7280' }]} />
              </View>
            ))}
          </View>

          {/* Live Chat Feed */}
          <Text style={styles.chatSectionTitle}>Live Feed</Text>
          <ScrollView
            ref={drawerChatScrollRef}
            style={styles.drawerChatScroll}
            contentContainerStyle={styles.drawerChatContent}
            showsVerticalScrollIndicator={true}
          >
            {partyFeed.map((item) => {
              const isMe = item.senderId === (selectedProfile?.id || 'guest');
              if (item.type === 'chat') {
                return (
                  <View key={item.id} style={[styles.chatFeedRow, isMe ? styles.chatFeedRowRight : styles.chatFeedRowLeft]}>
                    {!isMe && <Text style={styles.chatFeedSender}>{item.senderName}</Text>}
                    <View style={[styles.chatFeedBubble, isMe ? styles.chatFeedBubbleMe : styles.chatFeedBubbleOther]}>
                      <Text style={styles.chatFeedText}>{item.content}</Text>
                    </View>
                  </View>
                );
              }

              // System event message
              let systemText = '';
              if (item.type === 'reaction') {
                systemText = `${item.senderName} reacted ${item.content}`;
              } else if (item.type === 'play') {
                systemText = `${item.senderName} played`;
              } else if (item.type === 'pause') {
                systemText = `${item.senderName} paused`;
              } else if (item.type === 'seek') {
                const min = Math.floor(item.currentTime / 60);
                const sec = Math.floor(item.currentTime % 60).toString().padStart(2, '0');
                systemText = `${item.senderName} jumped to ${min}:${sec}`;
              } else {
                systemText = `${item.senderName} triggered ${item.type}`;
              }

              return (
                <View key={item.id} style={styles.systemFeedRow}>
                  <Text style={styles.systemFeedText}>{systemText}</Text>
                </View>
              );
            })}
          </ScrollView>

          {/* Quick reactions panel */}
          <View style={styles.reactionsContainer}>
            {['🔥', '😂', '😱', '❤️', '😢'].map((emoji) => (
              <Pressable key={emoji} style={styles.reactionBubble} onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                // Send locally
                triggerFloatingEmoji(emoji);
                // Broadcast
                FriendsService.sendWatchPartyEvent(watchPartyId, selectedProfile?.name || 'Friend', 'reaction', currentTime, { content: emoji });
              }}>
                <Text style={{ fontSize: 20 }}>{emoji}</Text>
              </Pressable>
            ))}
          </View>

          {/* Chat text input footer */}
          <View style={styles.drawerInputRow}>
            <TextInput
              style={styles.drawerTextInput}
              placeholder="Send a message..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={drawerInput}
              onChangeText={setDrawerInput}
              onSubmitEditing={handleSendDrawerMessage}
            />
            <Pressable onPress={handleSendDrawerMessage} disabled={!drawerInput.trim()} style={styles.drawerSendBtn}>
              <Ionicons name="send" size={14} color={drawerInput.trim() ? COLORS.primary : 'rgba(255,255,255,0.3)'} />
            </Pressable>
          </View>
        </Animated.View>
      )}

      {/* Floating Emojis Screen Overlay */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {floatingEmojis.map((item) => (
          <FloatingEmoji
            key={item.id}
            emoji={item.emoji}
            xOffset={item.xOffset}
            onComplete={() => {
              setFloatingEmojis((prev) => prev.filter((e) => e.id !== item.id));
            }}
          />
        ))}
      </View>

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
    backgroundColor: 'black',
  },
  partyDrawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 280,
    backgroundColor: 'rgba(26, 26, 26, 0.85)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.1)',
    zIndex: 100,
    padding: 20,
    paddingTop: 40,
  },
  partyDrawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  partyDrawerTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '900',
  },
  closeBtn: {
    padding: 4,
  },
  partyCodeBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 20,
  },
  partyCodeLabel: {
    color: '#A3A3A3',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  partyCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  partyCodeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
  },
  copyBtn: {
    padding: 4,
  },
  participantsSectionTitle: {
    color: '#A3A3A3',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
  },
  participantsScroll: {
    flex: 1,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  participantAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  participantName: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 10,
    flex: 1,
  },
  presenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  reactionsTitle: {
    color: '#A3A3A3',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 10,
  },
  reactionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
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
  activeIconBtn: {
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
    borderRadius: 20,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'space-between',
    paddingVertical: 20,
    zIndex: 10,
  },
  midStreamBuffering: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 5,
  },
  exitHologramBtn: {
    position: 'absolute',
    top: 40,
    right: 40,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  nextEpisodeOverlay: {
    position: 'absolute',
    right: 48,
    bottom: 120,
    width: 320,
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderRadius: 12,
    padding: 24,
    zIndex: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  nextEpisodeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  nextEpisodeHeader: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  nextEpisodeTimerCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextEpisodeTimerText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '900',
  },
  nextEpisodeTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    lineHeight: 26,
  },
  nextEpisodePreview: {
    height: 140,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 20,
    position: 'relative',
    backgroundColor: '#1a1a1a',
  },
  nextEpisodePlayIcon: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -22 }, { translateY: -22 }],
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  nextEpisodeActions: {
    flexDirection: 'row',
    gap: 12,
  },
  nextEpisodeBtn: {
    flex: 1,
    height: 48,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  nextEpisodeBtnPrimary: {
    backgroundColor: 'white',
    flexDirection: 'row',
    gap: 8,
  },
  nextEpisodeBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: 'black',
  },
  centeredOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  loadingStatusText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginTop: 15,
  },
  errorText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  errorActions: {
    flexDirection: 'row',
    marginTop: 30,
    gap: 15,
  },
  retryBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 4,
  },
  retryText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  topBar: {
    flexDirection: 'row',
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
    backgroundColor: 'rgba(229,9,20,0.1)',
    marginHorizontal: -12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  trackItemText: {
    color: '#D1D1D1',
    fontSize: 16,
    fontWeight: '500',
  },
  trackItemTextActive: {
    color: '#E50914',
    fontSize: 16,
    fontWeight: 'bold',
  },
  subtitleContainer: {
    position: 'absolute',
    bottom: 120,
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 5,
  },
  subtitleText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  epOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    gap: 16,
  },
  epOptionItemActive: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginHorizontal: -12,
    paddingHorizontal: 12,
    borderRadius: 8,
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
  seekRippleText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '900',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
  },
  bufferedFill: {
    position: 'absolute',
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 2,
  },
});

const holoStyles = StyleSheet.create({
  dashboardBg: {
    flex: 1,
    backgroundColor: '#080E1A',
  },
  dashboardScroll: {
    padding: 28,
    paddingTop: 52,
    paddingBottom: 60,
  },
  headerSection: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#E0F0FF',
    letterSpacing: 2.5,
  },
  headerSubtitle: {
    fontSize: 15,
    fontStyle: 'italic',
    color: '#5a8abb',
    marginTop: 4,
    letterSpacing: 0.8,
  },
  headerDesc: {
    fontSize: 13,
    color: '#6688AA',
    marginTop: 10,
    lineHeight: 19,
  },
  sectionRow: {
    flexDirection: 'row',
    gap: 18,
  },
  sectionFlex: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4488BB',
    letterSpacing: 1.8,
    marginBottom: 10,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0C1628',
    borderWidth: 1,
    borderColor: '#1A2844',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  modeCardActive: {
    borderColor: '#00E5FF',
    backgroundColor: '#0A1830',
    shadowColor: '#00E5FF',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  modeLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6688AA',
  },
  modeLabelActive: {
    color: '#00E5FF',
  },
  modeDesc: {
    fontSize: 11,
    color: '#4A6688',
    marginTop: 3,
    lineHeight: 15,
  },
  tipCard: {
    backgroundColor: '#0C1628',
    borderWidth: 1,
    borderColor: '#1A2844',
    borderRadius: 12,
    padding: 14,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  tipText: {
    fontSize: 13,
    color: '#8AAACC',
    flex: 1,
  },
  displayRow: {
    flexDirection: 'row',
    gap: 8,
  },
  displayChip: {
    flex: 1,
    backgroundColor: '#0C1628',
    borderWidth: 1,
    borderColor: '#1A2844',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  displayDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginBottom: 6,
  },
  displayLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#8AAACC',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  displayQuality: {
    fontSize: 9,
    color: '#4A6688',
    textAlign: 'center',
    marginTop: 2,
  },
  flowRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0C1628',
    borderWidth: 1,
    borderColor: '#1A2844',
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  flowStep: {
    flex: 1,
    alignItems: 'center',
  },
  flowIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0A1A2E',
    borderWidth: 1,
    borderColor: '#1A3355',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  flowStepNum: {
    fontSize: 9,
    fontWeight: '800',
    color: '#5A8ABB',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 4,
  },
  flowStepDesc: {
    fontSize: 10,
    color: '#4A6688',
    textAlign: 'center',
    lineHeight: 14,
  },
  perfRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    backgroundColor: '#060C18',
    borderWidth: 1,
    borderColor: '#142240',
    borderRadius: 10,
    padding: 12,
  },
  perfChip: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  perfText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8AAACC',
    textAlign: 'center',
  },
  perfSub: {
    fontSize: 9,
    color: '#4A6688',
    textAlign: 'center',
  },
  startBtn: {
    marginTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#00E5FF',
    paddingVertical: 16,
    borderRadius: 14,
    shadowColor: '#00E5FF',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  startBtnText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 2,
  },
  closeDashBtn: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 12,
  },
  closeDashText: {
    fontSize: 15,
    color: '#5a7a99',
    fontWeight: '600',
  },
  partyCodeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  partyCodeHeaderText: {
    color: '#A3A3A3',
    fontSize: 10,
    fontWeight: '600',
  },
  participantsHorizontalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  participantAvatarWrapper: {
    position: 'relative',
  },
  participantAvatarCompact: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  presenceDotOverlay: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#1a1a1a',
  },
  chatSectionTitle: {
    color: '#A3A3A3',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  drawerChatScroll: {
    flex: 1,
    marginVertical: 4,
  },
  drawerChatContent: {
    paddingVertical: 4,
    gap: 8,
  },
  chatFeedRow: {
    flexDirection: 'column',
    marginBottom: 2,
    maxWidth: '85%',
  },
  chatFeedRowLeft: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  chatFeedRowRight: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  chatFeedSender: {
    color: '#A3A3A3',
    fontSize: 9,
    fontWeight: '600',
    marginBottom: 2,
    marginLeft: 4,
  },
  chatFeedBubble: {
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  chatFeedBubbleMe: {
    backgroundColor: '#8B5CF6',
    borderBottomRightRadius: 2,
  },
  chatFeedBubbleOther: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderBottomLeftRadius: 2,
  },
  chatFeedText: {
    color: 'white',
    fontSize: 12,
    lineHeight: 16,
  },
  systemFeedRow: {
    alignSelf: 'center',
    marginVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  systemFeedText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
  },
  drawerInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginTop: 4,
  },
  drawerTextInput: {
    flex: 1,
    color: 'white',
    fontSize: 12,
    height: 32,
    padding: 0,
  },
  drawerSendBtn: {
    padding: 4,
    marginLeft: 6,
  },
});