import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchTrending, getImageUrl } from '../services/tmdb';
import { useProfile } from '../context/ProfileContext';
import Animated, { FadeInDown } from 'react-native-reanimated';
import LoadingSpinner from '../components/LoadingSpinner';

// On a real Netflix-like service, these would come from Firestore
// (new episodes available, movies added to My List are now available, etc.)
// Here we seed notifications from recent trending content so the screen is not empty.

interface Notification {
  id: string;
  type: 'new_episode' | 'available' | 'returning' | 'expiring';
  title: string;
  description: string;
  imageUrl: string;
  tmdbId: number;
  mediaType: string;
  time: string;
}

const TYPE_LABELS: Record<string, string> = {
  new_episode: 'New Episodes Available',
  available: 'Now Available',
  returning: 'Returning Soon',
  expiring: 'Leaving Soon',
};

const TYPE_COLORS: Record<string, string> = {
  new_episode: '#E50914',
  available: '#46d369',
  returning: '#f5a623',
  expiring: '#3d9eff',
};

const NOTIFICATION_TYPES: Notification['type'][] = ['new_episode', 'available', 'returning', 'expiring'];

const TIME_STRINGS = ['Just now', '2h ago', 'Yesterday', '3 days ago', '1 week ago', '2 weeks ago'];

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { selectedProfile } = useProfile();

  useEffect(() => {
    async function buildNotifications() {
      try {
        const trending = await fetchTrending('all', selectedProfile?.isKids);
        const notifs: Notification[] = trending.slice(0, 12).map((item: any, index: number) => ({
          id: `notif_${item.id}_${index}`,
          type: NOTIFICATION_TYPES[index % NOTIFICATION_TYPES.length],
          title: item.title || item.name,
          description: item.overview
            ? item.overview.slice(0, 100) + (item.overview.length > 100 ? '...' : '')
            : `${item.title || item.name} is waiting for you.`,
          imageUrl: getImageUrl(item.backdrop_path || item.poster_path) || '',
          tmdbId: item.id,
          mediaType: item.media_type || 'movie',
          time: TIME_STRINGS[index % TIME_STRINGS.length],
        }));
        setNotifications(notifs);
      } catch (e) {
        console.error('[Notifications]', e);
      } finally {
        setLoading(false);
      }
    }
    buildNotifications();
  }, [selectedProfile?.isKids]);

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingSpinner size={92} label="Loading notifications" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(0,0,30,0.9)', 'rgba(0,0,0,0.95)', '#000']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <Pressable
          style={({ focused }) => [styles.backBtn, focused && styles.backBtnFocused]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={28} color="white" />
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>Notifications</Text>
          <Text style={styles.headerSub}>{notifications.length} new updates</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {notifications.map((notif, index) => (
          <Animated.View
            key={notif.id}
            entering={FadeInDown.delay(index * 60).duration(400)}
          >
            <Pressable
              style={({ focused }) => [styles.card, focused && styles.cardFocused]}
              onPress={() => router.push({
                pathname: `/movie/${notif.tmdbId}`,
                params: { type: notif.mediaType }
              })}
            >
              {/* Image */}
              <Image
                source={{ uri: notif.imageUrl }}
                style={styles.cardImage}
                contentFit="cover"
              />

              {/* Type badge */}
              <View style={[styles.badge, { backgroundColor: TYPE_COLORS[notif.type] }]}>
                <Text style={styles.badgeText}>{TYPE_LABELS[notif.type]}</Text>
              </View>

              {/* Content */}
              <View style={styles.cardContent}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{notif.title}</Text>
                  <Text style={styles.cardTime}>{notif.time}</Text>
                </View>
                <Text style={styles.cardDescription} numberOfLines={2}>
                  {notif.description}
                </Text>
              </View>

              {/* Play Indicator */}
              <View style={styles.arrowContainer}>
                <Ionicons name="chevron-forward" size={24} color="rgba(255,255,255,0.4)" />
              </View>
            </Pressable>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 60,
    paddingTop: 60,
    paddingBottom: 40,
    gap: 30,
  },
  backBtn: {
    padding: 12,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  backBtnFocused: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    transform: [{ scale: 1.1 }],
  },
  headerTitle: {
    color: 'white',
    fontSize: 40,
    fontWeight: 'bold',
  },
  headerSub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 18,
    marginTop: 4,
  },
  listContent: {
    paddingHorizontal: 60,
    paddingBottom: 80,
    gap: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    height: 100,
  },
  cardFocused: {
    borderColor: 'white',
    transform: [{ scale: 1.02 }],
    backgroundColor: '#1a1a1a',
  },
  cardImage: {
    width: 160,
    height: '100%',
  },
  badge: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
  },
  cardContent: {
    flex: 1,
    paddingHorizontal: 20,
    gap: 6,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  cardTime: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    marginLeft: 10,
  },
  cardDescription: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    lineHeight: 20,
  },
  arrowContainer: {
    paddingRight: 20,
  },
});
