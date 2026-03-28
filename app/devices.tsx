import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
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
          <Ionicons name="arrow-back" size={28} color="white" />
        </Pressable>
        <Text style={styles.headerTitle}>Manage Devices</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#e50914" size="large" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.bannerContainer}>
            <Text style={styles.bannerSubtitle}>Protect your account by reviewing the devices where you are logged in.</Text>
          </View>

          <View style={styles.card}>
            {devices.map((device, index) => {
              const date = new Date(device.lastActive).toLocaleDateString();
              const isCurrent = device.id === currentDeviceId;
              
              return (
                <View key={device.id}>
                  <View style={styles.cardRowInteractive}>
                    <View style={styles.deviceIconBox}>
                      <MaterialCommunityIcons 
                        name={device.os === 'ios' ? 'apple' : device.os === 'android' ? 'android' : 'monitor'} 
                        size={28} 
                        color={isCurrent ? "#46d369" : "rgba(255,255,255,0.7)"} 
                      />
                    </View>
                    
                    <View style={styles.deviceInfo}>
                      <Text style={styles.cardTextPrimaryHeading}>{device.name}</Text>
                      {isCurrent && <Text style={styles.currentBadge}>Current Device</Text>}
                      <Text style={styles.cardTextSecondary}>Last active: {date}</Text>
                    </View>

                    {!isCurrent && (
                      <Pressable 
                        style={styles.revokeBtn}
                        onPress={() => handleRevoke(device)}
                      >
                        <Text style={styles.actionText}>Sign Out</Text>
                      </Pressable>
                    )}
                  </View>
                  {index < devices.length - 1 && <View style={styles.divider} />}
                </View>
              );
            })}
            
            {devices.length === 0 && (
                <Text style={{ color: 'white', padding: 20, textAlign: 'center' }}>No devices found.</Text>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#222', backgroundColor: '#000' },
  backButton: { marginRight: 16 },
  headerTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  scrollContent: { paddingBottom: 40 },
  bannerContainer: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 16 },
  bannerSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: '#111', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#222' },
  cardRowInteractive: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 16 },
  deviceIconBox: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  deviceInfo: { flex: 1, justifyContent: 'center' },
  cardTextPrimaryHeading: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  cardTextSecondary: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 4 },
  currentBadge: { color: '#46d369', fontSize: 12, fontWeight: '600', marginTop: 2 },
  actionText: { color: '#0071eb', fontSize: 14, fontWeight: '600' },
  revokeBtn: { padding: 8 },
  divider: { height: 1, backgroundColor: '#222', marginLeft: 82 }
});
