import React from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, useWindowDimensions } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING } from '../constants/theme';
import { useProfile } from '../context/ProfileContext';
import { MyListService } from '../services/MyListService';
import { getImageUrl, getBackdropUrl } from '../services/tmdb';

type MyListItem = {
  id: string;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  type?: 'movie' | 'tv';
};

export default function MyListScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { selectedProfile } = useProfile();
  const [items, setItems] = React.useState<MyListItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!selectedProfile) {
      setItems([]);
      setLoading(false);
      return;
    }

    const unsubscribe = MyListService.subscribeToList(selectedProfile.id, (data) => {
      setItems(data as MyListItem[]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedProfile]);

  const cardWidth = (width - (SPACING.md * 2) - SPACING.sm) / 2;
  const posterHeight = cardWidth * 1.48;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen
        options={{
          title: 'My List',
          headerShown: true,
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: 'white',
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="white" />
            </Pressable>
          ),
        }}
      />

      {loading ? (
        <View style={styles.centerState}>
          <Text style={styles.loadingText}>Loading your list...</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="add-circle-outline" size={54} color="rgba(255,255,255,0.35)" />
          <Text style={styles.emptyTitle}>Your My List is empty</Text>
          <Text style={styles.emptyBody}>Add movies and shows from the details screen to keep them here.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id.toString()}
          numColumns={2}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.row}
          renderItem={({ item, index }) => {
            const imageUrl = getImageUrl(item.poster_path || null) || getBackdropUrl(item.backdrop_path || null) || '';
            const title = item.title || item.name || 'Untitled';
            const type = item.type || 'movie';

            return (
              <Pressable
                style={[styles.card, { width: cardWidth }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({ pathname: '/movie/[id]', params: { id: item.id.toString(), type } });
                }}
              >
                <Image
                  source={{ uri: imageUrl }}
                  style={[styles.poster, { height: posterHeight }]}
                  contentFit="cover"
                  transition={150}
                />
                <View style={styles.cardMeta}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
                  <Text style={styles.cardType}>{type === 'tv' ? 'TV Show' : 'Movie'}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  backButton: {
    marginLeft: 10,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 15,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '800',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  emptyBody: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: 120,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  card: {
    backgroundColor: '#111111',
    borderRadius: 14,
    overflow: 'hidden',
  },
  poster: {
    width: '100%',
    backgroundColor: '#1a1a1a',
  },
  cardMeta: {
    padding: 12,
    gap: 4,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  cardType: {
    color: COLORS.textSecondary,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
