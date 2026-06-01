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
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

type MyListItem = {
  id: string;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  type?: 'movie' | 'tv';
};

const MyListCard = React.memo(({ item, cardWidth, posterHeight, onPress }: { 
  item: MyListItem; 
  cardWidth: number; 
  posterHeight: number; 
  onPress: () => void 
}) => {
  const imageUrl = getImageUrl(item.poster_path || null) || getBackdropUrl(item.backdrop_path || null) || '';
  const isOriginal = parseInt(item.id) % 3 === 0;
  const scale = useSharedValue(1);
  const zIndex = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
      zIndex: zIndex.value,
    };
  });

  const handlePressIn = () => {
    zIndex.value = 10;
    scale.value = withSpring(0.95, { damping: 15, stiffness: 300 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePressOut = () => {
    zIndex.value = 0;
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  return (
    <Animated.View style={[styles.card, { width: cardWidth, height: posterHeight }, animatedStyle]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        style={StyleSheet.absoluteFill}
      >
        <Image
          source={{ uri: imageUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
        />
        {isOriginal && (
          <View style={styles.netflixBadge}>
            <Image 
              source={require('../assets/images/netflix-n-logo.svg')} 
              style={styles.nBadgeImage} 
              contentFit="contain"
            />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
});

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
  const posterHeight = cardWidth * 1.5;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen
        options={{
          title: 'My List',
          headerShown: true,
          headerStyle: { backgroundColor: '#000000' },
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
          renderItem={({ item }) => {
            const type = item.type || 'movie';
            return (
              <MyListCard
                item={item}
                cardWidth={cardWidth}
                posterHeight={posterHeight}
                onPress={() => {
                  router.push({ pathname: '/movie/[id]', params: { id: item.id.toString(), type } });
                }}
              />
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
    backgroundColor: '#000000',
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
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  netflixBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 5,
  },
  nBadgeImage: {
    width: 16,
    height: 24,
  },
});
