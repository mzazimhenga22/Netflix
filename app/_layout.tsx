import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  Dimensions, 
  ActivityIndicator, 
  Image, 
  StyleSheet,
  View
} from 'react-native';
import Animated, { 
  useSharedValue, 
  withSequence, 
  withTiming, 
  withDelay, 
  Easing, 
  runOnJS, 
  useAnimatedStyle 
} from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SplashAnimation } from '../components/SplashAnimation';
import { ProfileProvider } from '../context/ProfileContext';

const { width, height } = Dimensions.get('window');

/**
 * GlobalGhostAvatar
 * Handles the cinematic transition from the "Who's Watching?" screen
 * to the Home screen by animating the selected profile's avatar.
 */
function GlobalGhostAvatar({ profile, layout, onComplete }: { profile: any, layout: any, onComplete: () => void }) {
  const top = useSharedValue(layout.y);
  const left = useSharedValue(layout.x);
  const scale = useSharedValue(1);
  const spinnerOpacity = useSharedValue(0);

  useEffect(() => {
    const centerX = width / 2 - (layout.width || 100) / 2;
    const centerY = height / 2 - (layout.height || 100) / 2;
    
    // Precise target: Home screen header avatar (Top-Right)
    const targetX = width - 40 - (layout.width || 100) / 2;
    const targetY = 50 - (layout.height || 100) / 2;

    const cinematicEasing = Easing.bezier(0.4, 0, 0.2, 1);

    top.value = withSequence(
      withTiming(centerY, { duration: 500, easing: cinematicEasing }),
      withDelay(300, withTiming(targetY, { duration: 700, easing: cinematicEasing }))
    );

    left.value = withSequence(
      withTiming(centerX, { duration: 500, easing: cinematicEasing }),
      withDelay(300, withTiming(targetX, { duration: 700, easing: cinematicEasing }))
    );

    scale.value = withSequence(
      withTiming(1.5, { duration: 500, easing: cinematicEasing }),
      withDelay(300, withTiming(0.28, { duration: 700, easing: cinematicEasing }, (finished?: boolean) => {
        if (finished) {
          runOnJS(onComplete)();
        }
      }))
    );

    spinnerOpacity.value = withSequence(
      withDelay(200, withTiming(1, { duration: 250 })),
      withDelay(400, withTiming(0, { duration: 200 }))
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    top: top.value,
    left: left.value,
    transform: [{ scale: scale.value }],
    position: 'absolute',
    width: layout.width || 100,
    height: layout.height || 100,
    zIndex: 9999,
  }));

  const spinnerStyle = useAnimatedStyle(() => ({
    opacity: spinnerOpacity.value,
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  }));

  return (
    <Animated.View style={animatedStyle} pointerEvents="none">
      <Image source={profile.avatar} style={{ width: '100%', height: '100%', borderRadius: 10 }} />
      <Animated.View style={spinnerStyle}>
         <ActivityIndicator size="large" color="#e50914" />
      </Animated.View>
    </Animated.View>
  );
}

// Theme Context for dynamic app-wide color matching
export const ThemeContext = createContext({
  themeColor: '#000000',
  setThemeColor: (color: string) => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

// Transition Context for Profile Animation State
export const TransitionContext = createContext({
  startProfileTransition: (profile: any, layout: any) => {},
  isTransitioning: false,
});

export const useTransition = () => useContext(TransitionContext);

/**
 * RootLayout
 * The primary entry point for the Netflix mobile application.
 * Manages contexts, global animations, and navigation routing.
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [showSplash, setShowSplash] = useState(true);
  const [themeColor, setThemeColor] = useState('#000000');
  const [transitionData, setTransitionData] = useState<{ profile: any, layout: any } | null>(null);

  useEffect(() => {
    // initializeDownloads();
  }, []);

  const startProfileTransition = (profile: any, layout: any) => {
    setTransitionData({ profile, layout });
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'black' }}>
      <ProfileProvider>
        <TransitionContext.Provider value={{ 
          startProfileTransition,
          isTransitioning: transitionData !== null
        }}>
          <ThemeContext.Provider value={{ themeColor, setThemeColor }}>
            <BottomSheetModalProvider>
              <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="profiles" />
                <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="movie/[id]" />
              </Stack>
              <StatusBar style="light" />
            </ThemeProvider>
            
            {showSplash && (
              <SplashAnimation onFinish={() => setShowSplash(false)} />
            )}
            
            {transitionData && (
              <GlobalGhostAvatar 
                profile={transitionData.profile} 
                layout={transitionData.layout} 
                onComplete={() => setTransitionData(null)} 
              />
            )}
          </BottomSheetModalProvider>
        </ThemeContext.Provider>
        </TransitionContext.Provider>
      </ProfileProvider>
    </GestureHandlerRootView>
  );
}
