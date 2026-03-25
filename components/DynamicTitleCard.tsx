import React from 'react';
import { View, StyleSheet, Pressable, Image, Dimensions } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  withSpring, 
  useSharedValue,
  SharedValue
} from 'react-native-reanimated';
import { COLORS } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');
const POSTER_WIDTH = width * 0.28;
const POSTER_HEIGHT = POSTER_WIDTH * 1.5;

const LANDSCAPE_WIDTH = width * 0.35;
const LANDSCAPE_HEIGHT = LANDSCAPE_WIDTH * 1.4;

interface DynamicTitleCardProps {
  item: {
    id: string;
    title: string;
    imageUrl: string;
    synopsis?: string;
    type?: 'movie' | 'tv';
  };
  variant?: 'poster' | 'landscape';
  tiltX?: SharedValue<number>;
  tiltY?: SharedValue<number>;
}

const DynamicTitleCardComponent = ({ item, variant = 'poster', tiltX, tiltY }: DynamicTitleCardProps) => {
  const router = useRouter();
  const isLandscape = variant === 'landscape';
  const cardWidth = isLandscape ? LANDSCAPE_WIDTH : POSTER_WIDTH;
  const cardHeight = isLandscape ? LANDSCAPE_HEIGHT : POSTER_HEIGHT;

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
      pathname: `/movie/${item.id}`,
      params: { type: item.type || 'movie' }
    });
  }, [item.id, item.type, router]);

  return (
    <Animated.View style={[
      styles.container, 
      { width: cardWidth, height: cardHeight },
      animatedStyle
    ]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        style={styles.pressable}
      >
        <Animated.Image 
          source={{ uri: item.imageUrl }} 
          style={styles.image} 
          resizeMode="cover"
          sharedTransitionTag={`movie-image-${item.id}`}
        />
        
        {isLandscape && (
          <View style={styles.landscapeOverlay}>
            <View style={styles.playCircle}>
              <Ionicons name="play" size={20} color="white" style={{ marginLeft: 2 }} />
            </View>
            
            <View style={styles.cardFooter}>
              <View style={styles.progressBarBackground}>
                <View style={[styles.progressBar, { width: '40%' }]} />
              </View>
              <View style={styles.cardControls}>
                <Ionicons name="information-circle-outline" size={22} color="white" />
                <Ionicons name="ellipsis-vertical" size={18} color="white" />
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
    borderRadius: 8,
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
  landscapeOverlay: {
    ...StyleSheet.absoluteFillObject,
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
    backgroundColor: 'rgba(0,0,0,0.6)',
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
    paddingHorizontal: 10,
    paddingVertical: 6,
  }
});
