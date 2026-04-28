import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  findNodeHandle,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  DownloadItem,
  loadMetadata,
  deleteDownload,
  deleteAllDownloads,
} from '../../services/downloads';
import Animated, { FadeInDown } from 'react-native-reanimated';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useTvFocusBridge } from '../../context/TvFocusBridgeContext';

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function DownloadsScreen() {
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const router = useRouter();
  const { setHeroFocusTag } = useTvFocusBridge();
  const deleteAllRef = React.useRef<any>(null);
  const firstCardRef = React.useRef<any>(null);

  const loadDownloads = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadMetadata();
      setItems(data);
    } catch (e) {
      console.error('[Downloads]', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDownloads();
      return undefined;
    }, [loadDownloads])
  );

  useFocusEffect(
    useCallback(() => {
      const timeout = setTimeout(() => {
        const target = deleteAllRef.current ?? firstCardRef.current;
        const tag = findNodeHandle(target);
        setHeroFocusTag(typeof tag === 'number' ? tag : null);
      }, 0);
      return () => {
        clearTimeout(timeout);
        setHeroFocusTag(null);
      };
    }, [items.length, loading, setHeroFocusTag])
  );

  const handleDelete = async (item: DownloadItem) => {
    Alert.alert(
      'Remove Download',
      `Remove "${item.title}" from downloads?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await deleteDownload(item.id);
            setItems(prev => prev.filter(i => i.id !== item.id));
          },
        },
      ]
    );
  };

  const handleDeleteAll = () => {
    Alert.alert(
      'Delete All Downloads',
      'This will remove all downloaded content from your device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            await deleteAllDownloads();
            setItems([]);
          },
        },
      ]
    );
  };

  const handlePlay = (item: DownloadItem) => {
    router.push({
      pathname: `/movie/${item.tmdbId}`,
      params: { type: item.type },
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingSpinner size={92} label="Loading downloads" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(20,0,0,0.8)', 'rgba(0,0,0,0.95)', '#000']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Downloads</Text>
          <Text style={styles.headerSub}>
            {items.length} title{items.length !== 1 ? 's' : ''} saved for offline
          </Text>
        </View>
        {items.length > 0 && (
          <Pressable
            ref={deleteAllRef}
            style={({ focused }) => [styles.deleteAllBtn, focused && styles.deleteAllBtnFocused]}
            onPress={handleDeleteAll}
          >
            <Ionicons name="trash-outline" size={24} color="white" />
            <Text style={styles.deleteAllText}>Delete All</Text>
          </Pressable>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="download-off-outline" size={80} color="rgba(255,255,255,0.2)" />
          <Text style={styles.emptyTitle}>No Downloads Yet</Text>
          <Text style={styles.emptyText}>
            Find a movie or episode you want to watch offline, then tap the Download button.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          numColumns={3}
          columnWrapperStyle={styles.row}
          renderItem={({ item, index }) => {
            const isFocused = focusedId === item.id;
            const isCompleted = item.status === 'completed';
            const progress = item.progress ?? 0;

            return (
              <Animated.View entering={FadeInDown.delay(index * 50).duration(400)}>
                <Pressable
                  ref={index === 0 ? firstCardRef : undefined}
                  style={({ focused }) => [styles.card, focused && styles.cardFocused]}
                  onFocus={() => setFocusedId(item.id)}
                  onBlur={() => setFocusedId(null)}
                  onPress={() => isCompleted ? handlePlay(item) : undefined}
                >
                  {/* Thumbnail */}
                  <View style={styles.thumbContainer}>
                    <Image
                      source={{ uri: item.image }}
                      style={styles.thumbnail}
                      contentFit="cover"
                    />

                    {/* Status Overlay */}
                    {!isCompleted && (
                      <View style={styles.progressOverlay}>
                        <LoadingSpinner size={34} />
                        <Text style={styles.progressText}>
                          {item.status === 'downloading'
                            ? `${Math.floor(progress * 100)}%`
                            : 'Failed'}
                        </Text>
                      </View>
                    )}

                    {/* Progress Bar */}
                    {item.status === 'downloading' && (
                      <View style={styles.progressBarContainer}>
                        <View style={[styles.progressBarFill, { width: `${Math.floor(progress * 100)}%` }]} />
                      </View>
                    )}

                    {/* Play icon for completed */}
                    {isCompleted && isFocused && (
                      <View style={styles.playOverlay}>
                        <Ionicons name="play-circle" size={50} color="white" />
                      </View>
                    )}

                    {/* Status badge */}
                    <View style={[
                      styles.statusBadge,
                      isCompleted ? styles.statusCompleted : styles.statusDownloading,
                    ]}>
                      <Ionicons
                        name={
                          isCompleted ? 'checkmark-circle' :
                          item.status === 'failed' ? 'close-circle' : 'download'
                        }
                        size={14}
                        color="white"
                      />
                    </View>
                  </View>

                  {/* Info */}
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.cardMeta}>
                      {item.type === 'tv' ? '📺 Series' : '🎬 Movie'}
                      {item.totalSize ? `  •  ${formatBytes(item.totalSize)}` : ''}
                    </Text>

                    {/* Actions */}
                    {isFocused && (
                      <Animated.View entering={FadeInDown.duration(200)} style={styles.cardActions}>
                        {isCompleted && (
                          <Pressable
                            style={({ focused }) => [styles.actionBtn, focused && styles.actionBtnFocused]}
                            onPress={() => handlePlay(item)}
                          >
                            <Ionicons name="play" size={18} color="black" />
                            <Text style={styles.actionBtnText}>Play</Text>
                          </Pressable>
                        )}
                        <Pressable
                          style={({ focused }) => [styles.deleteBtn, focused && styles.deleteBtnFocused]}
                          onPress={() => handleDelete(item)}
                        >
                          <Ionicons name="trash-outline" size={18} color="white" />
                          <Text style={styles.deleteBtnText}>Remove</Text>
                        </Pressable>
                      </Animated.View>
                    )}
                  </View>
                </Pressable>
              </Animated.View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: 100,
  },
  center: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 80,
    paddingBottom: 40,
  },
  headerTitle: {
    color: 'white',
    fontSize: 40,
    fontWeight: 'bold',
  },
  headerSub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 18,
    marginTop: 5,
  },
  deleteAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  deleteAllBtnFocused: {
    backgroundColor: 'rgba(229,9,20,0.3)',
    borderColor: '#E50914',
  },
  deleteAllText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 100,
    gap: 20,
  },
  emptyTitle: {
    color: 'white',
    fontSize: 32,
    fontWeight: 'bold',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 20,
    textAlign: 'center',
    lineHeight: 30,
  },
  listContent: {
    paddingHorizontal: 60,
    paddingBottom: 100,
  },
  row: {
    gap: 30,
    marginBottom: 30,
  },
  card: {
    width: 350,
    backgroundColor: '#111',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardFocused: {
    borderColor: 'white',
    transform: [{ scale: 1.03 }],
  },
  thumbContainer: {
    width: '100%',
    height: 200,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  progressOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  progressText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  progressBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#E50914',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 4,
    borderRadius: 12,
  },
  statusCompleted: {
    backgroundColor: '#46d369',
  },
  statusDownloading: {
    backgroundColor: '#E50914',
  },
  cardInfo: {
    padding: 16,
    gap: 6,
  },
  cardTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cardMeta: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'white',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  actionBtnFocused: {
    transform: [{ scale: 1.05 }],
  },
  actionBtnText: {
    color: 'black',
    fontSize: 14,
    fontWeight: 'bold',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(229,9,20,0.2)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E50914',
  },
  deleteBtnFocused: {
    backgroundColor: 'rgba(229,9,20,0.5)',
    transform: [{ scale: 1.05 }],
  },
  deleteBtnText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
