import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, Text, Dimensions, Pressable, Image, FlatList, ScrollView, StatusBar } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { COLORS, SPACING } from '../../constants/theme';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, withSpring, useSharedValue, interpolate, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../_layout';
import { useFocusEffect } from 'expo-router';

const { width, height } = Dimensions.get('window');

const GAMES_DATA = [
  {
    id: '1',
    title: 'GTA: San Andreas',
    developer: 'Rockstar Games',
    videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    posterUrl: 'https://image.tmdb.org/t/p/w500/z0iCS5Znx7TeTivPEg4sW1O5BG.jpg',
    tags: ['Open World', 'Action', 'Cloud'],
    match: 98,
    isCloud: true,
    description: 'Experience the blockbuster classic, updated for a new generation with across-the-board enhancements.',
  },
  {
    id: '2',
    title: 'Hades',
    developer: 'Supergiant Games',
    videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    posterUrl: 'https://image.tmdb.org/t/p/w500/8c4a8kE7PizaGQQnditMmI1xbRp.jpg',
    tags: ['Roguelike', 'Action', 'Mobile'],
    match: 95,
    isCloud: false,
    description: 'Defy the god of the dead as you hack and slash out of the Underworld in this rogue-like dungeon crawler.',
  },
  {
    id: '3',
    title: 'Oxenfree',
    developer: 'Night School Studio',
    videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    posterUrl: 'https://image.tmdb.org/t/p/w500/5m1tIeG7oQ5g9rQ6XQ0q1Y4G3c.jpg',
    tags: ['Thriller', 'Story-Rich', 'Mobile'],
    match: 89,
    isCloud: false,
    description: 'A supernatural thriller about a group of friends who unwittingly open a ghostly rift.',
  },
  {
    id: '4',
    title: 'Stranger Things 3',
    developer: 'Netflix',
    videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    posterUrl: 'https://image.tmdb.org/t/p/w500/x26YpY0izC7H6988pSAn9v9S9mo.jpg',
    tags: ['Action', 'Retro', 'Mobile'],
    match: 92,
    isCloud: false,
    description: 'Fight your way through a pixelated Hawkins as 12 playable characters from Stranger Things 3.',
  },
];

const GameFeedItem = ({ item, isActive }: { item: typeof GAMES_DATA[0], isActive: boolean }) => {
  const [isMuted, setIsMuted] = useState(true);
  const scale = useSharedValue(1);

  const player = useVideoPlayer(item.videoUrl, (p) => {
    p.loop = true;
    p.muted = true;
    if (isActive) p.play();
  });

  useEffect(() => {
    if (isActive) player.play();
    else player.pause();
  }, [isActive, player]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  return (
    <View style={styles.feedItemContainer}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />
      <LinearGradient colors={['rgba(0,0,0,0.6)', 'transparent']} style={styles.topGradient} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.95)']} style={styles.bottomGradient} />

      <Pressable style={styles.muteButton} onPress={() => {
        setIsMuted(!isMuted);
        player.muted = !isMuted;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}>
        <Ionicons name={isMuted ? "volume-mute" : "volume-medium"} size={22} color="white" />
      </Pressable>

      <View style={styles.overlayContent}>
        <Animated.View style={[styles.gameInfoCard, animatedStyle]}>
          <View style={styles.gameInfoTop}>
            <Image source={{ uri: item.posterUrl }} style={styles.gameIcon} />
            <View style={styles.gameTitleContainer}>
              <View style={styles.matchRow}>
                <Text style={styles.matchScore}>{item.match}% Match</Text>
                {item.isCloud && (
                  <View style={styles.cloudBadge}>
                    <Ionicons name="cloud" size={10} color="black" />
                    <Text style={styles.cloudBadgeText}>CLOUD</Text>
                  </View>
                )}
              </View>
              <Text style={styles.gameTitle}>{item.title}</Text>
              <Text style={styles.developerText}>{item.developer}</Text>
            </View>
          </View>
          <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
        </Animated.View>

        <View style={styles.sideActions}>
          <Pressable style={styles.sideActionBtn}>
            <View style={styles.sideIconCircle}><Ionicons name="add" size={26} color="white" /></View>
            <Text style={styles.sideActionText}>List</Text>
          </Pressable>
          <Pressable style={styles.sideActionBtn}>
            <View style={styles.sideIconCircle}><Feather name="send" size={22} color="white" /></View>
            <Text style={styles.sideActionText}>Share</Text>
          </Pressable>
        </View>

        <Pressable style={styles.playButton} onPress={() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)}>
          <Ionicons name={item.isCloud ? "cloud-outline" : "download-outline"} size={22} color="black" />
          <Text style={styles.playButtonText}>{item.isCloud ? 'Play on Cloud' : 'Install Game'}</Text>
        </Pressable>
      </View>
    </View>
  );
};

