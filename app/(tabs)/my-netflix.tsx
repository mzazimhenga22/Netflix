import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Pressable, Dimensions, StatusBar, Modal, Switch, Platform } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { BlurView } from 'expo-blur';
import { COLORS, SPACING } from '../../constants/theme';
import { fetchPopular, getImageUrl, getBackdropUrl } from '../../services/tmdb';
import { Ionicons, Feather, MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '../_layout';
import { useProfile } from '../../context/ProfileContext';
import { MyListService } from '../../services/MyListService';
import { WatchHistoryService } from '../../services/WatchHistoryService';
import Animated, { 
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { auth, db } from '../../services/firebase';
import { signOut } from 'firebase/auth';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { Alert, TextInput } from 'react-native';
import Constants from 'expo-constants';
const { width } = Dimensions.get('window');
const SMART_ACTIONS = [
  { id: '1', title: 'Notifications', icon: 'notifications', color: '#e50914', badge: '3' },
  { id: '2', title: 'Downloads', icon: 'download', color: '#0071eb' },
  { id: '3', title: 'My List', icon: 'add-circle', color: '#46d369' },
  { id: '5', title: 'Link TV', icon: 'tv', color: '#E50914' },
  { id: '4', title: 'Account', icon: 'settings', color: '#8e8e93' },
];
const MOMENTS = [
  {
    id: 'm1',
    title: 'Bridgerton',
    subtitle: 'Bridgerton | S4:E1',
    timestamp: 'Starts at 49:20',
    duration: '15s',
    imageUrl: 'https://image.tmdb.org/t/p/w500/uq4Z5I6E2B1h6f5w9z6n1l8j4l9.jpg',
    movieId: '94605',
    type: 'tv'
  },
  {
    id: 'm2',
    title: 'Stranger Things',
    subtitle: 'Stranger Things | S4:E9',
    timestamp: 'Starts at 06:27',
    duration: '2m',
    imageUrl: 'https://image.tmdb.org/t/p/w500/5625gH0WZ2958z1n3MWv65v84YN.jpg',
    movieId: '66732',
    type: 'tv'
  }
];
const getProfileColor = (profile: any) => {
  if (!profile) return '#e50914';
  if (profile.isKids) return '#0071eb';
  
  const colors: Record<string, string> = {
    avatar1: '#E50914',
    avatar2: '#0071eb',
    avatar3: '#46d369',
    avatar4: '#f5c518',
    avatar5: '#b9090b',
    avatar6: '#e91e63',
    avatar7: '#9c27b0',
    avatar8: '#ff5722',
    avatar9: '#00bcd4',
    avatar10: '#3f51b5',
  };
  return colors[profile.avatarId] || '#E50914';
};
/* ── Liquid Glass Circular Icon Button ── */
const GlassCircularButton = React.memo(({ onPress, children }: { onPress: () => void; children: React.ReactNode }) => {
  return (
    <View style={styles.glassCircleContainer}>
      <Pressable onPress={onPress} style={styles.glassCircleBody}>
        {/* Real-time blur */}
        <BlurView
          intensity={Platform.OS === 'ios' ? 65 : 75}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.glassPillTintFill} />
        {/* Convex dome – horizontal edge vignette */}
        <LinearGradient
          colors={[
            'rgba(0,0,0,0.20)',
            'rgba(0,0,0,0.07)',
            'transparent',
            'transparent',
            'rgba(0,0,0,0.07)',
            'rgba(0,0,0,0.20)',
          ]}
          locations={[0, 0.1, 0.25, 0.75, 0.9, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Convex dome – vertical center-bright */}
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.20)', // brighter top sheen
            'rgba(255,255,255,0.06)',
            'transparent',
            'transparent',
            'rgba(255,255,255,0.05)',
            'rgba(255,255,255,0.12)',
          ]}
          locations={[0, 0.15, 0.40, 0.80, 0.90, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Specular Highlight */}
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.30)', // Top rim glint
            'rgba(255,255,255,0.05)', 
            'rgba(255,255,255,0.40)', // Cylindrical bright glint band
            'rgba(255,255,255,0.08)',
            'transparent',            // Face shadow
            'rgba(255,255,255,0.15)', // Bottom bounce light
          ]}
          locations={[0, 0.08, 0.18, 0.32, 0.85, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Inner shadow */}
        <LinearGradient
          colors={[
            'rgba(0,0,0,0.28)', // Top shadow roll
            'transparent',
            'transparent',
            'rgba(0,0,0,0.48)', // Bottom shadow roll curving away
          ]}
          locations={[0, 0.12, 0.78, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Refraction edge line */}
        <View style={styles.glassCircleRefraction} pointerEvents="none" />
        {/* Outer glass border */}
        <View style={styles.glassCircleBorder} pointerEvents="none" />
        <View style={styles.glassCircleContent}>
          {children}
        </View>
      </Pressable>
    </View>
  );
});
/* ── Liquid Glass Pill Button Component for Profile / Menu / Filters ── */
const GlassPillButton = React.memo(({ isFocused, activeColor, onPress, children }: { isFocused: boolean; activeColor: string; onPress: () => void; children: React.ReactNode }) => {
  return (
    <View style={styles.glassPillContainer}>
      {/* Dynamic ambient color aura bleed behind the active pill */}
      {isFocused && (
        <View style={[styles.activePillAuraShadow, { shadowColor: activeColor }]} pointerEvents="none" />
      )}
      <Pressable onPress={onPress} style={styles.glassPillBody}>
        {/* Real-time blur */}
        <BlurView
          intensity={Platform.OS === 'ios' ? 65 : 75}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.glassPillTintFill} />
        {/* Convex dome – horizontal edge vignette */}
        <LinearGradient
          colors={[
            'rgba(0,0,0,0.18)',
            'rgba(0,0,0,0.06)',
            'transparent',
            'transparent',
            'rgba(0,0,0,0.06)',
            'rgba(0,0,0,0.18)',
          ]}
          locations={[0, 0.08, 0.22, 0.78, 0.92, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Convex dome – vertical center-bright band */}
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.20)', // brighter top sheen
            'rgba(255,255,255,0.06)',
            'transparent',
            'transparent',
            'rgba(255,255,255,0.05)',
            'rgba(255,255,255,0.12)',
          ]}
          locations={[0, 0.15, 0.40, 0.80, 0.90, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Specular Highlight */}
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.30)', // Top rim glint
            'rgba(255,255,255,0.05)', 
            'rgba(255,255,255,0.40)', // Cylindrical bright glint band
            'rgba(255,255,255,0.08)',
            'transparent',            // Face shadow
            'rgba(255,255,255,0.15)', // Bottom bounce light
          ]}
          locations={[0, 0.08, 0.18, 0.32, 0.85, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Inner shadow */}
        <LinearGradient
          colors={[
            'rgba(0,0,0,0.28)', // Top shadow roll
            'transparent',
            'transparent',
            'rgba(0,0,0,0.48)', // Bottom shadow roll curving away
          ]}
          locations={[0, 0.12, 0.78, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Refraction edge line */}
        <View style={styles.glassPillRefraction} pointerEvents="none" />
        {/* Outer glass border */}
        <View style={styles.glassPillBorder} pointerEvents="none" />
        {/* Active background glow */}
        {isFocused && (
          <View style={StyleSheet.absoluteFill}>
            <View style={styles.activePillGlow} />
            <LinearGradient
              colors={[
                `${activeColor}40`, // Soft active profile color wash inside
                'transparent',
                `${activeColor}20`,
              ]}
              locations={[0, 0.5, 1]}
              style={StyleSheet.absoluteFill}
            />
          </View>
        )}
        <View style={styles.glassPillContent}>
          {children}
        </View>
      </Pressable>
    </View>
  );
});
export default function MyNetflixScreen() {
  const router = useRouter();
  const { selectedProfile, profiles, selectProfile, updateProfileSettings } = useProfile();
  const { setThemeColor } = useTheme();
  const profileColor = getProfileColor(selectedProfile);
  const [myList, setMyList] = useState<any[]>([]);
  const [continueWatching, setContinueWatching] = useState<any[]>([]);
  const [likedList, setLikedList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLinking, setIsLinking] = useState(false);
  const [tvLinkCode, setTvLinkCode] = useState('');
  const [showTvLinkModal, setShowTvLinkModal] = useState(false);
  const [activeListFilter, setActiveListFilter] = useState<'All' | 'Movies' | 'TV Shows' | 'Started'>('All');
  const spatialEnabled = selectedProfile?.settings?.spatialMode !== false;
  
  const handleLinkTV = () => {
    setTvLinkCode('');
    setShowTvLinkModal(true);
  };
  const confirmLinkTV = async () => {
    const formattedCode = tvLinkCode.trim();
    if (!formattedCode) return;
    setShowTvLinkModal(false);
    setIsLinking(true);
    try {
      const codeDoc = await getDoc(doc(db, 'tv_codes', formattedCode));
      if (codeDoc.exists()) {
        const userEmail = auth.currentUser?.email;
        const uid = auth.currentUser?.uid;
        if (!userEmail || !uid) throw new Error('No user logged in');
        await updateDoc(doc(db, 'tv_codes', formattedCode), {
          status: 'authorized',
          email: userEmail,
          uid,
          authorizedAt: new Date()
        });
        Alert.alert('Success', 'Your TV is now linked!');
      } else {
        Alert.alert('Error', 'Invalid code. Please check your TV screen.');
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to connect to TV.');
    } finally {
      setIsLinking(false);
    }
  };
  
  const bottomSheetRef = React.useRef<BottomSheet>(null);
  const snapPoints = React.useMemo(() => ['58%'], []);
  const renderBackdrop = React.useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsAt={-1} appearsAt={0} opacity={0.7} />
    ),
    []
  );
  useFocusEffect(
    React.useCallback(() => {
      const activeColor = getProfileColor(selectedProfile);
      setThemeColor(activeColor);
    }, [selectedProfile])
  );
  useEffect(() => {
    fetchPopular().then(results => {
      const formatted = results.slice(0, 10).map((item: any) => ({
        ...item,
        imageUrl: getImageUrl(item.poster_path),
        backdropUrl: getBackdropUrl(item.backdrop_path),
        type: item.media_type || 'movie'
      }));
      setLikedList(formatted);
    }).catch(err => console.error(err));
  }, []);
  useEffect(() => {
    if (!selectedProfile) {
      setMyList([]);
      setContinueWatching([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubList = MyListService.subscribeToList(selectedProfile.id, (items: any[]) => {
      const formatted = items.map(item => ({
        ...item,
        imageUrl: getImageUrl(item.poster_path),
        backdropUrl: getBackdropUrl(item.backdrop_path),
      }));
      setMyList(formatted);
      setLoading(false);
    });
    const unsubHistory = WatchHistoryService.subscribeToHistory(selectedProfile.id, (items: any[]) => {
      if (!items || !Array.isArray(items)) {
        setContinueWatching([]);
        return;
      }
      
      // Deduplicate by item.id, keeping only the one with the latest lastUpdated timestamp
      const latestEpisodesMap: { [key: string]: any } = {};
      items.forEach(item => {
        if (!item || !item.id) return;
        const baseId = item.id.toString();
        const existing = latestEpisodesMap[baseId];
        if (!existing || (item.lastUpdated || 0) > (existing.lastUpdated || 0)) {
          latestEpisodesMap[baseId] = item;
        }
      });
      
      const uniqueItems = Object.values(latestEpisodesMap);
      
      const formatted = uniqueItems
        .map((item: any) => {
          const itemData = item.item || {};
          return {
            ...item,
            title: itemData.title || itemData.name || 'Unknown',
            imageUrl: itemData.poster_path 
              ? getImageUrl(itemData.poster_path) 
              : (itemData.backdrop_path ? getBackdropUrl(itemData.backdrop_path) : ''),
            backdropUrl: getBackdropUrl(itemData.backdrop_path),
          };
        })
        .sort((a: any, b: any) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
        
      setContinueWatching(formatted);
    });
    return () => {
      unsubList();
      unsubHistory();
    };
  }, [selectedProfile]);
  const dynamicMoments = useMemo(() => {
    if (likedList.length >= 2) {
      return [
        {
          id: 'm1',
          title: likedList[0].title || likedList[0].name || 'Bridgerton',
          subtitle: `${likedList[0].title || likedList[0].name} | S4:E1`,
          timestamp: 'Starts at 49:20',
          duration: '15s',
          imageUrl: likedList[0].backdropUrl || likedList[0].imageUrl || MOMENTS[0].imageUrl,
          movieId: likedList[0].id,
          type: likedList[0].type
        },
        {
          id: 'm2',
          title: likedList[1].title || likedList[1].name || 'Stranger Things',
          subtitle: `${likedList[1].title || likedList[1].name}`,
          timestamp: 'Starts at 06:27',
          duration: '2m',
          imageUrl: likedList[1].backdropUrl || likedList[1].imageUrl || MOMENTS[1].imageUrl,
          movieId: likedList[1].id,
          type: likedList[1].type
        }
      ];
    }
    return MOMENTS;
  }, [likedList]);
  if (loading) return <View style={{ flex: 1, backgroundColor: 'black' }} />;
  const filteredMyList = myList.filter(item => {
    if (activeListFilter === 'Movies') return item.type === 'movie';
    if (activeListFilter === 'TV Shows') return item.type === 'tv';
    if (activeListFilter === 'Started') return false;
    return true;
  });
  const showContinueWatching = continueWatching.length > 0 && (activeListFilter === 'All' || activeListFilter === 'Started');
  const showMyList = activeListFilter !== 'Started';
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Floating Header */}
      <View style={[styles.floatingHeader, { backgroundColor: 'transparent' }]}>
        <SafeAreaView edges={['top']} style={styles.headerContent}>
          {/* Profile Switcher Trigger */}
          <Pressable 
            style={styles.profileHeaderBtn} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              bottomSheetRef.current?.expand();
            }}
          >
            <Image source={selectedProfile?.avatar} style={styles.headerAvatar} />
            <Text style={styles.headerProfileName} numberOfLines={1}>{selectedProfile?.name || 'User'}</Text>
            <Ionicons name="chevron-down" size={14} color="white" style={styles.headerCaret} />
          </Pressable>
          {/* Action Icons */}
          <View style={styles.headerIcons}>
            <GlassCircularButton onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Alert.alert('Casting', 'Looking for casting devices...');
            }}>
              <MaterialIcons name="cast" size={20} color="white" />
            </GlassCircularButton>
            <GlassCircularButton onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/downloads');
            }}>
              <Feather name="download" size={18} color="white" />
            </GlassCircularButton>
            <GlassCircularButton onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              bottomSheetRef.current?.expand();
            }}>
              <Ionicons name="menu" size={22} color="white" />
            </GlassCircularButton>
          </View>
        </SafeAreaView>
      </View>
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Immersive Profile Ambient Gradient */}
        <LinearGradient
          colors={[`${profileColor}15`, 'transparent']}
          style={styles.profileGradient}
        />
        
        {/* Spacer for Floating Header */}
        <View style={{ height: 110 }} />
        {/* Filter Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsContainer}>
          {['All', 'Movies', 'TV Shows', 'Started'].map(filter => (
            <GlassPillButton
              key={filter}
              isFocused={activeListFilter === filter}
              activeColor={profileColor}
              onPress={() => {
                Haptics.selectionAsync();
                setActiveListFilter(filter as any);
              }}
            >
              <Text style={[styles.listFilterText, activeListFilter === filter && styles.listFilterTextActive]}>{filter}</Text>
            </GlassPillButton>
          ))}
        </ScrollView>
        {/* SECTION 1: Moments You've Saved */}
        <Animated.View entering={FadeInDown.duration(500)} style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Moments You've Saved</Text>
            <Pressable style={styles.seeAllBtn}>
              <Text style={styles.seeAllText}>See All</Text>
              <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.4)" />
            </Pressable>
          </View>
          
          <View style={styles.momentsContainer}>
            {dynamicMoments.map((moment) => (
              <Pressable 
                key={moment.id} 
                style={styles.momentCard}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({ pathname: "/movie/[id]", params: { id: moment.movieId, type: moment.type, autoplay: 'true' } });
                }}
              >
                <View style={styles.momentImageContainer}>
                  <Image source={{ uri: moment.imageUrl }} style={styles.momentImage} />
                  
                  {/* Play & Duration Overlay */}
                  <View style={styles.momentPlayPill}>
                    <View style={styles.momentPlayBtn}>
                      <Ionicons name="play" size={10} color="black" style={{ marginLeft: 1 }} />
                    </View>
                    <Text style={styles.momentDurationText}>{moment.duration}</Text>
                  </View>
                  
                  {/* Share Icon Overlay */}
                  <View style={styles.momentShareBtn}>
                    <Feather name="send" size={12} color="white" />
                  </View>
                </View>
                
                {/* Metadata */}
                <View style={styles.momentMetaBox}>
                  <Text style={styles.momentTimestamp}>{moment.timestamp}</Text>
                  <Text style={styles.momentSubtitle} numberOfLines={1}>{moment.subtitle}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </Animated.View>
        {/* SECTION 2: Continue Watching */}
        {showContinueWatching && (
          <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Continue Watching</Text>
              <Pressable style={styles.seeAllBtn}>
                <Text style={styles.seeAllText}>See All</Text>
                <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.4)" />
              </Pressable>
            </View>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowListContent}>
              {continueWatching.map((item) => {
                if (!item) return null;
                let progressWidth = 0;
                const currentTime = Number(item.currentTime);
                const duration = Number(item.duration);
                if (!isNaN(currentTime) && !isNaN(duration) && duration > 0) {
                  progressWidth = Math.min(100, (currentTime / duration) * 100);
                }
                return (
                  <Pressable 
                    key={item.id} 
                    style={styles.posterCard}
                    onPress={() => {
                      const params: any = { id: item.id, type: item.type };
                      if (item.season !== undefined && item.season !== null) params.season = item.season.toString();
                      if (item.episode !== undefined && item.episode !== null) params.episode = item.episode.toString();
                      if (item.currentTime !== undefined && item.currentTime !== null) params.resumeTime = item.currentTime.toString();
                      if (item.duration !== undefined && item.duration !== null) params.resumeDuration = item.duration.toString();
                      router.push({ pathname: "/movie/[id]", params });
                    }}
                  >
                    <View style={styles.posterWrapper}>
                      <Image source={{ uri: item.imageUrl }} style={styles.posterImage} />
                      
                      {/* Netflix N Badge */}
                      <View style={styles.nBadge}>
                        <ExpoImage 
                          source={require('../../assets/images/netflix-n-logo.svg')} 
                          style={styles.nBadgeImage} 
                          contentFit="contain"
                        />
                      </View>
                      {/* Play Button Overlay */}
                      <Pressable 
                        style={styles.posterPlayOverlay}
                        onPress={(e) => {
                          e.stopPropagation();
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                          const params: any = { id: item.id, type: item.type, autoPlay: 'true' };
                          if (item.season !== undefined && item.season !== null) params.season = item.season.toString();
                          if (item.episode !== undefined && item.episode !== null) params.episode = item.episode.toString();
                          if (item.currentTime !== undefined && item.currentTime !== null) params.resumeTime = item.currentTime.toString();
                          if (item.duration !== undefined && item.duration !== null) params.resumeDuration = item.duration.toString();
                          router.push({ pathname: "/movie/[id]", params });
                        }}
                      >
                        <BlurView intensity={65} tint="light" style={styles.posterPlayBtn}>
                          <Ionicons name="play" size={16} color="white" style={{ marginLeft: 2 }} />
                        </BlurView>
                      </Pressable>
                      {/* Progress Bar */}
                      <View style={styles.progressBarBackground}>
                        <View style={[styles.progressBarFill, { width: `${progressWidth}%`, backgroundColor: profileColor }]} />
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>
        )}
        {/* SECTION 3: My List */}
        {showMyList && filteredMyList.length > 0 && (
          <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>My List</Text>
              <Pressable style={styles.seeAllBtn} onPress={() => router.push('/my-list' as any)}>
                <Text style={styles.seeAllText}>See All</Text>
                <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.4)" />
              </Pressable>
            </View>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowListContent}>
              {filteredMyList.map((item) => (
                <Pressable 
                  key={item.id} 
                  style={styles.posterCard}
                  onPress={() => router.push({ pathname: "/movie/[id]", params: { id: item.id, type: item.type } })}
                >
                  <View style={styles.posterWrapper}>
                    <Image source={{ uri: item.imageUrl }} style={styles.posterImage} />
                    
                    {/* Netflix N Badge */}
                    <View style={styles.nBadge}>
                      <ExpoImage 
                        source={require('../../assets/images/netflix-n-logo.svg')} 
                        style={styles.nBadgeImage} 
                        contentFit="contain"
                      />
                    </View>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        )}
        {/* SECTION 4: TV Shows & Movies You Liked */}
        {likedList.length > 0 && (
          <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>TV Shows & Movies You Liked</Text>
              <Pressable style={styles.seeAllBtn}>
                <Text style={styles.seeAllText}>See All</Text>
                <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.4)" />
              </Pressable>
            </View>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowListContent}>
              {likedList.map((item) => (
                <Pressable 
                  key={item.id} 
                  style={styles.posterCard}
                  onPress={() => router.push({ pathname: "/movie/[id]", params: { id: item.id, type: item.type } })}
                >
                  <View style={styles.posterWrapper}>
                    <Image source={{ uri: item.imageUrl }} style={styles.posterImage} />
                    
                    {/* Netflix N Badge */}
                    <View style={styles.nBadge}>
                      <ExpoImage 
                        source={require('../../assets/images/netflix-n-logo.svg')} 
                        style={styles.nBadgeImage} 
                        contentFit="contain"
                      />
                    </View>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        )}
        {/* SECTION 5: Trailers You Liked (Landscape format matching original Trailers row) */}
        {activeListFilter === 'All' && myList.length > 5 && (
          <Animated.View entering={FadeInDown.delay(350).duration(500)} style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Trailers You Liked</Text>
              <Pressable style={styles.seeAllBtn}>
                <Text style={styles.seeAllText}>See All</Text>
                <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.4)" />
              </Pressable>
            </View>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowListContent}>
              {myList.slice(5, 10).map((item) => (
                <Pressable 
                  key={item.id} 
                  style={styles.landscapeCard}
                  onPress={() => router.push({ pathname: "/movie/[id]", params: { id: item.id, type: item.type } })}
                >
                  <View style={styles.landscapeWrapper}>
                    <Image source={{ uri: item.backdropUrl || item.imageUrl }} style={styles.landscapeImage} />
                    <View style={styles.landscapePlayBtn}>
                      <Ionicons name="play" size={12} color="black" style={{ marginLeft: 1 }} />
                    </View>
                  </View>
                  <Text style={styles.landscapeTitle} numberOfLines={1}>{item.title}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        )}
        {/* Spatial Hero Motion Card */}
        <View style={styles.preferenceCard}>
          <LinearGradient
            colors={['rgba(35, 35, 35, 0.6)', 'rgba(15, 15, 15, 0.85)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.preferenceContent}>
            <View style={styles.preferenceCopy}>
              <Text style={styles.preferenceTitle}>Spatial Hero Motion</Text>
              <Text style={styles.preferenceBody}>
                Turn the 3D home hero motion on or off for this profile.
              </Text>
            </View>
            <Switch
              value={spatialEnabled}
              onValueChange={(value) => {
                if (!selectedProfile) return;
                Haptics.selectionAsync();
                updateProfileSettings(selectedProfile.id, { spatialMode: value });
              }}
              trackColor={{ false: 'rgba(255,255,255,0.18)', true: `${profileColor}60` }}
              thumbColor={spatialEnabled ? profileColor : '#f4f3f4'}
            />
          </View>
        </View>
        {/* Quick Bento Shortcuts */}
        <View style={styles.bentoSection}>
          <Text style={styles.bentoSectionTitle}>Quick Shortcuts</Text>
          <View style={styles.bentoRow}>
            {SMART_ACTIONS.map((action) => (
              <Pressable 
                key={action.id}
                style={[styles.bentoCard, { width: (width - 36) / 2 }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (action.id === '1') router.push('/notifications');
                  if (action.id === '2') router.push('/downloads');
                  if (action.id === '3') router.push('/my-list' as any);
                  if (action.id === '5') handleLinkTV();
                  if (action.id === '4') router.push('/account');
                }}
              >
                <View style={[styles.bentoIconBox, { backgroundColor: `${action.color}20`, borderColor: `${action.color}40`, borderWidth: 1 }]}>
                  <MaterialIcons name={action.icon as any} size={20} color="white" />
                </View>
                <Text style={styles.bentoLabel}>{action.title}</Text>
                {action.badge && (
                  <View style={styles.bentoBadge}>
                    <Text style={styles.bentoBadgeText}>{action.badge}</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>
        <Text style={styles.footerInfo}>Version {Constants.expoConfig?.version || '1.0.0'}</Text>
        <Text style={styles.footerSignature}>made by mzazimhenga ❤️</Text>
        
        {/* Extra Bottom Tab Spacing */}
        <View style={{ height: 100 }} />
      </ScrollView>
      {/* TV Link Modal */}
      <Modal visible={showTvLinkModal} transparent animationType="fade" onRequestClose={() => setShowTvLinkModal(false)}>
        <Pressable style={styles.tvModalOverlay} onPress={() => setShowTvLinkModal(false)}>
          <Pressable style={styles.tvModalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.tvModalTitle}>Link TV</Text>
            <Text style={styles.tvModalSubtitle}>Enter the code shown on your TV screen</Text>
            <TextInput
              style={styles.tvModalInput}
              value={tvLinkCode}
              onChangeText={setTvLinkCode}
              placeholder="e.g. 1234-5678"
              placeholderTextColor="rgba(255,255,255,0.3)"
              autoCapitalize="characters"
              keyboardType="default"
              maxLength={9}
            />
            <View style={styles.tvModalButtons}>
              <Pressable style={styles.tvModalCancel} onPress={() => setShowTvLinkModal(false)}>
                <Text style={styles.tvModalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.tvModalConfirm} onPress={confirmLinkTV}>
                <Text style={styles.tvModalConfirmText}>Link</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      {/* Menu / Profile Switcher Bottom Sheet */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.bottomSheetBackground}
        handleIndicatorStyle={{ backgroundColor: 'rgba(255,255,255,0.3)' }}
      >
        <BottomSheetView style={styles.bottomSheetContent}>
          {/* Section: Profile Switcher List */}
          <Text style={styles.sheetHeaderTitle}>Switch Profile</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.profileSwitcherRow}>
            {profiles.map((p) => {
              const isActive = p.id === selectedProfile?.id;
              return (
                <Pressable
                  key={p.id}
                  style={styles.profileItem}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    selectProfile(p);
                    bottomSheetRef.current?.close();
                  }}
                >
                  <Image 
                    source={p.avatar} 
                    style={[styles.profileAvatar, isActive && { borderColor: 'white', borderWidth: 2 }]} 
                  />
                  <Text style={[styles.profileItemName, isActive && { color: 'white', fontWeight: 'bold' }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              style={styles.profileItem}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                bottomSheetRef.current?.close();
                router.replace('/profiles');
              }}
            >
              <View style={[styles.profileAvatar, styles.addProfileBtn]}>
                <Ionicons name="add" size={32} color="rgba(255,255,255,0.6)" />
              </View>
              <Text style={styles.profileItemName}>Manage</Text>
            </Pressable>
          </ScrollView>
          <View style={styles.sheetDivider} />
          {/* Section: Quick Actions */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetActionsList}>
            <Pressable style={styles.sheetItem} onPress={() => { 
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              bottomSheetRef.current?.close(); 
              handleLinkTV();
            }}>
              <Ionicons name="tv-outline" size={24} color="white" />
              <Text style={styles.sheetText}>Link TV</Text>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
            </Pressable>
            <Pressable style={styles.sheetItem} onPress={() => { 
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              bottomSheetRef.current?.close(); 
              router.push('/app-settings'); 
            }}>
              <Ionicons name="settings-outline" size={24} color="white" />
              <Text style={styles.sheetText}>App Settings</Text>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
            </Pressable>
            <Pressable style={styles.sheetItem} onPress={() => { 
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              bottomSheetRef.current?.close(); 
              router.push('/account'); 
            }}>
              <Ionicons name="person-outline" size={24} color="white" />
              <Text style={styles.sheetText}>Account</Text>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
            </Pressable>
            <Pressable style={styles.sheetItem} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
              <Ionicons name="help-circle-outline" size={24} color="white" />
              <Text style={styles.sheetText}>Help Center</Text>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
            </Pressable>
            <Pressable style={styles.sheetItem} onPress={async () => {
              try {
                await signOut(auth);
                router.replace('/');
              } catch (err) {
                console.error("Sign out failed", err);
                router.replace('/');
              }
            }}>
              <Ionicons name="log-out-outline" size={24} color="#e50914" />
              <Text style={[styles.sheetText, { color: '#e50914' }]}>Sign Out</Text>
            </Pressable>
          </ScrollView>
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: 'transparent',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  profileHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: width * 0.5,
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  headerLogoImage: {
    width: 26,
    height: 36,
  },
  headerProfileName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    marginLeft: 8,
    marginRight: 4,
    letterSpacing: -0.5,
  },
  headerCaret: {
    marginTop: 2,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  iconButton: {
    padding: 4,
  },
  profileGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 250,
  },
  filterPillsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
    height: 48,
  },
  listFilterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    height: 36,
  },
  listFilterPillActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  listFilterText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  listFilterTextActive: {
    color: '#000000',
  },
  sectionCard: {
    backgroundColor: '#121212',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  seeAllText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
  },
  momentsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  momentCard: {
    width: (width - 68) / 2,
  },
  momentImageContainer: {
    width: '100%',
    height: 104,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1a1a1a',
  },
  momentImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  momentPlayPill: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  momentPlayBtn: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  momentDurationText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  momentShareBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  momentMetaBox: {
    marginTop: 8,
  },
  momentTimestamp: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
  },
  momentSubtitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  rowListContent: {
    paddingRight: 10,
    gap: 12,
  },
  posterCard: {
    width: 110,
  },
  posterWrapper: {
    width: 110,
    height: 165,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1a1a1a',
  },
  posterImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  landscapeCard: {
    width: 150,
  },
  landscapeWrapper: {
    width: 150,
    height: 100,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1a1a1a',
  },
  landscapeImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  landscapePlayBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  landscapeTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  nBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 5,
  },
  nBadgeImage: {
    width: 14,
    height: 22,
  },
  posterPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    zIndex: 3,
  },
  posterPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  },
  progressBarBackground: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    zIndex: 4,
  },
  progressBarFill: {
    height: '100%',
  },
  preferenceCard: {
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#121212',
  },
  preferenceContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 16,
    width: '100%',
  },
  preferenceCopy: {
    flex: 1,
  },
  preferenceTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  preferenceBody: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 13,
    lineHeight: 18,
  },
  bentoSection: {
    paddingHorizontal: 12,
    marginVertical: 12,
  },
  bentoSectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
    paddingLeft: 4,
  },
  bentoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  bentoCard: {
    borderRadius: 16,
    height: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#121212',
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  bentoIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  bentoLabel: {
    color: 'white',
    fontSize: 13,
    fontWeight: 'bold',
  },
  bentoBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#e50914',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  bentoBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '900',
  },
  bottomSheetBackground: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  bottomSheetContent: {
    padding: 16,
    flex: 1,
  },
  sheetHeaderTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  profileSwitcherRow: {
    paddingHorizontal: 8,
    paddingBottom: 16,
    gap: 16,
  },
  profileItem: {
    alignItems: 'center',
    width: 68,
  },
  profileAvatar: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: '#333333',
  },
  addProfileBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.3)',
  },
  profileItemName: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
  },
  sheetDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 12,
  },
  sheetActionsList: {
    gap: 6,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    gap: 16,
  },
  sheetText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  footerInfo: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 40,
    fontWeight: 'bold',
  },
  footerSignature: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  tvModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  tvModalBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tvModalTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center',
  },
  tvModalSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  tvModalInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    marginBottom: 24,
  },
  tvModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  tvModalCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  tvModalCancelText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontWeight: 'bold',
  },
  tvModalConfirm: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#e50914',
    alignItems: 'center',
  },
  tvModalConfirmText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  /* ── Liquid Glass Pill Button Styles ── */
  glassPillContainer: {
    height: 34,
    borderRadius: 17,
    position: 'relative',
  },
  glassPillBody: {
    flex: 1,
    borderRadius: 17,
    overflow: 'hidden',
  },
  glassPillTintFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 15, 15, 0.42)', // Darker, smokey glass body matching details screen
  },
  glassPillRefraction: {
    position: 'absolute',
    top: 1.2,
    left: 2,
    right: 2,
    height: 8,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    borderTopWidth: 1.2,
    borderTopColor: 'rgba(255,255,255,0.4)',
  },
  glassPillBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)', // Matching LiquidGlassPill border opacity
    borderTopColor: 'rgba(255,255,255,0.40)', // Matching LiquidGlassPill top border
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  activePillGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(229, 9, 20, 0.15)', // Enhanced Netflix Red active backdrop wash
  },
  activePillAuraShadow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 17,
    backgroundColor: 'rgba(229, 9, 20, 0.01)',
    shadowColor: '#E50914', // Vibrant Netflix Red aura bleed
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.8,
    shadowRadius: 14,
    elevation: 8,
  },
  glassPillContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: '100%',
    justifyContent: 'center',
  },
  /* ── Liquid Glass Circular Icon Button Styles ── */
  glassCircleContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
  },
  glassCircleBody: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassCircleRefraction: {
    position: 'absolute',
    top: 1.2,
    left: 2,
    right: 2,
    height: 10,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1.2,
    borderTopColor: 'rgba(255,255,255,0.4)',
  },
  glassCircleBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.20)', // Matching LiquidGlassCircle border opacity
    borderTopColor: 'rgba(255,255,255,0.50)', // Matching LiquidGlassCircle top border
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  glassCircleContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
});
