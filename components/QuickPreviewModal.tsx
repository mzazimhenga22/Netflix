import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, Feather } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  FadeIn,
  FadeInDown,
  FadeInUp,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { fetchMovieDetails, getBackdropUrl, getImageUrl } from '../services/tmdb';
import { COLORS, SPACING } from '../constants/theme';
import { useRouter } from 'expo-router';
import { useProfile } from '../context/ProfileContext';
import { MyListService } from '../services/MyListService';

// ─── Types ─────────────────────────────────────────────────────────
export interface QuickPreviewItem {
  id: string;
  title: string;
  imageUrl: string;
  type?: string;
}

interface QuickPreviewModalProps {
  visible: boolean;
  item: QuickPreviewItem | null;
  onClose: () => void;
}

// ─── Animated Action Button ────────────────────────────────────────
const ActionButton = ({
  icon,
  activeIcon,
  label,
  onPress,
  isPrimary,
  isActive,
  delay = 0,
}: {
  icon: React.ReactNode;
  activeIcon?: React.ReactNode;
  label: string;
  onPress: () => void;
  isPrimary?: boolean;
  isActive?: boolean;
  delay?: number;
}) => {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSequence(
      withSpring(0.8, { damping: 12, stiffness: 300 }),
      withSpring(1.15, { damping: 12, stiffness: 300 }),
      withSpring(1, { damping: 12, stiffness: 300 })
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(400).springify()}>
      <Pressable onPress={handlePress} style={styles.actionButton}>
        <Animated.View
          style={[
            styles.actionCircle,
            isPrimary && styles.actionCirclePrimary,
            animStyle,
          ]}
        >
          {isActive && activeIcon ? activeIcon : icon}
        </Animated.View>
        <Text style={[styles.actionLabel, isPrimary && styles.actionLabelPrimary]}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
};

// ─── Match Score Ring ──────────────────────────────────────────────
const MatchScoreRing = ({ score, delay = 0 }: { score: number; delay?: number }) => {
  const progress = useSharedValue(0);
  const ringColor = score >= 75 ? '#46d369' : score >= 50 ? '#f5c518' : '#d94040';

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(score / 100, { duration: 1200, easing: Easing.out(Easing.cubic) })
    );
  }, [score, delay, progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <Animated.View entering={FadeIn.delay(delay).duration(400)} style={styles.matchContainer}>
      <View style={styles.matchBarBg}>
        <Animated.View style={[styles.matchBarFill, { backgroundColor: ringColor }, fillStyle]} />
      </View>
      <Text style={[styles.matchText, { color: ringColor }]}>{score}% Match</Text>
    </Animated.View>
  );
};

// ─── Similar Title Card ───────────────────────────────────────────
const SimilarCard = ({ item, onPress }: { item: any; onPress: () => void }) => {
  const { width } = useWindowDimensions();
  const cardW = (width - 64) / 3;

  return (
    <Pressable onPress={onPress} style={{ width: cardW }}>
      <ExpoImage
        source={{ uri: getImageUrl(item.poster_path) }}
        style={[styles.similarPoster, { width: cardW, height: cardW * 1.5 }]}
        contentFit="cover"
      />
    </Pressable>
  );
};

