import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Dimensions, Text, Pressable, Platform } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withSequence, 
  withDelay,
  runOnJS,
  FadeIn
} from 'react-native-reanimated';
import { COLORS, SPACING } from '../constants/theme';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { SubscriptionService } from '../services/SubscriptionService';

const { width } = Dimensions.get('window');

export default function SplashScreen() {
  const router = useRouter();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);
  const [showUpdateGate, setShowUpdateGate] = React.useState(false);
  const [updateConfig, setUpdateConfig] = React.useState<any>(null);
  const [isChecking, setIsChecking] = React.useState(true);
  const [downloadProgress, setDownloadProgress] = React.useState(0);
  const [isDownloading, setIsDownloading] = React.useState(false);



  useEffect(() => {
    // Beginner-friendly fade-in animation
    opacity.value = withTiming(1, { duration: 1000 });
    
    // Slight pop effect
    scale.value = withSequence(
      withTiming(1.05, { duration: 1000 }),
      withTiming(1, { duration: 500 }, () => {
        runOnJS(startVersionGuard)();
      })
    );
  }, []);

  const startVersionGuard = async () => {
    try {
      const configDoc = await getDoc(doc(db, 'app_config', 'versioning'));
      if (configDoc.exists()) {
        const data = configDoc.data();
        const localVersion = Constants.expoConfig?.version || '1.0.0';
        const remoteVersion = data.minRequiredVersion || '1.0.0';
        
        console.log(`[VersionGuard] Local: ${localVersion}, Required: ${remoteVersion}`);

        // Using simple lexicographical or split-join comparison for SemVer (safe for major/minor bumps)
        const isOutdated = compareVersions(localVersion, remoteVersion) < 0;

        if (isOutdated) {
          setUpdateConfig(data);
          setShowUpdateGate(true);
          setIsChecking(false);
          return;
        }
      }
    } catch (e) {
      console.warn('[VersionGuard] Fetch failed, bypassing for safety', e);
    }
    
    // Proceed to auth if version is current or fetch fails (fail-open for safety)
    checkAuth();
  };

  /**
   * SemVer Comparison: 1.0.1 vs 1.1.0 etc.
   * Returns: 
   *  -1 if v1 < v2
   *   0 if v1 == v2
   *   1 if v1 > v2
   */
  const compareVersions = (v1: string, v2: string) => {
    const s1 = v1.split('.').map(Number);
    const s2 = v2.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const n1 = s1[i] || 0;
      const n2 = s2[i] || 0;
      if (n1 > n2) return 1;
      if (n1 < n2) return -1;
    }
    return 0;
  };

  const handleUpdatePress = async () => {
    if (Platform.OS !== 'android') {
      Linking.openURL(updateConfig?.updateUrl || 'https://movieflixproxy.netlify.app');
      return;
    }

    // Direct APK Download & Install for Android
    const updateUrl = updateConfig?.directDownloadUrl || updateConfig?.updateUrl;
    if (!updateUrl || !updateUrl.endsWith('.apk')) {
        // Fallback to browser if no direct APK is provided
        Linking.openURL(updateConfig?.updateUrl || 'https://movieflixproxy.netlify.app');
        return;
    }

    try {
      setIsDownloading(true);
      const filename = `movieflix_v${updateConfig.minRequiredVersion}.apk`;
      const localUri = `${FileSystem.cacheDirectory}${filename}`;
      
      const downloadResumable = FileSystem.createDownloadResumable(
        updateUrl,
        localUri,
        {},
        (downloadProgress) => {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          setDownloadProgress(progress);
        }
      );

      const result = await downloadResumable.downloadAsync();
      
      if (result) {
        setIsDownloading(false);
        installApk(result.uri);
      }
    } catch (e) {
      console.error('[Update] Download failed:', e);
      setIsDownloading(false);
      // Fallback
      Linking.openURL(updateConfig.updateUrl);
    }
  };

  const installApk = async (uri: string) => {
    try {
      const contentUri = await FileSystem.getContentUriAsync(uri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: 'application/vnd.android.package-archive',
      });
    } catch (e) {
      console.error('[Update] Install failed:', e);
    }
  };

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
        style={[styles.logo, logoStyle, showUpdateGate ? { opacity: 0 } : {}]}
        resizeMode="contain"
      />

      {showUpdateGate && (
        <Animated.View entering={FadeIn.delay(200)} style={styles.gateOverlay}>
          <Ionicons name="cloud-download-outline" size={80} color={COLORS.primary} style={{ marginBottom: 30 }} />
          <Text style={styles.gateTitle}>Update Required</Text>
          <Text style={styles.gateSubtitle}>
            {updateConfig?.message || "A new, mandatory version of MovieFlix is available. Please update to continue watching."}
          </Text>
          
          <Pressable 
            style={[styles.updateBtn, isDownloading && { opacity: 0.6 }]}
            onPress={isDownloading ? undefined : handleUpdatePress}
          >
            <Text style={styles.updateBtnText}>
              {isDownloading ? `Downloading ${Math.round(downloadProgress * 100)}%` : `Download v${updateConfig?.minRequiredVersion || 'Now'}`}
            </Text>
          </Pressable>

          {isDownloading && (
            <View style={styles.progressContainer}>
              <View style={[styles.progressBar, { width: `${downloadProgress * 100}%` }]} />
            </View>
          )}

          <Text style={styles.versionInfo}>
            Your version: {Constants.expoConfig?.version || 'Unknown'}
          </Text>
        </Animated.View>
      )}
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
  gateOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    zIndex: 1000,
  },
  gateTitle: {
    color: 'white',
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 12,
  },
  gateSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
  },
  updateBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 4,
    width: '100%',
    alignItems: 'center',
  },
  updateBtnText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  progressContainer: {
    width: '100%',
    height: 4,
    backgroundColor: '#333',
    marginTop: 20,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.primary,
  },
  versionInfo: {
    color: '#444',
    fontSize: 12,
    marginTop: 20,
  }
});
