import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Pressable, Dimensions, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeInRight } from 'react-native-reanimated';
import { loadMetadata, deleteDownload, deleteAllDownloads, refreshMetadataCache, getMetadataCache, canPreview, getPlaybackUri, DownloadItem, togglePauseDownload } from '../services/downloads';
import { fetchTrending, getImageUrl } from '../services/tmdb';
import { ModernVideoPlayer } from '../components/ModernVideoPlayer';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

const { width } = Dimensions.get('window');

/** Format bytes to a human-readable string */
const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};


export default function DownloadsScreen() {
  const router = useRouter();
  const [downloads, setDownloads] = React.useState<DownloadItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [selectedDownload, setSelectedDownload] = React.useState<DownloadItem | null>(null);
  const [expandedGroups, setExpandedGroups] = React.useState<string[]>([]);
  const [smartPosters, setSmartPosters] = React.useState<string[]>([
    'https://image.tmdb.org/t/p/w500/2me70xt6bcY01khK71k7n9Uwua0.jpg', // Wednesday
    'https://image.tmdb.org/t/p/w500/8Gxv9mYgiwEuzvD92br69vI0Y78.jpg', // Damsel
    'https://image.tmdb.org/t/p/w500/d5PBICB6Mubq0zR6pyN9rPBz6Y3.jpg'  // Avatar
  ]);

  const toggleGroup = (tmdbId: string) => {
    setExpandedGroups(prev => 
      prev.includes(tmdbId) ? prev.filter(id => id !== tmdbId) : [...prev, tmdbId]
    );
  };

  const refreshDownloads = React.useCallback(async () => {
    const data = await loadMetadata();
    setDownloads(data);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    refreshDownloads();
    // Poll from cached metadata every 1.5 seconds (lightweight memory lookup, NO disk I/O)
    const interval = setInterval(() => {
      try {
        const data = getMetadataCache();
        if (data.length > 0) {
          // We can't just setDownloads(data) due to React batched updates ignoring mutative references.
          // But spreading creates a new array reference so React renders the updated progress %.
          setDownloads([...data]);
        }
      } catch (_) {}
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    // Fetch popular posters for "Downloads for You" using centralized service
    const fetchSmartPosters = async () => {
      try {
        const trendingMovies = await fetchTrending('movie');
        if (trendingMovies && trendingMovies.length >= 3) {
          const posters = trendingMovies.slice(0, 3).map((m: any) => getImageUrl(m.poster_path));
          setSmartPosters(posters.filter((p: any) => typeof p === 'string'));
          console.log('[Downloads] Smart posters updated from centralized API');
        }
      } catch (err) {
        // Fallback to initial posters if API fails, no loud warning needed
      }
    };
    fetchSmartPosters();
  }, []);

  const handleDelete = async (id: string) => {
    Alert.alert('Delete Download', 'Are you sure you want to remove this download?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteDownload(id);
          refreshDownloads();
        },
      },
    ]);
  };

  const handleDeleteAll = () => {
    if (downloads.length === 0) return;
    Alert.alert('Delete All Downloads', `Remove all ${downloads.length} downloads? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete All',
        style: 'destructive',
        onPress: async () => {
          await deleteAllDownloads();
          refreshDownloads();
        },
      },
    ]);
  };

  const [activePlaybackUri, setActivePlaybackUri] = React.useState<string | null>(null);

  const handlePlay = (item: DownloadItem) => {
    const playbackInfo = getPlaybackUri(item);
    if (playbackInfo) {
      setSelectedDownload(item);
      setActivePlaybackUri(playbackInfo.uri);
      setIsPlaying(true);
    } else if (item.status === 'downloading' && item.progress < 0.3) {
      Alert.alert('Not Ready', `Download is ${Math.round(item.progress * 100)}% complete. You can preview once it reaches 30%.`);
    }
  };

  // Grouped logic for TV shows
  const groupedDownloads = React.useMemo(() => {
    const groups: Record<string, DownloadItem[]> = {};
    const individual: DownloadItem[] = [];

    downloads.forEach(item => {
      if (item.type === 'tv' && item.tmdbId) {
        if (!groups[item.tmdbId]) groups[item.tmdbId] = [];
        groups[item.tmdbId].push(item);
      } else {
        individual.push(item);
      }
    });

    return { groups, individual };
  }, [downloads]);

  const activeDownloads = downloads.filter(d => d.status === 'downloading');
  const failedDownloads = downloads.filter(d => d.status === 'failed');

  const totalUsedBytes = downloads.reduce((acc, curr) => acc + (curr.totalSize || 0), 0);
  const totalUsedFormatted = formatBytes(totalUsedBytes);

  const StorageBar = () => (
    <View style={styles.storageContainer}>
      <View style={styles.storageHeader}>
        <Text style={styles.storageLabel}>Device Storage</Text>
        <Text style={styles.storageValue}>
          {totalUsedFormatted ? `Netflix: ${totalUsedFormatted}` : 'No downloads'}
        </Text>
      </View>
      <View style={styles.progressBarBg}>
        <View style={[styles.progressFill, { width: `${Math.max(2, (totalUsedBytes / (128 * 1024 * 1024 * 1024)) * 100)}%`, backgroundColor: '#E50914' }]} />
        <View style={[styles.progressFill, { width: '10%', backgroundColor: '#0071eb' }]} />
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#E50914' }]} />
          <Text style={styles.legendText}>Netflix ({totalUsedFormatted || '0 KB'})</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#0071eb' }]} />
          <Text style={styles.legendText}>Other</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#333' }]} />
          <Text style={styles.legendText}>Free</Text>
        </View>
      </View>
    </View>
  );

  const handleTogglePause = async (id: string) => {
    await togglePauseDownload(id);
    refreshDownloads();
  };

  const DownloadProgressCircle = ({ progress, status, isPaused, onPress }: { progress: number, status: string, isPaused?: boolean, onPress: () => void }) => {
    const size = 36;
    const strokeWidth = 3;
    const radius = (size / 2) - (strokeWidth / 2);
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (progress * circumference);

    return (
      <Pressable onPress={onPress} style={styles.progressCircleContainer}>
        <Svg width={size} height={size}>
          {/* Background Circle */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Progress Circle */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={COLORS.primary}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            fill="transparent"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
          
          {/* Center Icon */}
          {status === 'downloading' && !isPaused ? (
            <>
              <Rect x={14} y={13} width={3} height={10} fill="white" rx={1} />
              <Rect x={19} y={13} width={3} height={10} fill="white" rx={1} />
            </>
          ) : status === 'downloading' && isPaused ? (
            // Play Icon
            <Path d="M14 12 L24 18 L14 24 Z" fill="white" transform="scale(0.8) translate(4, -2)" />
          ) : null}
        </Svg>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {isPlaying && selectedDownload && activePlaybackUri && (
        <View style={styles.fullScreenPlayer}>
          <ModernVideoPlayer 
            videoUrl={activePlaybackUri}
            title={selectedDownload.title}
            onClose={() => {
              setIsPlaying(false);
              setActivePlaybackUri(null);
            }}
          />
        </View>
      )}
      <Stack.Screen options={{ headerShown: false }} />

      {/* Modern Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={28} color="white" />
          </Pressable>
          <Text style={styles.headerTitle}>Downloads</Text>
          <View style={styles.headerIcons}>
            <Pressable onPress={handleDeleteAll} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}>
              <MaterialCommunityIcons name="trash-can-outline" size={26} color={COLORS.primary} />
            </Pressable>
            <MaterialCommunityIcons name="cast" size={24} color="white" />
            <Ionicons name="search" size={24} color="white" />
          </View>
        </View>
        
        <View style={styles.smartRow}>
          <View style={styles.smartBadge}>
            <MaterialCommunityIcons name="auto-fix" size={14} color="#0071eb" />
            <Text style={styles.smartText}>Smart Downloads: On</Text>
          </View>
          <Pressable style={styles.clearBtn}>
            <Text style={styles.clearText}>Manage</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <StorageBar />

        {/* Active Downloads */}
        {activeDownloads.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Downloading</Text>
            {activeDownloads.map((item, index) => (
              <Animated.View key={item.id} entering={FadeInUp.delay(index * 80)} style={styles.manualItem}>
                <Pressable onPress={() => handlePlay(item)} style={styles.itemRow}>
                  <View style={styles.thumbnailContainer}>
                    <Image source={{ uri: item.image }} style={styles.manualImage} />
                    {canPreview(item) && (
                      <View style={styles.previewBadge}>
                        <Text style={styles.previewText}>PREVIEW</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.manualInfo}>
                    <Text style={styles.manualTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.manualMeta}>
                      {`${Math.round(item.progress * 100)}%`}
                      {item.totalSize ? ` of ${formatBytes(item.totalSize)}` : ''}
                    </Text>
                    <View style={[styles.progressBarBg, { marginTop: 8, height: 3 }]}>
                      <View style={[styles.progressFill, { width: `${Math.max(1, item.progress * 100)}%`, backgroundColor: COLORS.primary }]} />
                    </View>
                  </View>
                </Pressable>
                
                <DownloadProgressCircle 
                  progress={item.progress} 
                  status={item.status} 
                  isPaused={item.isPaused}
                  onPress={() => handleTogglePause(item.id)}
                />

                <Pressable onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
                  <Ionicons name="close-circle-outline" size={24} color="rgba(255,255,255,0.4)" />
                </Pressable>
              </Animated.View>
            ))}
          </View>
        )}

        {/* Grouped Downloads (Ready to Watch) */}
        {(Object.keys(groupedDownloads.groups).length > 0 || groupedDownloads.individual.filter(d => d.status === 'completed').length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ready to Watch</Text>
            {/* TV Show Groups */}
            {Object.keys(groupedDownloads.groups).map(tmdbId => {
              const items = groupedDownloads.groups[tmdbId];
              const completed = items.filter(i => i.status === 'completed');
              if (completed.length === 0) return null;
              
              return (
                <Pressable key={tmdbId} style={styles.groupHeader}>
                  <Image source={{ uri: completed[0].image }} style={styles.groupImage} />
                  <View style={styles.groupInfo}>
                    <Text style={styles.groupTitle} numberOfLines={1}>{completed[0].title.split(' S')[0]}</Text>
                    <Text style={styles.groupMeta}>{completed.length} Episode{completed.length !== 1 ? 's' : ''} • {formatBytes(completed.reduce((a, b) => a + (b.totalSize || 0), 0))}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
                </Pressable>
              );
            })}
            
            {/* Individual Movies (Completed) */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railContent}>
              {groupedDownloads.individual.filter(d => d.status === 'completed').map((item, index) => (
                <Pressable key={item.id} onPress={() => handlePlay(item)}>
                  <Animated.View 
                    entering={FadeInRight.delay(index * 100)}
                    style={styles.readyCard}
                  >
                    <Image source={{ uri: item.image }} style={styles.readyImage} />
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.9)']}
                      style={styles.readyGradient}
                    />
                    <View style={styles.readyInfo}>
                      <Text style={styles.readyTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.readyMeta}>
                        Movie • {formatBytes(item.totalSize || 0)}
                      </Text>
                    </View>
                    <View style={styles.playReady}>
                      <Ionicons name="play" size={18} color="black" />
                    </View>
                  </Animated.View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* All Downloads List */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Downloads</Text>
            {downloads.length > 0 && (
              <Text style={styles.countBadge}>{downloads.length}</Text>
            )}
          </View>
          
          {downloads.length === 0 && !loading && (
            <View style={styles.emptyState}>
              <Ionicons name="download-outline" size={64} color="#333" />
              <Text style={styles.emptyTitle}>No Downloads Yet</Text>
              <Text style={styles.emptyDesc}>
                Movies and shows you download will appear here. Start browsing to find content to watch offline.
              </Text>
              <Pressable style={styles.browseCta} onPress={() => router.push('/(tabs)/home')}>
                <Text style={styles.browseCtaText}>Find Something to Download</Text>
              </Pressable>
            </View>
          )}

          {/* TV Show Groups in My Downloads */}
          {Object.keys(groupedDownloads.groups).map(tmdbId => {
            const items = groupedDownloads.groups[tmdbId];
            const isExpanded = expandedGroups.includes(tmdbId);
            const showTitle = items[0].title.split(' S')[0];
            
            return (
              <View key={tmdbId} style={styles.groupContainer}>
                <Pressable style={styles.groupMainRow} onPress={() => toggleGroup(tmdbId)}>
                  <Image source={{ uri: items[0].image }} style={styles.groupMainImage} />
                  <View style={styles.groupMainInfo}>
                    <Text style={styles.groupMainTitle}>{showTitle}</Text>
                    <Text style={styles.groupMainMeta}>
                      {items.length} Episode{items.length !== 1 ? 's' : ''} • {formatBytes(items.reduce((a, b) => a + (b.totalSize || 0), 0))}
                    </Text>
                  </View>
                  <MaterialCommunityIcons 
                    name={isExpanded ? "chevron-up" : "chevron-down"} 
                    size={24} 
                    color={COLORS.textSecondary} 
                  />
                </Pressable>
                
                {isExpanded && (
                  <Animated.View entering={FadeInUp} style={styles.episodesList}>
                    {items.map(episode => (
                      <View key={episode.id} style={styles.episodeRow}>
                        <Pressable style={styles.episodeInfo} onPress={() => handlePlay(episode)}>
                          <Text style={styles.episodeTitle} numberOfLines={1}>
                            {episode.title.includes(' S') ? episode.title.split(' S')[1].split(' ')[0] : episode.title}
                          </Text>
                          <Text style={styles.episodeMeta}>{formatBytes(episode.totalSize || 0)}</Text>
                        </Pressable>
                        <Pressable 
                          onPress={() => {
                            Alert.alert(
                              episode.title,
                              undefined,
                              [
                                { text: 'Play', onPress: () => handlePlay(episode) },
                                { text: 'Delete Episode', style: 'destructive', onPress: () => handleDelete(episode.id) },
                                { text: 'Cancel', style: 'cancel' }
                              ]
                            );
                          }} 
                          style={styles.episodeOption}
                        >
                          <MaterialCommunityIcons name="dots-vertical" size={20} color={COLORS.textSecondary} />
                        </Pressable>
                      </View>
                    ))}
                  </Animated.View>
                )}
              </View>
            );
          })}

          {/* Individual Items (Movies) */}
          {groupedDownloads.individual.map((item, index) => (
            <Animated.View key={item.id} entering={FadeInUp.delay(index * 80)} style={styles.manualItem}>
              <Pressable style={styles.itemRow} onPress={() => handlePlay(item)}>
                <View style={styles.thumbnailContainer}>
                  <Image source={{ uri: item.image }} style={styles.manualImage} />
                  {item.status === 'completed' && (
                    <View style={styles.playOverlay}>
                      <Ionicons name="play" size={20} color="white" />
                    </View>
                  )}
                  {item.status === 'downloading' && (
                    <View style={styles.downloadingOverlay}>
                      <Text style={styles.downloadPct}>{Math.round(item.progress * 100)}%</Text>
                    </View>
                  )}
                </View>
                <View style={styles.manualInfo}>
                  <Text style={styles.manualTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.manualMeta}>
                    {item.status === 'downloading' 
                      ? `Downloading... ${Math.round(item.progress * 100)}%` 
                      : item.status === 'completed' 
                        ? '✓ Downloaded' 
                        : '✕ Failed'}
                    {item.totalSize ? ` • ${formatBytes(item.totalSize)}` : ''}
                  </Text>
                </View>
              </Pressable>
              
              <Pressable 
                onPress={() => {
                  Alert.alert(
                    item.title,
                    undefined,
                    [
                      { text: 'Play', onPress: () => handlePlay(item) },
                      { text: 'Delete Download', style: 'destructive', onPress: () => handleDelete(item.id) },
                      { text: 'Cancel', style: 'cancel' }
                    ]
                  );
                }} 
                style={styles.optionsBtn}
              >
                <MaterialCommunityIcons name="dots-vertical" size={24} color={COLORS.textSecondary} />
              </Pressable>
            </Animated.View>
          ))}
        </View>

        {/* Smart Downloads / Downloads for You (Circle + Three Cards) - ALWAYS VISIBLE AT BOTTOM */}
        <View style={styles.smartDownloadsBox}>
          <View style={styles.smartHeader}>
            <Text style={styles.smartTitle}>Downloads for You</Text>
            <View style={styles.badgeRow}>
              <MaterialCommunityIcons name="auto-fix" size={12} color="#0071eb" />
              <Text style={styles.smartSubtext}>Personalized for you</Text>
            </View>
          </View>
          
          <Text style={styles.smartDesc}>
            We&apos;ll download a personalized selection of movies and shows for you, so there&apos;s always something to watch on your device.
          </Text>
          
          <View style={styles.stackContainer}>
            <View style={styles.circleBg} />
            <Image 
              source={{ uri: smartPosters[0] }} 
              style={[styles.stackedPoster, styles.posterLeft]} 
              onError={() => {
                // If the poster fails to load, we can hide it or use a default
                // Avoiding console.error to keep logs clean for known placeholder issues
              }}
            />
            <Image 
              source={{ uri: smartPosters[1] }} 
              style={[styles.stackedPoster, styles.posterRight]} 
              onError={() => {}}
            />
            <Image 
              source={{ uri: smartPosters[2] }} 
              style={[styles.stackedPoster, styles.posterCenter]} 
              onError={() => {}}
            />
          </View>

          <Pressable style={styles.setupBtn} onPress={() => router.push('/(tabs)/home')}>
            <Text style={styles.setupText}>Set Up</Text>
          </Pressable>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  progressCircleContainer: {
    marginLeft: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenPlayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    backgroundColor: 'black',
  },
  header: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: 15,
  },
  headerTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
    flex: 1,
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 20,
  },
  smartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  smartBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 113, 235, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 15,
    gap: 6,
  },
  smartText: {
    color: '#0071eb',
    fontSize: 12,
    fontWeight: 'bold',
  },
  clearBtn: {
    padding: 5,
  },
  clearText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  storageContainer: {
    padding: SPACING.md,
    backgroundColor: '#111',
    margin: SPACING.md,
    borderRadius: 12,
  },
  storageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  storageLabel: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  storageValue: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#222',
    borderRadius: 3,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  legend: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 15,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },
  section: {
    marginTop: SPACING.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    marginBottom: 15,
  },
  sectionTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    paddingHorizontal: SPACING.md,
  },
  sectionSub: {
    color: COLORS.textSecondary,
    fontSize: 13,
    paddingHorizontal: SPACING.md,
    marginTop: 2,
    marginBottom: 15,
  },
  countBadge: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginRight: SPACING.md,
  },
  railContent: {
    paddingHorizontal: SPACING.md,
    gap: 15,
  },
  readyCard: {
    width: 120,
    height: 180,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#222',
  },
  readyImage: {
    width: '100%',
    height: '100%',
    opacity: 0.85,
  },
  readyGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  readyInfo: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 40,
  },
  readyTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  readyMeta: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },
  playReady: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  manualItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    marginBottom: 20,
    gap: 10,
  },
  thumbnailContainer: {
    position: 'relative',
  },
  manualImage: {
    width: 120,
    height: 70,
    borderRadius: 6,
    backgroundColor: '#222',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 6,
  },
  downloadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 6,
  },
  downloadPct: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  manualInfo: {
    flex: 1,
  },
  manualTitle: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
  },
  manualMeta: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  deleteBtn: {
    padding: 10,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 40,
  },
  emptyTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
  },
  emptyDesc: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  browseCta: {
    marginTop: 24,
    backgroundColor: 'white',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 4,
  },
  browseCtaText: {
    color: 'black',
    fontWeight: 'bold',
    fontSize: 15,
  },
  failedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    padding: 12,
    backgroundColor: 'rgba(229, 9, 20, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.3)',
  },
  failedText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    flex: 1,
  },
  discoveryBox: {
    alignItems: 'center',
    padding: SPACING.xl,
    marginTop: SPACING.xl,
  },
  discoveryTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 15,
  },
  discoveryDesc: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  discoveryBtn: {
    marginTop: 20,
    backgroundColor: '#fff',
    paddingHorizontal: 30,
    paddingVertical: 10,
    borderRadius: 4,
  },
  discoveryBtnText: {
    color: 'black',
    fontWeight: 'bold',
    fontSize: 15,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginHorizontal: SPACING.md,
    marginBottom: 10,
    borderRadius: 8,
    gap: 15,
  },
  groupImage: {
    width: 60,
    height: 80,
    borderRadius: 4,
  },
  groupInfo: {
    flex: 1,
  },
  groupTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  groupMeta: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  smartDownloadsBox: {
    alignItems: 'center',
    marginTop: 40,
    marginHorizontal: 20,
    backgroundColor: '#111',
    padding: 20,
    borderRadius: 15,
  },
  smartHeader: {
    alignItems: 'center',
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 113, 235, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 5,
    gap: 4,
  },
  smartSubtext: {
    color: '#0071eb',
    fontSize: 10,
    fontWeight: 'bold',
  },
  smartTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  smartDesc: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  stackContainer: {
    width: width * 0.9,
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 30,
    position: 'relative',
  },
  circleBg: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#1a1a1a',
    position: 'absolute',
  },
  stackedPoster: {
    width: 120,
    height: 175,
    borderRadius: 4,
    position: 'absolute',
    borderWidth: 1,
    borderColor: '#333',
  },
  posterLeft: {
    transform: [{ translateX: -60 }, { rotate: '-15deg' }, { scale: 0.85 }],
    zIndex: 1,
    opacity: 0.8,
  },
  posterRight: {
    transform: [{ translateX: 60 }, { rotate: '15deg' }, { scale: 0.85 }],
    zIndex: 1,
    opacity: 0.8,
  },
  posterCenter: {
    zIndex: 2,
    transform: [{ translateY: 5 }],
  },
  setupBtn: {
    backgroundColor: '#0071eb',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 4,
    alignItems: 'center',
    marginTop: 30,
  },
  setupText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  seeWhatBtn: {
    paddingVertical: 15,
    marginTop: 10,
  },
  seeWhatText: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
  },
  optionsBtn: {
    padding: 10,
  },
  groupContainer: {
    marginBottom: 10,
  },
  groupMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    gap: 15,
  },
  groupMainImage: {
    width: 100,
    height: 60,
    borderRadius: 4,
  },
  groupMainInfo: {
    flex: 1,
  },
  groupMainTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  groupMainMeta: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  episodesList: {
    paddingLeft: 70,
    paddingRight: SPACING.md,
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingVertical: 5,
  },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  episodeInfo: {
    flex: 1,
  },
  episodeTitle: {
    color: '#eee',
    fontSize: 14,
  },
  episodeMeta: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  episodeOption: {
    padding: 8,
  },
  previewBadge: {
    position: 'absolute',
    top: 5,
    left: 5,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
  },
  previewText: {
    color: 'white',
    fontSize: 9,
    fontWeight: 'bold',
  },
});
