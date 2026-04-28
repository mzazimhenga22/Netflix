import { useEffect, useState, useCallback, useRef } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { View, StyleSheet, Dimensions, useTVEventHandler, TouchableOpacity } from 'react-native';
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
import { SplashAnimation } from '../components/SplashAnimation';
import { MemoryManager } from '../components/MemoryManager';
import { PageColorProvider, usePageColor } from '../context/PageColorContext';

// Hide native splash immediately — we use our own animated one
SplashScreen.preventAutoHideAsync();
const { width, height } = Dimensions.get('window');

import { auth } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { SubscriptionService, SubscriptionStatus } from '../services/SubscriptionService';
import { Text, ActivityIndicator } from 'react-native';
import QRCode from 'react-native-qrcode-svg';


function RootLayoutContent() {
  const { selectedProfile } = useProfile();
  const router = useRouter();
  const [appIsReady, setAppIsReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [payHeroUrl, setPayHeroUrl] = useState<string | null>(null);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [paymentRetryTick, setPaymentRetryTick] = useState(0);
  const subUnsubRef = useRef<(() => void) | null>(null);


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

  const fetchSubscription = useCallback(() => {
    if (!auth.currentUser) {
      setSubscription({ status: 'none' });
      return () => {};
    }

    return SubscriptionService.listenToSubscription((sub) => {
      setSubscription(sub);
    });
  }, []);

  useEffect(() => {
    let subUnsubscribe = () => {};
    
    async function prepare() {
      try {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          if (user) {
            setInitialRoute('/profiles');
            subUnsubscribe();
            subUnsubscribe = fetchSubscription();
          } else {
            setInitialRoute('/');
            setSubscription({ status: 'none' });
            subUnsubscribe();
          }
        });

        // Give auth a moment to resolve
        await new Promise(resolve => setTimeout(resolve, 800));

        // Hide native Expo splash immediately — our animation takes over
        await SplashScreen.hideAsync();

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
  }, [fetchSubscription]);

  const handleRetrySub = () => {
    setSubscription({ status: 'loading' });
    // Clean up previous listener before creating a new one
    if (subUnsubRef.current) subUnsubRef.current();
    subUnsubRef.current = fetchSubscription();
  };

  const isLocked = false; // We no longer block the entire app. Gating happens per-movie.

  useEffect(() => {
    if (!isLocked || subscription?.status === 'error' || !auth.currentUser || isFetchingUrl) return;

    let isMounted = true;
    setIsFetchingUrl(true);

    SubscriptionService.initializePayHeroTransaction(auth.currentUser.uid, 500)
      .then((url) => {
        if (!isMounted) return;
        // QRCode component crashes on null/empty string — only set valid URLs
        if (url && typeof url === 'string' && url.length > 0) {
          setPayHeroUrl(url);
        } else {
          setPayHeroUrl(null);
        }
      })
      .catch((err) => {
        console.warn('[PayHero] Failed to generate URL:', err);
        if (!isMounted) return;
        setPayHeroUrl(null);
      })
      .finally(() => {
        if (!isMounted) return;
        setIsFetchingUrl(false);
      });

    return () => {
      isMounted = false;
    };
    // NOTE: isFetchingUrl intentionally excluded to prevent infinite re-trigger loop
  }, [isLocked, subscription?.status, paymentRetryTick]);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady && initialRoute) {
      if (initialRoute === '/profiles') {
        router.replace('/profiles');
      }
    }
  }, [appIsReady, initialRoute]);

  if (!appIsReady || !initialRoute) {
    // Show black screen while loading (SplashAnimation will show on top or after)
    return <View style={styles.splashContainer} />;
  }


  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="profiles" options={{ animation: 'fade' }} />
        <Stack.Screen name="edit-profile" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="movie/[id]" options={{ animation: 'fade' }} />
      </Stack>

      {/* Global memory cleanup for low-RAM TV devices */}
      <MemoryManager />
      
      {/* Subscription Lockdown Overlay */}
      {isLocked && (
        <View style={styles.subscribeOverlay}>
          <Image 
            source={require('../assets/images/netflix-n-logo.svg')} 
            style={[styles.splashIcon, { marginBottom: 30 }]} 
            contentFit="contain"
          />
          <Text style={styles.subscribeTitle}>
            {subscription?.status === 'error' ? 'Connection Error' : 'Subscription Required'}
          </Text>
          <Text style={styles.subscribeText}>
            {subscription?.status === 'error' 
              ? (subscription.errorMessage || 'We are having trouble connecting to Netflix. Please check your internet connection.')
              : 'Your account is currently inactive. Scan the QR code below to subscribe instantly or open the Netflix app on your mobile device.'}
          </Text>

          {isLocked && subscription?.status !== 'error' && (
            <View style={{ marginTop: 40, alignItems: 'center' }}>
              {payHeroUrl && payHeroUrl.length > 0 ? (
                <>
                  <View style={{ padding: 15, backgroundColor: 'white', borderRadius: 12 }}>
                    <QRCode
                      value={payHeroUrl}
                      size={220}
                      color="black"
                      backgroundColor="white"
                    />
                  </View>
                  <Text style={{ color: 'white', fontSize: 22, marginTop: 20, fontWeight: 'bold' }}>
                    Scan to Pay with M-Pesa (Standard Plan)
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16, marginTop: 8 }}>
                    Your TV will unlock automatically after payment
                  </Text>
                </>
              ) : isFetchingUrl ? (
                <ActivityIndicator size="large" color="#E50914" />
              ) : (
                <TouchableOpacity 
                  activeOpacity={0.8}
                  onPress={() => {
                    setPayHeroUrl(null);
                    setPaymentRetryTick((tick) => tick + 1);
                  }}
                  style={styles.retryButton}
                >
                  <Text style={styles.retryButtonText}>Generate Payment QR</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          
          {subscription?.status === 'error' ? (
            <TouchableOpacity 
              activeOpacity={0.8}
              onPress={handleRetrySub}
              style={{
                marginTop: 40,
                backgroundColor: '#E50914',
                paddingHorizontal: 40,
                paddingVertical: 15,
                borderRadius: 4,
                elevation: 5
              }}
            >
              <Text style={{ color: 'white', fontSize: 20, fontWeight: 'bold' }}>
                Retry Connection
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* Animated Netflix Splash Overlay — fades out to reveal app */}
      {showSplash && (
        <SplashAnimation onFinish={() => setShowSplash(false)} />
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
        <PageColorProvider>
          <StatusBar style="light" hidden={false} />
          <RootLayoutContent />
        </PageColorProvider>
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
    backgroundColor: 'rgba(0,0,0,0.85)',
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
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#E50914',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 4,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  }
});
