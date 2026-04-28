import React, { useState, useCallback, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Dimensions, 
  ImageBackground,
  TVFocusGuideView,
  Platform,
  Pressable
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useProfile, Profile } from '../context/ProfileContext';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../constants/theme';
import Animated, { FadeIn, FadeInLeft, ZoomIn } from 'react-native-reanimated';
import { fetchTrending, getBackdropUrl } from '../services/tmdb';
import LoadingSpinner from '../components/LoadingSpinner';

const { width, height } = Dimensions.get('window');

const PROFILE_ICON_SIZE = 120;
const FOCUSED_SCALE = 1.15;

export { Profile };

const FEATURED_CACHE_KEY = 'profiles_featured_cache';

export default function ProfilesScreen() {
  const router = useRouter();
  const { profiles, selectProfile, isLoading, canAddProfile } = useProfile();
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [featured, setFeatured] = useState<any>(null);
  const [featuredStatus, setFeaturedStatus] = useState<'loading' | 'live' | 'cached' | 'fallback'>('loading');
  const [isManaging, setIsManaging] = useState(false);
  
  // PIN Modal State
  const [showPinModal, setShowPinModal] = useState(false);
  const [lockedProfile, setLockedProfile] = useState<Profile | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [pendingMovie, setPendingMovie] = useState<any>(null);
  
  React.useEffect(() => {
    async function loadFeatured() {
      try {
        const cachedFeatured = await AsyncStorage.getItem(FEATURED_CACHE_KEY);
        if (cachedFeatured) {
          setFeatured(JSON.parse(cachedFeatured));
          setFeaturedStatus('cached');
        }
      } catch (error) {}

      try {
        const trending = await fetchTrending('all');
        if (trending && trending.length > 0) {
          // Select a random movie from the top 10
          const nextFeatured = trending[Math.floor(Math.random() * Math.min(trending.length, 10))];
          setFeatured(nextFeatured);
          setFeaturedStatus('live');
          await AsyncStorage.setItem(FEATURED_CACHE_KEY, JSON.stringify(nextFeatured));
          return;
        }
        setFeaturedStatus((current) => current === 'cached' ? 'cached' : 'fallback');
      } catch (error) {
        console.error("Failed to load featured recommendation:", error);
        setFeaturedStatus((current) => current === 'cached' ? 'cached' : 'fallback');
      }
    }
    loadFeatured();
  }, []);

  // Set initial focus when profiles load
  useEffect(() => {
    if (!focusedId && profiles.length > 0) {
      setFocusedId(profiles[0].id);
    }
  }, [profiles, focusedId]);

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <LoadingSpinner size={92} label="Loading profiles" />
      </View>
    );
  }
  
  const handleProfileSelect = (profile: Profile) => {
    if (isManaging) {
      router.push({
        pathname: '/edit-profile',
        params: { id: profile.id, name: profile.name, avatarId: profile.avatarId }
      });
      return;
    }

    if (profile.isLocked && profile.pin) {
       setLockedProfile(profile);
       setPinInput('');
       setPinError(false);
       setShowPinModal(true);
       return;
    }

    selectProfile(profile);
    
    if (pendingMovie) {
      router.replace({
        pathname: `/movie/${pendingMovie.id}`,
        params: { type: pendingMovie.media_type || (pendingMovie.first_air_date ? 'tv' : 'movie') }
      });
      setPendingMovie(null);
    } else {
      router.replace('/(tabs)');
    }
  };

  const handlePinPress = (digit: string) => {
    if (pinInput.length >= 4) return;
    
    setPinError(false);
    const newVal = pinInput + digit;
    setPinInput(newVal);

    if (newVal.length === 4) {
      if (newVal === lockedProfile?.pin) {
        setShowPinModal(false);
        selectProfile(lockedProfile);
        
        if (pendingMovie) {
          router.replace({
            pathname: `/movie/${pendingMovie.id}`,
            params: { type: pendingMovie.media_type || (pendingMovie.first_air_date ? 'tv' : 'movie') }
          });
          setPendingMovie(null);
        } else {
          router.replace('/(tabs)');
        }
      } else {
        setPinError(true);
        setTimeout(() => setPinInput(''), 400);
      }
    }
  };

  const handleDeletePin = () => {
    if (pinInput.length > 0) {
      setPinInput(pinInput.slice(0, -1));
      setPinError(false);
    }
  };

  const handleAddProfile = () => {
    router.push('/edit-profile');
  };

  const renderProfileItem = ({ item, index }: { item: Profile | any, index: number }) => {
    if (item.type === 'add') {
      const isFocused = focusedId === 'add-profile';
      return (
        <TouchableOpacity
          activeOpacity={1}
          onFocus={() => setFocusedId('add-profile')}
          onPress={handleAddProfile}
          style={[
            styles.profileItem,
            isFocused && styles.profileItemFocused
          ]}
        >
          <Animated.View 
            entering={ZoomIn.delay(index * 100).duration(400)}
            style={[
              styles.avatarContainer,
              isFocused && styles.avatarContainerFocused,
              styles.addBox
            ]}
          >
            <Ionicons name="add" size={50} color="white" />
          </Animated.View>
          {isFocused && (
            <Animated.View entering={FadeInLeft.duration(200)} style={styles.focusedProfileInfo}>
              <Text style={styles.profileNameText}>Add Profile</Text>
            </Animated.View>
          )}
        </TouchableOpacity>
      );
    }

    if (item.type === 'manage') {
        const isFocused = focusedId === 'manage-profiles';
        return (
          <TouchableOpacity
            activeOpacity={1}
            onFocus={() => setFocusedId('manage-profiles')}
            onPress={() => setIsManaging(!isManaging)}
            style={[
              styles.profileItem,
              isFocused && styles.profileItemFocused
            ]}
          >
            <Animated.View 
              entering={ZoomIn.delay(index * 100).duration(400)}
              style={[
                styles.avatarContainer,
                isFocused && styles.avatarContainerFocused,
                styles.manageBox,
                isManaging && { backgroundColor: '#fff' }
              ]}
            >
              <MaterialIcons name="edit" size={40} color={isManaging ? "black" : "white"} />
            </Animated.View>
            {isFocused && (
              <Animated.View entering={FadeInLeft.duration(200)} style={styles.focusedProfileInfo}>
                <Text style={styles.profileNameText}>{isManaging ? 'Done' : 'Manage Profiles'}</Text>
              </Animated.View>
            )}
          </TouchableOpacity>
        );
    }

    const isFocused = focusedId === item.id;
    
    return (
      <TouchableOpacity
        activeOpacity={1}
        onFocus={() => setFocusedId(item.id)}
        onPress={() => handleProfileSelect(item)}
        style={[
          styles.profileItem,
          isFocused && styles.profileItemFocused
        ]}
      >
        <Animated.View 
          entering={ZoomIn.delay(index * 100).duration(400)}
          style={[
            styles.avatarContainer,
            isFocused && styles.avatarContainerFocused
          ]}
        >
          <Image source={item.avatar} style={[styles.avatar, isManaging && { opacity: 0.6 }]} contentFit="cover" />
          {(isFocused || isManaging) && (
            <View style={styles.editIconContainer}>
               <MaterialIcons name="edit" size={20} color="white" />
            </View>
          )}
        </Animated.View>
        
        {isFocused && (
          <Animated.View entering={FadeInLeft.duration(200)} style={styles.focusedProfileInfo}>
          <Text style={styles.profileNameText}>{item.name}</Text>
          {item.isKids ? (
             <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18, marginTop: 4 }}>Kids</Text>
          ) : item.isLocked && !isManaging && (
             <Ionicons name="lock-closed" size={16} color="rgba(255,255,255,0.6)" />
          )}
          </Animated.View>
        )}
      </TouchableOpacity>
    );
  };

  const listData = [
    ...profiles,
    { id: 'manage-profiles', type: 'manage' },
    ...(canAddProfile ? [{ id: 'add-profile', type: 'add' as const }] : [])
  ];

  return (
    <View style={styles.container}>
      <ImageBackground 
        source={featured ? { uri: getBackdropUrl(featured.backdrop_path) } : require('../assets/1000446947.jpg')} 
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.8)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.8)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.gradientOverlay}
        />
        
        <View style={styles.content}>
          <View style={styles.leftPane}>
            <View style={styles.header}>
              <Text style={styles.netflixLogoText}>NETFLIX</Text>
              <Text style={styles.subHeaderText}>
                {isManaging ? 'Manage Profiles' : (pendingMovie ? `Watch ${pendingMovie.title || pendingMovie.name} as:` : "Who's Watching?")}
              </Text>
            </View>

            <View style={styles.profilesListContainer}>
               <FlatList
                data={listData}
                renderItem={renderProfileItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.profilesList}
                showsVerticalScrollIndicator={false}
              />
            </View>
          </View>

          <View style={styles.rightPane}>
            {featured && (
              <Animated.View key={featured.id} entering={FadeIn.duration(1000)} style={styles.featuredContent}>
                <View style={styles.nSeriesContainer}>
                  <Image 
                    source={require('../assets/images/netflix-n-logo.svg')} 
                    style={styles.nLogo} 
                    contentFit="contain"
                  />
                  <Text style={styles.nSeriesText}>SERIES</Text>
                </View>
                <Text style={styles.featuredTitle} numberOfLines={2}>
                  {featured.title || featured.name}
                </Text>
                <View style={styles.metadataContainer}>
                  <Text style={styles.metadataText}>
                    {featured.release_date?.split('-')[0] || featured.first_air_date?.split('-')[0]} • {featured.vote_average?.toFixed(1)} Rating
                  </Text>
                </View>
                <Pressable 
                  style={({ focused }) => [
                    styles.watchNowButton,
                    focused && styles.watchNowButtonFocused
                  ]}
                  onPress={() => {
                    if (featured) {
                      setPendingMovie(featured);
                    }
                  }}
                >
                  {({ focused }) => (
                    <>
                      <Ionicons name="play" size={24} color={focused ? "black" : "white"} style={{ marginRight: 8 }} />
                      <Text style={[styles.watchNowText, focused && { color: 'black' }]}>Watch Now</Text>
                    </>
                  )}
                </Pressable>
                {featuredStatus !== 'live' && (
                  <Text style={styles.networkNotice}>
                    {featuredStatus === 'cached' ? 'Weak network. Showing saved artwork.' : 'Weak network. Using local background.'}
                  </Text>
                )}
              </Animated.View>
            )}
            {!featured && featuredStatus === 'fallback' && (
              <View style={styles.fallbackMessage}>
                <Text style={styles.fallbackTitle}>Profiles are ready.</Text>
                <Text style={styles.networkNotice}>Weak network. Featured recommendations are unavailable right now.</Text>
              </View>
            )}
          </View>
        </View>
      </ImageBackground>

      {/* Full-Screen Dark PIN Modal for TV */}
      {showPinModal && lockedProfile && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.pinModalOverlay}>
          <Pressable 
            style={({ focused }) => [styles.pinModalCloseBtn, focused && { transform: [{ scale: 1.1 }] }]} 
            onPress={() => setShowPinModal(false)}
          >
            <Ionicons name="close" size={40} color="white" />
          </Pressable>
          
          <View style={styles.pinModalContent}>
            <Text style={styles.pinTitle}>Enter your PIN to access this profile.</Text>
            
            <View style={styles.pinDotsContainer}>
              {[0, 1, 2, 3].map((i) => (
                <View 
                  key={i} 
                  style={[
                    styles.pinDot, 
                    pinInput.length > i && styles.pinDotFilled,
                    pinError && styles.pinDotError,
                    pinError && pinInput.length > i && { backgroundColor: '#e50914' }
                  ]} 
                />
              ))}
            </View>

            <View style={styles.pinGrid}>
              {['1','2','3','4','5','6','7','8','9','','0','del'].map((key, idx) => {
                if (key === '') return <View key={idx} style={styles.pinCell} />;
                if (key === 'del') {
                  return (
                    <Pressable 
                      key={idx} 
                      style={({ focused }) => [styles.pinCellBtn, focused && { backgroundColor: 'white' }]} 
                      onPress={handleDeletePin}
                    >
                      {({ focused }) => (
                         <Ionicons name="backspace-outline" size={36} color={focused ? "black" : "white"} />
                      )}
                    </Pressable>
                  );
                }
                return (
                  <Pressable 
                    key={idx} 
                    style={({ focused }) => [styles.pinCellBtn, focused && { backgroundColor: 'white' }]} 
                    onPress={() => handlePinPress(key)}
                  >
                    {({ focused }) => (
                      <Text style={[styles.pinCellText, focused && { color: 'black' }]}>{key}</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    padding: 60,
  },
  leftPane: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  rightPane: {
    flex: 1.5,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingBottom: 40,
  },
  header: {
    marginBottom: 40,
  },
  netflixLogoText: {
    color: '#E50914',
    fontSize: 56,
    fontWeight: '900',
    letterSpacing: -2,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  subHeaderText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '300',
    opacity: 0.9,
    marginTop: 15,
    letterSpacing: 1,
  },
  profilesListContainer: {
    flex: 1,
  },
  profilesList: {
    paddingVertical: 20,
  },
  profileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
    height: 140,
  },
  profileItemFocused: {
    // scale effect?
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarContainerFocused: {
    borderColor: '#fff',
    transform: [{ scale: FOCUSED_SCALE }],
    width: 110,
    height: 110,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  addBox: {
    backgroundColor: '#141414',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  manageBox: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editIconContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  focusedProfileInfo: {
    marginLeft: 30,
  },
  profileNameText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  featuredContent: {
    alignItems: 'flex-end',
  },
  nSeriesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  nLogo: {
    width: 20,
    height: 30,
  },
  nSeriesText: {
    color: '#E50914',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 4,
  },
  featuredTitle: {
    color: '#fff',
    fontSize: 72,
    fontWeight: '900',
    textAlign: 'right',
    maxWidth: 600,
    lineHeight: 70,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  metadataContainer: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  metadataText: {
    color: '#fff',
    fontSize: 22,
    opacity: 0.8,
  },
  watchNowButton: {
    marginTop: 30,
    paddingVertical: 14,
    paddingHorizontal: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  watchNowButtonFocused: {
    backgroundColor: '#fff',
    borderColor: '#fff',
    transform: [{ scale: 1.05 }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  watchNowText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  networkNotice: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    marginTop: 18,
    maxWidth: 420,
    textAlign: 'right',
  },
  fallbackMessage: {
    alignItems: 'flex-end',
    maxWidth: 520,
  },
  fallbackTitle: {
    color: '#fff',
    fontSize: 42,
    fontWeight: '800',
    textAlign: 'right',
  },
  pinModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinModalCloseBtn: {
    position: 'absolute',
    top: 60,
    right: 60,
    padding: 20,
    borderRadius: 50,
  },
  pinModalContent: {
    width: 600,
    alignItems: 'center',
  },
  pinTitle: {
    color: 'white',
    fontSize: 28,
    textAlign: 'center',
    marginBottom: 40,
    fontWeight: '600',
  },
  pinDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 60,
    gap: 30,
  },
  pinDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  pinDotFilled: {
    backgroundColor: 'white',
    borderColor: 'white',
  },
  pinDotError: {
    borderColor: '#e50914',
  },
  pinGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: 450,
    gap: 20,
  },
  pinCell: {
    width: 120,
    height: 120,
  },
  pinCellBtn: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  pinCellText: {
    color: 'white',
    fontSize: 40,
    fontWeight: 'bold',
  }
});
