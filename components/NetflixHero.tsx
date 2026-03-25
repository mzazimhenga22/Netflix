import React from 'react';
import { View, Text, StyleSheet, Image, Dimensions, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import Animated, { 
  useAnimatedStyle, 
  SharedValue
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');
const POSTER_WIDTH = width * 0.9;
const POSTER_HEIGHT = POSTER_WIDTH * 1.35;

interface HeroProps {
  item: {
    id: string;
    title: string;
    imageUrl: string;
    categories: string[];
  };
  onPress?: () => void;
  tiltX?: SharedValue<number>;
  tiltY?: SharedValue<number>;
  shineX?: SharedValue<number>;
}

const NetflixHeroComponent = ({ item, onPress, tiltX, tiltY, shineX }: HeroProps) => {
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { perspective: 1000 },
        { rotateX: `${tiltX?.value ?? 0}deg` },
        { rotateY: `${tiltY?.value ?? 0}deg` },
      ],
    };
  });

  const shineStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: shineX?.value ?? -width },
        { skewX: '-20deg' }
      ],
    };
  });

  return (
    <View style={styles.outerContainer}>
      <Pressable onPress={onPress} style={{ width: POSTER_WIDTH, height: POSTER_HEIGHT }}>
        <Animated.View style={[styles.posterContainer, animatedStyle]}>
          <Animated.Image 
            source={{ uri: item.imageUrl }} 
            style={styles.image} 
            resizeMode="cover"
            sharedTransitionTag={`movie-image-${item.id}`}
          />

          {/* Dynamic Glare/Shine Effect */}
          <Animated.View style={[styles.shine, shineStyle]}>
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.15)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.85)']}
            style={styles.gradient}
          />

          <View style={styles.overlayContent}>
            {/* Contextual Callout */}
            <View style={styles.top10Badge}>
              <View style={styles.top10Square}>
                <Text style={styles.top10Text}>TOP</Text>
                <Text style={styles.top10Num}>10</Text>
              </View>
              <Text style={styles.top10Rank}>#1 in TV Shows Today</Text>
            </View>

            <Text style={styles.title} numberOfLines={2}>{item.title.toUpperCase()}</Text>
            <Text style={styles.categories}>{item.categories.join(' • ')}</Text>

            <View style={styles.actions}>
              <Pressable style={styles.playButton} onPress={onPress}>
                <Ionicons name="play" size={20} color="black" />
                <Text style={styles.playButtonText}>Play</Text>
              </Pressable>
              <Pressable style={styles.listButton}>
                <Ionicons name="add" size={24} color="white" />
                <Text style={styles.listButtonText}>My List</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
};

export const NetflixHero = React.memo(NetflixHeroComponent);

const styles = StyleSheet.create({
  outerContainer: {
    alignItems: 'center',
    marginVertical: SPACING.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  posterContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#141414',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  shine: {
    position: 'absolute',
    top: -100,
    bottom: -100,
    width: width * 0.6,
    zIndex: 5,
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
    zIndex: 6,
  },
  overlayContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: SPACING.lg,
    alignItems: 'center',
    zIndex: 10,
  },
  top10Badge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  top10Square: {
    width: 24,
    height: 24,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  top10Text: {
    color: 'white',
    fontSize: 5,
    fontWeight: '900',
    lineHeight: 6,
  },
  top10Num: {
    color: 'white',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 14,
  },
  top10Rank: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    textShadowColor: 'black',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  title: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: SPACING.xs,
    letterSpacing: -1,
    textShadowColor: 'black',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  categories: {
    color: COLORS.text,
    fontSize: 12,
    marginBottom: SPACING.md,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    width: '100%',
  },
  playButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.text,
    paddingVertical: 10,    borderRadius: 6,
    alignItems: 'center',    justifyContent: 'center',
    gap: 4,
  },
  playButtonText: {
    color: COLORS.background,
    fontWeight: 'bold',
    fontSize: 15,
  },
  listButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(51, 51, 51, 0.9)',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',    justifyContent: 'center',
    gap: 4,
  },
  listButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 15,
  }
});
