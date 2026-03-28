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

import { auth } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { SubscriptionService } from '../services/SubscriptionService';

export default function SplashScreen() {
  const router = useRouter();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);

  useEffect(() => {
    // Animation Sequence: Fade in -> Zoom in (Impact) -> Transition
    opacity.value = withTiming(1, { duration: 500 });
    scale.value = withSequence(
      withDelay(500, withTiming(1.2, { duration: 1000 })),
      withTiming(15, { duration: 600 }, () => {
        runOnJS(checkAuth)();
      })
    );
  }, []);

  const checkAuth = () => {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        // User is signed in, check subscription
        SubscriptionService.getSubscription().then(sub => {
          if (sub.status === 'active') {
            router.replace('/profiles');
          } else {
            router.replace('/subscription');
          }
        });
      } else {
        // No user is signed in, go to login
        router.replace('/login');
      }
    });
  };

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
