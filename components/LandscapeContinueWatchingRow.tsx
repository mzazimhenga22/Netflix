import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions, FlatList, Modal } from 'react-native';
import { Image } from 'expo-image';
import Animated, { 
  useAnimatedStyle, 
  withSpring, 
  withTiming,
  useSharedValue,
  SharedValue,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { COLORS, SPACING } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useProfile } from '../context/ProfileContext';
import { WatchHistoryService } from '../services/WatchHistoryService';

const AnimatedImage = Animated.createAnimatedComponent(Image);

const styles = StyleSheet.create({
  rowContainer: {
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.lg,
    marginBottom: 12,
  },
  title: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardContainer: {
    marginRight: 10,
    borderRadius: 6,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  posterPressable: {
    width: '100%',
    backgroundColor: '#141414',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  progressBarBackground: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    width: '100%',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#E50914', // Official Netflix Red
  },
  toolbar: {
    height: 38,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    backgroundColor: '#1b1b1b',
  },
  toolBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  optionsSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#222222',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 34,
    paddingHorizontal: 16,
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  optionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.15)',
  },
  optionsTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 16,
  },
  optionsSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  optionsCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionsList: {
    paddingVertical: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  optionText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '500',
  },
});

interface LandscapeCardProps {
  item: any;
  tiltX?: SharedValue<number>;
  tiltY?: SharedValue<number>;
  onLongPress?: (item: any) => void;
  onDotsPress: (item: any) => void;
  playItem: (item: any) => void;
}

const LandscapeCard = React.memo(({ item, tiltX, tiltY, onLongPress, onDotsPress, playItem }: LandscapeCardProps) => {
  const { width } = useWindowDimensions();
  // Vertical poster dimensions
  const cardWidth = width * 0.31; // fits nicely in row
  const posterHeight = cardWidth * 1.5; // aspect ratio 2:3
  const cardHeight = posterHeight + 3 + 38;

  const scale = useSharedValue(1);
  const zIndex = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { perspective: 500 },
        { rotateX: `${(tiltX?.value ?? 0) * 0.5}deg` },
        { rotateY: `${(tiltY?.value ?? 0) * 0.5}deg` },
        { scale: scale.value }
      ],
      zIndex: zIndex.value,
    };
  });

  const handlePressIn = React.useCallback(() => {
    zIndex.value = 10;
    scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handlePressOut = React.useCallback(() => {
    zIndex.value = 0;
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  }, []);

  // For Continue Watching, prioritize vertical poster_path over backdrop_path
  const imageSource = item.imageUrl || (item.item?.poster_path ? `https://image.tmdb.org/t/p/w342${item.item.poster_path}` : item.backdropUrl || '');
  const progress = item.progress || 0.15;

  return (
    <Animated.View style={[styles.cardContainer, { width: cardWidth, height: cardHeight }, animatedStyle]}>
      {/* Poster Image Area */}
      <Pressable 
        style={[styles.posterPressable, { height: posterHeight }]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => playItem(item)}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          if (onLongPress) {
            onLongPress({
              id: item.id || item.item?.id,
              title: item.title || item.item?.title || item.item?.name,
              imageUrl: item.imageUrl || (item.item?.poster_path ? `https://image.tmdb.org/t/p/w500${item.item.poster_path}` : ''),
              type: item.type || item.item?.type || 'movie',
            });
          }
        }}
        delayLongPress={300}
      >
        <AnimatedImage 
          source={{ uri: imageSource }}
          style={styles.image}
          contentFit="cover"
          transition={200}
        />
      </Pressable>

      {/* Progress Bar */}
      <View style={styles.progressBarBackground}>
        <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
      </View>

      {/* Bottom Tool Bar */}
      <View style={styles.toolbar}>
        {/* Info Icon Left */}
        <Pressable 
          style={styles.toolBtn} 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (onLongPress) {
              onLongPress({
                id: item.id || item.item?.id,
                title: item.title || item.item?.title || item.item?.name,
                imageUrl: item.imageUrl || (item.item?.poster_path ? `https://image.tmdb.org/t/p/w500${item.item.poster_path}` : ''),
                type: item.type || item.item?.type || 'movie',
              });
            }
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="information-circle-outline" size={22} color="rgba(255,255,255,0.7)" />
        </Pressable>

        {/* Three Dots Right */}
        <Pressable 
          style={styles.toolBtn} 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onDotsPress(item);
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="ellipsis-vertical" size={20} color="rgba(255,255,255,0.7)" />
        </Pressable>
      </View>
    </Animated.View>
  );
});

interface LandscapeCarouselRowProps {
  title: string;
  data: any[];
  tiltX?: SharedValue<number>;
  tiltY?: SharedValue<number>;
  onCardLongPress?: (item: any) => void;
}

