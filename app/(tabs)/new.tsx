import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Text, ScrollView, Image, Pressable, FlatList } from 'react-native';
import { COLORS, SPACING } from '../../constants/theme';
import { fetchNewAndHot, getBackdropUrl, fetchTrending } from '../../services/tmdb';
import { NetflixLoader } from '../../components/NetflixLoader';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../_layout';
import { db, auth } from '../../services/firebase';
import { doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { NotificationService } from '../../services/NotificationService';

const HEADER_OFFSET = 120;

export default function NewAndHotScreen() {
  const router = useRouter();
  const { setThemeColor } = useTheme();
  const [comingSoon, setComingSoon] = useState<any[]>([]);
  const [everyoneWatching, setEveryoneWatching] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'coming' | 'everyone'>('coming');

  useFocusEffect(
    useCallback(() => {
      setThemeColor('#000000');
      return () => {};
    }, [setThemeColor])
  );

  useEffect(() => {
    const loadData = async () => {
      try {
        const [newHotData, trendingData] = await Promise.all([
          fetchNewAndHot(),
          fetchTrending('all'),
        ]);
        setComingSoon(newHotData);
        setEveryoneWatching(trendingData);
      } catch (error) {
        console.error('Error fetching new and hot titles:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <NetflixLoader size={40} />
      </View>
    );
  }

  const activeData = activeTab === 'coming' ? comingSoon : everyoneWatching;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeHeader} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>New & Hot</Text>
          <View style={styles.headerIcons}>
            <Pressable style={styles.iconButton}>
              <MaterialCommunityIcons name="cast" size={24} color="white" />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={() => router.push('/search')}>
              <Ionicons name="search" size={24} color="white" />
            </Pressable>
          </View>
        </View>
        <View style={styles.stickyFilters}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filtersContainer}
            contentContainerStyle={styles.filtersContent}
          >
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setActiveTab('coming');
              }}
              style={[styles.filterPill, activeTab === 'coming' && styles.filterPillActive]}
            >
              <Text style={[styles.filterText, activeTab === 'coming' && styles.filterTextActive]}>Coming Soon</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setActiveTab('everyone');
              }}
              style={[styles.filterPill, activeTab === 'everyone' && styles.filterPillActive]}
            >
              <Text style={[styles.filterText, activeTab === 'everyone' && styles.filterTextActive]}>Everyone&apos;s Watching</Text>
            </Pressable>
          </ScrollView>
        </View>
      </SafeAreaView>

      <View style={styles.content}>
        <FlatList
          data={activeData}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <NewAndHotItem
              item={item}
              mode={activeTab}
              onInfoPress={() =>
                router.push({
                  pathname: '/movie/[id]',
                  params: {
                    id: item.id.toString(),
                    type: item.media_type || (item.title ? 'movie' : 'tv'),
                  }
                })
              }
            />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      </View>
    </View>
  );
}

const AnimatedActionButton = ({ icon, activeIcon, text, activeText, isActive, onPress }: any) => {
  const scale = useSharedValue(1);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSequence(
      withSpring(0.7, { damping: 10, stiffness: 300 }),
      withSpring(1.2, { damping: 10, stiffness: 300 }),
      withSpring(1, { damping: 10, stiffness: 300 })
    );
    if (onPress) onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  return (
    <Pressable style={styles.actionBtn} onPress={handlePress}>
      <Animated.View style={animatedStyle}>
        {isActive && activeIcon ? activeIcon : icon}
      </Animated.View>
      <Text style={[styles.actionBtnText, isActive && { color: 'white', fontWeight: 'bold' }]}>
        {isActive && activeText ? activeText : text}
      </Text>
    </Pressable>
  );
};

