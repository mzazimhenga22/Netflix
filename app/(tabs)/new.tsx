import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Text, ScrollView, Image, Pressable, FlatList, StatusBar } from 'react-native';
import { COLORS, SPACING } from '../../constants/theme';
import { fetchUpcoming, getBackdropUrl } from '../../services/tmdb';
import { NetflixLoader } from '../../components/NetflixLoader';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { VerticalVideoFeed } from '../../components/VerticalVideoFeed';

const MOCK_VIDEOS = [
  {
    id: 'v1',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    title: 'One Piece',
    description: 'Adventure on the high seas with the Straw Hat crew!',
    showId: '37854', // One Piece Anime
    type: 'tv'
  },
  {
    id: 'v2',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    title: 'Stranger Things',
    description: 'Small town mysteries and supernatural forces.',
    showId: '66732',
    type: 'tv'
  },
  {
    id: 'v3',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    title: 'Wednesday',
    description: 'Smart, sarcastic and a little dead inside.',
    showId: '119051',
    type: 'tv'
  }
];

export default function NewAndHotScreen() {
  const router = useRouter();
  const { tab } = useLocalSearchParams();
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'discovery' | 'coming' | 'everyone'>('coming');

  useEffect(() => {
    if (tab === 'discovery') {
      setActiveTab('discovery');
    }
  }, [tab]);

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'discovery') {
        StatusBar.setHidden(true, 'fade');
      } else {
        StatusBar.setHidden(false, 'fade');
      }
      return () => StatusBar.setHidden(false, 'fade');
    }, [activeTab])
  );

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await fetchUpcoming();
        setUpcoming(data);
      } catch (error) {
        console.error("Error fetching upcoming movies:", error);
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

  return (
    <View style={styles.container}>
      {activeTab !== 'discovery' && (
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
        </SafeAreaView>
      )}

      <View style={[styles.stickyFilters, activeTab === 'discovery' && styles.discoveryFilters]}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.filtersContainer} 
          contentContainerStyle={styles.filtersContent}
        >
          <Pressable 
            onPress={() => setActiveTab('discovery')}
            style={[styles.filterPill, activeTab === 'discovery' && styles.filterPillActive]}
          >
            <MaterialCommunityIcons 
              name="creation" 
              size={16} 
              color={activeTab === 'discovery' ? 'black' : 'white'} 
            />
            <Text style={[styles.filterText, activeTab === 'discovery' && styles.filterTextActive]}> Discovery</Text>
          </Pressable>
          <Pressable 
            onPress={() => setActiveTab('coming')}
            style={[styles.filterPill, activeTab === 'coming' && styles.filterPillActive]}
          >
            <Text style={[styles.filterText, activeTab === 'coming' && styles.filterTextActive]}>🍿 Coming Soon</Text>
          </Pressable>
          <Pressable 
            onPress={() => setActiveTab('everyone')}
            style={[styles.filterPill, activeTab === 'everyone' && styles.filterPillActive]}
          >
            <Text style={[styles.filterText, activeTab === 'everyone' && styles.filterTextActive]}>🔥 Everyone's Watching</Text>
          </Pressable>
        </ScrollView>
      </View>

      <View style={styles.content}>
        {activeTab === 'discovery' ? (
          <VerticalVideoFeed data={MOCK_VIDEOS} />
        ) : (
          <FlatList
            data={upcoming}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => <NewAndHotItem item={item} />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
    </View>
  );
}

const NewAndHotItem = ({ item }: { item: any }) => {
  const releaseDate = item.release_date ? new Date(item.release_date) : new Date();
  const month = releaseDate.toLocaleString('default', { month: 'short' }).toUpperCase();
  const day = releaseDate.getDate();

  return (
    <View style={styles.itemContainer}>
      <View style={styles.dateContainer}>
        <Text style={styles.dateMonth}>{month}</Text>
        <Text style={styles.dateDay}>{day}</Text>
      </View>
      
      <View style={styles.contentContainer}>
        <View style={styles.mediaContainer}>
          <Image 
            source={{ uri: getBackdropUrl(item.backdrop_path) }} 
            style={styles.backdropImage} 
            resizeMode="cover"
          />
        </View>

        <View style={styles.actionsRow}>
          <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.actionButtons}>
            <Pressable style={styles.actionBtn}>
              <Feather name="bell" size={22} color="white" />
              <Text style={styles.actionBtnText}>Remind Me</Text>
            </Pressable>
            <Pressable style={styles.actionBtn}>
              <Feather name="info" size={22} color="white" />
              <Text style={styles.actionBtnText}>Info</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.comingSoonText}>Coming {month} {day}</Text>
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
    backgroundColor: COLORS.background,
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
    backgroundColor: COLORS.background,
    zIndex: 20,
  },
  discoveryFilters: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
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
    backgroundColor: 'rgba(51, 51, 51, 0.8)',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  filterPillActive: {
    backgroundColor: 'white',
  },
  filterText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  filterTextActive: {
    color: 'black',
  },
  content: {
    flex: 1,
  },
  listContent: {
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
  }
});