export const LandscapeContinueWatchingRow = React.memo(({ title, data, tiltX, tiltY, onCardLongPress }: LandscapeCarouselRowProps) => {
  const router = useRouter();
  const { selectedProfile } = useProfile();
  const { width } = useWindowDimensions();

  // Option Bottom Sheet state
  const [selectedItem, setSelectedItem] = useState<any>(null);
  
  // Animation values
  const translateY = useSharedValue(350);
  const backdropOpacity = useSharedValue(0);

  const openOptions = useCallback((item: any) => {
    setSelectedItem(item);
    backdropOpacity.value = 0;
    translateY.value = 350;
    backdropOpacity.value = withTiming(1, { duration: 200 });
    translateY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.quad) });
  }, [backdropOpacity, translateY]);

  const closeOptions = useCallback(() => {
    backdropOpacity.value = withTiming(0, { duration: 150 });
    translateY.value = withTiming(350, { duration: 200 }, (finished) => {
      if (finished) {
        runOnJS(setSelectedItem)(null);
      }
    });
  }, [backdropOpacity, translateY]);

  const playItem = useCallback((item: any) => {
    const params: any = { 
      id: item.id || item.item?.id, 
      type: item.type || item.item?.type || 'movie',
      autoPlay: 'true',
    };

    if (item.season !== undefined && item.season !== null) params.season = item.season.toString();
    if (item.episode !== undefined && item.episode !== null) params.episode = item.episode.toString();
    if (item.currentTime !== undefined && item.currentTime !== null) params.resumeTime = item.currentTime.toString();
    if (item.duration !== undefined && item.duration !== null) params.resumeDuration = item.duration.toString();

    router.push({
      pathname: "/movie/[id]",
      params: params
    });
  }, [router]);

  const optionsSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const optionsBackdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!data || data.length === 0) return null;

  return (
    <View style={styles.rowContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
      </View>
      <FlatList
        horizontal
        data={data}
        keyExtractor={(item, index) => `${item.id || index}`}
        renderItem={({ item }) => (
          <LandscapeCard 
            item={item} 
            tiltX={tiltX} 
            tiltY={tiltY} 
            onLongPress={onCardLongPress} 
            onDotsPress={openOptions}
            playItem={playItem}
          />
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: SPACING.lg }}
        snapToInterval={width * 0.31 + 10}
        snapToAlignment="start"
        decelerationRate="fast"
      />

      {/* Options Menu Modal */}
      <Modal
        visible={selectedItem !== null}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={closeOptions}
      >
        <View style={StyleSheet.absoluteFill}>
          {/* Backdrop */}
          <Animated.View style={[styles.optionsBackdrop, optionsBackdropStyle]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeOptions} />
          </Animated.View>

          {/* Options Sheet */}
          <Animated.View style={[styles.optionsSheet, optionsSheetStyle]}>
            {/* Drag Handle */}
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>

            {/* Header */}
            <View style={styles.optionsHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionsTitle} numberOfLines={1}>
                  {selectedItem?.title || selectedItem?.item?.title || selectedItem?.item?.name || 'Options'}
                </Text>
                <Text style={styles.optionsSubtitle} numberOfLines={1}>
                  Continue Watching
                </Text>
              </View>
              <Pressable onPress={closeOptions} style={styles.optionsCloseBtn}>
                <Ionicons name="close" size={20} color="white" />
              </Pressable>
            </View>

            {/* Option list */}
            <View style={styles.optionsList}>
              {/* Play */}
              <Pressable 
                style={styles.optionRow} 
                onPress={() => {
                  closeOptions();
                  playItem(selectedItem);
                }}
              >
                <Ionicons name="play-outline" size={22} color="white" />
                <Text style={styles.optionText}>Play</Text>
              </Pressable>

              {/* Info */}
              <Pressable 
                style={styles.optionRow} 
                onPress={() => {
                  closeOptions();
                  if (onCardLongPress) {
                    onCardLongPress({
                      id: selectedItem.id || selectedItem.item?.id,
                      title: selectedItem.title || selectedItem.item?.title || selectedItem.item?.name,
                      imageUrl: selectedItem.imageUrl || (selectedItem.item?.poster_path ? `https://image.tmdb.org/t/p/w500${selectedItem.item.poster_path}` : ''),
                      type: selectedItem.type || selectedItem.item?.type || 'movie',
                    });
                  }
                }}
              >
                <Ionicons name="information-circle-outline" size={22} color="white" />
                <Text style={styles.optionText}>Info & More</Text>
              </Pressable>

              {/* Remove from Continue Watching */}
              <Pressable 
                style={styles.optionRow} 
                onPress={async () => {
                  closeOptions();
                  if (selectedProfile && selectedItem) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    await WatchHistoryService.removeFromHistory(
                      selectedProfile.id, 
                      selectedItem.id || selectedItem.item?.id
                    );
                  }
                }}
              >
                <Ionicons name="trash-outline" size={22} color="#E50914" />
                <Text style={[styles.optionText, { color: '#E50914' }]}>Remove from Continue Watching</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
});
