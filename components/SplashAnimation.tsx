import React, { useEffect } from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withSequence, 
  withDelay,
  Easing,
  runOnJS
} from 'react-native-reanimated';

const AnimatedImage = Animated.createAnimatedComponent(Image);
const { width, height } = Dimensions.get('window');

export function SplashAnimation({ onFinish }: { onFinish: () => void }) {
  const scale = useSharedValue(10);
  const opacity = useSharedValue(0);
  const bgOpacity = useSharedValue(1);

  useEffect(() => {
    // 1. Fade in the N logo while scaling it down to normal size
    opacity.value = withTiming(1, { duration: 600 });
    scale.value = withSequence(
      withTiming(1, { duration: 800, easing: Easing.out(Easing.exp) }),
      // 2. Wait
      withDelay(1200, 
        // 3. Zoom extremely close into the screen to reveal the app
        withTiming(40, { duration: 700, easing: Easing.in(Easing.poly(4)) })
      )
    );
    
    // Fade out the black background during the final zoom
    bgOpacity.value = withDelay(
      2200, 
      withTiming(0, { duration: 400 }, (finished) => {
        if (finished) {
          runOnJS(onFinish)();
        }
      })
    );
  }, []);

  const animatedLogoStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const animatedBgStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
  }));

  return (
    <Animated.View style={[styles.container, animatedBgStyle]}>
      <AnimatedImage 
        // Use the local Netflix "N" icon SVG
        source={require('../assets/images/netflix-n-logo.svg')}
        style={[styles.logo, animatedLogoStyle]} 
        contentFit="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
  },
  logo: {
    width: 120,
    height: 120,
  }
});