const NewAndHotItem = ({ item, mode, onInfoPress }: { item: any, mode: 'coming' | 'everyone', onInfoPress: () => void }) => {
  const [isReminded, setIsReminded] = useState(false);
  const releaseDate = item.release_date ? new Date(item.release_date) : new Date();
  const month = releaseDate.toLocaleString('default', { month: 'short' }).toUpperCase();
  const day = releaseDate.getDate();

  useEffect(() => {
    const checkReminder = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const reminderDoc = await getDoc(doc(db, 'users', user.uid, 'reminders', item.id.toString()));
      if (reminderDoc.exists()) {
        setIsReminded(true);
      }
    };
    checkReminder();
  }, [item.id]);

  const toggleReminder = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const reminderRef = doc(db, 'users', user.uid, 'reminders', item.id.toString());

    if (isReminded) {
      setIsReminded(false);
      await deleteDoc(reminderRef);
      await NotificationService.cancelReleaseReminder(item.id.toString());
    } else {
      setIsReminded(true);
      await setDoc(reminderRef, {
        id: item.id,
        title: item.title || item.name,
        releaseDate: item.release_date,
        image: item.backdrop_path,
        timestamp: new Date().toISOString()
      });
      await NotificationService.scheduleReleaseReminder(
        item.id.toString(),
        item.title || item.name,
        item.release_date
      );
    }
  };

  const getLabelText = () => {
    if (mode === 'everyone') {
      return 'Trending Now';
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const normalizedRelease = new Date(releaseDate);
    normalizedRelease.setHours(0, 0, 0, 0);

    const diffTime = normalizedRelease.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Coming Today';
    if (diffDays === 1) return 'Coming Tomorrow';
    if (diffDays > 0 && diffDays <= 7) {
      return `Coming ${releaseDate.toLocaleDateString('default', { weekday: 'long' })}`;
    }
    return `Coming ${month} ${day}`;
  };

  return (
    <View style={styles.itemContainer}>
      <View style={styles.dateContainer}>
        <Text style={styles.dateMonth}>{month}</Text>
        <Text style={styles.dateDay}>{day}</Text>
      </View>

      <View style={styles.contentContainer}>
        <Pressable style={styles.mediaContainer} onPress={onInfoPress}>
          <Image
            source={{ uri: getBackdropUrl(item.backdrop_path) }}
            style={styles.backdropImage}
            resizeMode="cover"
          />
          {parseInt(item.id, 10) % 2 === 0 && (
            <View style={styles.netflixBadge}>
              <Text style={styles.nLogo}>N</Text>
            </View>
          )}
        </Pressable>

        <View style={styles.actionsRow}>
          <Text style={styles.itemTitle} numberOfLines={2}>{item.title || item.name}</Text>
          <View style={styles.actionButtons}>
            <AnimatedActionButton
              icon={<Feather name="bell" size={24} color="white" />}
              activeIcon={<MaterialCommunityIcons name="bell-ring" size={24} color="white" />}
              text="Remind Me"
              activeText="Reminded"
              isActive={isReminded}
              onPress={toggleReminder}
            />
            <Pressable style={styles.actionBtn} onPress={onInfoPress}>
              <Feather name="info" size={24} color="white" />
              <Text style={styles.actionBtnText}>Info</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.comingSoonText}>{getLabelText()}</Text>
        <Text style={styles.synopsis} numberOfLines={3}>{item.overview}</Text>
        <Text style={styles.tags}>Slick • Dark • Thriller</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  safeHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '900',
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  iconButton: {
    padding: 4,
  },
  stickyFilters: {
    backgroundColor: 'transparent',
    zIndex: 20,
  },
  filtersContainer: {
    borderBottomWidth: 0,
  },
  filtersContent: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'transparent',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  filterPillActive: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.9)',
  },
  filterText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    fontWeight: '600',
  },
  filterTextActive: {
    color: 'white',
  },
  content: {
    flex: 1,
  },
  listContent: {
    paddingTop: HEADER_OFFSET,
    paddingBottom: 40,
  },
  itemContainer: {
    flexDirection: 'row',
    paddingVertical: SPACING.lg,
  },
  dateContainer: {
    width: 60,
    alignItems: 'center',
    paddingTop: 10,
  },
  dateMonth: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  dateDay: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: -1,
  },
  contentContainer: {
    flex: 1,
    paddingRight: SPACING.md,
  },
  mediaContainer: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#333',
  },
  backdropImage: {
    width: '100%',
    height: '100%',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  itemTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '900',
    flex: 1,
    marginRight: SPACING.md,
    letterSpacing: -0.5,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: SPACING.lg,
  },
  actionBtn: {
    alignItems: 'center',
    gap: 4,
  },
  actionBtnText: {
    color: COLORS.textSecondary,
    fontSize: 10,
  },
  comingSoonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: SPACING.xs,
  },
  synopsis: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: SPACING.sm,
  },
  tags: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '500',
  },
  netflixBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 20,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  nLogo: {
    color: '#E50914',
    fontSize: 20,
    fontWeight: '900',
    textShadowColor: 'black',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  }
});