// ─── Main Modal ───────────────────────────────────────────────────
export function QuickPreviewModal({ visible, item, onClose }: QuickPreviewModalProps) {
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const { selectedProfile } = useProfile();

  // Data
  const [details, setDetails] = useState<any>(null);
  const [similar, setSimilar] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInMyList, setIsInMyList] = useState(false);

  // Animation
  const translateY = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);
  const BACKDROP_H = width * 0.56; // 16:9 aspect

  // Fetch details when item changes
  useEffect(() => {
    if (!visible || !item) return;

    setLoading(true);
    setDetails(null);
    setSimilar([]);

    const contentType = (item.type as 'movie' | 'tv') || 'movie';

    fetchMovieDetails(item.id, contentType)
      .then((movieData) => {
        setDetails(movieData);
        // Similar titles come from the appended response
        const similarResults = movieData?.similar?.results || [];
        setSimilar(similarResults.slice(0, 6));
      })
      .catch((err) => {
        console.error('[QuickPreview] Failed to fetch details:', err);
      })
      .finally(() => setLoading(false));
  }, [visible, item]);

  // My List subscription
  useEffect(() => {
    if (!visible || !item || !selectedProfile) return;

    MyListService.isInList(selectedProfile.id, item.id).then(setIsInMyList);
    const unsubscribe = MyListService.subscribeToList(selectedProfile.id, (items) => {
      const exists = items.some((i) => i.id.toString() === item!.id.toString());
      setIsInMyList(exists);
    });
    return () => unsubscribe();
  }, [visible, item, selectedProfile]);

  // Entry animation
  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: 300 });
      translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
    }
  }, [visible, backdropOpacity, translateY]);

  const handleClose = useCallback(() => {
    backdropOpacity.value = withTiming(0, { duration: 200 });
    translateY.value = withTiming(height * 0.5, { duration: 250 }, () => {
      runOnJS(onClose)();
    });
  }, [onClose, backdropOpacity, translateY, height]);

  const handleToggleMyList = useCallback(async () => {
    if (!selectedProfile || !item || !details) return;
    const newStatus = !isInMyList;
    setIsInMyList(newStatus);
    const wasAdded = await MyListService.toggleItem(selectedProfile.id, {
      id: item.id,
      title: details.title || details.name,
      poster_path: details.poster_path,
      backdrop_path: details.backdrop_path,
      type: item.type || 'movie',
    });
    if (typeof wasAdded === 'boolean') setIsInMyList(wasAdded);
  }, [selectedProfile, item, details, isInMyList]);

  const handlePlay = useCallback(() => {
    handleClose();
    setTimeout(() => {
      if (item) {
        router.push({
          pathname: '/movie/[id]',
          params: { id: item.id, type: item.type || 'movie' },
        });
      }
    }, 300);
  }, [item, router, handleClose]);

  const handleDownload = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Download handled on detail page
    handlePlay();
  }, [handlePlay]);

  const handleShare = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Future share implementation
  }, []);

  // Dismiss gesture
  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > 120) {
        handleClose();
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!visible || !item) return null;

  // Derived metadata
  const year = details
    ? (details.release_date || details.first_air_date || '').split('-')[0]
    : '';
  const runtime = details?.runtime
    ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m`
    : details?.number_of_seasons
      ? `${details.number_of_seasons} Season${details.number_of_seasons > 1 ? 's' : ''}`
      : '';
  const genres = (details?.genres || []).slice(0, 3).map((g: any) => g.name);
  const matchScore = Math.floor(75 + Math.random() * 24);
  const backdropUrl = details?.backdrop_path
    ? getBackdropUrl(details.backdrop_path)
    : item.imageUrl;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* Blurred Background */}
        <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose}>
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />
          </Pressable>
        </Animated.View>

        {/* Sheet */}
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.sheet, { maxHeight: height * 0.82 }, sheetStyle]}>
            {/* Drag Handle */}
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>

            {/* Close Button */}
            <Pressable
              style={styles.closeButton}
              onPress={handleClose}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            >
              <View style={styles.closeCircle}>
                <Ionicons name="close" size={18} color="white" />
              </View>
            </Pressable>

            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              {/* Backdrop Image */}
              <View style={[styles.backdropContainer, { height: BACKDROP_H }]}>
                <ExpoImage
                  source={{ uri: backdropUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  priority="high"
                />
                <LinearGradient
                  colors={['transparent', 'rgba(20,20,20,0.6)', '#141414']}
                  locations={[0.3, 0.7, 1]}
                  style={StyleSheet.absoluteFill}
                />

                {/* Play FAB overlaid on backdrop */}
                <Animated.View
                  entering={FadeInDown.delay(200).duration(500).springify()}
                  style={styles.playFab}
                >
                  <Pressable onPress={handlePlay} style={styles.playFabPressable}>
                    <Ionicons name="play" size={28} color="black" style={{ marginLeft: 3 }} />
                  </Pressable>
                </Animated.View>
              </View>

              {/* Content */}
              <View style={styles.content}>
                {loading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                  </View>
                ) : (
                  <>
                    {/* Title */}
                    <Animated.Text
                      entering={FadeInUp.delay(100).duration(400)}
                      style={styles.title}
                      numberOfLines={2}
                    >
                      {details?.title || details?.name || item.title}
                    </Animated.Text>

                    {/* Match Score + Metadata Row */}
                    <Animated.View
                      entering={FadeInUp.delay(200).duration(400)}
                      style={styles.metaRow}
                    >
                      <MatchScoreRing score={matchScore} delay={400} />
                      {year ? <Text style={styles.metaText}>{year}</Text> : null}
                      <View style={styles.ratingBadge}>
                        <Text style={styles.ratingText}>16+</Text>
                      </View>
                      {runtime ? <Text style={styles.metaText}>{runtime}</Text> : null}
                      <View style={styles.hdBadge}>
                        <Text style={styles.hdText}>HD</Text>
                      </View>
                    </Animated.View>

                    {/* Genres */}
                    {genres.length > 0 && (
                      <Animated.Text
                        entering={FadeInUp.delay(300).duration(400)}
                        style={styles.genresText}
                      >
                        {genres.join(' · ')}
                      </Animated.Text>
                    )}

                    {/* Action Buttons Row */}
                    <View style={styles.actionsRow}>
                      <ActionButton
                        icon={<Ionicons name="play" size={26} color="black" style={{ marginLeft: 2 }} />}
                        label="Play"
                        onPress={handlePlay}
                        isPrimary
                        delay={300}
                      />
                      <ActionButton
                        icon={<Ionicons name="add" size={26} color="white" />}
                        activeIcon={<Ionicons name="checkmark" size={26} color="#46d369" />}
                        label="My List"
                        onPress={handleToggleMyList}
                        isActive={isInMyList}
                        delay={400}
                      />
                      <ActionButton
                        icon={<Feather name="download" size={22} color="white" />}
                        label="Download"
                        onPress={handleDownload}
                        delay={500}
                      />
                      <ActionButton
                        icon={<Ionicons name="paper-plane-outline" size={22} color="white" />}
                        label="Share"
                        onPress={handleShare}
                        delay={600}
                      />
                    </View>

                    {/* Synopsis */}
                    <Animated.Text
                      entering={FadeInUp.delay(500).duration(400)}
                      style={styles.synopsis}
                      numberOfLines={4}
                    >
                      {details?.overview || 'No description available.'}
                    </Animated.Text>

                    {/* Similar Titles */}
                    {similar.length > 0 && (
                      <Animated.View entering={FadeInUp.delay(600).duration(400)}>
                        <Text style={styles.sectionTitle}>More Like This</Text>
                        <View style={styles.similarGrid}>
                          {similar.map((sim) => (
                            <SimilarCard
                              key={sim.id}
                              item={sim}
                              onPress={() => {
                                handleClose();
                                setTimeout(() => {
                                  router.push({
                                    pathname: '/movie/[id]',
                                    params: {
                                      id: sim.id.toString(),
                                      type: sim.media_type || item.type || 'movie',
                                    },
                                  });
                                }, 300);
                              }}
                            />
                          ))}
                        </View>
                      </Animated.View>
                    )}

                    {/* Full Details Link */}
                    <Animated.View entering={FadeInUp.delay(700).duration(400)}>
                      <Pressable
                        style={styles.detailsButton}
                        onPress={handlePlay}
                      >
                        <Ionicons name="information-circle-outline" size={20} color="white" />
                        <Text style={styles.detailsButtonText}>Details & More</Text>
                        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />
                      </Pressable>
                    </Animated.View>
                  </>
                )}
              </View>
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#141414',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    // Subtle shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 25,
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
    zIndex: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  closeButton: {
    position: 'absolute',
    top: 10,
    right: 12,
    zIndex: 30,
  },
  closeCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(30,30,30,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  backdropContainer: {
    width: '100%',
    overflow: 'hidden',
  },
  playFab: {
    position: 'absolute',
    bottom: 16,
    left: 16,
  },
  playFabPressable: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    // Subtle shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  loadingContainer: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: 'white',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  matchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  matchBarBg: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  matchBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  matchText: {
    fontSize: 13,
    fontWeight: '700',
  },
  metaText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '500',
  },
  ratingBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 3,
  },
  ratingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
  },
  hdBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 3,
  },
  hdText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  genresText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  actionButton: {
    alignItems: 'center',
    gap: 6,
    minWidth: 64,
  },
  actionCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  actionCirclePrimary: {
    backgroundColor: 'white',
    borderColor: 'white',
  },
  actionLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
  },
  actionLabelPrimary: {
    color: 'white',
    fontWeight: '700',
  },
  synopsis: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '400',
    marginBottom: 24,
  },
  sectionTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  similarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  similarPoster: {
    borderRadius: 6,
    backgroundColor: '#222',
    overflow: 'hidden',
  },
  detailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  detailsButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
});
