import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Dimensions, Text, Pressable, Platform } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import Animated, { 
  FadeIn
} from 'react-native-reanimated';
import { COLORS } from '../constants/theme';
import { SplashAnimation } from '../components/SplashAnimation';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';

const { width } = Dimensions.get('window');

export default function SplashScreen() {
  const router = useRouter();
  const [showUpdateGate, setShowUpdateGate] = React.useState(false);
  const [updateConfig, setUpdateConfig] = React.useState<any>(null);
  const [downloadProgress, setDownloadProgress] = React.useState(0);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [updateStatusText, setUpdateStatusText] = React.useState('');
  const [animating, setAnimating] = React.useState(true);

  // Background version/auth check can begin during animation, but we won't navigate till both are done
  // For simplicity and maximum impact of the 3s splash, we start the checks *after* the fast animation
  // finishes.
  
  const handleSplashFinish = () => {
    setAnimating(false);
    startVersionGuard();
  };

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
          setUpdateStatusText(`Version ${remoteVersion} is required to continue.`);
          setShowUpdateGate(true);
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
      setUpdateStatusText('Opening the update page...');
      Linking.openURL(updateConfig?.updateUrl || 'https://movieflixproxy.netlify.app');
      return;
    }

    // Direct APK Download & Install for Android
    const updateUrl = updateConfig?.directDownloadUrl || updateConfig?.updateUrl;
    if (!updateUrl || !updateUrl.endsWith('.apk')) {
      setUpdateStatusText('Update link is missing a direct APK download.');
      Linking.openURL(updateConfig?.updateUrl || 'https://movieflixproxy.netlify.app');
      return;
    }

    try {
      setIsDownloading(true);
      setDownloadProgress(0);
      setUpdateStatusText('Downloading update...');
      const filename = `movieflix_v${updateConfig.minRequiredVersion}.apk`;
      const localUri = `${FileSystem.cacheDirectory}${filename}`;
      
      const downloadResumable = FileSystem.createDownloadResumable(
        updateUrl,
        localUri,
        {},
        (progressEvent) => {
          const total = progressEvent.totalBytesExpectedToWrite || 1;
          const progress = progressEvent.totalBytesWritten / total;
          setDownloadProgress(progress);
          setUpdateStatusText(`Downloading update... ${Math.round(progress * 100)}%`);
        }
      );

      const result = await downloadResumable.downloadAsync();
      
      if (result) {
        await installApk(result.uri);
      } else {
        setUpdateStatusText('Download failed. Please try again.');
        setIsDownloading(false);
      }
    } catch (e) {
      console.error('[Update] Download failed:', e);
      setUpdateStatusText('Download failed. Please try again.');
      setIsDownloading(false);
    }
  };

  const installApk = async (uri: string) => {
    try {
      const contentUri = await FileSystem.getContentUriAsync(uri);
      setUpdateStatusText('Download complete. Opening installer...');
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: 'application/vnd.android.package-archive',
      });
    } catch (e) {
      console.error('[Update] Install failed:', e);
      setUpdateStatusText('Install launch failed. Please try again.');
      setIsDownloading(false);
    }
  };

  const checkAuth = () => {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        // Allow all signed-in users into the app (Free Plan logic handles content locking)
        router.replace('/profiles');
      } else {
        // No user is signed in, go to login
        router.replace('/login');
      }
    });
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {animating ? (
        <SplashAnimation onFinish={handleSplashFinish} />
      ) : (
        <Animated.Image 
          source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix_icon.svg' }}
          style={[styles.logo, { opacity: showUpdateGate ? 0 : 0 }]}
          resizeMode="contain"
        />
      )}

      {showUpdateGate && (
        <Animated.View entering={FadeIn.delay(200)} style={styles.gateOverlay}>
          <Text style={styles.updateEyebrow}>Update Available</Text>
          <Text style={styles.updateTitle}>A newer version of MovieFlix is ready</Text>
          <Text style={styles.gateSubtitle}>
            {updateConfig?.message || `Version ${updateConfig?.minRequiredVersion || 'latest'} is required before continuing.`}
          </Text>

          <View style={styles.versionRow}>
            <Text style={styles.versionText}>Current: {Constants.expoConfig?.version || 'Unknown'}</Text>
            <Text style={styles.versionText}>Required: {updateConfig?.minRequiredVersion || 'Unknown'}</Text>
          </View>
          
          <Pressable 
            style={[styles.updateBtn, isDownloading && { opacity: 0.6 }]}
            onPress={isDownloading ? undefined : handleUpdatePress}
          >
            <Text style={styles.updateBtnText}>
              {isDownloading ? `Downloading ${Math.round(downloadProgress * 100)}%` : `Update to v${updateConfig?.minRequiredVersion || 'latest'}`}
            </Text>
          </Pressable>

          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: `${Math.max(downloadProgress > 0 ? 6 : 0, downloadProgress * 100)}%` }]} />
          </View>

          <Text style={styles.versionInfo}>
            {updateStatusText || 'This update cannot be skipped.'}
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
    backgroundColor: 'rgba(0,0,0,0.96)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    zIndex: 1000,
  },
  updateEyebrow: {
    color: '#E50914',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  updateTitle: {
    color: 'white',
    fontSize: 32,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 12,
  },
  gateSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  versionRow: {
    flexDirection: 'row',
    gap: 18,
    marginBottom: 28,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  versionText: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 14,
    fontWeight: '600',
  },
  updateBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 4,
    minWidth: 280,
    alignItems: 'center',
  },
  updateBtnText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  progressContainer: {
    width: '100%',
    maxWidth: 360,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginTop: 24,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 999,
  },
  versionInfo: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    marginTop: 18,
    textAlign: 'center',
    minHeight: 22,
  }
});
