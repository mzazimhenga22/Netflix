import React from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { COLORS } from '../constants/theme';
import * as Haptics from 'expo-haptics';

interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path?: string;
}

interface CastCarouselProps {
  cast: CastMember[];
}

export const CastCarousel = React.memo(({ cast }: CastCarouselProps) => {
  if (!cast || cast.length === 0) return null;

  // TMDB Image Base URL resolver
  const getAvatarUrl = (path?: string) => {
    if (!path) return 'https://ui-avatars.com/api/?name=Actor&background=141414&color=fff';
    return `https://image.tmdb.org/t/p/w185${path}`;
  };

  const renderItem = ({ item }: { item: CastMember }) => (
    <Pressable 
      style={styles.castItem}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        // Could expand to show actor filmography in the future!
      }}
    >
      <View style={styles.avatarContainer}>
        <Image 
          source={{ uri: getAvatarUrl(item.profile_path) }}
          style={styles.avatar}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
        />
      </View>
      <Text style={styles.realName} numberOfLines={1}>{item.name}</Text>
      <Text style={styles.characterName} numberOfLines={1}>{item.character}</Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Cast</Text>
      <FlatList
        horizontal
        data={cast.slice(0, 15)} // Reasonable limit
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContainer}
        snapToAlignment="start"
        decelerationRate="fast"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    marginBottom: 24,
  },
  headerTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  listContainer: {
    paddingHorizontal: 12,
  },
  castItem: {
    alignItems: 'center',
    width: 85,
    marginHorizontal: 8,
  },
  avatarContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#262626',
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  realName: {
    color: '#E5E5E5',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 2,
  },
  characterName: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '400',
    textAlign: 'center',
  }
});
