import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, findNodeHandle } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { fetchPopular, getImageUrl, getBackdropUrl } from '../../services/tmdb';
import TvPosterCard from '../../components/TvPosterCard';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import ColorExtractor from '../../components/ColorExtractor';
import ExpandingRow from '../../components/ExpandingRow';
import { useProfile } from '../../context/ProfileContext';
import { WatchHistoryService, WatchHistoryItem } from '../../services/WatchHistoryService';
import { MyListService } from '../../services/MyListService';
import { useCallback } from 'react';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useTvFocusBridge } from '../../context/TvFocusBridgeContext';

export default function MyNetflixScreen() {
  const { selectedProfile } = useProfile();
  const [myList, setMyList] = useState<any[]>([]);
  const [continueWatching, setContinueWatching] = useState<any[]>([]);
  const [heroColors, setHeroColors] = useState<readonly [string, string, string]>(['rgba(40, 0, 0, 0.8)', 'rgba(10, 0, 0, 0.9)', '#000']);
  const [loading, setLoading] = useState(true);
  const [pendingTarget, setPendingTarget] = useState<{ id: string, type: string } | null>(null);
  const router = useRouter();
  const { setHeroFocusTag } = useTvFocusBridge();
  const downloadsActionRef = useRef<any>(null);

  const loadData = useCallback(async () => {
    try {
      // Real Watch History Sync
      if (selectedProfile?.id) {
        await WatchHistoryService.syncWithFirestore(selectedProfile.id);
      }
      
      // Real Watch History Load
      const history = await WatchHistoryService.getAllHistory(selectedProfile.id);
      setContinueWatching(history.map(h => ({
        ...h.item,
        media_type: h.type,
        progressPercentage: (h.currentTime / h.duration) * 100
      })));

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedProfile?.id]);

  // Real-time My List Subscription
  useEffect(() => {
    if (selectedProfile?.id) {
      const unsub = MyListService.subscribeToList(selectedProfile.id, (items) => {
        setMyList(items);
      });
      return () => unsub();
    }
  }, [selectedProfile?.id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      return undefined;
    }, [loadData])
  );

  useFocusEffect(
    useCallback(() => {
      const timeout = setTimeout(() => {
        const tag = findNodeHandle(downloadsActionRef.current);
        setHeroFocusTag(typeof tag === 'number' ? tag : null);
      }, 0);
      return () => {
        clearTimeout(timeout);
        setHeroFocusTag(null);
      };
    }, [loading, setHeroFocusTag])
  );

  const handleSelect = useCallback((id: string, type: string = 'movie') => {
    setPendingTarget({ id, type });
  }, []);

  const confirmNavigation = () => {
    if (pendingTarget) {
      router.push({ pathname: `/movie/${pendingTarget.id}`, params: { type: pendingTarget.type } });
      setPendingTarget(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LoadingSpinner size={92} label="Loading My Netflix" />
      </View>
    );
  }

  const firstPoster = myList[0]?.backdrop_path || continueWatching[0]?.backdrop_path;

  return (
    <View style={styles.masterContainer}>
      {/* Ambient Background Layer */}
      <View style={styles.ambientBackground}>
        <LinearGradient
          colors={heroColors}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <ColorExtractor 
        imageUrl={getBackdropUrl(firstPoster) || ''} 
        onColorExtracted={(color) => {
          setHeroColors([`${color}99`, `${color}66`, '#000000']);
        }}
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.header}>
           <Image 
             source={selectedProfile?.avatar} 
             style={styles.profileBox} 
             contentFit="cover"
           />
           <View style={styles.headerText}>
             <Text style={styles.greeting}>For</Text>
             <Text style={styles.userName}>{selectedProfile?.name || 'Netflix User'}</Text>
           </View>
           
           {/* Account Quick Actions */}
           <View style={styles.actionRow}>
              <Pressable
                ref={downloadsActionRef}
                style={({ focused }) => [styles.actionBtn, focused && styles.actionBtnFocused]}
                onPress={() => router.push('/(tabs)/downloads')}
              >
                 <View style={styles.actionIconBox}>
                   <Ionicons name="download" size={32} color="white" />
                 </View>
                 <Text style={styles.actionText}>Downloads</Text>
              </Pressable>
              <Pressable
                style={({ focused }) => [styles.actionBtn, focused && styles.actionBtnFocused]}
                onPress={() => router.push('/notifications')}
              >
                 <View style={styles.actionIconBox}>
                   <Ionicons name="notifications" size={32} color="white" />
                 </View>
                 <Text style={styles.actionText}>Notifications</Text>
              </Pressable>
           </View>
        </View>

        <View style={styles.hubContent}>
          <ExpandingRow 
             title="Continue Watching" 
             content={continueWatching} 
             onItemPress={(movie) => handleSelect(movie.id.toString(), movie.media_type || 'movie')} 
          />
          <ExpandingRow 
             title="My List" 
             content={myList} 
             onItemPress={(movie) => handleSelect(movie.id.toString(), 'movie')} 
          />
        </View>
      </ScrollView>

      {/* Profile Gate Overlay */}
      {pendingTarget && (
        <View style={styles.gateOverlay}>
          <LinearGradient colors={['rgba(0,0,0,0.85)', '#000']} style={StyleSheet.absoluteFill} />
          <View style={styles.gateContent}>
            <Image 
              source={selectedProfile?.avatar} 
              style={styles.gateAvatar} 
              contentFit="cover"
            />
            <Text style={styles.gateTitle}>Finish Watching as {selectedProfile?.name}?</Text>
            <Text style={styles.gateSubtitle}>This will keep your progress synced to this profile.</Text>
            
            <View style={styles.gateActions}>
              <Pressable 
                style={({ focused }) => [styles.gateBtn, styles.gateBtnPrimary, focused && styles.gateBtnFocused]}
                onPress={confirmNavigation}
              >
                <Text style={styles.gateBtnText}>Watch Now</Text>
              </Pressable>
              
              <Pressable 
                style={({ focused }) => [styles.gateBtn, focused && styles.gateBtnFocused]}
                onPress={() => setPendingTarget(null)}
              >
                <Text style={styles.gateBtnTextSecondary}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  masterContainer: { 
    flex: 1, 
    backgroundColor: '#000' 
  },
  ambientBackground: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  container: { 
    flex: 1, 
    backgroundColor: 'transparent' 
  },
  contentContainer: { 
    paddingHorizontal: 80, 
    paddingTop: 120,
    paddingBottom: 100,
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
    marginBottom: 80,
    gap: 30,
  },
  profileBox: {
    width: 140,
    height: 140,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  headerText: {
    marginLeft: 10,
    flex: 1,
  },
  greeting: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 24,
    fontWeight: '600',
  },
  userName: {
    color: 'white',
    fontSize: 54,
    fontWeight: '900',
    marginTop: -5,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 40,
  },
  actionBtn: {
    alignItems: 'center',
    gap: 15,
    padding: 10,
    borderRadius: 12,
  },
  actionBtnFocused: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    transform: [{ scale: 1.05 }],
  },
  actionIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 18,
    fontWeight: 'bold',
  },
  hubContent: {
    gap: 60,
  },
  row: {
    marginBottom: 20,
  },
  rowContent: {
    gap: 20,
    paddingTop: 10,
  },
  section: {
    marginBottom: 40,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    marginBottom: 25,
  },
  sectionTitle: {
    color: 'white',
    fontSize: 32,
    fontWeight: 'bold',
  },
  notificationCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 30,
    borderRadius: 15,
    width: '60%',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 22,
    lineHeight: 32,
  },
  gateOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gateContent: {
    alignItems: 'center',
    width: '60%',
    padding: 60,
    backgroundColor: '#141414',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  gateAvatar: {
    width: 120,
    height: 120,
    borderRadius: 8,
    marginBottom: 30,
  },
  gateTitle: {
    color: 'white',
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  gateSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 20,
    marginBottom: 45,
    textAlign: 'center',
  },
  gateActions: {
    flexDirection: 'row',
    gap: 30,
  },
  gateBtn: {
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 8,
    minWidth: 200,
    alignItems: 'center',
  },
  gateBtnPrimary: {
    backgroundColor: 'white',
  },
  gateBtnFocused: {
    transform: [{ scale: 1.05 }],
    borderWidth: 3,
    borderColor: '#E50914',
  },
  gateBtnText: {
    color: 'black',
    fontSize: 20,
    fontWeight: 'bold',
  },
  gateBtnTextSecondary: {
    color: 'white',
    fontSize: 20,
    fontWeight: '600',
  }
});
