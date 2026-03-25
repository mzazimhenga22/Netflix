import React from 'react';
import { View, Text, StyleSheet, FlatList, Image, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';

const MOCK_NOTIFICATIONS = [
  {
    id: '1',
    type: 'New Arrival',
    title: 'Berlin',
    desc: 'From the world of Money Heist.',
    date: 'Dec 29',
    image: 'https://image.tmdb.org/t/p/w500/v9mRl9m9m9m9m9m9m9m9m9m.jpg',
  },
  {
    id: '2',
    type: 'Now Available',
    title: 'The Crown: Season 6',
    desc: 'The final chapter begins.',
    date: 'Dec 14',
    image: 'https://image.tmdb.org/t/p/w500/v9mRl9m9m9m9m9m9m9m9m9m.jpg',
  }
];

export default function NotificationsScreen() {
  const router = useRouter();

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
        data={MOCK_NOTIFICATIONS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.notificationItem}>
            <Image source={{ uri: 'https://image.tmdb.org/t/p/w500/x2LSRm21uTEx2PqYmbtHQmQp0X3.jpg' }} style={styles.notifImage} />
            <View style={styles.notifContent}>
              <Text style={styles.notifType}>{item.type}</Text>
              <Text style={styles.notifTitle}>{item.title}</Text>
              <Text style={styles.notifDesc}>{item.desc}</Text>
              <Text style={styles.notifDate}>{item.date}</Text>
            </View>
          </View>
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
  }
});
