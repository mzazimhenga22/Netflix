import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { DeviceTrackerService } from '../services/DeviceTrackerService';
import * as Haptics from 'expo-haptics';

export default function DevicesScreen() {
  const router = useRouter();
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    setLoading(true);
    const fetched = await DeviceTrackerService.getDevices();
    const currentId = await DeviceTrackerService.getDeviceId();
    setDevices(fetched);
    setCurrentDeviceId(currentId);
    setLoading(false);
  };

  const handleRevoke = (device: any) => {
    if (device.id === currentDeviceId) {
      Alert.alert("Cannot revoke", "You cannot revoke the device you are currently using.");
      return;
    }

    Alert.alert('Sign Out Device', `Are you sure you want to sign out "${device.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          await DeviceTrackerService.revokeDevice(device.id);
          setDevices(prev => prev.filter(d => d.id !== device.id));
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </Pressable>
        <Text style={styles.headerTitle}>Manage Devices</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#e50914" size="large" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Animated.View entering={FadeInUp.duration(500)} style={styles.bannerContainer}>
            <Text style={styles.bannerSubtitle}>
              Protect your account by reviewing the devices where you are logged in. Sign out of any devices you don't recognize.
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(600).delay(200)} style={styles.cardContainer}>
            {devices.map((device, index) => {
              const date = new Date(device.lastActive).toLocaleDateString();
              const isCurrent = device.id === currentDeviceId;
              
              return (
                <View key={device.id}>
                  <View style={styles.deviceRow}>
                    <View style={[styles.deviceIconBox, isCurrent && styles.deviceIconBoxCurrent]}>
                      <MaterialCommunityIcons 
                        name={device.os === 'ios' ? 'apple' : device.os === 'android' ? 'android' : 'monitor'} 
                        size={26} 
                        color={isCurrent ? "#46d369" : "rgba(255,255,255,0.7)"} 
                      />
                    </View>
                    
                    <View style={styles.deviceInfo}>
                      <Text style={styles.deviceName}>{device.name}</Text>
                      {isCurrent ? (
                        <View style={styles.currentBadge}>
                          <Text style={styles.currentBadgeText}>Current Device</Text>
                        </View>
                      ) : (
                        <Text style={styles.deviceActiveDate}>Last active: {date}</Text>
                      )}
                    </View>

                    {!isCurrent && (
                      <Pressable 
                        style={styles.revokeButton}
                        onPress={() => handleRevoke(device)}
                      >
                        <Text style={styles.revokeButtonText}>Sign Out</Text>
                      </Pressable>
                    )}
                  </View>
                  {index < devices.length - 1 && <View style={styles.divider} />}
                </View>
              );
            })}
            
            {devices.length === 0 && (
              <Text style={styles.emptyText}>No active devices found.</Text>
            )}
          </Animated.View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#000000' 
  },
  center: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    borderBottomWidth: 1.5, 
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#000000' 
  },
  backButton: { 
    marginRight: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerTitle: { 
    color: 'white', 
    fontSize: 20, 
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  scrollContent: { 
    paddingBottom: 40 
  },
  bannerContainer: { 
    paddingHorizontal: 16, 
    paddingTop: 24, 
    paddingBottom: 16 
  },
  bannerSubtitle: { 
    color: '#B3B3B3', 
    fontSize: 14.5, 
    lineHeight: 20,
    fontWeight: '500',
  },
  cardContainer: { 
    backgroundColor: 'rgba(20, 20, 20, 0.85)', 
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1, 
    borderColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  deviceRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingVertical: 18, 
    paddingHorizontal: 18 
  },
  deviceIconBox: { 
    width: 48, 
    height: 48, 
    borderRadius: 24, 
    backgroundColor: 'rgba(255, 255, 255, 0.06)', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginRight: 16 
  },
  deviceIconBoxCurrent: {
    backgroundColor: 'rgba(70, 211, 105, 0.1)',
  },
  deviceInfo: { 
    flex: 1, 
    justifyContent: 'center' 
  },
  deviceName: { 
    color: 'white', 
    fontSize: 16, 
    fontWeight: '800' 
  },
  deviceActiveDate: { 
    color: '#8C8C8C', 
    fontSize: 13, 
    marginTop: 4,
    fontWeight: '500',
  },
  currentBadge: { 
    backgroundColor: 'rgba(70, 211, 105, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  currentBadgeText: {
    color: '#46d369',
    fontSize: 11,
    fontWeight: '800',
  },
  revokeButton: { 
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  revokeButtonText: { 
    color: '#B3B3B3', 
    fontSize: 13.5, 
    fontWeight: '700' 
  },
  divider: { 
    height: 1, 
    backgroundColor: 'rgba(255, 255, 255, 0.05)', 
    marginLeft: 82 
  },
  emptyText: {
    color: '#8C8C8C',
    padding: 24,
    textAlign: 'center',
    fontSize: 15,
  }
});