function GamesLibrary() {
  const resumePlaying = GAMES_DATA.slice(0, 2);
  
  return (
    <ScrollView style={styles.libraryContainer} showsVerticalScrollIndicator={false}>
      <View style={styles.libraryHeader}>
        <Text style={styles.sectionTitle}>Resume Playing</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.resumeScroll}>
          {resumePlaying.map(game => (
            <Pressable key={game.id} style={styles.resumeCard}>
              <Image source={{ uri: game.posterUrl }} style={styles.resumeImage} />
              <View style={styles.resumeOverlay}>
                <View style={styles.resumePlayBtn}>
                  <Ionicons name="play" size={20} color="black" />
                </View>
                <Text style={styles.resumeTitle} numberOfLines={1}>{game.title}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Game Categories</Text>
        <View style={styles.bentoGrid}>
          <View style={[styles.bentoItem, { backgroundColor: '#e50914', width: width - 32 }]}>
            <Text style={styles.bentoTitle}>New & Trending</Text>
            <MaterialCommunityIcons name="fire" size={32} color="rgba(255,255,255,0.3)" style={styles.bentoIcon} />
          </View>
          <View style={[styles.bentoItem, { backgroundColor: '#1a1a1a', width: (width - 42) * 0.5 }]}>
            <Text style={styles.bentoTitle}>Action</Text>
            <MaterialCommunityIcons name="sword" size={24} color="rgba(255,255,255,0.3)" style={styles.bentoIcon} />
          </View>
          <View style={[styles.bentoItem, { backgroundColor: '#2b0a14', width: (width - 42) * 0.5 }]}>
            <Text style={styles.bentoTitle}>Puzzles</Text>
            <MaterialCommunityIcons name="puzzle" size={24} color="rgba(255,255,255,0.3)" style={styles.bentoIcon} />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>All Mobile Games</Text>
        <View style={styles.allGamesGrid}>
          {GAMES_DATA.map(game => (
            <Pressable key={game.id} style={styles.gameCardSmall}>
              <Image source={{ uri: game.posterUrl }} style={styles.gameCardIcon} />
              <Text style={styles.gameCardTitle} numberOfLines={1}>{game.title}</Text>
              <Text style={styles.gameCardDev}>{game.developer}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

export default function GamesScreen() {
  const { setThemeColor } = useTheme();
  const [viewMode, setViewMode] = useState<'discovery' | 'library'>('discovery');
  const [activeIndex, setActiveIndex] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setThemeColor('#000000');
    }, [])
  );

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) setActiveIndex(viewableItems[0].index);
  }).current;

  const toggleView = () => {
    setViewMode(prev => prev === 'discovery' ? 'library' : 'discovery');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      <SafeAreaView style={styles.headerSafeArea} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Games</Text>
          <View style={styles.headerIcons}>
            <Pressable style={styles.iconButton} onPress={toggleView}>
              <MaterialCommunityIcons 
                name={viewMode === 'discovery' ? "library-shelves" : "play-box-multiple"} 
                size={26} 
                color="white" 
              />
            </Pressable>
            <Pressable style={styles.iconButton}>
              <Ionicons name="search" size={24} color="white" />
            </Pressable>
          </View>
        </View>
        
        {viewMode === 'discovery' && (
          <View style={styles.filterContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
              <View style={[styles.filterPill, styles.filterPillActive]}><Text style={styles.filterTextActive}>For You</Text></View>
              <View style={styles.filterPill}><Text style={styles.filterText}>Action</Text></View>
              <View style={styles.filterPill}><Text style={styles.filterText}>RPG</Text></View>
              <View style={styles.filterPill}><Text style={styles.filterText}>Cloud</Text></View>
            </ScrollView>
          </View>
        )}
      </SafeAreaView>

      {viewMode === 'discovery' ? (
        <FlatList
          data={GAMES_DATA}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => <GameFeedItem item={item} isActive={index === activeIndex} />}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
          snapToAlignment="start"
          decelerationRate="fast"
        />
      ) : (
        <Animated.View entering={FadeIn.duration(400)} style={{ flex: 1 }}>
          <GamesLibrary />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  headerSafeArea: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { color: 'white', fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  iconButton: { padding: 4 },
  filterContainer: { paddingVertical: 8 },
  filterScroll: { paddingHorizontal: 16, gap: 10 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  filterPillActive: { backgroundColor: 'white' },
  filterText: { color: 'white', fontSize: 14, fontWeight: '600' },
  filterTextActive: { color: 'black', fontWeight: 'bold' },
  feedItemContainer: { width, height },
  topGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 180 },
  bottomGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.6 },
  muteButton: { position: 'absolute', top: height * 0.18, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  overlayContent: { position: 'absolute', bottom: 90, left: 0, right: 0, padding: 16 },
  gameInfoCard: { backgroundColor: 'rgba(25, 25, 25, 0.7)', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', width: '85%' },
  gameInfoTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  gameIcon: { width: 56, height: 60, borderRadius: 12, marginRight: 12 },
  gameTitleContainer: { flex: 1 },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  matchScore: { color: '#46d369', fontWeight: 'bold', fontSize: 13 },
  cloudBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4, gap: 2 },
  cloudBadgeText: { color: 'black', fontSize: 9, fontWeight: '900' },
  gameTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  developerText: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  description: { color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 18 },
  sideActions: { position: 'absolute', right: 16, bottom: 85, alignItems: 'center', gap: 20 },
  sideActionBtn: { alignItems: 'center', gap: 6 },
  sideIconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  sideActionText: { color: 'white', fontSize: 12, fontWeight: '600' },
  playButton: { flexDirection: 'row', backgroundColor: 'white', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8 },
  playButtonText: { color: 'black', fontSize: 17, fontWeight: 'bold' },
  // Library Styles
  libraryContainer: { flex: 1, paddingTop: 140, paddingHorizontal: 16 },
  libraryHeader: { marginBottom: 24 },
  sectionTitle: { color: 'white', fontSize: 20, fontWeight: '900', marginBottom: 16, letterSpacing: -0.5 },
  resumeScroll: { gap: 12 },
  resumeCard: { width: width * 0.7, height: 160, borderRadius: 16, overflow: 'hidden', backgroundColor: '#1a1a1a' },
  resumeImage: { width: '100%', height: '100%', opacity: 0.6 },
  resumeOverlay: { ...StyleSheet.absoluteFillObject, padding: 16, justifyContent: 'flex-end' },
  resumePlayBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  resumeTitle: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  section: { marginBottom: 32 },
  bentoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bentoItem: { height: 100, borderRadius: 16, padding: 16, justifyContent: 'space-between' },
  bentoTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  bentoIcon: { alignSelf: 'flex-end' },
  allGamesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  gameCardSmall: { width: (width - 48) / 2, marginBottom: 8 },
  gameCardIcon: { width: '100%', aspectRatio: 1, borderRadius: 16, backgroundColor: '#1a1a1a', marginBottom: 8 },
  gameCardTitle: { color: 'white', fontSize: 14, fontWeight: 'bold' },
  gameCardDev: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
});
