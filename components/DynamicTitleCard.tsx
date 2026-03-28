import React from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, { 
  useAnimatedStyle, 
  withSpring, 
  useSharedValue,
  SharedValue,
} from 'react-native-reanimated';
const AnimatedImage = Animated.createAnimatedComponent(Image);
import { COLORS } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');
const POSTER_WIDTH = width * 0.28;
const POSTER_HEIGHT = POSTER_WIDTH * 1.5;

const LANDSCAPE_WIDTH = width * 0.35;
const LANDSCAPE_HEIGHT = LANDSCAPE_WIDTH * 1.4;

const SQUARE_SIZE = width * 0.28;

interface DynamicTitleCardProps {
  item: {
    id: string;
    title: string;
    imageUrl: string;
    synopsis?: string;
    type?: 'movie' | 'tv' | 'game';
  };
  variant?: 'poster' | 'landscape' | 'square';
  tiltX?: SharedValue<number>;
  tiltY?: SharedValue<number>;
  index?: number;
  isTop10?: boolean;
  isOriginal?: boolean;
  isRecentlyAdded?: boolean;
  isGame?: boolean;
  isWatchHistory?: boolean;
}

const DynamicTitleCardComponent = ({ item, variant = 'poster', tiltX, tiltY, index, isTop10, isOriginal, isRecentlyAdded, isGame, isWatchHistory }: DynamicTitleCardProps) => {
  const router = useRouter();
  const isLandscape = variant === 'landscape';
  const isSquare = variant === 'square';
  const baseWidth = isSquare ? SQUARE_SIZE : (isLandscape ? LANDSCAPE_WIDTH : POSTER_WIDTH);
  const cardWidth = isTop10 ? baseWidth + 40 : baseWidth;
  const cardHeight = isSquare ? SQUARE_SIZE : (isLandscape ? LANDSCAPE_HEIGHT : POSTER_HEIGHT);

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
    scale.value = withSpring(0.95, { damping: 15, stiffness: 300 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handlePressOut = React.useCallback(() => {
    zIndex.value = 0;
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  }, []);

  const handlePress = React.useCallback(() => {
    router.push({
      pathname: "/movie/[id]",
      params: { id: item.id, type: item.type || 'movie' }
    });
  }, [item.id, item.type, router]);

  return (
    <Animated.View style={[
      styles.container, 
      { width: cardWidth, height: cardHeight },
      animatedStyle,
      isTop10 && styles.top10Container,
      isSquare && { borderRadius: 16 }
    ]}>
      {isTop10 && index !== undefined && (
        <View style={styles.top10NumberWrapper}>
          <Text style={styles.top10NumberText}>{index + 1}</Text>
        </View>
      )}
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        style={[styles.pressable, isTop10 && { width: POSTER_WIDTH, position: 'absolute', right: 0, height: '100%' }]}
      >
        <AnimatedImage 
          source={{ uri: item.imageUrl }} 
          style={styles.image} 
          contentFit="cover"
          sharedTransitionTag={`movie-image-${item.id}`}
        />

        {isOriginal && (
          <View style={styles.netflixBadge}>
            <Image 
              source={require('../assets/images/netflix-n-logo.svg')} 
              style={styles.nBadgeImage} 
              contentFit="contain"
            />
          </View>
        )}

        {isRecentlyAdded && !isTop10 && !isLandscape && (
          <View style={styles.recentlyAddedBadge}>
            <Text style={styles.recentlyAddedText}>Recently Added</Text>
          </View>
        )}
        
        {(isLandscape || isWatchHistory) && (
          <View style={[styles.cardOverlay, isLandscape && styles.landscapeOverlay]}>
            {isLandscape && (
              <Pressable 
                style={styles.playCircle}
                onPress={(e) => {
                  e.stopPropagation();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                  router.push({ pathname: "/movie/[id]", params: { id: item.id, type: item.type || 'movie', autoplay: 'true' } });
                }}
              >
                <Ionicons name="play" size={20} color="white" style={{ marginLeft: 2 }} />
              </Pressable>
            )}
            
            <View style={[styles.cardFooter, isWatchHistory && !isLandscape && styles.posterFooter]}>
              {isLandscape && (
                <View style={styles.progressBarBackground}>
                  <View style={[styles.progressBar, { width: '40%' }]} />
                </View>
              )}
              <View style={styles.cardControls}>
                <View style={styles.leftControls}>
                   <Pressable style={styles.controlBtn} onPress={(e) => {
                     e.stopPropagation();
                     Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                     router.push({ pathname: "/movie/[id]", params: { id: item.id, type: item.type || 'movie', autoplay: 'true' } });
                   }}>
                     <Ionicons name="play-circle" size={24} color="white" />
                   </Pressable>
                   <Pressable style={styles.controlBtn} onPress={(e) => { e.stopPropagation(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}>
                     <Ionicons name="add-outline" size={24} color="white" />
                   </Pressable>
                </View>

                <Pressable style={styles.infoBtn} onPress={(e) => { e.stopPropagation(); handlePress(); }}>
                  <Ionicons name="information-circle-outline" size={24} color="white" />
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
};

export const DynamicTitleCard = React.memo(DynamicTitleCardComponent);

const styles = StyleSheet.create({
  container: {
    marginRight: 8,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  pressable: {
    flex: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  top10Container: {
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  top10NumberWrapper: {
    position: 'absolute',
    left: -15,
    bottom: -25,
    zIndex: 1,
  },
  top10NumberText: {
    fontSize: 140,
    fontWeight: '900',
    color: COLORS.background,
    textShadowColor: 'rgba(255,255,255,0.7)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 2,
    letterSpacing: -10,
  },
  netflixBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 5,
  },
  nBadgeImage: {
    width: 14,
    height: 22,
  },
  recentlyAddedBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#E50914',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomLeftRadius: 8,
    zIndex: 5,
  },
  recentlyAddedText: {
    color: 'white',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  landscapeOverlay: {
    backgroundColor: 'rgba(0,0,0,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  posterFooter: {
    backgroundColor: 'transparent',
    paddingBottom: 4,
  },
  progressBarBackground: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    width: '100%',
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.primary,
  },
  cardControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  leftControls: {
    flexDirection: 'row',
    gap: 12,
  },
  controlBtn: {
    opacity: 0.9,
  },
  infoBtn: {
    opacity: 0.9,
  }
});
