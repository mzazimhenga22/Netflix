import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, FlatList, Dimensions, Text, Pressable, Image } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { COLORS, SPACING } from '../constants/theme';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring, 
  withRepeat, 
  withSequence, 
  withTiming,
  FadeInRight,
  FadeIn
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

const { height, width } = Dimensions.get('window');
// Full screen for clips
const ITEM_HEIGHT = height; 

interface VideoItemProps {
  item: {
    id: string;
    videoUrl: string;
    title: string;
    description: string;
    showId?: string;
    type?: string;
    rating?: string;
  };
  isActive: boolean;
}

const VideoItem = React.memo(({ item, isActive }: VideoItemProps) => {
  const router = useRouter();
  const [isMuted, setIsMuted] = useState(false);
  
  const player = useVideoPlayer(item.videoUrl, (p) => {
    p.loop = true;
    p.muted = isMuted;
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [liked, setLiked] = useState(false);
  
  const progress = useSharedValue(0);

  // Auto-play when active
  useEffect(() => {
    if (isActive) {
      player.play();
      setIsPlaying(true);
    } else {
      player.pause();
      setIsPlaying(false);
    }
  }, [isActive, player]);

  // Sync progress bar
  useEffect(() => {
    if (isActive) {
      const interval = setInterval(() => {
        if (player.duration > 0) {
          progress.value = (player.currentTime / player.duration) * 100;
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isActive, player]);

  // Sync mute state
  useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  const togglePlay = () => {
    if (player.playing) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleLike = () => {
    setLiked(!liked);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));

  const handleGoToDetails = () => {
    if (item.showId) {
      router.push({
        pathname: `/movie/${item.showId}`,
        params: { type: item.type || 'movie' }
      });
    }
  };

  return (
    <View style={styles.itemContainer}>
      <Pressable onPress={togglePlay} style={styles.videoPressable}>
        <VideoView
          player={player}
          style={styles.video}
          contentFit="cover"
          nativeControls={false}
        />
        
        {/* Cinematic Overlays */}
        <LinearGradient
          colors={['rgba(0,0,0,0.4)', 'transparent', 'transparent', 'rgba(0,0,0,0.8)']}
          style={StyleSheet.absoluteFill}
        />

        {!isPlaying && (
          <Animated.View entering={FadeIn} style={styles.playIconOverlay}>
            <Ionicons name="play" size={80} color="white" style={{ opacity: 0.6 }} />
          </Animated.View>
        )}
      </Pressable>

      {/* Interaction Rail (Right Side) */}
      <View style={styles.rightRail}>
        <Animated.View entering={FadeInRight.delay(200)}>
          <Pressable style={styles.railAction} onPress={handleLike}>
            <Ionicons 
              name={liked ? "heart" : "heart-outline"} 
              size={32} 
              color={liked ? COLORS.primary : "white"} 
            />
            <Text style={styles.railLabel}>{liked ? 'Liked' : 'LOL'}</Text>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInRight.delay(300)}>
          <Pressable style={styles.railAction}>
            <Ionicons name="add" size={35} color="white" />
            <Text style={styles.railLabel}>My List</Text>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInRight.delay(400)}>
          <Pressable style={styles.railAction}>
            <MaterialCommunityIcons name="share-variant" size={30} color="white" />
            <Text style={styles.railLabel}>Share</Text>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInRight.delay(500)}>
          <Pressable 
            style={styles.playFunnel} 
            onPress={handleGoToDetails}
          >
            <Ionicons name="play" size={24} color="black" />
            <Text style={styles.playFunnelText}>Play</Text>
          </Pressable>
        </Animated.View>
      </View>

      {/* Content Info (Bottom Left) */}
      <View style={styles.infoContainer}>
        <View style={styles.badgeRow}>
          <View style={styles.nBadge}>
            <Text style={styles.nBadgeText}>N</Text>
          </View>
          <Text style={styles.seriesText}>SERIES</Text>
        </View>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.description} numberOfLines={2}>
          {item.description}
        </Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <Animated.View style={[styles.progressBar, progressStyle]} />
      </View>
    </View>
  );
});

VideoItem.displayName = 'VideoItem';

export function VerticalVideoFeed({ data }: { data: any[] }) {
  const [activeIndex, setActiveIndex] = useState(0);

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index);
    }
  }, []);

  const viewabilityConfig = {
    itemVisiblePercentThreshold: 50,
  };

  const [isScreenFocused, setIsScreenFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      return () => setIsScreenFocused(false);
    }, [])
  );

  return (
    <FlatList
      data={data}
      renderItem={({ item, index }) => (
        <VideoItem item={item} isActive={index === activeIndex && isScreenFocused} />
      )}
      keyExtractor={(item) => item.id}
      pagingEnabled
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      snapToAlignment="start"
      snapToInterval={ITEM_HEIGHT}
      decelerationRate="fast"
      style={styles.feedList}
    />
  );
}

const styles = StyleSheet.create({
  feedList: {
    backgroundColor: 'black',
  },
  itemContainer: {
    height: ITEM_HEIGHT,
    width: width,
    backgroundColor: 'black',
  },
  videoPressable: {
    flex: 1,
  },
  video: {
    flex: 1,
  },
  playIconOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  rightRail: {
    position: 'absolute',
    right: 12,
    bottom: 100, // Above tab bar
    alignItems: 'center',
    gap: 20,
    zIndex: 10,
  },
  railAction: {
    alignItems: 'center',
    gap: 4,
  },
  railLabel: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    textShadowColor: 'black',
    textShadowRadius: 4,
  },
  playFunnel: {
    backgroundColor: 'white',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  playFunnelText: {
    color: 'black',
    fontSize: 10,
    fontWeight: '900',
    marginTop: -2,
  },
  infoContainer: {
    position: 'absolute',
    bottom: 40,
    left: 16,
    right: 80,
    zIndex: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  nBadge: {
    width: 18,
    height: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 2,
  },
  nBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '900',
  },
  seriesText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    opacity: 0.8,
  },
  title: {
    color: 'white',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 6,
    textShadowColor: 'black',
    textShadowRadius: 4,
  },
  description: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    lineHeight: 18,
    textShadowColor: 'black',
    textShadowRadius: 4,
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.primary,
  }
});
