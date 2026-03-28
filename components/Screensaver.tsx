import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, { 
  FadeIn, 
  FadeOut, 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  Easing,
  withSequence,
  withDelay,
  withRepeat
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchTrending, getBackdropUrl } from '../services/tmdb';

const { width, height } = Dimensions.get('window');

interface ScreensaverProps {
  onDismiss: () => void;
}

export default function Screensaver({ onDismiss }: ScreensaverProps) {
  const [movie, setMovie] = useState<any>(null);
  const [time, setTime] = useState(new Date());
  const scale = useSharedValue(1);

  useEffect(() => {
    async function loadBackdrop() {
      try {
        const trending = await fetchTrending('all');
        if (trending && trending.length > 0) {
          // Pick a random trending item
          const randomIdx = Math.floor(Math.random() * Math.min(20, trending.length));
          setMovie(trending[randomIdx]);
        }
      } catch (e) {
        console.warn(e);
      }
    }
    loadBackdrop();

    // Subtle Ken Burns scale effect
    scale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 30000, easing: Easing.linear }),
        withTiming(1, { duration: 30000, easing: Easing.linear })
      ),
      -1, // Infinite
      true // Reverse
    );

    const clockInterval = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(clockInterval);
  }, []);

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (!movie) return null;

  return (
    <Animated.View entering={FadeIn.duration(2000)} exiting={FadeOut.duration(1000)} style={styles.container}>
      <Animated.View style={[StyleSheet.absoluteFill, animatedImageStyle]}>
        <Image 
          source={{ uri: getBackdropUrl(movie.backdrop_path) }} 
          style={StyleSheet.absoluteFill} 
          contentFit="cover"
        />
      </Animated.View>

      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'transparent', 'rgba(0,0,0,0.8)']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.overlay}>
         <View style={styles.topLeft}>
            <Image 
              source={require('../assets/images/netflix-n-logo.svg')} 
              style={styles.logo} 
              contentFit="contain"
            />
         </View>

         <View style={styles.bottomLeft}>
            <Text style={styles.movieTitle}>{movie.title || movie.name}</Text>
            <Text style={styles.promptText}>Press any button to wake</Text>
         </View>

         <View style={styles.bottomRight}>
            <Text style={styles.clockText}>
              {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
         </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: 'black',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    padding: 60,
    justifyContent: 'space-between',
  },
  topLeft: {
    alignItems: 'flex-start',
  },
  logo: {
    width: 30,
    height: 45,
  },
  bottomLeft: {
    position: 'absolute',
    bottom: 60,
    left: 60,
    maxWidth: '60%',
  },
  movieTitle: {
    color: 'white',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 10,
    textShadowColor: 'black',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  promptText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 1,
  },
  bottomRight: {
    position: 'absolute',
    bottom: 60,
    right: 60,
  },
  clockText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 48,
    fontWeight: '300',
  }
});
