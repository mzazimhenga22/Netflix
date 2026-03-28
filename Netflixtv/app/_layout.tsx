import { useEffect, useState, useCallback, useRef } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { View, StyleSheet, Dimensions, useTVEventHandler } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { FilterProvider } from '../context/FilterContext';
import { ProfileProvider, useProfile } from '../context/ProfileContext';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import Screensaver from '../components/Screensaver';

// Hide native splash immediately — we use our own animated one
SplashScreen.preventAutoHideAsync();
const { width, height } = Dimensions.get('window');

const AnimatedImage = Animated.createAnimatedComponent(Image);

import { auth } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { SubscriptionService, SubscriptionStatus } from '../services/SubscriptionService';
import { Text } from 'react-native';

function RootLayoutContent() {
  const { selectedProfile } = useProfile();
  const router = useRouter();
  const [appIsReady, setAppIsReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);

  // Netflix N Logo Animation (ported from Phone app)
  // Phase 1: Start huge (10×), zoom down to normal
  // Phase 2: Hold for 1.2s
  // Phase 3: Zoom way past camera (40×) to reveal app
  const splashScale = useSharedValue(10);
  const splashOpacity = useSharedValue(0);
  const bgOpacity = useSharedValue(1);

  // Idle Timer for Screensaver (5 minutes = 300000ms)
  const [isIdle, setIsIdle] = useState(false);
  const idleTimer = useRef<NodeJS.Timeout | null>(null);

  const resetIdleTimer = useCallback(() => {
    if (isIdle) setIsIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);

    idleTimer.current = setTimeout(() => {
      setIsIdle(true);
    }, 300000);
  }, [isIdle]);

  useTVEventHandler(() => {
    resetIdleTimer();
  });

  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [resetIdleTimer]);

  const hideSplash = useCallback(() => {
    setShowSplash(false);
  }, []);

  useEffect(() => {
    let subUnsubscribe = () => {};
    
    async function prepare() {
      try {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          if (user) {
            setInitialRoute('/profiles');
            subUnsubscribe();
            subUnsubscribe = SubscriptionService.listenToSubscription((sub) => {
              setSubscription(sub);
            });
          } else {
            setInitialRoute('/');
            setSubscription({ status: 'none' });
            subUnsubscribe();
          }
        });

        // Give auth a moment to resolve
        await new Promise(resolve => setTimeout(resolve, 500));

        // Hide native Expo splash immediately — our animation takes over
        await SplashScreen.hideAsync();

        // Phase 1: Fade in the N logo while zooming from 10× → 1×
        splashOpacity.value = withTiming(1, { duration: 600 });
        splashScale.value = withSequence(
          // Zoom down from 10× to 1× (the dramatic "N appears" effect)
          withTiming(1, { duration: 800, easing: Easing.out(Easing.exp) }),
          // Phase 2: Hold at normal size for 1.2s
          withDelay(1200,
            // Phase 3: Zoom way past the camera to reveal app
            withTiming(40, { duration: 700, easing: Easing.in(Easing.poly(4)) })
          )
        );

        // Fade out the black background during the final zoom
        bgOpacity.value = withDelay(
          2200,
          withTiming(0, { duration: 400 }, (finished) => {
            if (finished) {
              runOnJS(hideSplash)();
            }
          })
        );

        return () => {
          unsubscribe();
          subUnsubscribe();
        };
      } catch (e) {
        console.warn(e);
      } finally {
        setAppIsReady(true);
      }
    }

    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady && initialRoute) {
      if (initialRoute === '/profiles') {
        router.replace('/profiles');
      }
    }
  }, [appIsReady, initialRoute]);

  const animatedLogoStyle = useAnimatedStyle(() => ({
    opacity: splashOpacity.value,
    transform: [{ scale: splashScale.value }],
  }));

  const animatedBgStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
  }));

  if (!appIsReady || !initialRoute) {
    // Show black screen with animated N logo while loading
    return (
      <View style={styles.splashContainer}>
        <AnimatedImage 
          source={require('../assets/images/netflix-n-logo.svg')} 
          style={[styles.splashIcon, animatedLogoStyle]} 
          contentFit="contain"
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="profiles" options={{ animation: 'fade' }} />
        <Stack.Screen name="edit-profile" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="movie/[id]" options={{ presentation: 'modal' }} />
      </Stack>
      
      {/* Subscription Lockdown Overlay */}
      {initialRoute !== '/' && subscription && (subscription.status === 'none' || subscription.status === 'past_due') && (
        <View style={styles.subscribeOverlay}>
          <AnimatedImage 
            source={require('../assets/images/netflix-n-logo.svg')} 
            style={[styles.splashIcon, { marginBottom: 30 }]} 
            contentFit="contain"
          />
          <Text style={styles.subscribeTitle}>Subscription Required</Text>
          <Text style={styles.subscribeText}>
            Your account is currently inactive. Please open the Netflix app on your mobile device to complete your subscription payment.
          </Text>
        </View>
      )}

      {/* Animated Netflix Splash Overlay — fades out to reveal app */}
      {showSplash && (
        <Animated.View style={[styles.splashOverlay, animatedBgStyle]} pointerEvents="none">
          <AnimatedImage 
            source={require('../assets/images/netflix-n-logo.svg')} 
            style={[styles.splashIcon, animatedLogoStyle]} 
            contentFit="contain"
          />
        </Animated.View>
      )}
      
      {/* Global Screensaver Overlay */}
      {isIdle && <Screensaver onDismiss={resetIdleTimer} />}
    </View>
  );
}

export default function RootLayout() {
  return (
    <ProfileProvider>
      <FilterProvider>
        <StatusBar style="light" hidden={false} />
        <RootLayoutContent />
      </FilterProvider>
    </ProfileProvider>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
  },
  subscribeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99998,
    padding: 50,
  },
  subscribeTitle: {
    color: '#E50914',
    fontSize: 42,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  subscribeText: {
    color: '#FFFFFF',
    fontSize: 24,
    textAlign: 'center',
    opacity: 0.8,
    maxWidth: 800,
    lineHeight: 34,
  },
  splashIcon: {
    width: width * 0.12,
    height: height * 0.3,
  }
});

