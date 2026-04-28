import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Pressable, Dimensions, StatusBar, Modal, Switch } from 'react-native';
import { COLORS, SPACING } from '../../constants/theme';
import { HorizontalCarousel } from '../../components/HorizontalCarousel';
import { fetchPopular, getImageUrl, getBackdropUrl } from '../../services/tmdb';
import { Ionicons, MaterialCommunityIcons, Feather, MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '../_layout';
import { useProfile } from '../../context/ProfileContext';
import { MyListService } from '../../services/MyListService';
import { WatchHistoryService } from '../../services/WatchHistoryService';
import Animated, { 
  FadeIn,
  FadeInDown,
  useSharedValue, 
  useAnimatedStyle, 
  withSpring,
  withTiming,
  interpolate,
  SharedTransition,
} from 'react-native-reanimated';
import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

import { auth, db } from '../../services/firebase';
import { signOut } from 'firebase/auth';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { Alert, TextInput } from 'react-native';
import Constants from 'expo-constants';

const SMART_ACTIONS = [
  { id: '1', title: 'Notifications', icon: 'notifications', color: '#e50914', badge: '3' },
  { id: '2', title: 'Downloads', icon: 'download', color: '#0071eb' },
  { id: '3', title: 'My List', icon: 'add-circle', color: '#46d369' },
  { id: '5', title: 'Link TV', icon: 'tv', color: '#E50914' },
  { id: '4', title: 'Account', icon: 'settings', color: '#333' },
];

export default function MyNetflixScreen() {
  const router = useRouter();
  const { selectedProfile, updateProfileSettings } = useProfile();
  const { setThemeColor } = useTheme();
  const [myList, setMyList] = useState<any[]>([]);
  const [continueWatching, setContinueWatching] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLinking, setIsLinking] = useState(false);
  const [activeListFilter, setActiveListFilter] = useState<'All' | 'Movies' | 'TV Shows' | 'Started'>('All');
  const [tvLinkCode, setTvLinkCode] = useState('');
  const [showTvLinkModal, setShowTvLinkModal] = useState(false);
  
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
        // Only store uid for the TV app to use for auth — NEVER the password
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
  
  const scrollY = useSharedValue(0);
  
  const bottomSheetRef = React.useRef<BottomSheet>(null);
  const snapPoints = React.useMemo(() => ['35%'], []);
  const renderBackdrop = React.useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsAt={-1} appearsAt={0} opacity={0.7} />
    ),
    []
  );

  useFocusEffect(
    React.useCallback(() => {
      setThemeColor('#000000');
    }, [])
  );

  useEffect(() => {
    if (!selectedProfile) {
      setMyList([]);
      setContinueWatching([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // 1. My List Subscription
    const unsubList = MyListService.subscribeToList(selectedProfile.id, (items: any[]) => {
      const formatted = items.map(item => ({
        ...item,
        imageUrl: getImageUrl(item.poster_path),
        backdropUrl: getBackdropUrl(item.backdrop_path),
      }));
      setMyList(formatted);
      setLoading(false);
    });

    // 2. Watch History Subscription
    const unsubHistory = WatchHistoryService.subscribeToHistory(selectedProfile.id, (items: any[]) => {
      const formatted = items.map(item => ({
        ...item,
        imageUrl: item.backdrop_path ? getBackdropUrl(item.backdrop_path) : getImageUrl(item.poster_path),
        backdropUrl: getBackdropUrl(item.backdrop_path),
      }));
      setContinueWatching(formatted);
    });

    return () => {
      unsubList();
      unsubHistory();
    };
  }, [selectedProfile]);

  const headerOpacityStyle = useAnimatedStyle(() => {
    return {
      opacity: 1,
      backgroundColor: 'transparent',
    };
  });

  if (loading) return <View style={{ flex: 1, backgroundColor: 'black' }} />;

  const filteredMyList = myList.filter(item => {
    if (activeListFilter === 'Movies') return item.type === 'movie';
    if (activeListFilter === 'TV Shows') return item.type === 'tv';
    if (activeListFilter === 'Started') return false;
    return true;
  });

  const showContinueWatching = continueWatching.length > 0 && (activeListFilter === 'All' || activeListFilter === 'Started');
  const showMyList = activeListFilter !== 'Started';
  const spatialEnabled = selectedProfile?.settings?.spatialMode !== false;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Floating Header */}
      <Animated.View style={[styles.floatingHeader, headerOpacityStyle]}>
        <SafeAreaView edges={['top']} style={styles.headerContent}>
          <Text style={styles.floatingHeaderTitle}>My Netflix</Text>
          <View style={styles.headerIcons}>
            <Pressable style={styles.iconButton} onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/search');
            }}><Ionicons name="search" size={28} color="white" /></Pressable>
            <Pressable style={styles.iconButton} onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              bottomSheetRef.current?.expand();
            }}>
              <Ionicons name="menu" size={32} color="white" />
            </Pressable>
          </View>
        </SafeAreaView>
      </Animated.View>

      <Animated.ScrollView 
        showsVerticalScrollIndicator={false} 
        onScroll={(e) => { scrollY.value = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Immersive Profile Identity */}
        <LinearGradient
          colors={['rgba(229, 9, 20, 0.2)', 'transparent']}
          style={styles.profileGradient}
        />
        
        <SafeAreaView edges={['top']}>
          <View style={styles.profileSection}>
            <Animated.View entering={FadeIn.duration(600)} style={styles.avatarContainer}>
              <Pressable onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}>
                <Animated.Image 
                  source={selectedProfile?.avatar} 
                  style={styles.mainAvatar} 
                  sharedTransitionTag="p_avatar"
                />
                <View style={styles.avatarEditBadge}>
                  <MaterialIcons name="edit" size={16} color="white" />
                </View>
              </Pressable>
            </Animated.View>
            <Text style={styles.profileName}>{selectedProfile?.name || 'User'}</Text>
            <Pressable style={styles.switchPill} onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.replace('/profiles');
            }}>
              <Text style={styles.switchPillText}>Switch Profile</Text>
              <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.6)" />
            </Pressable>
          </View>
        </SafeAreaView>

        {/* AI-Powered Smart Actions (Bento Grid) */}
        <View style={styles.bentoSection}>
          <View style={styles.bentoRow}>
            {SMART_ACTIONS.map((action, idx) => (
              <Animated.View 
                key={action.id}
                entering={FadeInDown.delay(idx * 100).duration(500)}
                style={[styles.bentoCard, { width: (width - 44) / 2 }]}
              >
                <Pressable 
                  style={styles.bentoPressable}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (action.id === '1') router.push('/notifications');
                    if (action.id === '2') router.push('/downloads');
                    if (action.id === '3') router.push('/my-list' as any);
                    if (action.id === '5') handleLinkTV();
                    if (action.id === '4') router.push('/account');
                  }}
                >
                  <View style={[styles.bentoIconBox, { backgroundColor: action.color }]}>
                    <MaterialIcons name={action.icon as any} size={24} color="white" />
                  </View>
                  <Text style={styles.bentoLabel}>{action.title}</Text>
                  {action.badge && (
                    <View style={styles.bentoBadge}>
                      <Text style={styles.bentoBadgeText}>{action.badge}</Text>
                    </View>
                  )}
                </Pressable>
              </Animated.View>
            ))}
          </View>
        </View>

        {/* Filter Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsContainer}>
          {['All', 'Movies', 'TV Shows', 'Started'].map(filter => (
            <Pressable 
              key={filter}
              style={[styles.listFilterPill, activeListFilter === filter && styles.listFilterPillActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setActiveListFilter(filter as any);
              }}
            >
              <Text style={[styles.listFilterText, activeListFilter === filter && styles.listFilterTextActive]}>{filter}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.preferenceCard}>
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
            trackColor={{ false: 'rgba(255,255,255,0.18)', true: 'rgba(229,9,20,0.5)' }}
            thumbColor={spatialEnabled ? '#E50914' : '#f4f3f4'}
          />
        </View>

        {/* Personalized Feed Rows */}
        <View style={styles.contentRows}>
          {showContinueWatching && (
            <View style={styles.continueWatchingContainer}>
              <Text style={styles.sectionHeader}>Continue Watching</Text>
              <Pressable 
                style={styles.cwCard}
                onPress={() => router.push({ pathname: "/movie/[id]", params: { id: continueWatching[0].id, type: continueWatching[0].type } })}
              >
                <Image source={{ uri: continueWatching[0].imageUrl }} style={styles.cwImage} />
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.8)']}
                  style={styles.cwGradient}
                />
                <Pressable 
                  style={styles.cwPlayButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    router.push({ pathname: "/movie/[id]", params: { id: continueWatching[0].id, type: continueWatching[0].type, autoplay: 'true' } });
                  }}
                >
                  <Ionicons name="play" size={28} color="black" style={{ marginLeft: 3 }} />
                </Pressable>
                <View style={styles.cwInfo}>
                  <Text style={styles.cwTitle} numberOfLines={1}>{continueWatching[0].title}</Text>
                  <Text style={styles.cwSubtitle}>Continue watching</Text>
                  <View style={styles.cwProgressBackground}>
                    <View style={[styles.cwProgressFill, { 
                      width: `${Math.min(100, ((continueWatching[0].currentTime || 0) / (continueWatching[0].duration || 1)) * 100)}%` 
                    }]} />
                  </View>
                </View>
              </Pressable>
            </View>
          )}
          
          {showMyList && (
            <>
              <View style={styles.rowWrapper}>
                <HorizontalCarousel 
                  title="My List" 
                  data={filteredMyList} 
                />
              </View>

              {activeListFilter === 'All' && (
                <View style={styles.rowWrapper}>
                  <HorizontalCarousel 
                    title="Trailers You Liked" 
                    data={myList.slice(5, 10)} 
                    variant="landscape"
                  />
                </View>
              )}
            </>
          )}
        </View>

        <Text style={styles.footerInfo}>Version {Constants.expoConfig?.version || '1.0.0'}</Text>
        <Text style={styles.footerSignature}>made by mzazimhenga ❤️</Text>
        <View style={{ height: 120 }} />
      </Animated.ScrollView>

      {/* TV Link Modal — cross-platform replacement for Alert.prompt */}
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

      {/* Menu Bottom Sheet */}
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
          <Pressable style={styles.sheetItem}>
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
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
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
    paddingBottom: 10,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  floatingHeaderTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '900',
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  iconButton: {
    padding: 4,
  },
  profileGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  profileSection: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  mainAvatar: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    backgroundColor: '#1a1a1a',
    padding: 6,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  profileName: {
    color: 'white',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  switchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  switchPillText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: 'bold',
  },
  bentoSection: {
    paddingHorizontal: 16,
    marginBottom: 30,
  },
  preferenceCard: {
    marginHorizontal: 16,
    marginBottom: 28,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
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
  bentoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  bentoCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    height: 110,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  bentoPressable: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bentoIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
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
  contentRows: {
    marginTop: 10,
  },
  rowWrapper: {
    marginBottom: 10,
  },
  sectionHeader: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  continueWatchingContainer: {
    marginBottom: 24,
  },
  cwCard: {
    marginHorizontal: 16,
    height: 200,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cwImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  cwGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  cwPlayButton: {
    position: 'absolute',
    top: '35%',
    alignSelf: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
    elevation: 8,
  },
  cwInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  cwTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
    textShadowColor: 'black',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  cwSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    marginBottom: 12,
  },
  cwProgressBackground: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  cwProgressFill: {
    height: '100%',
    backgroundColor: '#e50914',
    borderRadius: 2,
  },
  bottomSheetBackground: {
    backgroundColor: '#000000',
  },
  bottomSheetContent: {
    padding: 16,
    gap: 8,
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
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 40,
    fontWeight: 'bold',
  },
  footerSignature: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  filterPillsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  listFilterPill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'transparent',
  },
  listFilterPillActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  listFilterText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  listFilterTextActive: {
    color: '#000',
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
  }
});
