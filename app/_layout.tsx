import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { createContext, useContext, useState, useEffect, } from 'react';
import { 
  Dimensions, 
  ActivityIndicator, 
  Image, 
  StyleSheet,
  useWindowDimensions,
  View,
  NativeModules
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
import * as SplashScreen from 'expo-splash-screen';
import { SplashAnimation } from '../components/SplashAnimation';
import { ProfileProvider } from '../context/ProfileContext';
import { useProfile } from '../context/ProfileContext';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

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
  const [themeColor, setThemeColor] = useState('#000000');
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    // Hide the native splash screen immediately to let our custom Animation take over
    SplashScreen.hideAsync();
  }, []);

  const startProfileTransition = (profile: any, layout: any) => {
    setIsTransitioning(true);
    triggerNativeProfileTransition(profile, layout);
    // Reset transition state after animation approximate duration
    setTimeout(() => setIsTransitioning(false), 1200);
  };

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'black' }}>
        <ProfileProvider>
        <TransitionContext.Provider value={{ 
          startProfileTransition,
          isTransitioning
        }}>
          <ThemeContext.Provider value={{ themeColor, setThemeColor }}>
            <BottomSheetModalProvider>
              <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                <NavigationGate>
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="profiles" />
                    <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="movie/[id]" />
                  </Stack>
                </NavigationGate>
                <StatusBar style="light" />
            </ThemeProvider>
          </BottomSheetModalProvider>
        </ThemeContext.Provider>
        </TransitionContext.Provider>
        </ProfileProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

function NavigationGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const { selectedProfile, isLoading } = useProfile();

  useEffect(() => {
    if (isLoading) return;

    const [rootSegment] = segments;
    const needsProfile = [
      '(tabs)',
      'movie',
      'search',
      'notifications',
      'my-list',
      'downloads',
      'account',
      'devices',
      'app-settings',
      'games',
    ].includes(rootSegment ?? '');

    if (needsProfile && !selectedProfile) {
      router.replace('/profiles');
    }
  }, [isLoading, router, segments, selectedProfile]);

  return <>{children}</>;
}

// Native helper logic to start the high-performance floating transition
function triggerNativeProfileTransition(profile: any, layout: any) {
  const { ProfileTransitionModule } = NativeModules;
  if (!ProfileTransitionModule) return;

  const { width, height } = Dimensions.get('window');
  const tabCount = 5;
  const targetSize = 32;
  const tabBarHeight = 60;
  const tabAvatarSize = 24;
  const tabAvatarVerticalOffset = 14;

  // Target the actual "My Netflix" avatar tab.
  // The previous values assumed a 4-tab layout, so the floating avatar
  // faded toward the center instead of landing in the far-right slot.
  const myNetflixTabCenterX = width * ((tabCount - 0.5) / tabCount);
  const targetX = myNetflixTabCenterX - (targetSize / 2);
  const targetY = height - tabBarHeight + tabAvatarVerticalOffset - ((targetSize - tabAvatarSize) / 2);

  ProfileTransitionModule.startFloatingAnimation({
    startX: layout.x,
    startY: layout.y,
    startSize: layout.width || 100,
    targetX,
    targetY,
    targetSize,
    avatarId: profile.avatarId
  });
}
