import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Alert, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { loadMetadata, deleteAllDownloads, DownloadItem } from '../services/downloads';
import { useProfile } from '../context/ProfileContext';

export default function AppSettingsScreen() {
  const router = useRouter();
  const { selectedProfile, updateProfileSettings } = useProfile();
  
  const [wifiOnly, setWifiOnly] = useState(selectedProfile?.settings?.wifiOnlyDownloads ?? false);
  const [autoplayNext, setAutoplayNext] = useState(selectedProfile?.settings?.autoplayNext ?? true);
  const [autoplayPreviews, setAutoplayPreviews] = useState(selectedProfile?.settings?.autoplayPreviews ?? true);
  
  const [smartDownloads, setSmartDownloads] = useState(true);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [diskSpace, setDiskSpace] = useState({ free: 0, total: 0 });
  const [isCheckingNetwork, setIsCheckingNetwork] = useState(false);
  const [deviceModel, setDeviceModel] = useState(Constants.deviceName || Platform.OS === 'ios' ? 'iPhone' : 'Android Device');
  
  useEffect(() => {
    loadMetadata().then(setDownloads);
    
    const fetchStorage = async () => {
      try {
        const free = await FileSystem.getFreeDiskStorageAsync();
        const total = await FileSystem.getTotalDiskCapacityAsync();
        setDiskSpace({ free, total });
      } catch (err) {
        console.error("Storage check failed", err);
      }
    };
    fetchStorage();
  }, []);

  const handleDeleteAll = () => {
    if (downloads.length === 0) return;
    Alert.alert('Delete All Downloads', `Remove all ${downloads.length} downloads? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete All',
        style: 'destructive',
        onPress: async () => {
          await deleteAllDownloads();
          setDownloads([]);
        },
      },
    ]);
  };

  const totalUsedBytes = downloads.reduce((acc, curr) => acc + (curr.totalSize || 0), 0);
  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };
  const totalUsedFormatted = formatBytes(totalUsedBytes);

  const saveSettings = (overrides: any) => {
    if (!selectedProfile) return;
    const current = selectedProfile.settings || { autoplayNext: true, autoplayPreviews: true, wifiOnlyDownloads: false };
    updateProfileSettings(selectedProfile.id, { ...current, ...overrides });
  };

  const handleNetworkCheck = async () => {
    setIsCheckingNetwork(true);
    try {
      // Simulate real ping to fastest Netflix server (e.g. google.com for basic connectivity)
      const start = Date.now();
      const res = await fetch('https://www.google.com', { method: 'HEAD', mode: 'no-cors' });
      const duration = Date.now() - start;
      if (res.ok || res.type === 'opaque') {
        Alert.alert('Network Check', `Success! Connection is stable. \nLatency: ${duration}ms`);
      } else {
        throw new Error("Server unreachable");
      }
    } catch (err) {
      Alert.alert('Network Check', 'Connection failed. Please check your Wi-Fi or Cellular settings.');
    } finally {
      setIsCheckingNetwork(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="white" />
        </Pressable>
        <Text style={styles.headerTitle}>App Settings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* VIDEO PLAYBACK */}
        <Text style={styles.sectionTitle}>VIDEO PLAYBACK</Text>
        <Pressable style={styles.settingItem}>
          <Ionicons name="cellular-outline" size={24} color="#888" style={styles.itemIcon} />
          <View style={styles.itemTextContainer}>
            <Text style={styles.itemTitle}>Cellular Data Usage</Text>
            <Text style={styles.itemSubtitle}>Automatic</Text>
          </View>
        </Pressable>
        <View style={styles.settingItem}>
          <Ionicons name="play-circle-outline" size={24} color="#888" style={styles.itemIcon} />
          <View style={styles.itemTextContainer}>
            <Text style={styles.itemTitle}>Autoplay Next Episode</Text>
          </View>
          <Switch 
            value={autoplayNext} 
            onValueChange={(val) => { setAutoplayNext(val); saveSettings({ autoplayNext: val }); }} 
            trackColor={{ false: '#333', true: '#0071eb' }}
            thumbColor={'#fff'}
          />
        </View>
        <View style={styles.settingItem}>
          <Ionicons name="film-outline" size={24} color="#888" style={styles.itemIcon} />
          <View style={styles.itemTextContainer}>
            <Text style={styles.itemTitle}>Autoplay Previews on Home</Text>
          </View>
          <Switch 
            value={autoplayPreviews} 
            onValueChange={(val) => { setAutoplayPreviews(val); saveSettings({ autoplayPreviews: val }); }} 
            trackColor={{ false: '#333', true: '#0071eb' }}
            thumbColor={'#fff'}
          />
        </View>

        {/* DOWNLOADS */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>DOWNLOADS</Text>
        <View style={styles.settingItem}>
          <Ionicons name="wifi-outline" size={24} color="#888" style={styles.itemIcon} />
          <View style={styles.itemTextContainer}>
            <Text style={styles.itemTitle}>Wi-Fi Only</Text>
          </View>
          <Switch 
            value={wifiOnly} 
            onValueChange={(val) => { setWifiOnly(val); saveSettings({ wifiOnlyDownloads: val }); }} 
            trackColor={{ false: '#333', true: '#0071eb' }}
            thumbColor={'#fff'}
          />
        </View>
        
        <View style={styles.settingItem}>
          <Ionicons name="flash-outline" size={24} color="#888" style={styles.itemIcon} />
          <View style={styles.itemTextContainer}>
            <Text style={styles.itemTitle}>Smart Downloads</Text>
          </View>
          <Switch 
            value={smartDownloads} 
            onValueChange={setSmartDownloads} 
            trackColor={{ false: '#333', true: '#0071eb' }}
            thumbColor={'#fff'}
          />
        </View>

        <Pressable style={styles.settingItem}>
          <Ionicons name="film-outline" size={24} color="#888" style={styles.itemIcon} />
          <View style={styles.itemTextContainer}>
            <Text style={styles.itemTitle}>Video Quality</Text>
            <Text style={styles.itemSubtitle}>Standard</Text>
          </View>
        </Pressable>
        <Pressable style={styles.settingItem}>
          <Ionicons name="folder-outline" size={24} color="#888" style={styles.itemIcon} />
          <View style={styles.itemTextContainer}>
            <Text style={styles.itemTitle}>Download Location</Text>
            <Text style={styles.itemSubtitle}>Internal Storage</Text>
          </View>
        </Pressable>

        {/* Storage Bar */}
        <View style={styles.storageContainer}>
          <View style={styles.storageHeader}>
            <Text style={styles.storageLabel}>Device Storage</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressFill, { width: `${Math.max(2, (totalUsedBytes / diskSpace.total) * 100)}%`, backgroundColor: '#e50914' }]} />
            <View style={[styles.progressFill, { width: `${(Math.max(0, diskSpace.total - diskSpace.free - totalUsedBytes) / diskSpace.total) * 100}%`, backgroundColor: '#0071eb' }]} />
          </View>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: '#e50914' }]} />
              <Text style={styles.legendText}>Netflix ({totalUsedFormatted})</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: '#0071eb' }]} />
              <Text style={styles.legendText}>Other ({formatBytes(Math.max(0, diskSpace.total - diskSpace.free - totalUsedBytes))})</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: '#333' }]} />
              <Text style={styles.legendText}>Free ({formatBytes(diskSpace.free)})</Text>
            </View>
          </View>
        </View>

        <Pressable style={[styles.settingItem, styles.deleteItem]} onPress={handleDeleteAll}>
          <Ionicons name="trash-outline" size={24} color="#888" style={styles.itemIcon} />
          <View style={styles.itemTextContainer}>
            <Text style={styles.itemTitle}>Delete All Downloads</Text>
          </View>
        </Pressable>

        {/* ABOUT */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>ABOUT</Text>
        <Pressable style={styles.settingItem}>
          <Text style={styles.itemTitle}>Device</Text>
          <Text style={styles.itemSubtitleRight}>{deviceModel}</Text>
        </Pressable>
        <Pressable style={styles.settingItem} onPress={handleNetworkCheck} disabled={isCheckingNetwork}>
          <Text style={styles.itemTitle}>Network Check</Text>
          {isCheckingNetwork ? <ActivityIndicator size="small" color="#888" /> : <Ionicons name="chevron-forward" size={20} color="#888" />}
        </Pressable>
        <Pressable style={styles.settingItem} onPress={() => Alert.alert('Speed Test', 'Connecting to fast.com... (External Link Simulation)')}>
          <Text style={styles.itemTitle}>Internet Speed Test</Text>
          <Ionicons name="chevron-forward" size={20} color="#888" />
        </Pressable>
        <Pressable style={styles.settingItem}>
          <Text style={styles.itemTitle}>Privacy</Text>
          <Ionicons name="chevron-forward" size={20} color="#888" />
        </Pressable>
        <Pressable style={styles.settingItem}>
          <Text style={styles.itemTitle}>Terms of Use</Text>
          <Ionicons name="chevron-forward" size={20} color="#888" />
        </Pressable>
        <Pressable style={styles.settingItem}>
          <Text style={styles.itemTitle}>Open Source Licenses</Text>
          <Ionicons name="chevron-forward" size={20} color="#888" />
        </Pressable>
        
        <View style={styles.footerVersion}>
          <Text style={styles.versionText}>Version: 1.0.0 (2026.03.26)</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    backgroundColor: '#000',
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#111',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  itemIcon: {
    marginRight: 16,
  },
  itemTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  itemTitle: {
    color: 'white',
    fontSize: 16,
  },
  itemSubtitle: {
    color: '#888',
    fontSize: 14,
    marginTop: 4,
  },
  itemSubtitleRight: {
    flex: 1,
    color: '#888',
    fontSize: 14,
    textAlign: 'right',
  },
  deleteItem: {
    marginTop: 8,
  },
  storageContainer: {
    padding: 16,
    backgroundColor: '#000',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  storageHeader: {
    marginBottom: 10,
  },
  storageLabel: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#222',
    borderRadius: 3,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  legend: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 15,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: '#888',
    fontSize: 12,
  },
  footerVersion: {
    padding: 24,
    alignItems: 'center',
  },
  versionText: {
    color: '#444',
    fontSize: 13,
  }
});
