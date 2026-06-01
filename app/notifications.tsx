import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { NotificationService, NetflixNotification } from '../services/NotificationService';
import { useProfile } from '../context/ProfileContext';

export default function NotificationsScreen() {
  const router = useRouter();
  const { selectedProfile } = useProfile();
  const [notifications, setNotifications] = useState<NetflixNotification[]>([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    if (!selectedProfile) return;

    const unsub = NotificationService.subscribeToNotifications(selectedProfile.id, (data) => {
      setNotifications(data);
      setLoading(false);
      
      // Auto-seed if empty for the demo experience
      if (data.length === 0) {
        NotificationService.seedMockNotifications(selectedProfile.id);
      }
    });

    return () => unsub();
  }, [selectedProfile]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ 
        title: 'Notifications',
        headerStyle: { backgroundColor: '#000000' },
        headerTintColor: 'white',
        headerShown: true,
        headerLeft: () => (
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="white" />
          </Pressable>
        ),
      }} />

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInUp.delay(index * 80).duration(500)}>
            <Pressable 
              style={[styles.notificationCard, !item.isRead && styles.unreadCard]}
              onPress={() => {
                if (selectedProfile && !item.isRead) {
                  NotificationService.markAsRead(selectedProfile.id, item.id);
                }
              }}
            >
              <ExpoImage 
                source={{ uri: item.image || 'https://image.tmdb.org/t/p/w500/x2LSRm21uTEx2PqYmbtHQmQp0X3.jpg' }} 
                style={styles.notifImage}
                contentFit="cover"
              />
              <View style={styles.notifContent}>
                <View style={styles.headerRow}>
                  <Text style={styles.notifType}>{item.type}</Text>
                  {!item.isRead && <View style={styles.unreadBadge}><Text style={styles.unreadText}>New</Text></View>}
                </View>
                <Text style={[styles.notifTitle, !item.isRead && { fontWeight: 'bold', color: 'white' }]}>
                  {item.title}
                </Text>
                <Text style={styles.notifDesc} numberOfLines={2}>{item.desc}</Text>
                <Text style={styles.notifDate}>{item.date}</Text>
              </View>
            </Pressable>
          </Animated.View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  backButton: {
    marginLeft: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  notificationCard: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(20, 20, 20, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 14,
    alignItems: 'center',
  },
  unreadCard: {
    backgroundColor: 'rgba(229, 9, 20, 0.04)',
    borderColor: 'rgba(229, 9, 20, 0.2)',
  },
  notifImage: {
    width: 105,
    height: 65,
    borderRadius: 8,
  },
  notifContent: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  notifType: {
    color: '#8C8C8C',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  unreadBadge: {
    backgroundColor: '#e50914',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  unreadText: {
    color: 'white',
    fontSize: 8.5,
    fontWeight: '900',
  },
  notifTitle: {
    color: '#E0E0E0',
    fontSize: 14.5,
    fontWeight: '600',
    lineHeight: 19,
  },
  notifDesc: {
    color: '#B3B3B3',
    fontSize: 12.5,
    marginTop: 2,
    lineHeight: 16,
  },
  notifDate: {
    color: '#707070',
    fontSize: 11,
    marginTop: 6,
    fontWeight: '500',
  },
});
