import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions, Text } from 'react-native';
import { Image } from 'expo-image';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  Easing, 
  withSequence 
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

interface HeroSkeletonProps {
  pageColor?: string;
}

export default function HeroSkeleton({ pageColor = '#000', style }: HeroSkeletonProps & { style?: any }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <View style={[styles.container, { backgroundColor: pageColor }, style]}>
      {/* Main Banner Card */}
      <View style={styles.bannerCard}>
        {/* Placeholder for the background image/video */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.bannerPlaceholder, animatedStyle]} />
        
        {/* Overlays */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.8)']}
          style={StyleSheet.absoluteFill}
        />

        {/* Content Section */}
        <View style={styles.content}>
          {/* Logo + Series Badge */}
          <View style={styles.badgeRow}>
             <Image 
                source={require('../assets/images/netflix-n-logo.svg')}
                style={styles.logo}
                contentFit="contain"
             />
             <Animated.View style={[styles.seriesText, animatedStyle]} />
          </View>

          {/* Title Area */}
          <Animated.View style={[styles.title, animatedStyle]} />
          <Animated.View style={[styles.titleSecondary, animatedStyle]} />

          {/* Metadata Line */}
          <View style={styles.metaRow}>
             <Animated.View style={[styles.metaPill, animatedStyle, { width: 120 }]} />
             <Animated.View style={[styles.metaPill, animatedStyle, { width: 60 }]} />
             <Animated.View style={[styles.metaPill, animatedStyle, { width: 80 }]} />
             <Animated.View style={[styles.metaPill, animatedStyle, { width: 50 }]} />
          </View>
        </View>

        {/* Bottom Right Badges Area */}
        <View style={styles.bottomRightBadges}>
           <Animated.View style={[styles.badgePill, animatedStyle, { width: 140 }]} />
           <Animated.View style={[styles.badgePill, animatedStyle, { width: 220 }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 600, // Matching the proportion in the image
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 20,
  },
  bannerCard: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  bannerPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  content: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    paddingLeft: 40,
    paddingBottom: 40,
    zIndex: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 15,
  },
  logo: {
    width: 24,
    height: 36,
  },
  seriesText: {
    width: 100,
    height: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
  },
  title: {
    width: 400,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 6,
    marginBottom: 8,
  },
  titleSecondary: {
    width: 250,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 6,
    marginBottom: 20,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metaPill: {
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
  },
  bottomRightBadges: {
    position: 'absolute',
    bottom: 40,
    right: 40,
    flexDirection: 'row',
    gap: 12,
  },
  badgePill: {
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
  },
});
