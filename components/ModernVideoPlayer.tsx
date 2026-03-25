import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, ActivityIndicator, ScrollView, Modal, Image } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons, MaterialCommunityIcons, MaterialIcons, Feather } from '@expo/vector-icons';
import Animated, { 
  useAnimatedStyle, 
  withTiming, 
  useSharedValue,
  Easing,
  runOnJS,
  FadeInDown
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Brightness from 'expo-brightness';
import { COLORS } from '../constants/theme';
import { parseVtt, Subtitle } from '../utils/vttParser';
import { getImageUrl } from '../services/tmdb';
import { NetflixLoader } from './NetflixLoader';

const { width, height } = Dimensions.get('window');

interface ModernPlayerProps {
  videoUrl: string;
  onClose: () => void;
  title: string;
  headers?: Record<string, string>;
  // Subtitles
  tracks?: any[];
  // Episodes
  episodes?: any[];
  onEpisodeSelect?: (episodeNumber: number) => void;
  onNextEpisode?: () => void;
}

export function ModernVideoPlayer({ 
  videoUrl, 
  onClose, 
  title, 
  headers,
  tracks = [],
  episodes = [],
  onEpisodeSelect,
  onNextEpisode
}: ModernPlayerProps) {
  const [isLocked, setIsLocked] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [showEpisodePicker, setShowEpisodePicker] = useState(false);
  const [showSubtitlePicker, setShowSubtitlePicker] = useState(false);
  
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

  const controlsOpacity = useSharedValue(1);
  const progressPercentage = useSharedValue(0);
  const hideTimeout = useRef<NodeJS.Timeout | null>(null);
  const currentUrlRef = useRef(videoUrl);

  // Initialize player with the current source
  const player = useVideoPlayer({ 
    uri: videoUrl, 
    headers: headers || undefined 
  }, (player) => {
    player.loop = false;
    player.play();
  });

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
      if (selectedTrackIndex >= 0 && tracks[selectedTrackIndex]) {
        try {
          const track = tracks[selectedTrackIndex];
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
  }, [selectedTrackIndex, tracks]);

  // Real-time progress and subtitle polling
  useEffect(() => {
    let interval: NodeJS.Timeout;
    interval = setInterval(() => {
      if (player) {
        const current = player.currentTime || 0;
        const playerDur = player.duration || 0;
        
        if (playerDur > 0 && playerDur !== duration) {
          setDuration(playerDur);
        }
        
        const activeDur = playerDur > 0 ? playerDur : (duration > 0 ? duration : 1);

        if (!isScrubbing.current) {
          progressPercentage.value = (current / activeDur) * 100;
          setCurrentTime(current);
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
      }
    }, 50);

    return () => clearInterval(interval);
  }, [player, duration]);

  // Handle Source Replacement
  useEffect(() => {
    async function updateSource() {
      if (videoUrl && videoUrl !== currentUrlRef.current) {
        console.log(`[Player] 🔄 Switching source to: ${videoUrl}`);
        currentUrlRef.current = videoUrl;
        try {
          setStatus('loading');
          await (player as any).replaceAsync({ 
            uri: videoUrl,
            headers: headers || undefined 
          });
          player.play();
        } catch (e) {
          console.error("[Player] ❌ Switch failed:", e);
        }
      }
    }
    updateSource();
  }, [videoUrl, headers]);

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
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT).catch(() => {});
    };
  }, []);

  // Manual Event Listeners
  useEffect(() => {
    const subscriptions = [
      player.addListener('statusChange', (payload: any) => {
        if (payload.status === 'error') {
          console.error(`[Player] 💥 Error details:`, payload.error);
        }
        setStatus(payload.status);
      }),
      player.addListener('timeUpdate', (payload: any) => {
        if (!isScrubbing.current) {
          setCurrentTime(payload.currentTime);
        }
      }),
      (player as any).addListener('durationChange', (payload: any) => {
        setDuration(payload.duration);
      }),
      player.addListener('playingChange', (payload: any) => {
        setIsPlaying(payload.isPlaying);
      })
    ];

    return () => {
      subscriptions.forEach(sub => sub.remove());
    };
  }, [player, headers]);

  const resetHideTimer = () => {
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
      }, 3500);
    }
  };

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    };
  }, [isLocked]);

  const toggleControls = () => {
    if (controlsOpacity.value > 0) {
      controlsOpacity.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished) runOnJS(setIsControlsVisible)(false);
      });
    } else {
      resetHideTimer();
    }
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    resetHideTimer();
  };

  const skip = (seconds: number) => {
    player.currentTime += seconds;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetHideTimer();
  };

  // Gestures
  const tapGesture = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => {
      toggleControls();
    });

  const doubleTapLeft = Gesture.Tap()
    .numberOfTaps(2)
    .runOnJS(true)
    .onEnd(() => {
      skip(-10);
    });

  const doubleTapRight = Gesture.Tap()
    .numberOfTaps(2)
    .runOnJS(true)
    .onEnd(() => {
      skip(10);
    });

  const scrubGesture = Gesture.Pan()
    .runOnJS(true)
    .onBegin((e) => {
      isScrubbing.current = true;
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
    .onEnd((e) => {
      if (duration > 0 && progressBarWidth > 0) {
        const percent = Math.max(0, Math.min(100, (e.x / progressBarWidth) * 100));
        player.currentTime = (percent / 100) * duration;
      }
      setTimeout(() => {
        isScrubbing.current = false;
      }, 200);
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
      setVolumeLevel(newVol);
      player.volume = newVol;
    });

  const leftGestures = Gesture.Exclusive(doubleTapLeft, tapGesture);
  const rightGestures = Gesture.Exclusive(doubleTapRight, tapGesture);

  const animatedControlsStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));

  const animatedProgressStyle = useAnimatedStyle(() => ({
    width: `${progressPercentage.value}%`,
  }));

  const animatedThumbStyle = useAnimatedStyle(() => ({
    left: `${progressPercentage.value}%`,
  }));

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) secs = 0;
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.container}>
        <VideoView
          style={StyleSheet.absoluteFill}
          player={player}
          nativeControls={false}
        />

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
              <View style={{ flex: 1, backgroundColor: 'transparent' }} />
            </GestureDetector>
            <GestureDetector gesture={Gesture.Simultaneous(volumeGesture, rightGestures)}>
              <View style={{ flex: 1, backgroundColor: 'transparent' }} />
            </GestureDetector>
          </View>
        ) : (
          <GestureDetector gesture={tapGesture}>
             <View style={[StyleSheet.absoluteFill, { zIndex: 1, backgroundColor: 'transparent' }]} />
          </GestureDetector>
        )}

        {/* Buffering/Loading Overlay */}
        {(status === 'loading' || status === 'idle') && (
          <View style={styles.centeredOverlay}>
            <NetflixLoader size={60} withPercentage={true} />
          </View>
        )}

        {/* Error Overlay */}
        {status === 'error' && (
          <View style={styles.centeredOverlay}>
            <Ionicons name="alert-circle" size={50} color={COLORS.primary} />
            <Text style={styles.errorText}>This video is currently unavailable.</Text>
            <Text style={[styles.errorText, { fontSize: 14, fontWeight: '400', marginTop: 5, color: 'rgba(255,255,255,0.7)' }]}>
              Please try again later.
            </Text>
            <View style={styles.errorActions}>
              <Pressable style={styles.retryBtn} onPress={onClose}>
                <Text style={styles.retryText}>Go Back</Text>
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
            {!isLocked && (
              <View style={styles.topBar}>
                <Pressable style={styles.iconBtn}>
                  <MaterialCommunityIcons name="cast" size={26} color="white" />
                </Pressable>
                <Text style={styles.videoTitle} numberOfLines={1}>{title}</Text>
                <Pressable onPress={onClose} style={styles.iconBtn}>
                  <Ionicons name="close" size={30} color="white" />
                </Pressable>
              </View>
            )}

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
                    <Ionicons name={isPlaying ? "pause" : "play"} size={70} color="white" />
                  </Pressable>

                  <Pressable onPress={() => skip(10)} style={styles.centerIcon}>
                    <MaterialIcons name="forward-10" size={56} color="white" />
                  </Pressable>
                </View>
              ) : (
                <View style={[styles.centerControls, { flex: 1, justifyContent: 'center' }]} pointerEvents="box-none">
                   <Pressable 
                    onPress={() => {
                      setIsLocked(false);
                      resetHideTimer();
                    }} 
                    style={styles.lockBtnLarge}
                  >
                    <Ionicons name="lock-closed" size={40} color="white" />
                    <Text style={styles.lockText}>Tap to Unlock</Text>
                  </Pressable>
                </View>
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
                      <View style={styles.progressTrack}>
                        <Animated.View style={[styles.progressFill, animatedProgressStyle]} />
                      </View>
                      <Animated.View style={[styles.progressThumb, animatedThumbStyle]} />
                    </View>
                  </GestureDetector>
                </View>

                <View style={styles.bottomIcons}>
                  <Pressable onPress={() => {
                    const speeds = [0.75, 1, 1.25, 1.5];
                    const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
                    setPlaybackSpeed(next);
                    player.playbackRate = next;
                    resetHideTimer();
                  }} style={styles.bottomIconBtn}>
                    <Ionicons name="speedometer-outline" size={26} color="white" />
                    <Text style={styles.bottomIconLabel}>Speed ({playbackSpeed}x)</Text>
                  </Pressable>
                  
                  <Pressable onPress={() => setIsLocked(true)} style={styles.bottomIconBtn}>
                    <Ionicons name="lock-open-outline" size={26} color="white" />
                    <Text style={styles.bottomIconLabel}>Lock</Text>
                  </Pressable>
                  
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

                  {episodes && episodes.length > 0 && (
                    <Pressable 
                      onPress={() => {
                        if (onNextEpisode) {
                          onNextEpisode();
                          resetHideTimer();
                        }
                      }} 
                      style={styles.bottomIconBtn}
                    >
                      <Ionicons name="play-skip-forward-outline" size={26} color="white" />
                      <Text style={styles.bottomIconLabel}>Next Ep.</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            )}
          </Animated.View>
        )}
      </View>

      {/* Episodes Picker Modal */}
      <Modal
        visible={showEpisodePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEpisodePicker(false)}
      >
        <Pressable style={styles.modalOverlayEpisodes} onPress={() => setShowEpisodePicker(false)}>
          <Animated.View entering={FadeInDown.duration(300)} style={styles.episodesModalContent}>
            <View style={styles.episodesModalHeader}>
              <Text style={styles.episodesModalTitle}>Episodes</Text>
              <Pressable onPress={() => setShowEpisodePicker(false)} style={styles.closeBtn}>
                 <Ionicons name="close" size={24} color="white" />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {episodes.map((ep) => (
                <Pressable 
                  key={ep.id} 
                  style={styles.episodeOption}
                  onPress={() => {
                    if (onEpisodeSelect) onEpisodeSelect(ep.episode_number);
                    setShowEpisodePicker(false);
                    resetHideTimer();
                  }}
                >
                  <Image source={{ uri: getImageUrl(ep.still_path) }} style={styles.epOptionThumb} />
                  <View style={styles.epOptionInfo}>
                    <Text style={styles.epOptionTitle} numberOfLines={1}>{ep.episode_number}. {ep.name}</Text>
                    <Text style={styles.epOptionRuntime}>{ep.runtime || 45}m</Text>
                  </View>
                  <Feather name="download" size={20} color="white" style={{ padding: 10 }} />
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* Subtitles Picker Modal */}
      <Modal
        visible={showSubtitlePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSubtitlePicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowSubtitlePicker(false)}>
          <Animated.View entering={FadeInDown.duration(300)} style={styles.modalContent}>
            <Text style={styles.modalTitle}>Subtitles</Text>
            <ScrollView>
              <Pressable 
                style={[styles.trackOption, selectedTrackIndex === -1 && styles.trackOptionActive]}
                onPress={() => {
                  setSelectedTrackIndex(-1);
                  setShowSubtitlePicker(false);
                  resetHideTimer();
                }}
              >
                <Ionicons 
                  name={selectedTrackIndex === -1 ? "radio-button-on" : "radio-button-off"} 
                  size={20} 
                  color={selectedTrackIndex === -1 ? COLORS.primary : "white"} 
                />
                <Text style={styles.trackLabel}>Off</Text>
              </Pressable>

              {tracks.map((track, index) => (
                <Pressable 
                  key={index} 
                  style={[styles.trackOption, selectedTrackIndex === index && styles.trackOptionActive]}
                  onPress={() => {
                    setSelectedTrackIndex(index);
                    setShowSubtitlePicker(false);
                    resetHideTimer();
                  }}
                >
                  <Ionicons 
                    name={selectedTrackIndex === index ? "radio-button-on" : "radio-button-off"} 
                    size={20} 
                    color={selectedTrackIndex === index ? COLORS.primary : "white"} 
                  />
                  <Text style={styles.trackLabel}>{track.label || `Track ${index + 1}`}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
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
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'black',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  errorText: {
    color: 'white',
    marginTop: 10,
    fontSize: 18,
    fontWeight: '600',
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
    paddingHorizontal: 40,
    paddingTop: 10,
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
  lockBtnLarge: {
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 20,
    borderRadius: 15,
  },
  lockText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#262626',
    width: width * 0.4,
    borderRadius: 12,
    padding: 20,
    maxHeight: height * 0.6,
  },
  modalTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  trackOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  trackOptionActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.1)',
  },
  trackLabel: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  
  // Episodes Modal Styles
  modalOverlayEpisodes: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  episodesModalContent: {
    backgroundColor: '#262626',
    width: width * 0.45,
    height: '100%',
    padding: 20,
  },
  episodesModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
    paddingBottom: 15,
  },
  episodesModalTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeBtn: {
    padding: 5,
  },
  episodeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    gap: 12,
  },
  epOptionThumb: {
    width: 100,
    height: 56,
    borderRadius: 4,
    backgroundColor: '#1a1a1a',
  },
  epOptionInfo: {
    flex: 1,
  },
  epOptionTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  epOptionRuntime: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
});