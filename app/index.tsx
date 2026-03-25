import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withSequence, 
  withDelay,
  runOnJS
} from 'react-native-reanimated';
import { COLORS } from '../constants/theme';

const { width } = Dimensions.get('window');

export default function SplashScreen() {
  const router = useRouter();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const startApp = () => {
      router.replace('/login');
    };

    // Animation Sequence: Fade in -> Zoom in (Impact) -> Transition
    opacity.value = withTiming(1, { duration: 500 });
    scale.value = withSequence(
      withDelay(500, withTiming(1.2, { duration: 1000 })),
      withTiming(15, { duration: 600 }, () => {
        runOnJS(startApp)();
      })
    );
  }, []);

  const logoStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ scale: scale.value }],
    };
  });

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <Animated.Image 
        source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix_icon.svg' }}
        style={[styles.logo, logoStyle]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: width * 0.4,
    height: width * 0.4,
  },
});
