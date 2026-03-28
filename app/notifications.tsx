import React from 'react';
import { View, Text, StyleSheet, FlatList, Image, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';

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
        headerStyle: { backgroundColor: COLORS.background },
        headerTintColor: 'white',
        headerShown: true,
        headerLeft: () => (
          <Pressable onPress={() => router.back()} style={{ marginLeft: 10 }}>
            <Ionicons name="arrow-back" size={24} color="white" />
          </Pressable>
        ),
      }} />

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable 
            style={[styles.notificationItem, !item.isRead && styles.unreadItem]}
            onPress={() => {
              if (selectedProfile && !item.isRead) {
                NotificationService.markAsRead(selectedProfile.id, item.id);
              }
            }}
          >
            <Image 
              source={{ uri: item.image || 'https://image.tmdb.org/t/p/w500/x2LSRm21uTEx2PqYmbtHQmQp0X3.jpg' }} 
              style={styles.notifImage} 
            />
            <View style={styles.notifContent}>
              <Text style={styles.notifType}>{item.type}</Text>
              <Text style={[styles.notifTitle, !item.isRead && { fontWeight: 'bold' }]}>{item.title}</Text>
              <Text style={styles.notifDesc}>{item.desc}</Text>
              <Text style={styles.notifDate}>{item.date}</Text>
            </View>
            {!item.isRead && <View style={styles.unreadDot} />}
          </Pressable>
        )}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  notificationItem: {
    flexDirection: 'row',
    padding: SPACING.md,
    backgroundColor: '#121212',
    marginBottom: 1,
    gap: 15,
  },
  notifImage: {
    width: 110,
    height: 65,
    borderRadius: 4,
  },
  notifContent: {
    flex: 1,
  },
  notifType: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  notifTitle: {
    color: 'white',
    fontSize: 14,
    marginTop: 2,
  },
  notifDesc: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  notifDate: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 5,
  },
  unreadItem: {
    backgroundColor: '#1a1a1a',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e50914',
    alignSelf: 'center',
    marginRight: 10,
  }
});
