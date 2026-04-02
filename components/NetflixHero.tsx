import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useProfile } from '../context/ProfileContext';
import { MyListService } from '../services/MyListService';
import * as Haptics from 'expo-haptics';
import Animated, { 
  useAnimatedStyle, 
  SharedValue,
  interpolate,
  Extrapolate
} from 'react-native-reanimated';

// Removed static Dimensions measurement to prevent orientation-change distortion;
// using useWindowDimensions() inside component instead.
const AnimatedImage = Animated.createAnimatedComponent(Image);

const styles = StyleSheet.create({
  outerContainer: {
    alignItems: 'center',
    marginVertical: SPACING.lg,
    zIndex: 1,
  },
  posterContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: '#141414',
    zIndex: 2,
  },
  imageLayer: {
    width: '100%',
    height: '100%',
    zIndex: 1,
  },
  image: {
    width: '120%', // Wider to allow for parallax movement without edges showing
    height: '120%',
    left: '-10%',
    top: '-10%',
  },
  shine: {
    position: 'absolute',
    zIndex: 5,
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
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
  seriesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  nSeriesLogoImage: {
    width: 18,
    height: 28,
  },
  seriesText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 4,
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
    backgroundColor: 'white',
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',    
    justifyContent: 'center',
    gap: 8,
  },
  playButtonText: {
    color: 'black',
    fontWeight: 'bold',
    fontSize: 16,
  },
  listButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(42, 42, 42, 0.8)',
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',    
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)'
  },
  listButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  }
});

interface HeroProps {
  item: {
    id: string;
    title: string;
    imageUrl: string;
    categories: string[];
    type?: string;
  };
  onPress?: () => void;
  tiltX?: SharedValue<number>;
  tiltY?: SharedValue<number>;
  shineX?: SharedValue<number>;
  sensor?: any; // Reanimated sensor
  style?: any;
}

const NetflixHeroComponent = ({ item, onPress, tiltX, tiltY, shineX, sensor, style }: HeroProps) => {
  const { width, height } = useWindowDimensions();
  const POSTER_WIDTH = width * 0.9;
  const POSTER_HEIGHT = POSTER_WIDTH * 1.35;
  
  const { selectedProfile } = useProfile();
  const [isInMyList, setIsInMyList] = useState(false);

  useEffect(() => {
    if (!selectedProfile || !item?.id) return;
    
    MyListService.isInList(selectedProfile.id, item.id.toString()).then(setIsInMyList);

    const unsubscribe = MyListService.subscribeToList(selectedProfile.id, (items) => {
      const exists = items.some(i => i.id.toString() === item.id.toString());
      setIsInMyList(exists);
    });

    return () => unsubscribe();
  }, [selectedProfile, item?.id]);

  const handleToggleMyList = async () => {
    if (!selectedProfile || !item) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newStatus = !isInMyList;
    setIsInMyList(newStatus);
    
    const wasAdded = await MyListService.toggleItem(selectedProfile.id, {
      id: item.id.toString(),
      title: item.title,
      poster_path: item.imageUrl,
      backdrop_path: item.imageUrl,
      type: item.type || 'movie'
    });
    
    if (typeof wasAdded === 'boolean') {
      setIsInMyList(wasAdded);
    }
  };

  const animatedStyle = useAnimatedStyle(() => {
    const sensorX = sensor ? sensor.sensor.value.pitch * 15 : 0;
    const sensorY = sensor ? sensor.sensor.value.roll * 15 : 0;
    
    const tx = (tiltX?.value ?? 0) + sensorX;
    const ty = (tiltY?.value ?? 0) + sensorY;
    
    return {
      transform: [
        { perspective: 1200 },
        { rotateX: `${tx}deg` },
        { rotateY: `${ty}deg` },
      ],
    };
  });

  const contentAnimatedStyle = useAnimatedStyle(() => {
    const sensorX = sensor ? sensor.sensor.value.pitch * 15 : 0;
    const sensorY = sensor ? sensor.sensor.value.roll * 15 : 0;
    
    const tx = (tiltX?.value ?? 0) + sensorX;
    const ty = (tiltY?.value ?? 0) + sensorY;
    
    return {
      transform: [
        { perspective: 1200 },
        { translateX: ty * 0.8 },
        { translateY: -tx * 0.8 },
        { scale: 1.05 },
      ],
    };
  });

  const imageAnimatedStyle = useAnimatedStyle(() => {
    const sensorX = sensor ? sensor.sensor.value.pitch * 15 : 0;
    const sensorY = sensor ? sensor.sensor.value.roll * 15 : 0;
    
    const tx = (tiltX?.value ?? 0) + sensorX;
    const ty = (tiltY?.value ?? 0) + sensorY;
    
    return {
      transform: [
        { perspective: 1200 },
        { scale: 1.15 },
        { translateX: -ty * 0.3 },
        { translateY: tx * 0.3 },
      ],
    };
  });

  const shineStyle = useAnimatedStyle(() => {
    const sY = sensor ? sensor.sensor.value.roll * 50 : 0;
    const tx = tiltX?.value ?? 0;
    const ty = tiltY?.value ?? 0;
    
    return {
      opacity: (tx !== 0 || ty !== 0 || sY !== 0) ? 0.8 : 0.4,
      transform: [
        { translateX: (shineX?.value ?? -width) + sY },
        { skewX: '-25deg' }
      ],
    };
  });

  return (
    <Animated.View style={[styles.outerContainer, style]}>
      <Pressable onPress={onPress} style={{ width: POSTER_WIDTH, height: POSTER_HEIGHT }}>
        <Animated.View 
          style={[styles.posterContainer, animatedStyle]}
          renderToHardwareTextureAndroid={true}
        >
          <Animated.View style={[styles.imageLayer, imageAnimatedStyle]}>
            <AnimatedImage 
              source={{ uri: item.imageUrl }} 
              style={styles.image} 
              contentFit="cover"
              priority="high"
              sharedTransitionTag={`movie-image-${item.id}`}
            />
          </Animated.View>

          <Animated.View style={[styles.shine, shineStyle, { top: -height, bottom: -height, width: width * 0.8 }]}>
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.25)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.9)']}
            style={styles.gradient}
          />

          <Animated.View style={[styles.overlayContent, contentAnimatedStyle]}>
            <View style={styles.seriesRow}>
              <Image 
                source={require('../assets/images/netflix-n-logo.svg')} 
                style={styles.nSeriesLogoImage} 
                contentFit="contain"
              />
              <Text style={styles.seriesText}>S E R I E S</Text>
            </View>

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
              <Pressable style={styles.listButton} onPress={handleToggleMyList}>
                <Ionicons name={isInMyList ? "checkmark" : "add"} size={24} color="white" />
                <Text style={styles.listButtonText}>My List</Text>
              </Pressable>
            </View>
          </Animated.View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
};

export const NetflixHero = React.memo(NetflixHeroComponent);
